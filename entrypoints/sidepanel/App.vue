<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { browser } from "wxt/browser";
import { Loader2, RotateCw } from "lucide-vue-next";
import AppHeader from "@/components/AppHeader.vue";
import LoginGate from "@/components/LoginGate.vue";
import MatchRow from "@/components/MatchRow.vue";
import OriginSetup from "@/components/OriginSetup.vue";
import AnimatedFilters from "@/components/ui/AnimatedFilters.vue";
import Button from "@/components/ui/Button.vue";
import type { Candidate } from "@/lib/candidates";
import { discover, importFaceitMatch } from "@/lib/discover";
import { type Page, pageFromUrl, samePage } from "@/lib/page";
import {
  DEFAULT_PANEL,
  type Lookup,
  PanelError,
  type PanelUser,
  panel,
  panelOrigin,
  savedPanels,
} from "@/lib/panel";
import { activeTab } from "@/lib/tabs";
import { REFRESH_BADGE } from "@/lib/badge";

type Phase = "loading" | "setup" | "error" | "login" | "ready";

const LOOKUP_BATCH = 50;
const VALVE_BATCH = 20;
const POLL_MS = 5_000;

const origin = ref(DEFAULT_PANEL);
const panels = ref<Array<string>>([DEFAULT_PANEL]);
const version = browser.runtime.getManifest().version;
const phase = ref<Phase>("loading");
const user = ref<PanelUser | null>(null);
const panelProblem = ref<string | null>(null);

// Each FACEIT or Leetify tab gets its own panel; background.ts names the tab.
const panelTabId = Number(new URLSearchParams(location.search).get("tab")) || undefined;

const page = ref<Page>({ site: "none" });
const tabId = ref<number>();
const candidates = ref<Array<Candidate>>([]);
const discovering = ref(false);
const discoverProblem = ref<string | null>(null);

const lookups = ref<Record<string, Lookup>>({});
const progress = ref<Record<string, string>>({});
const errors = ref<Record<string, string>>({});
const selected = ref(new Set<string>());
const importing = ref(false);

const submitted = new Set<string>();
const retried = new Set<string>();
let discoverRun = 0;
let poll: ReturnType<typeof setInterval> | undefined;
let signing: Promise<unknown> = Promise.resolve();

const pageTitle = computed(() => {
  switch (page.value.site) {
    case "faceit":
      if (page.value.kind === "room") {
        return "FACEIT Match";
      }
      if (page.value.kind === "home") {
        return user.value?.faceit?.nickname
          ? `FACEIT · ${user.value.faceit.nickname}`
          : "Your FACEIT Matches";
      }
      return `FACEIT · ${page.value.nickname}`;
    case "leetify":
      if (page.value.kind === "home") {
        return "Your Leetify Matches";
      }
      return page.value.kind === "profile" ? "Leetify Profile" : "Leetify Match";
    default:
      return "";
  }
});

type Tab = "import" | "working" | "imported" | "others";

const listTab = ref<Tab>("import");

function tabOf(candidate: Candidate): Tab {
  const state = lookups.value[candidate.key]?.state ?? "none";
  if (progress.value[candidate.key] || state === "queued" || state === "importing") {
    return "working";
  }
  if (state === "imported") {
    return "imported";
  }
  if (!candidate.own && user.value?.role !== "administrator") {
    return "others";
  }
  return "import";
}

const tabCounts = computed(() => {
  const counts: Record<Tab, number> = { import: 0, working: 0, imported: 0, others: 0 };
  for (const candidate of candidates.value) {
    counts[tabOf(candidate)]++;
  }
  return counts;
});

const tabOptions = computed(() => [
  { key: "import", label: "To Import", count: tabCounts.value.import },
  { key: "working", label: "Importing", count: tabCounts.value.working },
  { key: "imported", label: "Imported", count: tabCounts.value.imported },
  ...(tabCounts.value.others > 0
    ? [{ key: "others", label: "Others", count: tabCounts.value.others }]
    : []),
]);

const tabModel = computed({
  get: () => listTab.value,
  set: (next: string) => {
    listTab.value = next as Tab;
  },
});

const visibleCandidates = computed(() =>
  candidates.value.filter((candidate) => tabOf(candidate) === listTab.value),
);

const emptyTabText = computed(
  () =>
    ({
      import: "Nothing left to import here.",
      working: "Nothing importing right now.",
      imported: "None of these are in 5Stack yet.",
      others: "",
    })[listTab.value],
);

const selectedCandidates = computed(() =>
  candidates.value.filter((candidate) => selected.value.has(candidate.key)),
);

function disabledReason(candidate: Candidate): string | undefined {
  if (user.value && !user.value.imports[candidate.source]) {
    return `${candidate.source === "faceit" ? "FACEIT" : "Valve"} imports are off on this panel.`;
  }
  if (!candidate.own && user.value?.role !== "administrator") {
    return "Only matches you played can be imported.";
  }
  return undefined;
}

function selectable(candidate: Candidate): boolean {
  const state = lookups.value[candidate.key]?.state ?? "none";
  return (
    !disabledReason(candidate) &&
    !progress.value[candidate.key] &&
    (state === "none" || state === "failed")
  );
}

function toggle(candidate: Candidate) {
  const next = new Set(selected.value);
  if (next.has(candidate.key)) {
    next.delete(candidate.key);
  } else {
    next.add(candidate.key);
  }
  selected.value = next;
}

function selectNew() {
  selected.value = new Set(
    candidates.value.filter(selectable).map((candidate) => candidate.key),
  );
}

// A new panel is only saved once it answers: logged in, or logged out (403)
// and waiting for a login, both count.
async function connect(next?: string) {
  const target = next ?? origin.value;
  phase.value = "loading";
  panelProblem.value = null;

  let me: PanelUser | null = null;
  try {
    me = await panel.me(target);
  } catch (error) {
    if (!(error instanceof PanelError && error.status === 403)) {
      panelProblem.value = (error as Error).message;
      phase.value = next ? "setup" : "error";
      return;
    }
  }

  if (next) {
    origin.value = next;
    await panelOrigin.setValue(next);
    if (!panels.value.includes(next)) {
      panels.value = [...panels.value, next];
      await savedPanels.setValue(panels.value);
    }
  }

  user.value = me;
  if (!me) {
    phase.value = "login";
    return;
  }
  phase.value = "ready";
  await refreshPage(true);
}

function addPanel() {
  panelProblem.value = null;
  phase.value = "setup";
}

async function switchPanel(next: string) {
  if (next !== origin.value) {
    await connect(next);
  }
}

async function removePanel(target: string) {
  panels.value = panels.value.filter((candidate) => candidate !== target);
  await savedPanels.setValue(panels.value);
  if (target === origin.value) {
    await connect(DEFAULT_PANEL);
  }
}

function openPanel() {
  void browser.tabs.create({ url: origin.value });
}

async function logout() {
  await panel.logout(origin.value).catch(() => undefined);
  user.value = null;
  candidates.value = [];
  phase.value = "login";
  void browser.runtime.sendMessage(REFRESH_BADGE).catch(() => undefined);
}

async function refreshPage(force = false) {
  if (phase.value !== "ready") {
    return;
  }
  const tab =
    panelTabId === undefined
      ? await activeTab()
      : await browser.tabs.get(panelTabId).catch(() => undefined);
  const next = pageFromUrl(tab?.url);
  if (!force && samePage(next, page.value) && tab?.id === tabId.value) {
    return;
  }

  const run = ++discoverRun;
  page.value = next;
  tabId.value = tab?.id;
  candidates.value = [];
  selected.value = new Set();
  discoverProblem.value = null;
  if (next.site === "none") {
    discovering.value = false;
    return;
  }

  discovering.value = true;
  try {
    const found = await discover(next, tab?.id, user.value!);
    if (run !== discoverRun) {
      return;
    }
    candidates.value = found;
    await lookupAll();
    if (run === discoverRun) {
      selectNew();
      listTab.value =
        tabCounts.value.import > 0 || tabCounts.value.imported === 0
          ? "import"
          : "imported";
    }
  } catch (error) {
    if (run === discoverRun) {
      discoverProblem.value = (error as Error).message;
    }
  } finally {
    if (run === discoverRun) {
      discovering.value = false;
    }
  }
}

async function lookupAll() {
  const listed = candidates.value;
  for (let offset = 0; offset < listed.length; offset += LOOKUP_BATCH) {
    const batch = listed.slice(offset, offset + LOOKUP_BATCH);
    const faceit = batch.filter((c) => c.source === "faceit");
    const valve = batch.filter((c) => c.source === "valve");
    const result = await panel.lookup(origin.value, {
      faceit: faceit.map((c) => ({ id: c.id, maps: c.maps })),
      valve: valve.map((c) => c.id),
    });
    const next = { ...lookups.value };
    for (const candidate of faceit) {
      next[candidate.key] = result.faceit[candidate.id] ?? { state: "none" };
    }
    for (const candidate of valve) {
      next[candidate.key] = result.valve[candidate.id] ?? { state: "none" };
    }
    lookups.value = next;
  }

  // FACEIT signs a link for five minutes. One that ran out before the panel
  // started downloading gets signed again, once.
  for (const candidate of listed) {
    const lookup = lookups.value[candidate.key];
    if (
      candidate.source === "faceit" &&
      lookup?.state === "failed" &&
      lookup.reason === "link expired" &&
      submitted.has(candidate.key) &&
      !retried.has(candidate.key)
    ) {
      retried.add(candidate.key);
      void importFaceit(candidate).catch(() => undefined);
    }
  }
}

// One FACEIT check at a time: an automatic re-sign and a manual import would
// otherwise render two Turnstile widgets in the same tab.
function importFaceit(candidate: Candidate): Promise<void> {
  const run = signing.then(() => signAndSend(candidate));
  signing = run.catch(() => undefined);
  return run;
}

async function signAndSend(candidate: Candidate) {
  submitted.add(candidate.key);
  delete errors.value[candidate.key];
  try {
    const maps = await importFaceitMatch(origin.value, candidate.id, (map, total) => {
      progress.value = {
        ...progress.value,
        [candidate.key]:
          total > 1
            ? `Signing map ${map} of ${total} on FACEIT`
            : "Signing the demo on FACEIT",
      };
    });
    candidate.maps = maps;
    lookups.value = { ...lookups.value, [candidate.key]: { state: "queued" } };
  } catch (error) {
    errors.value = { ...errors.value, [candidate.key]: (error as Error).message };
    throw error;
  } finally {
    const { [candidate.key]: _, ...rest } = progress.value;
    progress.value = rest;
  }
}

async function importSelected() {
  const chosen = selectedCandidates.value;
  selected.value = new Set();
  importing.value = true;

  try {
    const valve = chosen.filter((c) => c.source === "valve");
    if (valve.length > 0) {
      for (const candidate of valve) {
        delete errors.value[candidate.key];
        progress.value = { ...progress.value, [candidate.key]: "Sending to 5Stack" };
      }
      try {
        for (let offset = 0; offset < valve.length; offset += VALVE_BATCH) {
          const batch = valve.slice(offset, offset + VALVE_BATCH);
          try {
            const result = await panel.importValve(
              origin.value,
              batch.map((c) => c.id),
            );
            const next = { ...lookups.value };
            for (const candidate of batch) {
              next[candidate.key] = result.valve[candidate.id] ?? {
                state: "none",
              };
            }
            lookups.value = next;
          } catch (error) {
            for (const candidate of valve.slice(offset)) {
              errors.value = {
                ...errors.value,
                [candidate.key]: (error as Error).message,
              };
            }
            break;
          }
        }
      } finally {
        const rest = { ...progress.value };
        valve.forEach((candidate) => delete rest[candidate.key]);
        progress.value = rest;
      }
    }

    for (const candidate of chosen.filter((c) => c.source === "faceit")) {
      try {
        await importFaceit(candidate);
      } catch (error) {
        if (error instanceof PanelError && error.status === 429) {
          break;
        }
      }
    }

    await lookupAll();
  } finally {
    importing.value = false;
    void browser.runtime.sendMessage(REFRESH_BADGE).catch(() => undefined);
  }
}

function onTabActivated() {
  if (panelTabId === undefined) {
    void refreshPage();
  }
}

function onTabUpdated(
  id: number,
  change: { url?: string; status?: string },
  tab: { active?: boolean },
) {
  const ours = panelTabId === undefined ? tab.active : id === panelTabId;
  if (ours && (change.url || change.status === "complete")) {
    void refreshPage();
  }
}

onMounted(async () => {
  origin.value = await panelOrigin.getValue();
  panels.value = await savedPanels.getValue();
  if (!panels.value.includes(origin.value)) {
    panels.value = [...panels.value, origin.value];
  }
  browser.tabs.onActivated.addListener(onTabActivated);
  browser.tabs.onUpdated.addListener(onTabUpdated);
  poll = setInterval(() => {
    if (phase.value === "login") {
      panel
        .me(origin.value)
        .then((me) => {
          user.value = me;
          phase.value = "ready";
          return refreshPage(true);
        })
        .catch(() => undefined);
      return;
    }
    const waiting = candidates.value.some((candidate) => {
      const state = lookups.value[candidate.key]?.state;
      return state === "queued" || state === "importing";
    });
    if (phase.value === "ready" && waiting && !importing.value) {
      void lookupAll().catch(() => undefined);
    }
  }, POLL_MS);
  await connect();
});

onBeforeUnmount(() => {
  browser.tabs.onActivated.removeListener(onTabActivated);
  browser.tabs.onUpdated.removeListener(onTabUpdated);
  clearInterval(poll);
});
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <AppHeader
      :origin="origin"
      :user="user"
      :panels="panels"
      :version="version"
      @switch-panel="switchPanel"
      @add-panel="addPanel"
      @remove-panel="removePanel"
      @open-panel="openPanel"
      @logout="logout"
    />

    <main class="flex-1">
      <Transition
        mode="out-in"
        enter-active-class="transition-opacity duration-200 ease-out motion-reduce:transition-none"
        enter-from-class="opacity-0"
        leave-active-class="transition-opacity duration-150 ease-in motion-reduce:transition-none"
        leave-to-class="opacity-0"
      >
        <div
          v-if="phase === 'loading'"
          key="loading"
          class="flex items-center gap-2 p-4 text-sm text-muted-foreground"
        >
          <Loader2 class="size-4 animate-spin motion-reduce:animate-none" />
          Connecting to your panel
        </div>

        <OriginSetup
          v-else-if="phase === 'setup'"
          key="setup"
          :error="panelProblem"
          @connect="connect"
          @cancel="connect()"
        />

        <div v-else-if="phase === 'error'" key="error" class="space-y-3 p-4">
          <p class="text-sm text-destructive">{{ panelProblem }}</p>
          <Button variant="outline" size="sm" @click="connect()">
            <RotateCw />
            Try Again
          </Button>
        </div>

        <LoginGate
          v-else-if="phase === 'login'"
          key="login"
          :origin="origin"
          @change-panel="addPanel"
        />

        <div v-else-if="page.site === 'none'" key="none" class="p-4">
          <div
            class="mb-2 inline-flex items-center gap-2 font-sans text-[0.72rem] uppercase tracking-[0.24em] text-muted-foreground"
          >
            <span
              class="inline-block h-[2px] w-[10px] bg-[hsl(var(--tac-amber))]"
            />
            Nothing To Import
          </div>
          <p class="text-[0.85rem] text-muted-foreground">
            Open a FACEIT match room or player page, or a Leetify profile or
            match. Matches with demos show up here.
          </p>
        </div>

        <div v-else :key="JSON.stringify(page)">
          <div
            class="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5"
          >
            <div
              class="inline-flex min-w-0 items-center gap-2 font-sans text-[0.72rem] uppercase tracking-[0.24em] text-muted-foreground"
            >
              <span
                class="inline-block h-[2px] w-[10px] shrink-0 bg-[hsl(var(--tac-amber))]"
              />
              <span class="truncate">{{ pageTitle }}</span>
            </div>
          </div>

          <div
            v-if="!discovering && !discoverProblem && candidates.length > 0"
            class="border-b border-border px-4 py-2.5"
          >
            <AnimatedFilters v-model="tabModel" :options="tabOptions" />
          </div>

          <div v-if="discovering" class="divide-y divide-border">
            <div v-for="row in 3" :key="row" class="space-y-2 px-4 py-3">
              <div class="h-4 w-1/2 animate-pulse rounded bg-muted motion-reduce:animate-none" />
              <div class="h-3 w-1/3 animate-pulse rounded bg-muted/60 motion-reduce:animate-none" />
            </div>
          </div>

          <div v-else-if="discoverProblem" class="space-y-3 p-4">
            <p class="text-sm text-destructive">{{ discoverProblem }}</p>
            <Button variant="outline" size="sm" @click="refreshPage(true)">
              <RotateCw />
              Try Again
            </Button>
          </div>

          <p
            v-else-if="candidates.length === 0"
            class="p-4 text-[0.85rem] text-muted-foreground"
          >
            {{
              page.site === "faceit" && page.kind === "room"
                ? "FACEIT has no demo for this match yet."
                : "No matches with demos on this page."
            }}
          </p>

          <p
            v-else-if="visibleCandidates.length === 0"
            class="p-4 text-[0.85rem] text-muted-foreground"
          >
            {{ emptyTabText }}
          </p>

          <TransitionGroup
            v-else
            tag="div"
            enter-active-class="transition-opacity duration-200 ease-out motion-reduce:transition-none"
            enter-from-class="opacity-0"
          >
            <MatchRow
              v-for="candidate in visibleCandidates"
              :key="candidate.key"
              :candidate="candidate"
              :lookup="lookups[candidate.key]"
              :progress="progress[candidate.key]"
              :error="errors[candidate.key]"
              :disabled-reason="disabledReason(candidate)"
              :selectable="selectable(candidate)"
              :selected="selected.has(candidate.key)"
              :origin="origin"
              @toggle="toggle(candidate)"
            />
          </TransitionGroup>
        </div>
      </Transition>
    </main>

    <footer
      v-if="phase === 'ready' && candidates.length > 0"
      class="sticky bottom-0 space-y-2 border-t border-border bg-background p-3"
    >
      <Button
        variant="tactical"
        class="w-full"
        :disabled="selected.size === 0"
        :loading="importing"
        @click="importSelected"
      >
        {{
          selected.size === 0
            ? "Import"
            : `Import ${selected.size} ${selected.size === 1 ? "Match" : "Matches"}`
        }}
      </Button>
      <p
        v-if="selectedCandidates.some((c) => c.source === 'faceit')"
        class="text-center text-[0.7rem] text-muted-foreground"
      >
        FACEIT demos are signed in a FACEIT tab, one at a time.
      </p>
    </footer>
  </div>
</template>
