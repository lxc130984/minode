<script setup lang="ts">
import { computed } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'

import { guardCycle } from '@/engine/dnd'
import type { GameNode } from '@/engine/types'
import { useGameStore } from '@/stores/game'
import type { DragEndLike } from '@/utils/tree-drop'

/**
 * Lisp 式渲染（docs/06 §4，D-29/D-30）——完全纵向大纲（emacs 风格，无层级竖线）：
 * - 每个表达式 = `( 头部` 一行 + 实参逐行缩进 21px + 子树尾部闭括号行；
 * - **点击 = eval 解耦**（D-30）：`()` 表示 eval——只有自己构成表达式（有实参/函数/根层）
 *   的节点点击才 eval 自己的 `(…)`；裸符号实参点击没有效果；
 * - 折叠交互：**点 `)` 折叠（折叠后仍保留 `( …+N )` 的括号形态）、点 `…+N` 展开**；
 * - 括号同时是拖拽把手（拖 = 移动整棵子表达式，D-29）。
 */
const props = defineProps<{ node: GameNode; depth?: number; isHead?: boolean }>()
const store = useGameStore()

const depth = computed(() => props.depth ?? 1)
const name = computed(() => store.nameOf(props.node))
const ret = computed(() => store.retOf(props.node))
const state = computed(() => store.chipState(props.node))
/** 语法高亮分类（docs/06 §2.1） */
const kind = computed(() => store.chipKind(props.node))
const childCount = computed(() => store.foldBadgeOf(props.node))
const hasChildren = computed(() => props.node.children.length > 0)
/** 可调用（函数）：即使没有实参也是应用表达式 `( f )`；符号是原子 */
const isCallable = computed(() => kind.value === 'machine')
const isHead = computed(() => props.isHead ?? false)
/** 悬停标记（docs/06 §6.1）：被悬停节点的父节点加下划线 */
const isHoveredParent = computed(() => store.isHoveredParent(props.node))
/** 括号配对高亮（emacs show-paren，D-31）：悬停本表达式的任一括号 → 两端同时亮 */
const parenMatched = computed(() => store.isParenMatched(props.node))

/** 括号 = 表达式的边界（落单的头部也包，`()` 表示 eval，D-30） */
const showBrackets = computed(() => hasChildren.value || isCallable.value || isHead.value)

/** 拖拽把手：chip + 开/闭括号（括号 = 整个表达式的把手，docs/08 D-29） */
const DRAG_HANDLE = '.chip, .bracket-open, .bracket-close'
const BRACKET_TITLE = '拖动 = 移动整个表达式（含全部实参）· 点击 = 折叠/展开'

const chipTitle = computed(() => {
  const base = showBrackets.value
    ? '点击 = eval 本表达式（手持物作为隐式实参参与检测）'
    : '实参（点击无效果；要 eval 它，把它包进自己的括号）'
  return store.isHeldHint(props.node) ? `${base} · 手持可命中（虚线提示，点击必得）` : base
})

function onDragStart(): void {
  store.setDragging(true)
}

/** 落位全部交给 store：DOM 只作媒介，模型是唯一事实源（docs/05 §2.1） */
function onDragEnd(evt: DragEndLike): void {
  store.handleDrop(evt)
}

/** 括号左键（开/闭对称）：放置模式下放行（冒泡给树区 = 建造）；否则 = 折叠/展开切换 */
function onBracketClick(event: MouseEvent): void {
  if (store.placing) return
  event.stopPropagation()
  store.toggleFold(props.node.id)
}
</script>

<template>
  <div
    class="node"
    :class="{ 'node-appear': store.isAppearing(node) }"
    :data-node-id="node.id"
    :data-node-type="node.type"
    :data-depth="depth"
  >
    <div class="node-row">
      <!-- 开括号（折叠时也在：折叠形态 = `( …+N )`）；点击 = 折叠/展开，悬停 = 配对高亮 -->
      <span
        v-if="showBrackets"
        class="bracket bracket-open"
        :class="{ 'bracket-matched': parenMatched }"
        :title="BRACKET_TITLE"
        @click="onBracketClick"
        @mouseenter="store.setParenPair(node.id)"
        @mouseleave="store.setParenPair(null)"
        >(</span
      >

      <button
        class="chip"
        :class="[
          state === 'unknown' ? 'is-unknown' : state === 'idle' ? 'is-idle' : 'is-ok',
          `k-${kind}`,
          { pulse: store.isPulsing(node), 'is-hover-parent': isHoveredParent },
        ]"
        :title="chipTitle"
        @click="store.chipClick(node.id, $event)"
      >
        <span class="chip-name">{{ name }}</span>
        <span v-if="store.panelOf(node)" class="chip-panel" title="可打开浮动窗口">▣</span>
        <template v-if="ret !== null">
          <span class="chip-bracket">[</span>
          <span class="chip-ret" :class="{ 'is-held-hint': store.isHeldHint(node) }">{{
            ret
          }}</span>
          <span class="chip-bracket">]</span>
        </template>
      </button>

      <!-- 折叠态：…+N 徽标是展开开关，括号形态完整保留 -->
      <template v-if="node.folded">
        <span class="bracket-dots">…</span>
        <button
          class="fold-badge fold-toggle"
          title="点击展开"
          @click.stop="store.toggleFold(node.id)"
        >
          +{{ childCount }}
        </button>
      </template>
      <span
        v-if="showBrackets && (node.folded || !hasChildren)"
        class="bracket bracket-close"
        :class="{ 'bracket-matched': parenMatched }"
        :title="BRACKET_TITLE"
        @click="onBracketClick"
        @mouseenter="store.setParenPair(node.id)"
        @mouseleave="store.setParenPair(null)"
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
      <TreeNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :depth="depth + 1"
        :is-head="false"
      />
    </VueDraggable>

    <!-- 展开表达式的闭括号：子树末尾的独立一行（点击 = 折叠） -->
    <div v-if="hasChildren && !node.folded" class="bracket-close-line">
      <span
        class="bracket bracket-close"
        :class="{ 'bracket-matched': parenMatched }"
        :title="BRACKET_TITLE"
        @click="onBracketClick"
        @mouseenter="store.setParenPair(node.id)"
        @mouseleave="store.setParenPair(null)"
        >)</span
      >
    </div>
  </div>
</template>
