<script setup lang="ts">
import { computed } from "vue";
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "reka-ui";
import {
  Check,
  ChevronDown,
  ExternalLink,
  LogOut,
  Plus,
  Settings,
  Trash2,
} from "lucide-vue-next";
import { DEFAULT_PANEL, type PanelUser } from "@/lib/panel";

const props = defineProps<{
  origin: string;
  user: PanelUser | null;
  panels: Array<string>;
  version: string;
}>();

defineEmits<{
  "switch-panel": [origin: string];
  "add-panel": [];
  "remove-panel": [origin: string];
  "open-panel": [];
  logout: [];
}>();

const hostOf = (origin: string) => {
  try {
    return new URL(origin).host;
  } catch {
    return origin;
  }
};
const host = computed(() => hostOf(props.origin));

const menu =
  "z-50 min-w-[13rem] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg";
const item =
  "relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0";
const label =
  "px-2 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground";
</script>

<template>
  <header
    class="flex items-center gap-3 border-b border-border bg-card/50 px-4 py-3 [backdrop-filter:blur(6px)]"
  >
    <img src="/icon/48.png" alt="" class="size-8 rounded-md" />
    <div class="flex-1">
      <div class="whitespace-nowrap text-sm font-bold uppercase tracking-[0.18em]">
        Match Importer
      </div>
      <!-- Only the title sets how narrow this column can get: a long panel
           address truncates instead of pushing the header past the edge. -->
      <div class="[contain:inline-size]">
        <DropdownMenuRoot>
          <DropdownMenuTrigger
            class="flex max-w-full items-center gap-1 font-mono text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground"
            aria-label="Switch panel"
          >
            <span class="truncate">{{ host }}</span>
            <ChevronDown class="size-3 shrink-0" />
          </DropdownMenuTrigger>
          <DropdownMenuPortal>
            <DropdownMenuContent :class="menu" align="start" :side-offset="6">
              <DropdownMenuLabel :class="label">Panels</DropdownMenuLabel>
              <DropdownMenuItem
                v-for="panel in panels"
                :key="panel"
                :class="item"
                @select="$emit('switch-panel', panel)"
              >
                <Check
                  :class="panel === origin ? 'opacity-100' : 'opacity-0'"
                  class="text-[hsl(var(--tac-amber))]"
                />
                <span class="truncate">{{ hostOf(panel) }}</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator class="-mx-1 my-1 h-px bg-border" />
              <DropdownMenuItem :class="item" @select="$emit('add-panel')">
                <Plus />
                Add a Panel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenuRoot>
      </div>
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

    <DropdownMenuRoot>
      <DropdownMenuTrigger
        class="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
        aria-label="Settings"
      >
        <Settings class="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent :class="menu" align="end" :side-offset="6">
          <DropdownMenuItem :class="item" @select="$emit('open-panel')">
            <ExternalLink />
            Open {{ host }}
          </DropdownMenuItem>
          <DropdownMenuItem v-if="user" :class="item" @select="$emit('logout')">
            <LogOut />
            Log Out
          </DropdownMenuItem>
          <DropdownMenuItem
            v-if="origin !== DEFAULT_PANEL"
            :class="item"
            class="text-destructive data-[highlighted]:text-destructive"
            @select="$emit('remove-panel', origin)"
          >
            <Trash2 />
            Remove This Panel
          </DropdownMenuItem>
          <DropdownMenuSeparator class="-mx-1 my-1 h-px bg-border" />
          <DropdownMenuLabel :class="label">Version {{ version }}</DropdownMenuLabel>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenuRoot>
  </header>
</template>
