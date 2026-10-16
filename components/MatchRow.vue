<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { ArrowUpRight, CircleCheck } from "lucide-vue-next";
import ProgressRing from "./ui/ProgressRing.vue";
import type { Candidate } from "@/lib/candidates";
import { mapLabel } from "@/lib/candidates";
import type { Lookup } from "@/lib/panel";

const props = defineProps<{
  candidate: Candidate;
  lookup?: Lookup;
  progress?: string;
  error?: string;
  disabledReason?: string;
  selectable: boolean;
  selected: boolean;
  origin: string;
  tag?: string;
}>();

defineEmits<{ toggle: [] }>();

const thisYear = new Date().getFullYear();

function formatDate(iso: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === thisYear ? {} : { year: "numeric" }),
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

const maps = computed(() =>
  props.candidate.mapNames.length
    ? props.candidate.mapNames.map(mapLabel).join(" · ")
    : props.candidate.source === "faceit"
      ? "FACEIT match"
      : "Valve match",
);

const details = computed(() =>
  [
    props.candidate.finishedAt ? formatDate(props.candidate.finishedAt) : null,
    props.candidate.source === "faceit" ? "FACEIT" : "Valve",
  ].filter(Boolean),
);

const mode = computed(() => {
  const state = props.lookup?.state ?? "none";
  if (props.progress || state === "queued" || state === "importing") {
    return "working";
  }
  return state === "imported" ? "imported" : "pending";
});

// The download percent arrives a few points at a time every few seconds; it is
// counted up to rather than shown jumping.
const shownPercent = ref(props.lookup?.progress ?? 0);
let frame = 0;

watch(
  () => props.lookup?.progress,
  (target) => {
    cancelAnimationFrame(frame);
    if (typeof target !== "number") {
      return;
    }
    const from = shownPercent.value;
    if (
      target <= from ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      shownPercent.value = target;
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min((now - start) / 900, 1);
      shownPercent.value = Math.round(from + (target - from) * (1 - (1 - t) ** 3));
      if (t < 1) {
        frame = requestAnimationFrame(step);
      }
    };
    frame = requestAnimationFrame(step);
  },
);

onBeforeUnmount(() => cancelAnimationFrame(frame));

const matchUrl = computed(() => {
  const id = props.lookup?.match_id ?? props.lookup?.match_ids?.[0];
  return mode.value === "imported" && id
    ? `${props.origin}/matches/${id}`
    : undefined;
});

// The key names the stage, so the line fades only when the stage changes,
// never on every percent.
const note = computed(() => {
  const working = "text-[hsl(var(--tac-amber))]";
  if (props.progress) {
    return { key: props.progress, text: props.progress, tone: working };
  }
  if (mode.value === "working") {
    const lookup = props.lookup;
    if (lookup?.stage === "downloading") {
      return { key: "downloading", text: "Downloading", tone: working, percent: true };
    }
    if (lookup?.stage === "processing") {
      return { key: "processing", text: "Processing the demo", tone: working };
    }
    return lookup?.state === "importing"
      ? { key: "importing", text: "Importing", tone: working }
      : { key: "queued", text: "Queued", tone: working };
  }
  const failure =
    props.error ??
    (props.lookup?.state === "failed" ? props.lookup.reason : undefined);
  if (failure) {
    return { key: "failed", text: failure, tone: "text-destructive" };
  }
  if (props.disabledReason) {
    return {
      key: "disabled",
      text: props.disabledReason,
      tone: "text-muted-foreground",
    };
  }
  if (props.lookup?.match_ids?.length && mode.value === "pending") {
    return {
      key: "partial",
      text: "Some maps are already in 5Stack",
      tone: "text-muted-foreground",
    };
  }
  return null;
});
</script>

<template>
  <component
    :is="matchUrl ? 'a' : 'label'"
    :href="matchUrl"
    :target="matchUrl ? '_blank' : undefined"
    rel="noreferrer"
    :class="[
      'group flex items-start gap-3 border-b border-border px-4 py-2.5 transition-colors duration-150 last:border-b-0',
      selectable || matchUrl ? 'cursor-pointer hover:bg-muted/30' : '',
      !selectable && mode === 'pending' ? 'opacity-60' : '',
    ]"
  >
    <Transition
      mode="out-in"
      enter-active-class="transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none"
      enter-from-class="scale-75 opacity-0"
      leave-active-class="transition-[opacity,transform] duration-150 ease-in motion-reduce:transition-none"
      leave-to-class="scale-75 opacity-0"
    >
      <input
        v-if="mode === 'pending'"
        key="pending"
        type="checkbox"
        class="mt-0.5 size-4 shrink-0 cursor-pointer accent-[hsl(var(--tac-amber))] disabled:cursor-default disabled:opacity-30"
        :checked="selected"
        :disabled="!selectable"
        :aria-label="`Select ${maps}`"
        @change="$emit('toggle')"
      />
      <ProgressRing
        v-else-if="mode === 'working'"
        key="working"
        class="mt-px"
        :progress="
          !progress && lookup?.stage === 'downloading'
            ? (lookup.progress ?? 0)
            : undefined
        "
      />
      <CircleCheck
        v-else
        key="imported"
        class="mt-0.5 size-4 shrink-0 text-success"
      />
    </Transition>

    <div class="min-w-0 flex-1">
      <div class="flex items-baseline justify-between gap-3">
        <span class="flex min-w-0 items-center gap-2">
          <span class="truncate text-sm font-semibold">{{ maps }}</span>
          <span
            v-if="tag"
            class="shrink-0 rounded-sm bg-[hsl(var(--tac-amber)/0.15)] px-1.5 py-0.5 font-mono text-[0.55rem] uppercase leading-none tracking-[0.14em] text-[hsl(var(--tac-amber))]"
            >{{ tag }}</span
          >
        </span>
        <span
          v-if="candidate.score"
          class="shrink-0 font-mono text-xs tabular-nums text-muted-foreground"
          >{{ candidate.score.replace(" : ", " – ") }}</span
        >
      </div>
      <div class="mt-0.5 truncate text-xs text-muted-foreground">
        {{ details.join(" · ") }}
        <template v-if="candidate.title"> · {{ candidate.title }}</template>
      </div>
      <Transition
        mode="out-in"
        enter-active-class="transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none"
        enter-from-class="-translate-y-0.5 opacity-0"
        leave-active-class="transition-opacity duration-150 ease-in motion-reduce:transition-none"
        leave-to-class="opacity-0"
      >
        <div v-if="note" :key="note.key" class="mt-1 text-xs" :class="note.tone">
          {{ note.text }}
          <span v-if="note.percent" class="tabular-nums">{{ shownPercent }}%</span>
        </div>
      </Transition>
    </div>

    <ArrowUpRight
      v-if="matchUrl"
      class="mt-0.5 size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
    />
  </component>
</template>
