<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { browser } from "wxt/browser";
import { ExternalLink } from "lucide-vue-next";
import Button from "@/components/ui/Button.vue";
import { DEFAULT_PANEL, panelOrigin } from "@/lib/panel";

const origin = ref(DEFAULT_PANEL);
const host = computed(() => new URL(origin.value).host);

onMounted(async () => {
  origin.value = await panelOrigin.getValue();
});

function open(url: string) {
  void browser.tabs.create({ url });
  window.close();
}
</script>

<template>
  <div class="w-[300px] space-y-4 p-4">
    <div class="flex items-center gap-3">
      <img src="/icon/48.png" alt="" class="size-8 rounded-md" />
      <div class="text-sm font-bold uppercase tracking-[0.18em]">5Stack</div>
    </div>
    <p class="text-[0.85rem] text-muted-foreground">
      Open a FACEIT or Leetify page and click the icon again to import its
      matches into {{ host }}.
    </p>
    <div class="grid grid-cols-2 gap-2">
      <Button variant="outline" size="sm" @click="open('https://www.faceit.com/en/home')">
        FACEIT
      </Button>
      <Button variant="outline" size="sm" @click="open('https://leetify.com/app')">
        Leetify
      </Button>
    </div>
    <Button variant="ghost" size="sm" class="w-full" @click="open(origin)">
      <ExternalLink />
      Open {{ host }}
    </Button>
  </div>
</template>
