<script setup lang="ts">
import { ref } from "vue";
import { browser } from "wxt/browser";
import { normalizePanelOrigin, originPermission } from "@/lib/panel";
import Button from "./ui/Button.vue";

const props = defineProps<{ initial: string; error?: string | null }>();
const emit = defineEmits<{ connect: [origin: string] }>();

const input = ref(props.initial.replace(/^https:\/\//, ""));
const problem = ref<string | null>(null);
const connecting = ref(false);

// Chrome only grants a permission from inside the click that asked for it,
// so the request has to start before anything is awaited.
function connect() {
  const origin = normalizePanelOrigin(input.value);
  if (!origin) {
    problem.value = "Enter your panel's address, like 5stack.gg.";
    return;
  }
  problem.value = null;
  connecting.value = true;
  browser.permissions
    .request({ origins: [originPermission(origin)] })
    .then((granted) => {
      if (granted) {
        emit("connect", origin);
      } else {
        problem.value = `The extension needs access to ${new URL(origin).host} to reach your panel.`;
      }
    })
    .catch((error: Error) => {
      problem.value = error.message;
    })
    .finally(() => {
      connecting.value = false;
    });
}
</script>

<template>
  <form class="space-y-4 p-4" @submit.prevent="connect">
    <div>
      <div
        class="mb-2 inline-flex items-center gap-2 font-sans text-[0.72rem] uppercase tracking-[0.24em] text-muted-foreground"
      >
        <span class="inline-block h-[2px] w-[10px] bg-[hsl(var(--tac-amber))]" />
        Your Panel
      </div>
      <p class="text-[0.85rem] text-muted-foreground">
        The 5Stack panel matches are imported into. You stay signed in with
        your normal 5Stack login.
      </p>
    </div>
    <input
      v-model="input"
      type="text"
      inputmode="url"
      autocomplete="url"
      spellcheck="false"
      placeholder="5stack.gg"
      aria-label="Panel address"
      class="h-9 w-full rounded-md border border-input bg-transparent px-3 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    />
    <p v-if="problem ?? error" class="text-xs text-destructive">
      {{ problem ?? error }}
    </p>
    <Button type="submit" variant="tactical" class="w-full" :loading="connecting">
      Connect
    </Button>
  </form>
</template>
