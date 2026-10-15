import { shallowReactive, shallowRef } from 'vue'

import type { GameNode, NodeId } from '@/engine/types'

const PULSE_MS = 400
const HINT_MS = 2600
/** 入场动画时长（放置/拖入新表达式的「括号生长」，D-31） */
export const APPEAR_MS = 260

/**
 * 瞬态反馈层：hint（HUD 提示）、pulse（点击产出闪烁）、悬停父节点下划线、
 * 括号配对高亮（D-31）、入场动画标记——全是「按节点 id 分键」的短命状态，
 * 只有真正受影响的节点重渲染（整树共享一个集合会让每次点击重渲染全树）。
 */
export function createFeedback() {
  const hint = shallowRef('')
  let hintTimer: ReturnType<typeof setTimeout> | undefined

  function setHint(text: string): void {
    hint.value = text
    clearTimeout(hintTimer)
    hintTimer = setTimeout(() => {
      hint.value = ''
    }, HINT_MS)
  }

  const pulseAt = shallowReactive<Record<NodeId, boolean>>({})
  let pulseTimer: ReturnType<typeof setTimeout> | undefined
  let pulseDelay: ReturnType<typeof setTimeout> | undefined

  function pulse(ids: readonly NodeId[]): void {
    if (ids.length === 0) return
    clearTimeout(pulseTimer)
    clearTimeout(pulseDelay)
    for (const id of ids) delete pulseAt[id] // 先摘除一帧，否则连点不重启动画
    pulseDelay = setTimeout(() => {
      for (const id of ids) pulseAt[id] = true
      pulseTimer = setTimeout(() => {
        for (const id of ids) delete pulseAt[id]
      }, PULSE_MS)
    }, 16)
  }

  function isPulsing(node: GameNode): boolean {
    return pulseAt[node.id] !== undefined
  }

  // 悬停：只标记被悬停节点的父节点（键级更新，不触发全树重渲染）
  const hoverParentAt = shallowReactive<Record<NodeId, true>>({})
  let hoveredId: NodeId | null = null

  /** 写「父节点 id」标记（父链由调用方查索引传入——反馈层不持有树结构） */
  function setHoverParent(parentId: NodeId | null): void {
    if (parentId === hoveredId) return
    for (const key of Object.keys(hoverParentAt)) delete hoverParentAt[key]
    hoveredId = parentId
    if (parentId !== null) hoverParentAt[parentId] = true
  }

  function isHoveredParent(node: GameNode): boolean {
    return hoverParentAt[node.id] === true
  }

  // 括号配对高亮（emacs show-paren，D-31）：悬停某表达式的任一括号 → 该表达式 id
  const parenPairAt = shallowRef<NodeId | null>(null)

  function setParenPair(id: NodeId | null): void {
    parenPairAt.value = id
  }

  function isParenMatched(node: GameNode): boolean {
    return parenPairAt.value === node.id
  }

  // 入场动画（D-31）：刚放置/刚拖到新位置的表达式标记一拍，node-appear 播放「括号生长」
  const appearAt = shallowReactive<Record<NodeId, true>>({})
  let appearTimer: ReturnType<typeof setTimeout> | undefined

  function markAppearing(id: NodeId): void {
    appearAt[id] = true
    clearTimeout(appearTimer)
    appearTimer = setTimeout(() => {
      for (const key of Object.keys(appearAt)) delete appearAt[key]
    }, APPEAR_MS)
  }

  function isAppearing(node: GameNode): boolean {
    return appearAt[node.id] !== undefined
  }

  /** 读档/重置时清空全部瞬态（树结构由调用方负责） */
  function clearAll(): void {
    for (const key of Object.keys(pulseAt)) delete pulseAt[key]
    for (const key of Object.keys(hoverParentAt)) delete hoverParentAt[key]
    for (const key of Object.keys(appearAt)) delete appearAt[key]
    setParenPair(null)
    setHoverParent(null)
    hint.value = ''
    clearTimeout(hintTimer)
    clearTimeout(pulseTimer)
    clearTimeout(pulseDelay)
    clearTimeout(appearTimer)
  }

  return {
    hint,
    setHint,
    pulse,
    isPulsing,
    setHoverParent,
    isHoveredParent,
    setParenPair,
    isParenMatched,
    markAppearing,
    isAppearing,
    clearAll,
  }
}

export type Feedback = ReturnType<typeof createFeedback>
