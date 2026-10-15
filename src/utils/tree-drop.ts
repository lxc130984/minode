import type { NodeId } from '@/engine/types'

/**
 * 拖拽落位与放置落点的 **DOM 读取层**（docs/04 §3）。
 * 生产线模型下只有树内拖拽（重排表达式）与放置模式的落点检测需要读 DOM；
 * 背包/箱子是物品表（无格位、不参与拖拽）。
 *
 * 落点权威（沿 D-22 教训）：树内移动用 SortableJS 的 `newIndex`（树允许预览，值可靠）；
 * 放置模式 / 拖到侧栏回收一律问指针。
 */

/** SortableJS 拖拽结束事件里我们用到的字段（duck-typing，便于无 DOM 单测） */
export interface DragEndLike {
  item?: unknown
  from?: unknown
  to?: unknown
  newIndex?: unknown
}

export interface TreeDropPlan {
  from: { node: NodeId; owner: NodeId | null }
  to: { owner: NodeId | null; index: number }
}

function asElement(value: unknown): Element | null {
  return value instanceof Element ? value : null
}

/** 树里的列表 → 属主节点 id（根层 = null）；不是树列表返回 undefined */
export function treeOwnerOf(el: Element | null): NodeId | null | undefined {
  if (!el) return undefined
  if (el.classList.contains('root-list')) return null
  const owner = el.closest('.node')?.getAttribute('data-node-id')
  return owner ?? undefined
}

/** 读树内拖拽意图；读不出（缺下标 / 未知列表 / 未知身份）返回 null。 */
export function readDrop(evt: DragEndLike): TreeDropPlan | null {
  const fromEl = asElement(evt.from)
  const toEl = asElement(evt.to)
  const itemEl = asElement(evt.item)
  const raw = typeof evt.newIndex === 'number' ? evt.newIndex : Number.NaN
  if (!fromEl || !toEl || !itemEl || !Number.isFinite(raw) || raw < 0) return null

  const fromOwner = treeOwnerOf(fromEl)
  const nodeId = itemEl instanceof HTMLElement ? (itemEl.dataset.nodeId ?? null) : null
  if (fromOwner === undefined || !nodeId) return null

  const toOwner = treeOwnerOf(toEl)
  if (toOwner === undefined) return null
  return { from: { node: nodeId, owner: fromOwner }, to: { owner: toOwner, index: raw } }
}

function pointerOf(evt: unknown): { x: number; y: number } | null {
  const outer = evt as { originalEvent?: unknown; clientX?: unknown; clientY?: unknown } | null
  const src = (outer?.originalEvent ?? outer) as
    | { clientX?: unknown; clientY?: unknown }
    | { x?: unknown; y?: unknown }
    | null
  const x = (src as { clientX?: number })?.clientX ?? (src as { x?: number })?.x
  const y = (src as { clientY?: number })?.clientY ?? (src as { y?: number })?.y
  if (typeof x !== 'number' || typeof y !== 'number') return null
  return { x, y }
}

/**
 * 指针落在**树的哪个列表的哪个位置**（放置模式的落点 + 拖拽落点兜底）。
 * `evt` 接受鼠标事件或 `{ x, y }`。不在树上返回 null。
 *
 * 索引判定是**二维中点**（同 SortableJS 的 dragover 逻辑，不分横竖列表）：
 * 子节点算在指针「前面」= 它整行在指针上方，或与指针同行且指针越过其水平中点——
 * 这样横向流式换行的子列表里，行内位置也能精确检测。
 */
export function treeZoneAt(evt: unknown): { owner: NodeId | null; index: number } | null {
  const point = pointerOf(evt)
  if (!point) return null
  const el = document.elementFromPoint(point.x, point.y)
  const list = el?.closest('.root-list, .kids')
  if (!list) return null
  const isRoot = list.classList.contains('root-list')
  const ownerEl = list.closest('.node') as HTMLElement | null
  const owner = isRoot ? null : (ownerEl?.dataset.nodeId ?? null)
  const kids = Array.from(list.children).filter(
    (c): c is HTMLElement => c instanceof HTMLElement && c.classList.contains('node'),
  )
  let index = 0
  for (const kid of kids) {
    const rect = kid.getBoundingClientRect()
    const rowAbove = rect.bottom <= point.y
    const sameRow = point.y >= rect.top && point.y <= rect.bottom
    const rightOfMid = point.x > rect.left + rect.width / 2
    if (rowAbove || (sameRow && rightOfMid)) index += 1
  }
  return { owner, index }
}

/** 指针是否落在侧栏（选择面板/背包）——树内拖到侧栏 = 回收。 */
export function pointerOverSidebar(evt: unknown): boolean {
  const point = pointerOf(evt)
  if (!point) return false
  const el = document.elementFromPoint(point.x, point.y)
  return el?.closest('.sidebar') != null
}
