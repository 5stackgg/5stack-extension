<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { Loader2 } from "lucide-vue-next";
import { cn } from "@5stack/ui/lib/utils";
import { buttonVariants, type ButtonVariants } from "./button";

const props = defineProps<{
  variant?: ButtonVariants["variant"];
  size?: ButtonVariants["size"];
  class?: HTMLAttributes["class"];
  loading?: boolean;
  disabled?: boolean;
  type?: "button" | "submit";
}>();
</script>

<template>
  <button
    :type="props.type ?? 'button'"
    :class="cn(buttonVariants({ variant, size }), props.class)"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
  >
    <Loader2 v-if="loading" class="animate-spin motion-reduce:animate-none" />
    <slot />
  </button>
</template>
