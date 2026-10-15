<script setup lang="ts">
import { computed, ref } from 'vue'

import { bagTotal } from '@/engine/bag'
import { useGameStore } from '@/stores/game'
import { fmt } from '@/utils/format'

const store = useGameStore()

/** 标题栏拖动（docs/08 D-16）：原生指针事件 + setPointerCapture，不需要第三方库 */
const offset = ref({ x: 0, y: 0 })
let dragFrom: { x: number; y: number; ox: number; oy: number } | null = null
function onDragStart(event: PointerEvent): void {
  if ((event.target as HTMLElement).closest('.panel-close, .text-btn')) return
  dragFrom = { x: event.clientX, y: event.clientY, ox: offset.value.x, oy: offset.value.y }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}
function onDragMove(event: PointerEvent): void {
  if (!dragFrom) return
  offset.value = {
    x: dragFrom.ox + (event.clientX - dragFrom.x),
    y: dragFrom.oy + (event.clientY - dragFrom.y),
  }
}
function onDragEnd(): void {
  dragFrom = null
}

/** 当前面板的箱子节点 id（模板 v-if 保证面板打开时才渲染） */
const nodeId = computed(() => (store.panel ? store.panel.nodeId : ''))
/** 箱子里的物品行（按内容顺序） */
const rows = computed(() => {
  if (!store.panel) return []
  const chest = store.chestContents[store.panel.nodeId] ?? {}
  return store.registry.defs.items
    .filter((item) => chest[item.id]?.gt(0))
    .map((item) => ({ id: item.id, count: chest[item.id] }))
})
const used = computed(() =>
  store.panel ? bagTotal(store.chestContents[store.panel.nodeId] ?? {}) : undefined,
)
</script>

<template>
  <section
    v-if="store.panel && store.panel.kind === 'storage'"
    class="panel"
    :style="{ transform: `translate(${offset.x}px, ${offset.y}px)` }"
  >
    <header
      class="panel-head"
      title="按住可拖动窗口"
      @pointerdown="onDragStart"
      @pointermove="onDragMove"
      @pointerup="onDragEnd"
      @pointercancel="onDragEnd"
    >
      <span class="panel-title">箱子</span>
      <span class="panel-hint">
        {{ fmt(used ?? 0) }}/{{ store.registry.config.chestCapacity }} · 背包单击/双击转入 ·
        点行取回
      </span>
      <button class="panel-close" title="关闭" @click="store.closePanel()">×</button>
    </header>

    <div class="bag-list">
      <div
        v-for="row in rows"
        :key="row.id"
        class="bag-row"
        title="单击/滚轮取 1 个回背包 · 双击整项取回"
        @click="store.chestRowClick(row.id)"
        @dblclick="store.chestRowDouble(row.id)"
        @wheel.prevent="store.chestRowClick(row.id)"
      >
        <span class="bag-name" :class="`k-${store.itemHue(row.id)}`">
          {{ store.itemName(row.id) }}
        </span>
        <span class="bag-count">×{{ fmt(row.count ?? 0) }}</span>
      </div>
      <span v-if="rows.length === 0" class="bag-empty">空</span>
    </div>
  </section>
</template>
