<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from "vue";
import { browser } from "wxt/browser";
import { ExternalLink } from "lucide-vue-next";
import Button from "@/components/ui/Button.vue";
import { DEFAULT_PANEL, panelOrigin } from "@/lib/panel";
import { REFRESH_BADGE, type Unimported, unimportedCounts } from "@/lib/badge";

const origin = ref(DEFAULT_PANEL);
const counts = ref<Unimported | null>(null);
const host = computed(() => new URL(origin.value).host);
const total = computed(() =>
  counts.value ? counts.value.faceit + counts.value.valve : 0,
);

let unwatch: (() => void) | undefined;

onMounted(async () => {
  origin.value = await panelOrigin.getValue();
  counts.value = await unimportedCounts.getValue();
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
      <div class="flex-1 text-sm font-bold uppercase tracking-[0.18em]">
        5Stack
      </div>
      <button
        type="button"
        class="inline-flex h-8 items-center gap-1.5 rounded-md px-2 font-mono text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        :title="`Open ${host}`"
        :aria-label="`Open ${host}`"
        @click="open(origin)"
      >
        {{ host }}
        <ExternalLink class="size-3.5" />
      </button>
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
        @click="open('https://www.faceit.com/en/home')"
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
        @click="open('https://leetify.com/app')"
      >
        Leetify
        <span v-if="counts" class="tabular-nums text-muted-foreground">{{
          counts.valve
        }}</span>
      </Button>
    </div>
  </div>
</template>
