<script setup lang="ts">
import { computed } from "vue";
import type { PanelUser } from "@/lib/panel";

const props = defineProps<{ origin: string | null; user: PanelUser | null }>();

const host = computed(() => (props.origin ? new URL(props.origin).host : null));
defineEmits<{ "change-panel": [] }>();
</script>

<template>
  <header
    class="flex items-center gap-3 border-b border-border bg-card/50 px-4 py-3 [backdrop-filter:blur(6px)]"
  >
    <img src="/icon/48.png" alt="" class="size-8 rounded-md" />
    <div class="min-w-0 flex-1">
      <div class="text-sm font-bold uppercase tracking-[0.18em]">5Stack</div>
      <button
        v-if="host"
        type="button"
        class="block max-w-full truncate font-mono text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
        title="Change panel"
        @click="$emit('change-panel')"
      >
        {{ host }}
      </button>
    </div>
    <div v-if="user" class="flex min-w-0 items-center gap-2">
      <span class="truncate text-xs text-muted-foreground">{{ user.name }}</span>
      <img
        v-if="user.avatar_url"
        :src="user.avatar_url"
        alt=""
        class="size-7 rounded-full border border-border"
      />
    </div>
  </header>
</template>
