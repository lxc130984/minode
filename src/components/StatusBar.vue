<script setup lang="ts">
import { computed } from "vue"
import { CloudCheck } from "lucide-vue-next"
import { useGameStore } from "../stores/game"
import { useUiStore } from "../stores/ui"

const game = useGameStore()
const ui = useUiStore()

const playTime = computed(() => {
  const s = game.playSeconds
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const p = (n: number) => String(n).padStart(2, "0")
  return `${p(h)}:${p(m)}:${p(sec)}`
})

const lastLog = computed(() => game.lastLog)
</script>

<template>
  <footer class="statusbar">
    <div class="left">
      <span class="saved"><CloudCheck :size="12" /> 已保存</span>
      <span class="seg">世界 {{ game.worldNodeCount }}</span>
      <span class="seg">物品 {{ game.itemCount }}</span>
      <span class="seg mono">{{ playTime }}</span>
    </div>
    <button
      class="log-peek"
      :title="lastLog?.text ?? '打开日志'"
      @click="ui.logOpen = true"
    >
      <span class="kind" :class="lastLog?.kind">›</span>
      <span class="text">{{ lastLog?.text ?? "日志" }}</span>
    </button>
  </footer>
</template>

<style scoped>
.statusbar {
  flex: none;
  height: var(--status-h);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  gap: 10px;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 11px;
  color: var(--fg-dim);
  font-family: var(--mono);
  overflow: hidden;
}
.left {
  display: flex;
  gap: 12px;
  align-items: center;
  flex: none;
}
.saved {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--green);
}
.seg {
  color: var(--fg-dim);
}
.mono {
  font-family: var(--mono);
}
.log-peek {
  display: flex;
  gap: 6px;
  align-items: center;
  background: none;
  border: none;
  color: var(--fg-faint);
  font-family: var(--mono);
  font-size: 11px;
  cursor: pointer;
  min-width: 0;
  padding: 0;
}
.log-peek .text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.log-peek .kind.gain {
  color: var(--green);
}
.log-peek .kind.craft {
  color: var(--purple);
}
.log-peek .kind.warn {
  color: var(--orange);
}
@media (max-width: 900px) {
  .left .seg {
    display: none;
  }
}
</style>
