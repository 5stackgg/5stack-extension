<script setup lang="ts">
import { browser } from "wxt/browser";
import { LogIn } from "lucide-vue-next";
import Button from "./ui/Button.vue";

const props = defineProps<{ origin: string }>();

const host = new URL(props.origin).host;
defineEmits<{ "change-panel": [] }>();

function logIn() {
  void browser.tabs.create({ url: `${props.origin}/login` });
}
</script>

<template>
  <div class="space-y-4 p-4">
    <div>
      <div
        class="mb-2 inline-flex items-center gap-2 font-sans text-[0.72rem] uppercase tracking-[0.24em] text-muted-foreground"
      >
        <span class="inline-block h-[2px] w-[10px] bg-[hsl(var(--tac-amber))]" />
        Log In
      </div>
      <p class="text-[0.85rem] text-muted-foreground">
        Log in to {{ host }} in this browser. This panel
        picks it up on its own once you are in.
      </p>
    </div>
    <Button variant="tactical" class="w-full" @click="logIn">
      <LogIn />
      Log In to 5Stack
    </Button>
    <button
      type="button"
      class="w-full text-center text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      @click="$emit('change-panel')"
    >
      Use a self-hosted panel
    </button>
  </div>
</template>
