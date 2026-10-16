<script setup lang="ts">
import { computed } from "vue";
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

const matchUrl = computed(() => {
  const id = props.lookup?.match_id ?? props.lookup?.match_ids?.[0];
  return mode.value === "imported" && id
    ? `${props.origin}/matches/${id}`
    : undefined;
});

const note = computed(() => {
  if (props.progress) {
    return { text: props.progress, tone: "text-[hsl(var(--tac-amber))]" };
  }
  if (mode.value === "working") {
    const lookup = props.lookup;
    return {
      text:
        lookup?.stage === "downloading"
          ? `Downloading ${lookup.progress ?? 0}%`
          : lookup?.stage === "processing"
            ? "Processing the demo"
            : lookup?.state === "importing"
              ? "Importing"
              : "Queued",
      tone: "text-[hsl(var(--tac-amber))]",
    };
  }
  const failure =
    props.error ??
    (props.lookup?.state === "failed" ? props.lookup.reason : undefined);
  if (failure) {
    return { text: failure, tone: "text-destructive" };
  }
  if (props.disabledReason) {
    return { text: props.disabledReason, tone: "text-muted-foreground" };
  }
  if (props.lookup?.match_ids?.length && mode.value === "pending") {
    return {
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
    <input
      v-if="mode === 'pending'"
      type="checkbox"
      class="mt-0.5 size-4 shrink-0 cursor-pointer accent-[hsl(var(--tac-amber))] disabled:cursor-default disabled:opacity-30"
      :checked="selected"
      :disabled="!selectable"
      :aria-label="`Select ${maps}`"
      @change="$emit('toggle')"
    />
    <ProgressRing
      v-else-if="mode === 'working'"
      class="mt-px"
      :progress="
        !progress && lookup?.stage === 'downloading' ? lookup.progress : undefined
      "
    />
    <CircleCheck v-else class="mt-0.5 size-4 shrink-0 text-success" />

    <div class="min-w-0 flex-1">
      <div class="flex items-baseline justify-between gap-3">
        <span class="truncate text-sm font-semibold">{{ maps }}</span>
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
      <div v-if="note" class="mt-1 text-xs" :class="note.tone">
        {{ note.text }}
      </div>
    </div>

    <ArrowUpRight
      v-if="matchUrl"
      class="mt-0.5 size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
    />
  </component>
</template>
