/** 拖拽守卫接口用 duck-typing，便于用普通对象桩做无 DOM 单测（docs/06 §9）。 */
export interface DragMoveLikeEvent {
  dragged: { contains(el: unknown): boolean }
  to: unknown
}

/** 目标列表若在被拖节点的 DOM 子树内 → 拒绝（防拖入自身后代成环）。 */
export function guardCycle(evt: DragMoveLikeEvent): boolean {
  return !evt.dragged.contains(evt.to)
}
