/**
 * 拖拽系统:SortableJS 分组守卫 + 落库整理。
 *
 * 世界树 / 背包树 / 物品栏 都是 GameNode 列表,跨区拖拽就是移动节点本身。
 * 规则:
 *   - 守卫:节点能否进入某区域由 registry 的 zones 权限决定;
 *          不可把节点拖进自己所在面板的子树(防环)。
 *   - 语义:拖进"世界"= 放置,材料堆一次只放一个(余量退回储区);
 *          储区之间(物品栏↔背包)= 整堆搬运。
 *   - 整理延迟到 setTimeout(0),避免与 Sortable 落盘序列竞争。
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
      useGameStore().canEnterZone(dragEl, "hotbar"),
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
 * - 储区 → 世界:材料堆按"放置"语义拆成 1 个(延迟结算);
 * - 储区 → 任意面板:提示一句;挂上子节点时自动展开;
 * - 落进背包(任意层级):延迟整理(子树释放/同级合并)。
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
  const fromStorage = fromZone === "hotbar" || fromZone === "backpack"

  if (board === "world" && fromStorage) {
    game.pushLog(`「${getDef(dropped.type).name}」被放置进了世界。`, "info")
  }
  if (owner?.collapsed) owner.collapsed = false

  const target = dropped
  if (board === "world" && fromStorage) {
    const zone = fromZone as "hotbar" | "backpack"
    setTimeout(() => game.settleWorldDrop(target, zone), 0)
  } else if (board === "backpack" && fromZone !== "backpack") {
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

/**
 * 拖拽跟随虚影完全交给 SortableJS 的 fallback 机制(官方实现,触屏同款):
 * forceFallback 统一桌面/移动行为,库自己克隆元素、跟随指针;
 * 我们只通过 CSS(.sortable-fallback)微调宽度与观感,不自己造轮子。
 */
export const DND_COMMON = {
  animation: 150,
  forceFallback: true,
  fallbackOnBody: true,
  fallbackTolerance: 3,
  // 触屏:按住 150ms 才进入拖拽,避免和点击/滚动冲突
  delay: 150,
  delayOnTouchOnly: true,
  swapThreshold: 0.55,
  emptyInsertThreshold: 12,
} as const
