<script setup lang="ts">
import { computed, watch, watchEffect, onUnmounted } from 'vue'

import type { NodeTypeId } from '@/engine/types'
import { useGameStore } from '@/stores/game'

/**
 * 放置模式的视觉层（docs/04 §2）：= 「无须按住的 vue-draggable 拖拽」，观感完全同一套——
 * 1. 光标跟随一个**普通样式的 chip**（相当于拖拽影像）；
 * 2. 落点预览 = 一个 `.place-ghost`（透明度同 `sortable-ghost`）**真实插入目标列表**，
 *    兄弟节点自然挤开；
 * 3. 挤开/合拢带 **120ms FLIP 位移补间**——与 VueDraggable 的 `:animation="120"` 同款手感，
 *    不是硬切。
 *
 * ghost 元素是外来的 DOM（非 Vue 管理）：
 * - 落点没变就不动 DOM；树被 Vue 重渲染后按「DOM 实际位置」自检重挂；
 * - 真实拖拽开始（dragging）时摘除，保证 SortableJS 的「DOM 子元素 ↔ 列表项」映射不被污染。
 */
const store = useGameStore()

/** 与 VueDraggable 容器的 :animation="120" 保持一致 */
const ANIM_MS = 120

const name = computed(() => (store.placing ? store.nodeName(store.placing) : ''))
const kind = computed(() => (store.placing ? store.chipKindOfType(store.placing) : 'symbol'))

/** 落点 ghost：单个复用元素，插入 placingZone 指向的列表（setup 内创建，组件卸载即弃） */
const ghost = document.createElement('div')
ghost.className = 'chip place-ghost'
ghost.title = '放置预览'

/**
 * FLIP（First-Last-Invert-Play）：记录受影响元素的旧位置 → 改 DOM → 用 transform
 * 从旧位补间到新位。WAAPI 动画不写内联样式，与 Vue 的渲染互不干扰；
 * 新动画自动替换旧动画，连续快速移动也丝滑。
 */
function flip(containers: Element[], mutate: () => void): void {
  const rects = new Map<Element, DOMRect>()
  for (const list of containers) {
    if (!list.isConnected) continue
    for (const child of list.children) rects.set(child, child.getBoundingClientRect())
  }
  mutate()
  for (const [el, before] of rects) {
    if (!el.isConnected) continue
    const after = el.getBoundingClientRect()
    const dx = before.left - after.left
    const dy = before.top - after.top
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue
    el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], {
      duration: ANIM_MS,
      easing: 'ease',
    })
  }
}

function nodeChildren(list: Element): Element[] {
  return Array.from(list.children).filter(
    (child) => child instanceof HTMLElement && child.classList.contains('node'),
  )
}

/** ghost 当前在列表里排在第几个 .node 位（-1 = 不在列表里） */
function ghostIndexIn(list: Element): number {
  let index = 0
  for (const child of list.children) {
    if (child === ghost) return index
    if (child instanceof HTMLElement && child.classList.contains('node')) index += 1
  }
  return -1
}

let attachedList: Element | null = null

/** 摘除 ghost；animated = 兄弟节点平滑合拢（同拖拽预览消失时的收拢动画） */
function detachGhost(animated: boolean): void {
  const parent = ghost.parentElement
  attachedList = null
  if (!parent) return
  if (animated && parent.isConnected) flip([parent], () => ghost.remove())
  else ghost.remove()
}

function updateGhost(type: NodeTypeId): void {
  ghost.className = `chip place-ghost k-${store.chipKindOfType(type)}`
  ghost.textContent = store.nodeName(type)

  const zone = store.placingZone
  if (!zone) {
    detachGhost(true)
    return
  }
  const list =
    zone.owner === null
      ? document.querySelector('.root-list')
      : document.querySelector(`.node[data-node-id="${zone.owner}"] > .kids`)
  if (!list) {
    detachGhost(true)
    return
  }
  const target = Math.min(zone.index, nodeChildren(list).length)
  // 落点没变、且 ghost 的 DOM 实际位置也对（树重渲染后可能漂移）→ 不动 DOM
  if (attachedList === list && ghostIndexIn(list) === target && ghost.isConnected) return

  const affected = attachedList && attachedList !== list ? [list, attachedList] : [list]
  flip(affected, () => {
    const ref = nodeChildren(list)[target]
    if (ref) list.insertBefore(ghost, ref)
    else list.appendChild(ghost)
  })
  attachedList = list
}

watchEffect(() => {
  // 放置中且未在真实拖拽 → 挂预览；否则摘除（树重渲染/拖拽中都不该有外来元素）
  if (store.placing && !store.dragging && store.pointer) {
    updateGhost(store.placing)
  } else {
    detachGhost(true)
  }
})

// ---------- 边缘自动滚动（放置模式的「拖到边上自己滚」，与 SortableJS 拖拽同款手感） ----------
// 纵向大纲布局（D-28）：纵向 = 页面滚动。指针停在视口上下边缘 60px 内 → rAF 循环滚页面；
// 滚动后指针下的内容变了，每帧重算落点（refreshPlacingZone），ghost 跟着 FLIP 换位。
const SCROLL_EDGE = 60
const SCROLL_STEP = 14
let scrollVelocity = 0
let scrollRaf = 0

function scrollLoop(): void {
  scrollRaf = 0
  if (!store.placing || scrollVelocity === 0) return
  window.scrollBy(0, scrollVelocity)
  store.refreshPlacingZone()
  scrollRaf = requestAnimationFrame(scrollLoop)
}

watch(
  () => store.pointer,
  (point) => {
    if (!point) {
      scrollVelocity = 0
      return
    }
    const canUp = window.scrollY > 0
    const canDown = window.scrollY < document.documentElement.scrollHeight - window.innerHeight
    if (point.y < SCROLL_EDGE && canUp) scrollVelocity = -SCROLL_STEP
    else if (point.y > window.innerHeight - SCROLL_EDGE && canDown) scrollVelocity = SCROLL_STEP
    else scrollVelocity = 0
    if (scrollVelocity !== 0 && scrollRaf === 0) scrollRaf = requestAnimationFrame(scrollLoop)
  },
)

onUnmounted(() => {
  if (scrollRaf !== 0) cancelAnimationFrame(scrollRaf)
  detachGhost(false)
})
</script>

<template>
  <div
    v-if="store.placing && store.pointer"
    class="chip place-cursor"
    :class="`k-${kind}`"
    :style="{ left: `${store.pointer.x + 14}px`, top: `${store.pointer.y + 14}px` }"
  >
    {{ name }}
  </div>
</template>
