<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ progress?: number }>();

const RADIUS = 7;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const known = computed(() => typeof props.progress === "number");
const offset = computed(() =>
  known.value
    ? CIRCUMFERENCE * (1 - Math.min(Math.max(props.progress!, 0), 100) / 100)
    : CIRCUMFERENCE * 0.72,
);
</script>

<template>
  <svg
    viewBox="0 0 18 18"
    :class="[
      'size-[18px] shrink-0 -rotate-90',
      known ? '' : 'animate-spin motion-reduce:animate-none',
    ]"
    role="progressbar"
    :aria-valuenow="known ? progress : undefined"
    aria-valuemin="0"
    aria-valuemax="100"
  >
    <circle
      cx="9"
      cy="9"
      :r="RADIUS"
      fill="none"
      stroke-width="2.25"
      class="stroke-muted"
    />
    <circle
      cx="9"
      cy="9"
      :r="RADIUS"
      fill="none"
      stroke-width="2.25"
      stroke-linecap="round"
      class="stroke-[hsl(var(--tac-amber))] transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none"
      :stroke-dasharray="CIRCUMFERENCE"
      :stroke-dashoffset="offset"
    />
  </svg>
</template>
