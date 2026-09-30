<script setup lang="ts">
import { computed } from "vue"
import { VueDraggable } from "vue-draggable-plus"
import { ChevronRight, Settings2, Ellipsis, PanelRightOpen, PanelRightClose } from "lucide-vue-next"
import { workOf } from "../game/work"
import { DND_COMMON, onTreeAdd, setDragging, treeGroup } from "../game/dnd"
import { getDef, getRecipe } from "../game/registry"
import type { GameNode } from "../game/types"
import { CATEGORY_LABELS, isStack, nodeCount } from "../game/types"
import { findNode } from "../game/tree"
import type { BoardId } from "../stores/game"
import {
  autoTriggerBehaviorOf,
  autoTriggerReady,
  occupierOfWorkingAncestor,
  useGameStore,
} from "../stores/game"
import { useUiStore } from "../stores/ui"
import NodeIcon from "./NodeIcon.vue"

const props = defineProps<{ node: GameNode; board: BoardId; depth: number }>()
const game = useGameStore()
const ui = useUiStore()

const def = computed(() => getDef(props.node.type))
const selected = computed(() => game.selectedId === props.node.id)
/** 物品堆落进树里的瞬态帧没有 children,渲染要安全 */
const children = computed(() =>
  Array.isArray(props.node.children) ? props.node.children : [],
)
const hasChildren = computed(() => children.value.length > 0)
/** 背包里的同类堆:显示总数徽标;子节点超过 4 个用省略号 */
const isItemStack = computed(
  () => props.board === "backpack" && isStack(props.node) && hasChildren.value,
)
const stackTotal = computed(() => (isItemStack.value ? nodeCount(props.node) : 0))
const hiddenCount = computed(() =>
  isItemStack.value ? Math.max(0, children.value.length - 4) : 0,
)
const catLabel = computed(() => CATEGORY_LABELS[def.value.category])
/** 世界里的处理上限徽标:N/M(石斧 1/1、水车 2/2);背包堆上限仍走 ×N 徽标 */
const kidsMax = computed(() =>
  props.board === "world" && typeof def.value.maxProcess === "number"
    ? def.value.maxProcess
    : null,
)
/** 功能节点带行为(探索/合成/视图开关等) */
const isFunctional = computed(() => !!def.value.behavior)
/** 视图开关节点(背包):点击开合分屏 */
const isViewToggle = computed(() => def.value.behavior?.kind === "view-toggle")
const noChildren = computed(() => !!def.value.noChildren)
/** 被占用:祖上有正在进行的工作(如石斧正在砍的森林)——半透明置灰,
 *  点击会被引擎拦下并提示;与 store 触发前置检查共用同一口径 */
const occupied = computed(() =>
  !!occupierOfWorkingAncestor(game.boardRoots(props.board), props.node),
)

const benchRecipeName = computed(() => {
  if (props.node.type !== "bench") return null
  const r = getRecipe(game.selectedRecipeId)
  return r ? getDef(r.output.type).name : "未选择"
})

/** 自触发节点(水车等):挂在 poweredBy(河流)下面才被驱动 */
const autoTrigger = computed(() => autoTriggerBehaviorOf(props.node))
const autoReady = computed(() => {
  const b = autoTrigger.value
  if (!b) return false
  const parent = findNode(game.boardRoots(props.board), props.node.id)?.parent ?? null
  return autoTriggerReady(b, parent)
})
const autoSub = computed(() => {
  const b = autoTrigger.value
  if (!b) return null
  if (autoReady.value) return `每 ${Math.round(b.intervalMs / 1000)} 秒驱动`
  return b.poweredBy ? `需挂在${getDef(b.poweredBy).name}下面` : "待就位"
})

/**
 * 工作进度条:节点开始做事(triggerNode 挂上工作)时,行底一条细线
 * 从左到右匀速填满,到点结算后消失。纯 CSS transform 动画,无 JS 帧驱动。
 * duration = 总时长、delay = -已耗时:中途(折叠/展开)重挂载也能从真实比例续走。
 */
const work = computed(() => workOf(props.node.id))
const workStyle = computed(() => {
  const j = work.value
  if (!j) return undefined
  const left = Math.max(0, j.endAt - Date.now())
  const elapsed = Math.max(0, j.durationMs - left)
  return { animationDuration: `${j.durationMs}ms`, animationDelay: `-${elapsed}ms` }
})

/** 点击:视图开关节点切换分屏;功能节点(按 behavior 分发)任何面板都触发;
 *  普通节点只在"世界"里触发(父触发子/空手),背包里无反应。
 *  触发 = 开始工作(行底进度条),到点才结算;忙碌中再点无效。
 *  点击不选中节点——selectedId 只由「详情/选择配方」按钮设置,联动检查器。 */
function onRowClick() {
  if (isViewToggle.value) {
    const view = def.value.behavior?.kind === "view-toggle" ? def.value.behavior.view : "backpack"
    if (view === "codex") ui.toggleCodex()
    else ui.toggleBackpack()
    return
  }
  const clickable = isFunctional.value || props.board === "world"
  if (clickable) {
    game.clickNode(props.node.id)
  }
}

function openInspector() {
  game.select(props.node.id)
  ui.inspOpen = true
}

function openRecipe() {
  game.select(props.node.id)
  ui.recipeOpen = true
}
</script>

<template>
  <li
    class="node-wrap"
    :data-node-id="node.id"
    :data-ntype="node.type"
    :data-zone="board === 'world' ? 'tree' : 'backpack'"
  >
    <div
      class="row-main"
      :class="{ selected, occupied, functional: isFunctional, 'view-toggle': isViewToggle }"
      :style="def.accent ? { '--node-accent': def.accent } : undefined"
      @click="onRowClick"
    >
      <button
        v-if="!noChildren"
        class="twisty"
        :class="{ invisible: !hasChildren }"
        tabindex="-1"
        @click.stop="game.toggleCollapse(node.id)"
      >
        <ChevronRight :size="13" :class="{ rotated: !node.collapsed }" />
      </button>
      <NodeIcon :type="node.type" :size="16" />
      <span class="nt-name" :style="def.accent ? { color: def.accent } : undefined">
        {{ def.name }}
      </span>
      <span v-if="node.type === 'bench'" class="nt-sub">配方 · {{ benchRecipeName }}</span>
      <span v-if="isViewToggle" class="nt-sub view-state" :class="{ open: ui.backpackOpen }">
        <component :is="ui.backpackOpen ? PanelRightClose : PanelRightOpen" :size="12" />
        {{ ui.backpackOpen ? "已开启" : "已收起" }}
      </span>
      <span v-else-if="!isFunctional" class="nt-cat" :class="`cat-${def.category}`">
        {{ catLabel }}
      </span>
      <span v-if="autoSub" class="nt-sub auto-state" :class="{ ready: autoReady, need: !autoReady }">
        {{ autoSub }}
      </span>
      <span class="nt-fill" />
      <span v-if="isItemStack" class="nt-pile mono">×{{ stackTotal }}</span>
      <span v-else-if="hasChildren && !noChildren" class="nt-kids mono">
        {{ children.length }}{{ kidsMax ? `/${kidsMax}` : "" }}
      </span>
      <button
        v-if="node.type === 'bench'"
        class="row-act"
        title="选择配方"
        @click.stop="openRecipe"
      >
        <Settings2 :size="14" />
      </button>
      <button class="row-act" title="详情" @click.stop="openInspector">
        <Ellipsis :size="14" />
      </button>
      <!-- 工作进度条:做事时行底细线从左向右匀速填满,到点结算后消失 -->
      <span v-if="work" class="work-track" :style="workStyle" />
    </div>

    <!-- 子列表:展开时渲染;空列表(含折叠的空节点)在拖拽时显示为投放区;
         背包堆默认只显示前 4 个子节点,其余折叠为省略号 -->
    <VueDraggable
      v-if="!noChildren && (!node.collapsed || !hasChildren)"
      v-model="node.children"
      tag="ol"
      class="child-list"
      :class="{ 'is-empty': !hasChildren, 'stack-list': isItemStack }"
      :data-zone="board === 'world' ? 'tree' : 'backpack'"
      :group="treeGroup(board, node.id)"
      handle=".row-main"
      v-bind="DND_COMMON"
      @add="onTreeAdd(board, node, children, $event)"
      @start="setDragging(true)"
      @end="setDragging(false)"
    >
      <NodeItem
        v-for="child in children"
        :key="child.id"
        :node="child"
        :board="board"
        :depth="depth + 1"
      />
    </VueDraggable>
    <div v-if="hiddenCount > 0 && !node.collapsed" class="stack-ellipsis mono">⋯ 还有 {{ hiddenCount }} 个</div>
  </li>
</template>

<style scoped>
.node-wrap {
  list-style: none;
  margin: 0;
  padding: 0;
}

/* org 式行节点:全宽、无边框、无垂直间隙 */
.row-main {
  position: relative;
  overflow: hidden; /* 进度条贴着行底走,裁进行圆角 */
  display: flex;
  align-items: center;
  gap: 7px;
  height: var(--row-h);
  padding: 0 6px 0 2px;
  margin: 0;
  border: none;
  border-left: 2px solid transparent;
  border-radius: 7px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.12s;
  user-select: none;
  -webkit-user-select: none;
  touch-action: manipulation;
}
.row-main:hover {
  background: var(--hover);
}
.row-main:active {
  background: var(--active);
}
.row-main.selected {
  background: var(--accent-soft);
  border-left-color: var(--accent);
}
/* 被占用(祖上工作正在进行):整行淡化,示意它是流程参与物、暂不可自行触发 */
.row-main.occupied {
  opacity: 0.55;
}
.row-main.functional .nt-name {
  font-weight: 600;
}
.row-main.view-toggle .nt-name {
  font-weight: 700;
}

.twisty {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 17px;
  height: 17px;
  border: none;
  background: transparent;
  color: var(--fg-faint);
  cursor: pointer;
  padding: 0;
  border-radius: 4px;
  flex: none;
}
.twisty:hover {
  color: var(--fg);
  background: var(--active);
}
.twisty :deep(svg) {
  transition: transform 0.12s;
}
.twisty .rotated {
  transform: rotate(90deg);
}

.nt-name {
  color: var(--fg);
  white-space: nowrap;
}
.nt-sub {
  font-size: 11px;
  color: var(--fg-faint);
  white-space: nowrap;
}
.nt-sub.view-state {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.nt-sub.view-state.open {
  color: var(--accent);
}
.nt-sub.auto-state {
  color: var(--fg-faint);
}
.nt-sub.auto-state.ready {
  color: var(--cyan);
}
.nt-sub.auto-state.need {
  color: var(--orange);
}
.nt-cat {
  font-size: 10px;
  color: var(--fg-faint);
  flex: none;
  letter-spacing: 0.05em;
}
.nt-cat.cat-terrain {
  color: var(--green);
}
.nt-cat.cat-tool {
  color: var(--purple);
}

.nt-fill {
  flex: 1;
}
.nt-pile {
  font-size: 11px;
  color: var(--fg-dim);
  flex: none;
}
.nt-kids {
  font-size: 10px;
  color: var(--fg-faint);
  background: var(--bg-soft);
  border: 1px solid var(--border);
  border-radius: 9px;
  padding: 0 6px;
  line-height: 16px;
  flex: none;
}

.row-act {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--fg-faint);
  cursor: pointer;
  opacity: 0.35;
  flex: none;
  transition: opacity 0.12s;
}
.row-main:hover .row-act,
.row-main.selected .row-act {
  opacity: 1;
}
.row-act:hover {
  background: var(--active);
  color: var(--fg);
}

/* 工作进度条:行底一条 2px 细线,从左向右匀速填满该类型自己的主色;
   时长内联 = 剩余工作时间,scaleX 走 GPU 不触发布局。
   透明度刻意高(85%):2px 的细线在浅底上太淡会直接看不见 */
.work-track {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2px;
  background: color-mix(in srgb, var(--node-accent, var(--accent)) 85%, transparent);
  transform-origin: 0 50%;
  animation: work-fill linear forwards;
  pointer-events: none;
}
@keyframes work-fill {
  from {
    transform: scaleX(0);
  }
  to {
    transform: scaleX(1);
  }
}
/* 触屏设备:常显操作按钮 */
@media (hover: none) {
  .row-act {
    opacity: 0.55;
  }
}

/* 子列表缩进 + org 引导线(空列表不画线,避免残留的短竖线) */
.child-list {
  list-style: none;
  margin: 0;
  padding: 0 0 0 18px;
  border-left: 1px solid var(--guide);
  min-height: 6px;
}
.child-list.is-empty {
  min-height: 8px;
  border-left-color: transparent;
  padding-left: 0;
}
/* 背包堆:只显示前 4 个子节点(占位保持 sortable 索引对齐),其余隐藏 */
.child-list.stack-list > .node-wrap:nth-child(n + 5) {
  display: none;
}
.stack-ellipsis {
  margin: 0 0 2px 18px;
  padding-left: 8px;
  font-size: 11px;
  color: var(--fg-faint);
  border-left: 1px dashed var(--guide);
  pointer-events: none;
}
/* 拖拽时,空子列表成为可见投放区,且向上咬合父行下半部分 */
.app.dragging .child-list.is-empty {
  min-height: 14px;
  margin-top: -14px;
  padding-top: 14px;
  border-left: 1px dashed var(--guide);
  position: relative;
  margin-bottom: 3px;
}
.app.dragging .child-list.is-empty::after {
  content: "↳ 挂为子节点";
  position: absolute;
  left: 19px;
  top: 16px;
  font-size: 10px;
  color: var(--fg-faint);
  pointer-events: none;
}
</style>
