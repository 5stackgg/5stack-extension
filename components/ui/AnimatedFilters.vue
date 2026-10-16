<script lang="ts" setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

// A trimmed copy of web's components/common/AnimatedFilters.vue (square,
// block): the same sliding amber pill, without its tooltip and collapse modes.
type FilterOption = {
  key: string;
  label: string;
  count?: number;
  disabled?: boolean;
};

const props = defineProps<{ options: Array<FilterOption> }>();

const model = defineModel<string>();

function buttonState(opt: FilterOption) {
  const selected = model.value === opt.key;
  if (opt.disabled) {
    return "cursor-not-allowed text-muted-foreground/40";
  }
  return selected
    ? "font-bold text-black"
    : "text-muted-foreground hover:text-foreground";
}

function countTone(opt: FilterOption) {
  return model.value !== opt.key && (opt.count ?? 0) === 0 ? "opacity-35" : "";
}

const containerRef = ref<HTMLElement | null>(null);
const indicatorRef = ref<HTMLElement | null>(null);
const btns = new Map<string, HTMLElement>();

function setBtn(el: Element | null, key: string) {
  if (el) {
    btns.set(key, el as HTMLElement);
  } else {
    btns.delete(key);
  }
}

type Rect = { left: number; top: number; width: number; height: number };

let placed: Rect | null = null;

function place(rect: Rect | null) {
  const el = indicatorRef.value;
  if (!el) {
    return;
  }
  placed = rect;
  if (!rect) {
    el.style.opacity = "0";
    return;
  }
  el.style.left = `${rect.left}px`;
  el.style.top = `${rect.top}px`;
  el.style.width = `${rect.width}px`;
  el.style.height = `${rect.height}px`;
  el.style.opacity = "1";
}

function tabRect(): Rect | null {
  const el = model.value ? btns.get(model.value) : null;
  if (!el || !containerRef.value || el.offsetWidth === 0) {
    return null;
  }
  return {
    left: el.offsetLeft,
    top: el.offsetTop,
    width: el.offsetWidth,
    height: el.offsetHeight,
  };
}

function drawnRect(): Rect | null {
  const el = indicatorRef.value;
  const strip = containerRef.value;
  if (!el || !strip || !placed) {
    return null;
  }
  const box = el.getBoundingClientRect();
  const origin = strip.getBoundingClientRect();
  return {
    left: box.left - origin.left - strip.clientLeft,
    top: box.top - origin.top - strip.clientTop,
    width: box.width,
    height: box.height,
  };
}

let running: Animation | null = null;

// A transform over a layout that has already landed, so the compositor runs
// it; animating left and width would lay the strip out on every frame.
function glide(from: Rect, to: Rect) {
  const el = indicatorRef.value;
  if (
    !el ||
    to.width === 0 ||
    to.height === 0 ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    (Math.abs(from.left - to.left) < 0.5 &&
      Math.abs(from.width - to.width) < 0.5)
  ) {
    return;
  }
  running = el.animate(
    [
      {
        transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`,
      },
      { transform: "none" },
    ],
    { duration: 240, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
  );
}

function follow() {
  const from = drawnRect();
  running?.cancel();
  const to = tabRect();
  place(to);
  if (from && to) {
    glide(from, to);
  }
}

let ro: ResizeObserver | null = null;

onMounted(() => {
  nextTick(() => place(tabRect()));
  ro = new ResizeObserver(() => place(tabRect()));
  if (containerRef.value) {
    ro.observe(containerRef.value);
  }
});

onBeforeUnmount(() => {
  ro?.disconnect();
  running?.cancel();
});

watch(
  [model, () => props.options.map((option) => option.key).join(",")],
  follow,
  { flush: "post" },
);
</script>

<template>
  <div
    ref="containerRef"
    class="relative flex w-full gap-1 rounded-md border border-border bg-muted/30 p-1"
  >
    <span
      ref="indicatorRef"
      class="pointer-events-none absolute origin-top-left rounded-sm bg-[hsl(var(--tac-amber))] opacity-0 shadow-[0_0_12px_-2px_hsl(var(--tac-amber)/0.6)]"
    />
    <button
      v-for="opt in options"
      :key="opt.key"
      :ref="(el) => setBtn(el as Element | null, opt.key)"
      type="button"
      :disabled="opt.disabled"
      class="relative z-10 inline-flex h-[1.375rem] min-w-0 flex-1 items-center justify-center gap-1.5 rounded-sm px-2 font-mono text-[0.62rem] font-semibold uppercase leading-none tracking-[0.12em] transition-colors duration-200"
      :class="buttonState(opt)"
      @click="!opt.disabled && (model = opt.key)"
    >
      <span class="truncate">{{ opt.label }}</span>
      <span
        v-if="opt.count !== undefined"
        class="tabular-nums opacity-60"
        :class="countTone(opt)"
        >{{ opt.count }}</span
      >
    </button>
  </div>
</template>
