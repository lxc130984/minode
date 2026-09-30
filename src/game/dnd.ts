/**
 * 拖拽系统:SortableJS 分组守卫 + 落库整理。
 *
 * 世界树 / 背包树都是 GameNode 列表,跨区拖拽就是移动节点本身。
 * 规则:
 *   - 守卫:节点能否进入某面板由 registry 的 zones 权限决定;
 *          背包里的普通物品节点只能挂同类子节点(堆叠规则,功能节点除外);
 *          不可把节点拖进自己所在面板的子树(防环)。
 *   - 语义:拖进"世界"= 放置,一次只放一个(余下子节点回背包堆叠);
 *          背包内部 = 整堆搬运/合并(把一堆拖到另一堆下面)。
 *   - 虚影完全交给 SortableJS 的 fallback 机制(官方实现,触屏同款),
 *     CSS(.sortable-fallback)只微调宽度与观感。
 *   - 整理延迟到 setTimeout(0),避免与 Sortable 落盘序列竞争。
 */
import type { SortableEvent } from "sortablejs"
import type { BoardId } from "../stores/game"
import { getDef } from "./registry"
import type { GameNode } from "./types"
import { useGameStore } from "../stores/game"

/** 统一 group 名:允许跨区域搬运,合法性交给 put 守卫 */
export const DND_GROUP = "minode"

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
 * - 从背包拖进世界:根级放置提示一句;堆按"放置"语义只留 1 个(延迟结算);
 * - 任意拖入背包(任意层级):释放与背包不兼容的子树(延迟结算);
 * - 挂上子节点时自动展开(默认折叠的节点获得可见的子树)。
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
  const fromBackpack = fromZone === "backpack"

  if (board === "world" && fromBackpack && owner === null) {
    game.pushLog(`「${getDef(dropped.type).name}」被放置进了世界。`, "info")
  }
  if (owner?.collapsed) owner.collapsed = false

  const target = dropped
  if (board === "world" && fromBackpack) {
    setTimeout(() => game.settleWorldDrop(target), 0)
  } else if (board === "backpack" && !fromBackpack) {
    setTimeout(() => game.settleBackpackDrop(target), 0)
  }
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
