<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue"
import { Eraser, SquareTerminal } from "lucide-vue-next"
import { useGameStore } from "../stores/game"

const game = useGameStore()
const bodyEl = ref<HTMLElement | null>(null)

const lines = computed(() => game.log.slice(-120))

watch(
  () => game.log.length,
  () => {
    nextTick(() => {
      const el = bodyEl.value
      if (el) el.scrollTop = el.scrollHeight
    })
  },
)

function fmtTime(t: number) {
  const d = new Date(t)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
</script>

<template>
  <div class="log-panel">
    <div class="panel-title">
      <SquareTerminal :size="13" />
      <span>日志</span>
      <span class="title-hint">共 {{ game.log.length }} 条</span>
      <button class="icon-btn small" title="清空" @click="game.log.splice(0)">
        <Eraser :size="13" />
      </button>
    </div>
    <div ref="bodyEl" class="log-body">
      <div v-for="e in lines" :key="e.seq" class="log-line" :class="e.kind">
        <span class="log-time mono">{{ fmtTime(e.time) }}</span>
        <span class="log-text">{{ e.text }}</span>
      </div>
      <div v-if="!lines.length" class="log-empty">— 等待事件 —</div>
    </div>
  </div>
</template>

<style scoped>
.log-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}
.icon-btn.small {
  width: 22px;
  height: 22px;
}
.log-body {
  flex: 1;
  overflow-y: auto;
  padding: 6px 12px;
  font-family: var(--mono);
  font-size: 12px;
  line-height: 1.9;
}
.log-line {
  display: flex;
  gap: 10px;
  white-space: nowrap;
}
.log-time {
  color: var(--fg-faint);
  flex: none;
}
.log-text {
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--fg-dim);
}
.log-line.gain .log-text {
  color: var(--green);
}
.log-line.craft .log-text {
  color: var(--purple);
}
.log-line.warn .log-text {
  color: var(--orange);
}
.log-empty {
  color: var(--fg-faint);
}
</style>
