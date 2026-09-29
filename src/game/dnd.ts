/**
 * 拖拽系统:SortableJS 分组守卫 + 落库整理。
 *
 * 世界树 / 背包树 / 物品栏 都是 GameNode 列表,跨区拖拽就是移动节点本身。
 * 需要处理的只有:
 *   - 守卫:地形/特殊节点不可离开世界(board ≠ world 的列表一律拒绝);
 *          不可把节点拖进自己所在面板的子树(防环)。
 *   - 落库整理:同级同堆合并、物品栏超格溢出、带子树的节点进储区时释放子树。
 * 整理一律延迟到 setTimeout(0),避免与 Sortable 落盘序列竞争。
 */
import type { SortableEvent } from "sortablejs"
import type { BoardId } from "../stores/game"
import { getDef } from "./registry"
import type { GameNode } from "./types"
import { useGameStore } from "../stores/game"

/** 统一 group 名:允许跨区域搬运,合法性交给 put 守卫 */
export const DND_GROUP = "minode"

/** 物品栏(扁平快速栏)的 group 配置 */
export function storageGroup() {
  return {
    name: DND_GROUP,
    pull: true,
    put: (_to: unknown, _from: unknown, dragEl: HTMLElement) =>
      useGameStore().canEnterStorage(dragEl),
  }
}

/**
 * 节点面板(世界/背包)树列表的 group 配置;
 * ownerId 为挂靠父节点 id,面板根列表为 undefined。
 */
export function treeGroup(board: BoardId, ownerId?: string) {
  return {
    name: DND_GROUP,
    pull: true,
    put: (_to: unknown, _from: unknown, dragEl: HTMLElement) =>
      useGameStore().canDropIntoChildList(dragEl, board, ownerId),
  }
}

/** 是否处于拖拽中(控制空子列表投放区显隐) */
export function setDragging(v: boolean) {
  useGameStore().dragging = v
}

/**
 * 面板树列表 @add:
 * - 物品从储区拖进世界时提示一句;
 * - 挂上子节点时自动展开(默认折叠的节点获得可见的子树);
 * - 落进背包(任意层级)时延迟整理。
 */
export function onTreeAdd(
  board: BoardId,
  owner: GameNode | null,
  list: GameNode[],
  evt: SortableEvent,
) {
  if (evt.newIndex == null) return
  const dropped = list[evt.newIndex]
  if (!dropped) return
  const game = useGameStore()
  const fromZone = evt.from?.dataset?.zone

  if (board === "world" && (fromZone === "hotbar" || fromZone === "backpack")) {
    game.pushLog(`「${getDef(dropped.type).name}」被放置进了世界。`, "info")
  }
  if (owner?.collapsed) owner.collapsed = false
  if (board === "backpack" && fromZone !== "backpack") {
    const target = dropped
    setTimeout(() => game.settleStorageDrop("backpack", list, target), 0)
  }
}

/** 物品栏 @add:延迟整理(合并堆/溢出/子树释放) */
export function onHotbarAdd(evt: SortableEvent) {
  if (evt.newIndex == null) return
  const game = useGameStore()
  const dropped = game.hotbar[evt.newIndex]
  if (!dropped) return
  setTimeout(() => game.settleStorageDrop("hotbar", game.hotbar, dropped), 0)
}

/** 树/储区通用拖拽手感 */
export const DND_COMMON = {
  animation: 150,
  // 触屏:按住 150ms 才进入拖拽,避免和点击/滚动冲突
  // (触屏设备自动走 fallback 模式,不需要 forceFallback)
  delay: 150,
  delayOnTouchOnly: true,
  fallbackOnBody: true,
  swapThreshold: 0.55,
  emptyInsertThreshold: 12,
} as const
