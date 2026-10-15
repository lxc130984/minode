<script setup lang="ts">
import { VueDraggable } from 'vue-draggable-plus'

import { guardCycle } from '@/engine/dnd'
import { useGameStore } from '@/stores/game'
import type { DragEndLike } from '@/utils/tree-drop'
import TreeNode from './TreeNode.vue'

const store = useGameStore()

/** 树区左键：放置模式 = 按指针落点建造（空地也能落）；否则什么都不做（chip 自己处理 eval） */
function onTreeClick(event: MouseEvent): void {
  if (store.placing) store.placeAt(event.clientX, event.clientY)
}

function onDragStart(): void {
  store.setDragging(true)
}

/** 与 TreeNode 同一入口：DOM 读意图 → 纯路由 → store 写模型（docs/05 §2.1） */
function onDragEnd(evt: DragEndLike): void {
  store.handleDrop(evt)
}
</script>

<template>
  <main class="tree" @click="onTreeClick">
    <VueDraggable
      :key="store.renderVersion"
      :model-value="store.roots"
      class="root-list"
      tag="div"
      :group="{ name: 'nodes' }"
      handle=".chip, .bracket-open, .bracket-close"
      :draggable="'.node'"
      :animation="120"
      :empty-insert-threshold="30"
      :on-move="guardCycle"
      :on-start="onDragStart"
      :on-end="onDragEnd"
    >
      <TreeNode v-for="node in store.roots" :key="node.id" :node="node" :depth="1" />
    </VueDraggable>
    <div v-if="store.panel" class="tree-dim" title="点击关闭面板" @click="store.closePanel()" />
  </main>
</template>
