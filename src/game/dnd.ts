/**
 * 拖拽系统:SortableJS 分组守卫 + 落库钩子。
 *
 * 世界树 / 背包树都是 GameNode 列表,跨区拖拽就是移动节点本身。
 * 规则:
 *   - 守卫:节点能否进入某面板由 registry 的 zones 权限决定;
 *          跨区整树禁止(双向"一次一个":放置走 placeItem、回收一条一条);
 *          世界挂载受处理上限(maxProcess,只数直接子节点);
 *          背包里的普通物品只能挂同类子节点(堆叠规则,功能节点除外);
 *          不可把节点拖进自己所在面板的子树(防环)。
 *   - 虚影完全交给 SortableJS 的 fallback 机制(官方实现,触屏同款),
 *     CSS(.sortable-fallback)只微调宽度与观感。
 *   - 历史上的两条"落库整理"(settle)已被上游守卫取代删除:
 *     守卫按数据判定整树后,落进背包/世界的拖拽物都只能是单节点,无需再分拣。
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
 * - 从背包拖进世界(根级落点):放置提示一句;
 * - 挂上子节点时自动展开(默认折叠的节点获得可见的子树);
 * - 落进背包:延迟把落点堆规约回「根+直接子叶」不变量(展平/填满/溢出)——
 *   必须延迟到 Sortable 落盘回写之后(同步改数据会被库覆盖,历史坑 §1.1)。
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

  if (board === "backpack") {
    setTimeout(() => {
      // 落点是普通物品堆 → 规约整堆;落在功能节点/根下但拖入物自带子树 → 规约拖入物
      if (owner && !getDef(owner.type).behavior) game.normalizePile(owner)
      else if (dropped.children.length > 0) game.normalizePile(dropped)
    }, 0)
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
