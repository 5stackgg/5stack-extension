<script setup lang="ts">
import { computed } from "vue";
import type { Candidate } from "@/lib/candidates";
import { mapLabel } from "@/lib/candidates";
import type { Lookup } from "@/lib/panel";
import StatusBadge from "./StatusBadge.vue";

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

const dateFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const maps = computed(() =>
  props.candidate.mapNames.length
    ? props.candidate.mapNames.map(mapLabel).join(" · ")
    : props.candidate.source === "faceit"
      ? "FACEIT match"
      : "Valve match",
);

const details = computed(() =>
  [
    props.candidate.finishedAt
      ? dateFormat.format(new Date(props.candidate.finishedAt))
      : null,
    props.candidate.score,
    props.candidate.source === "faceit" ? "FACEIT" : "Valve",
  ].filter(Boolean),
);

const state = computed(() =>
  props.progress ? "working" : (props.lookup?.state ?? "none"),
);

const matchId = computed(
  () => props.lookup?.match_id ?? props.lookup?.match_ids?.[0],
);

const note = computed(
  () =>
    props.progress ??
    props.error ??
    (props.lookup?.state === "failed" ? props.lookup.reason : undefined) ??
    props.disabledReason,
);
</script>

<template>
  <label
    :class="[
      'group flex items-start gap-3 border-b border-border px-4 py-3 transition-colors duration-150 last:border-b-0',
      selectable ? 'cursor-pointer hover:bg-muted/30' : '',
    ]"
  >
    <input
      type="checkbox"
      class="mt-0.5 size-4 shrink-0 cursor-pointer accent-[hsl(var(--tac-amber))] disabled:cursor-default disabled:opacity-30"
      :checked="selected"
      :disabled="!selectable"
      :aria-label="`Select ${maps}`"
      @change="$emit('toggle')"
    />
    <div class="min-w-0 flex-1">
      <div class="flex items-center justify-between gap-2">
        <div class="truncate text-sm font-semibold">{{ maps }}</div>
        <StatusBadge
          :state="state"
          :href="matchId ? `${origin}/matches/${matchId}` : undefined"
        />
      </div>
      <div
        v-if="candidate.title"
        class="truncate text-xs text-muted-foreground"
      >
        {{ candidate.title }}
      </div>
      <div
        class="mt-0.5 font-mono text-[0.64rem] uppercase tracking-[0.1em] text-muted-foreground"
      >
        {{ details.join(" · ") }}
      </div>
      <div
        v-if="note"
        :class="[
          'mt-1 text-xs',
          error || lookup?.state === 'failed'
            ? 'text-destructive'
            : progress
              ? 'text-[hsl(var(--tac-amber))]'
              : 'text-muted-foreground',
        ]"
      >
        {{ note }}
      </div>
    </div>
  </label>
</template>
