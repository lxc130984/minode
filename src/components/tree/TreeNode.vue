<script setup lang="ts">
import { computed } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'

import { guardCycle } from '@/engine/dnd'
import type { GameNode } from '@/engine/types'
import { useGameStore } from '@/stores/game'
import type { DragEndLike } from '@/utils/tree-drop'

const props = defineProps<{ node: GameNode; depth?: number }>()
const store = useGameStore()

const depth = computed(() => props.depth ?? 1)
const name = computed(() => store.nameOf(props.node))
const ret = computed(() => store.retOf(props.node))
const state = computed(() => store.chipState(props.node))
/** 语法高亮分类（docs/06 §2.1） */
const kind = computed(() => store.chipKind(props.node))
const childCount = computed(() => store.foldBadgeOf(props.node))
const hasChildren = computed(() => props.node.children.length > 0)
/** 可调用（函数）：即使没有实参也是应用表达式 `( f )`，要括号；符号是原子，不要括号 */
const isCallable = computed(() => kind.value === 'machine')
/** 悬停标记（docs/06 §6.1）：被悬停节点的父节点加下划线 */
const isHoveredParent = computed(() => store.isHoveredParent(props.node))

/** 拖拽把手：chip + 开/闭括号（括号 = 整个表达式的把手，docs/08 D-29） */
const DRAG_HANDLE = '.chip, .bracket-open, .bracket-close'
const BRACKET_TITLE = '拖动 = 移动整个表达式（含全部实参）'

function onDragStart(): void {
  store.setDragging(true)
}

/** 落位全部交给 store：DOM 只作媒介，模型是唯一事实源（docs/05 §2.1） */
function onDragEnd(evt: DragEndLike): void {
  store.handleDrop(evt)
}
</script>

<template>
  <div class="node" :data-node-id="node.id" :data-node-type="node.type" :data-depth="depth">
    <div class="node-row">
      <button
        v-if="hasChildren"
        class="fold"
        :title="node.folded ? '展开' : '折叠（折叠后不可拖入）'"
        @click.stop="store.toggleFold(node.id)"
      >
        {{ node.folded ? '[+]' : '[-]' }}
      </button>

      <!-- 表达式的开括号：与 chip 一样是拖拽把手（拖 = 整棵子树） -->
      <span v-if="isCallable || hasChildren" class="bracket bracket-open" :title="BRACKET_TITLE"
        >(</span
      >

      <button
        class="chip"
        :class="[
          state === 'unknown' ? 'is-unknown' : state === 'idle' ? 'is-idle' : 'is-ok',
          `k-${kind}`,
          {
            pulse: store.isPulsing(node),
            'is-hover-parent': isHoveredParent,
          },
        ]"
        title="点击 eval（放置模式时 = 建造；符号只作实参；手持物作为隐式实参参与检测）"
        @click="store.chipClick(node.id, $event)"
      >
        <span class="chip-name">{{ name }}</span>
        <span v-if="store.panelOf(node)" class="chip-panel" title="可打开浮动窗口">▣</span>
        <template v-if="ret !== null">
          <span class="chip-bracket">[</span>
          <span class="chip-ret">{{ ret }}</span>
          <span class="chip-bracket">]</span>
        </template>
      </button>

      <!-- 已折叠 / 空函数：闭括号收在行内（…+N 徽标）；展开的闭括号在 kids 尾部内联 -->
      <template v-if="hasChildren && node.folded">
        <span class="bracket-dots">…</span>
        <span class="fold-badge">+{{ childCount }}</span>
        <span class="bracket bracket-close" :title="BRACKET_TITLE">)</span>
      </template>
      <span
        v-else-if="isCallable && !hasChildren"
        class="bracket bracket-close"
        :title="BRACKET_TITLE"
        >)</span
      >

      <button
        class="recycle-btn"
        title="回收（分解成原材料返还，子节点上移）"
        @click.stop="store.recycle(node.id)"
      >
        ×
      </button>
    </div>

    <VueDraggable
      v-if="!node.folded"
      :model-value="node.children"
      class="kids"
      tag="div"
      :group="{ name: 'nodes' }"
      :handle="DRAG_HANDLE"
      :draggable="'.node'"
      :animation="120"
      :empty-insert-threshold="8"
      :on-move="guardCycle"
      :on-start="onDragStart"
      :on-end="onDragEnd"
    >
      <TreeNode v-for="child in node.children" :key="child.id" :node="child" :depth="depth + 1" />
      <!-- 展开表达式的闭括号：kids 尾部内联（紧贴最后一个实参；draggable 只认 .node，括号不是列表项） -->
      <span v-if="hasChildren" class="bracket bracket-close kids-close" :title="BRACKET_TITLE"
        >)</span
      >
    </VueDraggable>
  </div>
</template>
