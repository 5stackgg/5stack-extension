<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { browser } from "wxt/browser";
import { Info, Loader2, RotateCw } from "lucide-vue-next";
import AppHeader from "@/components/AppHeader.vue";
import LoginGate from "@/components/LoginGate.vue";
import MatchRow from "@/components/MatchRow.vue";
import OriginSetup from "@/components/OriginSetup.vue";
import AnimatedFilters from "@/components/ui/AnimatedFilters.vue";
import Button from "@/components/ui/Button.vue";
import type { Candidate } from "@/lib/candidates";
import { discover, importFaceitMatch, ownMatches } from "@/lib/discover";
import { type Page, pageFromUrl, samePage } from "@/lib/page";
import {
  DEFAULT_PANEL,
  type Lookup,
  PanelError,
  type PanelUser,
  panel,
  panelOrigin,
  rememberProfiles,
  savedPanels,
} from "@/lib/panel";
import { activeTab } from "@/lib/tabs";
import { anyFaceitTab, showUnimported, unimported } from "@/lib/badge";

type Phase = "loading" | "setup" | "error" | "login" | "ready";

const LOOKUP_BATCH = 50;
// One import runs at a time, from a batch of at most ten, so a long history
// never floods the player's panel or their own connection.
const MAX_BATCH = 10;
const IMPORT_TIMEOUT_MS = 15 * 60 * 1000;
const POLL_MS = 3_000;

const origin = ref(DEFAULT_PANEL);
const panels = ref<Array<string>>([DEFAULT_PANEL]);
const version = browser.runtime.getManifest().version;
const phase = ref<Phase>("loading");
const user = ref<PanelUser | null>(null);
const panelProblem = ref<string | null>(null);

// Each FACEIT or Leetify tab gets its own panel; background.ts names the tab.
const panelTabId = Number(new URLSearchParams(location.search).get("tab")) || undefined;

// The player's own matches are the list; they are loaded once and kept, so
// moving between FACEIT and Leetify pages never empties it.
const ownList = ref<Array<Candidate>>([]);
const ownLoaded = ref(false);
const ownProblem = ref<string | null>(null);

// What the page in this tab shows, for context: the room the player was in
// is pinned to the top, and someone else's page says why it is not offered,
// unless the player may import anyone's matches.
const page = ref<Page>({ site: "none" });
const tabId = ref<number>();
const pageList = ref<Array<Candidate>>([]);
const pageLoading = ref(false);
const pageProblem = ref<string | null>(null);

const lookups = ref<Record<string, Lookup>>({});
const queue = ref<Array<string>>([]);
const queueTotal = ref(0);
const queueDone = ref(0);
const progress = ref<Record<string, string>>({});
const errors = ref<Record<string, string>>({});
const selected = ref(new Set<string>());
const importing = ref(false);

const submitted = new Set<string>();
const retried = new Set<string>();
let discoverRun = 0;
let poll: ReturnType<typeof setInterval> | undefined;
let signing: Promise<unknown> = Promise.resolve();

const othersPage = computed(
  () =>
    page.value.site !== "none" &&
    page.value.kind !== "home" &&
    pageList.value.length > 0 &&
    !pageList.value.some((candidate) => candidate.own),
);

const showingPage = computed(
  () => othersPage.value && !!user.value?.imports.anyone,
);

const pinned = computed(() =>
  page.value.site === "faceit" &&
  page.value.kind === "room" &&
  pageList.value[0]?.own
    ? pageList.value[0]
    : null,
);

const candidates = computed<Array<Candidate>>(() => {
  if (showingPage.value) {
    return pageList.value;
  }
  const pin = pinned.value;
  return pin
    ? [pin, ...ownList.value.filter((candidate) => candidate.key !== pin.key)]
    : ownList.value;
});

const listLoading = computed(() =>
  showingPage.value ? pageLoading.value : !ownLoaded.value,
);
const listProblem = computed(() =>
  showingPage.value ? pageProblem.value : ownProblem.value,
);

const pageSubject = computed(() => {
  switch (page.value.site) {
    case "faceit":
      return page.value.kind === "player"
        ? `${page.value.nickname}'s matches`
        : "This match";
    case "leetify":
      return page.value.kind === "profile" ? "This profile's matches" : "This match";
    default:
      return "";
  }
});

const contextNote = computed(() => {
  if (showingPage.value) {
    return `${pageSubject.value}. As a match organizer you can import them.`;
  }
  if (othersPage.value) {
    return "You can only import matches you played. Yours are below.";
  }
  return null;
});

type Tab = "import" | "imported";

const listTab = ref<Tab>("import");

// Imports in flight stay under To Import, with their progress on the row,
// until they land under Imported.
function tabOf(candidate: Candidate): Tab {
  const state = lookups.value[candidate.key]?.state ?? "none";
  return state === "imported" && !progress.value[candidate.key]
    ? "imported"
    : "import";
}

const tabCounts = computed(() => {
  const counts: Record<Tab, number> = { import: 0, imported: 0 };
  for (const candidate of candidates.value) {
    counts[tabOf(candidate)]++;
  }
  return counts;
});

const tabOptions = computed(() => [
  { key: "import", label: "To Import", count: tabCounts.value.import },
  { key: "imported", label: "Imported", count: tabCounts.value.imported },
]);

const tabModel = computed({
  get: () => listTab.value,
  set: (next: string) => {
    listTab.value = next as Tab;
  },
});

const listKey = computed(() => listTab.value);

const visibleCandidates = computed(() =>
  candidates.value.filter((candidate) => tabOf(candidate) === listTab.value),
);

const selectableVisible = computed(() =>
  visibleCandidates.value.filter(selectable),
);

const selectedVisible = computed(
  () =>
    selectableVisible.value.filter((candidate) =>
      selected.value.has(candidate.key),
    ).length,
);

const roomLeft = computed(() =>
  Math.max(0, MAX_BATCH - queue.value.length - selectedCandidates.value.length),
);

const allTicked = computed(
  () =>
    selectedVisible.value > 0 &&
    (selectedVisible.value === selectableVisible.value.length ||
      roomLeft.value === 0),
);

function toggleAll() {
  const next = new Set(selected.value);
  if (allTicked.value) {
    for (const candidate of selectableVisible.value) {
      next.delete(candidate.key);
    }
  } else {
    let room = roomLeft.value;
    for (const candidate of selectableVisible.value) {
      if (room > 0 && !next.has(candidate.key)) {
        next.add(candidate.key);
        room--;
      }
    }
  }
  selected.value = next;
}

function tickable(candidate: Candidate): boolean {
  return (
    selectable(candidate) &&
    (selected.value.has(candidate.key) || roomLeft.value > 0)
  );
}

const emptyTabText = computed(
  () =>
    ({
      import: "Everything here is in 5Stack.",
      imported: "None of these are in 5Stack yet.",
    })[listTab.value],
);

const selectedCandidates = computed(() =>
  candidates.value.filter((candidate) => selected.value.has(candidate.key)),
);

function disabledReason(candidate: Candidate): string | undefined {
  if (user.value && !user.value.imports[candidate.source]) {
    return `${candidate.source === "faceit" ? "FACEIT" : "Valve"} imports are off on this panel.`;
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
  } else if (roomLeft.value > 0) {
    next.add(candidate.key);
  }
  selected.value = next;
}

function selectNew(list: Array<Candidate>) {
  const next = new Set(selected.value);
  let room = roomLeft.value;
  for (const candidate of list.filter(selectable)) {
    if (room > 0 && !next.has(candidate.key)) {
      next.add(candidate.key);
      room--;
    }
  }
  selected.value = next;
}

function settleTab() {
  listTab.value =
    tabCounts.value.import > 0 || tabCounts.value.imported === 0
      ? "import"
      : "imported";
}

function updateBadge() {
  if (ownLoaded.value && user.value) {
    void showUnimported(
      unimported(ownList.value, lookups.value, user.value.imports),
    );
  }
}

async function loadOwn() {
  ownProblem.value = null;
  try {
    const faceitTab = page.value.site === "faceit" ? tabId.value : undefined;
    const found = await ownMatches(user.value!, faceitTab ?? (await anyFaceitTab()));
    await lookupAll(found);
    ownList.value = found;
    selectNew(found);
  } catch (error) {
    ownProblem.value = (error as Error).message;
  } finally {
    ownLoaded.value = true;
    settleTab();
    updateBadge();
  }
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
  void rememberProfiles(me);
  phase.value = "ready";
  ownLoaded.value = false;
  ownList.value = [];
  await refreshPage(true);
  await loadOwn();
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
  ownList.value = [];
  pageList.value = [];
  phase.value = "login";
  void showUnimported(null);
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
  pageList.value = [];
  pageProblem.value = null;
  if (next.site === "none" || next.kind === "home") {
    pageLoading.value = false;
    return;
  }

  pageLoading.value = true;
  try {
    const found = await discover(next, tab?.id, user.value!);
    if (run !== discoverRun) {
      return;
    }
    await lookupAll(found);
    if (run === discoverRun) {
      pageList.value = found;
      if (user.value?.imports.anyone || found.some((c) => c.own)) {
        selectNew(found.filter((c) => c.own || user.value?.imports.anyone));
      }
    }
  } catch (error) {
    if (run === discoverRun) {
      pageProblem.value = (error as Error).message;
    }
  } finally {
    if (run === discoverRun) {
      pageLoading.value = false;
    }
  }
}

async function lookupAll(listed: Array<Candidate> = candidates.value) {
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

function clearProgress(key: string) {
  const { [key]: _, ...rest } = progress.value;
  progress.value = rest;
}

function findCandidate(key: string): Candidate | undefined {
  return [...ownList.value, ...pageList.value].find(
    (candidate) => candidate.key === key,
  );
}

function importSelected() {
  const chosen = selectedCandidates.value.slice(
    0,
    Math.max(0, MAX_BATCH - queue.value.length),
  );
  selected.value = new Set();
  for (const candidate of chosen) {
    delete errors.value[candidate.key];
    progress.value = { ...progress.value, [candidate.key]: "In line" };
  }
  queue.value = [...queue.value, ...chosen.map((candidate) => candidate.key)];
  queueTotal.value += chosen.length;
  if (!importing.value) {
    void runQueue();
  }
}

async function sendOne(candidate: Candidate) {
  if (candidate.source === "faceit") {
    await importFaceit(candidate);
    return;
  }
  progress.value = { ...progress.value, [candidate.key]: "Sending to 5Stack" };
  const result = await panel.importValve(origin.value, [candidate.id]);
  lookups.value = {
    ...lookups.value,
    [candidate.key]: result.valve[candidate.id] ?? { state: "none" },
  };
}

// The next import starts only once 5Stack is done with this one, imported or
// failed, so a batch never downloads more than one demo at a time.
async function waitUntilDone(candidate: Candidate) {
  clearProgress(candidate.key);
  const deadline = Date.now() + IMPORT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const state = lookups.value[candidate.key]?.state;
    if (state !== "queued" && state !== "importing") {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    await lookupAll([candidate]).catch(() => undefined);
  }
}

async function runQueue() {
  importing.value = true;
  try {
    while (queue.value.length > 0) {
      const [key, ...rest] = queue.value;
      queue.value = rest;
      const candidate = key ? findCandidate(key) : undefined;
      if (!key || !candidate) {
        if (key) {
          clearProgress(key);
        }
        continue;
      }
      try {
        await sendOne(candidate);
        await waitUntilDone(candidate);
      } catch (error) {
        const message = (error as Error).message;
        errors.value = { ...errors.value, [key]: message };
        if (error instanceof PanelError && error.status === 429) {
          for (const waiting of queue.value) {
            clearProgress(waiting);
            errors.value = { ...errors.value, [waiting]: message };
          }
          queue.value = [];
        }
      } finally {
        clearProgress(key);
        queueDone.value++;
        updateBadge();
      }
    }
  } finally {
    importing.value = false;
    queueTotal.value = 0;
    queueDone.value = 0;
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
          return refreshPage(true).then(loadOwn);
        })
        .catch(() => undefined);
      return;
    }
    const waiting = candidates.value.some((candidate) => {
      const state = lookups.value[candidate.key]?.state;
      return state === "queued" || state === "importing";
    });
    if (phase.value === "ready" && waiting && !importing.value) {
      void lookupAll()
        .then(updateBadge)
        .catch(() => undefined);
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

        <div v-else key="list">
          <div
            v-if="contextNote"
            class="flex items-start gap-2 border-b border-border bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground"
          >
            <Info class="mt-px size-3.5 shrink-0" />
            <span>{{ contextNote }}</span>
          </div>

          <div
            v-if="!listLoading && !listProblem && candidates.length > 0"
            class="border-b border-border px-4 py-2.5"
          >
            <AnimatedFilters v-model="tabModel" :options="tabOptions" />
          </div>

          <div
            v-if="
              !listLoading &&
              !listProblem &&
              listTab === 'import' &&
              selectableVisible.length > 0
            "
            class="border-b border-border px-4 py-2"
          >
            <label
              class="flex cursor-pointer select-none items-center gap-3 whitespace-nowrap text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <input
                type="checkbox"
                class="size-4 cursor-pointer accent-[hsl(var(--tac-amber))]"
                :checked="allTicked"
                :indeterminate="selectedVisible > 0 && !allTicked"
                @change="toggleAll"
              />
              <span>
                {{
                  selectedVisible === 0
                    ? selectableVisible.length > MAX_BATCH
                      ? `Select ${MAX_BATCH} Newest`
                      : "Select All"
                    : `${selectedVisible} of ${selectableVisible.length} selected`
                }}
                <span
                  v-if="selectableVisible.length > MAX_BATCH"
                  class="text-muted-foreground/60"
                  >· {{ MAX_BATCH }} at a time</span
                >
              </span>
            </label>
          </div>

          <div v-if="listLoading" class="divide-y divide-border">
            <div v-for="row in 4" :key="row" class="space-y-2 px-4 py-3">
              <div class="h-4 w-1/2 animate-pulse rounded bg-muted motion-reduce:animate-none" />
              <div class="h-3 w-1/3 animate-pulse rounded bg-muted/60 motion-reduce:animate-none" />
            </div>
          </div>

          <div v-else-if="listProblem" class="space-y-3 p-4">
            <p class="text-sm text-destructive">{{ listProblem }}</p>
            <Button
              variant="outline"
              size="sm"
              @click="showingPage ? refreshPage(true) : loadOwn()"
            >
              <RotateCw />
              Try Again
            </Button>
          </div>

          <p
            v-else-if="candidates.length === 0"
            class="p-4 text-[0.85rem] text-muted-foreground"
          >
            {{
              showingPage
                ? "No matches with demos on this page."
                : "No recent matches found for you on FACEIT or Leetify. Leetify needs a public profile, and FACEIT history loads from an open FACEIT tab."
            }}
          </p>

          <p
            v-else-if="visibleCandidates.length === 0"
            class="p-4 text-[0.85rem] text-muted-foreground"
          >
            {{ emptyTabText }}
          </p>

          <!-- Switching tab or source swaps the whole list, old out then new in:
               crossfading row by row stacked the two lists' first rows. -->
          <Transition
            v-else
            mode="out-in"
            enter-active-class="transition-opacity duration-200 ease-out motion-reduce:transition-none"
            enter-from-class="opacity-0"
            leave-active-class="transition-opacity duration-100 ease-in motion-reduce:transition-none"
            leave-to-class="opacity-0"
          >
            <!-- Within one list, a row that finishes fades out of the flow
                 (absolute) while the rows below slide up into its place. -->
            <TransitionGroup
              :key="listKey"
              tag="div"
              class="relative"
              enter-active-class="transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none"
              enter-from-class="translate-y-1 opacity-0"
              leave-active-class="absolute inset-x-0 transition-opacity duration-150 ease-in motion-reduce:transition-none"
              leave-to-class="opacity-0"
              move-class="transition-transform duration-300 ease-out motion-reduce:transition-none"
            >
              <MatchRow
                v-for="candidate in visibleCandidates"
                :key="candidate.key"
                :candidate="candidate"
                :lookup="lookups[candidate.key]"
                :progress="progress[candidate.key]"
                :error="errors[candidate.key]"
                :disabled-reason="disabledReason(candidate)"
                :selectable="tickable(candidate)"
                :selected="selected.has(candidate.key)"
                :origin="origin"
                :tag="pinned?.key === candidate.key ? 'This Match' : undefined"
                @toggle="toggle(candidate)"
              />
            </TransitionGroup>
          </Transition>
        </div>
      </Transition>
    </main>

    <footer
      v-if="phase === 'ready' && candidates.length > 0"
      class="sticky bottom-0 border-t border-border bg-background p-3"
    >
      <Button
        variant="tactical"
        class="w-full"
        :disabled="selectedCandidates.length === 0"
        :loading="importing && selectedCandidates.length === 0"
        @click="importSelected"
      >
        {{
          selectedCandidates.length > 0
            ? importing
              ? `Add ${selectedCandidates.length} to the Queue`
              : `Import ${selectedCandidates.length} ${selectedCandidates.length === 1 ? "Match" : "Matches"}`
            : importing
              ? `Importing ${Math.min(queueDone + 1, queueTotal)} of ${queueTotal}`
              : "Import"
        }}
      </Button>
    </footer>
  </div>
</template>
