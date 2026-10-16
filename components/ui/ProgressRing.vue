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
  <span
    class="inline-flex size-[18px] shrink-0"
    role="progressbar"
    :aria-valuenow="known ? progress : undefined"
    aria-valuemin="0"
    aria-valuemax="100"
  >
    <!-- The spinner must not also carry a rotation: animate-spin's keyframes
         only set where it ends, so a starting rotate makes every turn snap
         back instead of completing the circle. -->
    <svg
      viewBox="0 0 18 18"
      :class="[
        'size-full',
        known ? '-rotate-90' : 'animate-spin motion-reduce:animate-none',
      ]"
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
        class="stroke-[hsl(var(--tac-amber))] transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none"
        :stroke-dasharray="CIRCUMFERENCE"
        :stroke-dashoffset="offset"
      />
    </svg>
  </span>
</template>
