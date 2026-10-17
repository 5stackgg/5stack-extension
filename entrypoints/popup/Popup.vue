<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from "vue";
import { browser } from "wxt/browser";
import { ExternalLink } from "lucide-vue-next";
import Button from "@/components/ui/Button.vue";
import { DEFAULT_PANEL, panelOrigin, playerProfiles } from "@/lib/panel";
import { REFRESH_BADGE, type Unimported, unimportedCounts } from "@/lib/badge";

const origin = ref(DEFAULT_PANEL);
const counts = ref<Unimported | null>(null);
const faceitUrl = ref("https://www.faceit.com/en/home");
const leetifyUrl = ref("https://leetify.com/app");
const host = computed(() => new URL(origin.value).host);
const total = computed(() =>
  counts.value ? counts.value.faceit + counts.value.valve : 0,
);

let unwatch: (() => void) | undefined;

onMounted(async () => {
  origin.value = await panelOrigin.getValue();
  counts.value = await unimportedCounts.getValue();
  const profiles = await playerProfiles.getValue();
  faceitUrl.value = profiles?.faceit ?? faceitUrl.value;
  leetifyUrl.value = profiles?.leetify ?? leetifyUrl.value;
  unwatch = unimportedCounts.watch((next) => {
    counts.value = next;
  });
  void browser.runtime.sendMessage(REFRESH_BADGE).catch(() => undefined);
});

onBeforeUnmount(() => unwatch?.());

function open(url: string) {
  void browser.tabs.create({ url });
  window.close();
}
</script>

<template>
  <div class="w-[300px] space-y-4 p-4">
    <div class="flex items-center gap-3">
      <img src="/icon/48.png" alt="" class="size-8 rounded-md" />
      <div class="min-w-0 flex-1">
        <div class="text-sm font-bold uppercase tracking-[0.18em]">
          Match Importer
        </div>
        <button
          type="button"
          class="flex max-w-full items-center gap-1 font-mono text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground"
          :title="`Open ${host}`"
          :aria-label="`Open ${host}`"
          @click="open(origin)"
        >
          <span class="truncate">{{ host }}</span>
          <ExternalLink class="size-3 shrink-0" />
        </button>
      </div>
    </div>

    <p class="text-[0.85rem] text-muted-foreground">
      <template v-if="counts === null">
        Open FACEIT and click the icon again to import your matches into
        {{ host }}.
      </template>
      <template v-else-if="total > 0">
        <span class="font-semibold text-foreground">{{ total }}</span>
        of your recent matches
        {{ total === 1 ? "isn't" : "aren't" }} in {{ host }} yet.
      </template>
      <template v-else>Your recent matches are all in {{ host }}.</template>
    </p>

    <div class="grid grid-cols-2 gap-2">
      <Button
        variant="tactical"
        class="gap-2"
        @click="open(faceitUrl)"
      >
        FACEIT
        <span v-if="counts" class="tabular-nums opacity-70">{{
          counts.faceit
        }}</span>
      </Button>
      <Button
        variant="outline"
        class="gap-2"
        title="Your Valve matchmaking matches"
        @click="open(leetifyUrl)"
      >
        Leetify
        <span v-if="counts" class="tabular-nums text-muted-foreground">{{
          counts.valve
        }}</span>
      </Button>
    </div>
  </div>
</template>
