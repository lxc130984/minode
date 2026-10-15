<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'

import DebugPanel from './components/debug/DebugPanel.vue'
import HistoryPanel from './components/history/HistoryPanel.vue'
import StatBar from './components/hud/StatBar.vue'
import ChestPanel from './components/inventory/ChestPanel.vue'
import ItemBag from './components/inventory/ItemBag.vue'
import NodePalette from './components/inventory/NodePalette.vue'
import TreeView from './components/tree/TreeView.vue'
import PlacementGhost from './components/tree/PlacementGhost.vue'
import { useGameStore } from './stores/game'

const AUTOSAVE_MS = 10_000

const store = useGameStore()

// 开发期挂载点：浏览器控制台/自动化可直接读状态、造树、量性能（docs/07 §6）
if (import.meta.env.DEV) {
  ;(window as Window & { __minode?: unknown }).__minode = store
}

let saveTimer: ReturnType<typeof setInterval> | undefined

function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    store.cancelPlacing()
    return
  }
  const meta = event.ctrlKey || event.metaKey
  const key = event.key.toLowerCase()
  if (meta && key === 'z') {
    event.preventDefault()
    if (event.shiftKey) store.redo()
    else store.undo()
    return
  }
  if (meta && key === 'y') {
    event.preventDefault()
    store.redo()
  }
}

/** 放置模式的指针追踪（虚影 + 挤压预览只在放置模式更新） */
function onMove(event: MouseEvent): void {
  store.trackPointer(event)
}

/** 右键：放置模式的统一取消（docs/04 §2；手机端另设取消按钮） */
function onContext(): void {
  if (store.placing) store.cancelPlacing()
}

function onVisibility(): void {
  if (document.visibilityState === 'hidden') store.saveGame()
}

function onBeforeUnload(): void {
  store.saveGame()
}

/** 拖拽兜底：任何路径的拖拽结束都清掉「拖拽中」态，避免落点条/样式残留 */
function onGlobalDragEnd(): void {
  store.setDragging(false)
}

onMounted(() => {
  saveTimer = setInterval(() => store.saveGame(), AUTOSAVE_MS)
  window.addEventListener('keydown', onKey)
  window.addEventListener('mousemove', onMove)
  window.addEventListener('contextmenu', onContext)
  window.addEventListener('beforeunload', onBeforeUnload)
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('dragend', onGlobalDragEnd)
  window.addEventListener('drop', onGlobalDragEnd)
})

onUnmounted(() => {
  clearInterval(saveTimer)
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('mousemove', onMove)
  window.removeEventListener('contextmenu', onContext)
  window.removeEventListener('beforeunload', onBeforeUnload)
  document.removeEventListener('visibilitychange', onVisibility)
  window.removeEventListener('dragend', onGlobalDragEnd)
  window.removeEventListener('drop', onGlobalDragEnd)
})
</script>

<template>
  <div
    class="app"
    :class="{
      'is-dragging': store.dragging,
      'is-locked': !!store.panel,
      'is-placing': !!store.placing,
    }"
  >
    <aside class="sidebar">
      <NodePalette />
      <ItemBag />
    </aside>
    <div class="main">
      <StatBar />
      <TreeView />
      <ChestPanel />
      <HistoryPanel />
      <DebugPanel />
    </div>
    <PlacementGhost />
  </div>
</template>
