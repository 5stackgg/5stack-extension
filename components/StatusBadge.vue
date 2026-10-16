<script setup lang="ts">
import { computed } from "vue";
import { ArrowUpRight, Loader2 } from "lucide-vue-next";
import type { ImportState } from "@/lib/panel";

const props = defineProps<{
  state: ImportState | "working" | "partial";
  href?: string;
}>();

const look = computed(
  () =>
    ({
      imported: {
        label: "In 5Stack",
        classes:
          "border-[hsl(var(--success)/0.4)] bg-[hsl(var(--success)/0.12)] text-success",
      },
      partial: {
        label: "Partial",
        classes:
          "border-[hsl(var(--success)/0.4)] bg-[hsl(var(--success)/0.12)] text-success",
      },
      queued: {
        label: "Queued",
        classes:
          "border-[hsl(var(--tac-amber)/0.45)] bg-[hsl(var(--tac-amber)/0.12)] text-[hsl(var(--tac-amber))]",
      },
      importing: {
        label: "Importing",
        classes:
          "border-[hsl(var(--tac-amber)/0.45)] bg-[hsl(var(--tac-amber)/0.12)] text-[hsl(var(--tac-amber))]",
      },
      working: {
        label: "Sending",
        classes:
          "border-[hsl(var(--tac-amber)/0.45)] bg-[hsl(var(--tac-amber)/0.12)] text-[hsl(var(--tac-amber))]",
      },
      failed: {
        label: "Failed",
        classes:
          "border-[hsl(var(--destructive)/0.45)] bg-[hsl(var(--destructive)/0.12)] text-destructive",
      },
      none: {
        label: "New",
        classes: "border-border bg-muted/30 text-muted-foreground",
      },
    })[props.state],
);
</script>

<template>
  <component
    :is="href ? 'a' : 'span'"
    :href="href"
    :target="href ? '_blank' : undefined"
    rel="noreferrer"
    :class="[
      'inline-flex h-6 shrink-0 items-center gap-1 rounded-md border px-2 font-mono text-[0.6rem] uppercase leading-none tracking-[0.14em] transition-colors duration-150',
      look.classes,
      href ? 'hover:bg-[hsl(var(--success)/0.2)]' : '',
    ]"
  >
    <Loader2
      v-if="state === 'importing' || state === 'working'"
      class="size-3 animate-spin motion-reduce:animate-none"
    />
    {{ look.label }}
    <ArrowUpRight v-if="href" class="size-3" />
  </component>
</template>
