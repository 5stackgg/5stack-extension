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

const result = computed(() => {
  switch (props.candidate.result) {
    case "win":
      return { letter: "W", tone: "bg-[hsl(var(--success)/0.15)] text-success" };
    case "loss":
      return { letter: "L", tone: "bg-[hsl(var(--destructive)/0.15)] text-destructive" };
    case "tie":
      return { letter: "T", tone: "bg-muted text-muted-foreground" };
    default:
      return null;
  }
});

const signed = (value: number, digits = 0) =>
  `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(digits)}`;

const statLine = computed(() => {
  const stats = props.candidate.stats;
  if (!stats) {
    return [];
  }
  const parts: Array<{ text: string; tone?: string }> = [];
  if (stats.kills !== undefined && stats.deaths !== undefined) {
    parts.push({
      text: `${stats.kills}/${stats.deaths}/${stats.assists ?? 0}`,
    });
  }
  if (stats.adr !== undefined) {
    parts.push({ text: `ADR ${Math.round(stats.adr)}` });
  }
  if (stats.headshotPercent !== undefined) {
    parts.push({ text: `${Math.round(stats.headshotPercent)}% HS` });
  }
  if (stats.rating !== undefined) {
    parts.push({
      text: `Leetify ${signed(stats.rating, 1)}`,
      tone: stats.rating >= 0 ? "text-success" : "text-destructive",
    });
  }
  if (stats.eloDelta !== undefined && stats.eloDelta !== 0) {
    parts.push({
      text: `${signed(stats.eloDelta)} Elo`,
      tone: stats.eloDelta > 0 ? "text-success" : "text-destructive",
    });
  }
  return parts;
});

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
          class="flex shrink-0 items-center gap-1.5 font-mono text-xs tabular-nums"
        >
          <span
            v-if="result"
            class="rounded-sm px-1 py-0.5 text-[0.6rem] font-bold leading-none"
            :class="result.tone"
            >{{ result.letter }}</span
          >
          <span :class="result ? 'text-foreground' : 'text-muted-foreground'">{{
            candidate.score.replace(" : ", " – ")
          }}</span>
        </span>
      </div>
      <div class="mt-0.5 truncate text-xs text-muted-foreground">
        {{ details.join(" · ") }}
        <template v-if="candidate.title"> · {{ candidate.title }}</template>
      </div>
      <div
        v-if="statLine.length"
        class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[0.64rem] tabular-nums text-muted-foreground"
      >
        <template v-for="(part, index) in statLine" :key="part.text">
          <span v-if="index" class="opacity-40">·</span>
          <span :class="part.tone">{{ part.text }}</span>
        </template>
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
