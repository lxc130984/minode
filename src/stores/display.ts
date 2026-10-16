import { subtreeSize } from '@/engine/node'
import { fmt } from '@/utils/format'
import { costEntries, recycleRefund } from '@/engine/bag'
import { D, type Decimal } from '@/engine/num'
import type { NodeRegistry } from '@/engine/registry'
import type { ChipKind } from '@/stores/game'
import { findRecipe, type EvalOutcome } from '@/engine/eval'
import type { GameNode, ItemId, NodeTypeId, Yield } from '@/engine/types'

/**
 * 展示辅助层（docs/07 §4.3）：**纯函数**——只读注册表与节点，不触碰任何可变状态。
 * store 拿到这组绑定后的函数直接对外暴露，组件用法不变。
 */
export function createDisplayHelpers(registry: NodeRegistry) {
  function nameOf(node: GameNode): string {
    return registry.node(node.type)?.name ?? '?'
  }

  function formatYields(items: readonly Yield[]): string {
    return items
      .map((entry) => {
        const label = registry.shortOf(entry.id)
        return entry.count.gt(1) ? `${label}×${fmt(entry.count)}` : label
      })
      .join(' ')
  }

  /**
   * `[]` 里的文本：null = 不显示方括号；'?' = 空手检测不通过。
   * **手持可命中提示（D-34）**：`unresolved` 且手持物能命中时，显示**预测产物**替代 `[?]`
   * （`isHeldHint` 为真，组件挂 `.is-held-hint` 虚线下划线）——与点击共用 `findRecipe`，
   * 看到什么就点什么得什么。`held` 由 store 绑定（`heldItem`），本层保持纯函数。
   */
  function retOf(node: GameNode, held: string | null = null): string | null {
    if (!registry.node(node.type)) return null
    if (node.ret.kind === 'unresolved') {
      if (held) {
        const recipe = findRecipe(registry, node, held)
        if (recipe) {
          const text = formatYields(recipe.out.map((o) => ({ id: o.item, count: D(o.count ?? 1) })))
          if (text) return text
        }
      }
      return '?'
    }
    if (node.ret.kind !== 'value') return null
    const items = node.ret.items
    const atom = items.length === 1 && items[0]?.id === node.type && items[0].count.eq(1)
    if (atom) return null // 原子自返省略方括号
    return formatYields(items)
  }

  /** 手持可命中（D-34）：`unresolved` 且手持物能命中（`retOf` 正显示预测产物） */
  function isHeldHint(node: GameNode, held: string | null = null): boolean {
    if (!held || node.ret.kind !== 'unresolved') return false
    return findRecipe(registry, node, held) !== undefined
  }

  function chipState(node: GameNode): 'ok' | 'idle' | 'unknown' {
    if (!registry.node(node.type)) return 'unknown'
    return node.ret.kind === 'unresolved' ? 'idle' : 'ok'
  }

  /** 语法高亮分类（06 篇 §2.1）：函数（有配方）/ 符号（原子）/ 工具 / 未注册 */
  function chipKind(node: GameNode): ChipKind {
    return chipKindOfType(node.type)
  }

  /** 节点类型的高亮分类（免节点版本：放置预览/选择面板用） */
  function chipKindOfType(type: NodeTypeId): ChipKind {
    const def = registry.node(type)
    if (!def) return 'unknown'
    if (def.toolClass) return 'tool'
    return registry.recipesFor(type).length > 0 ? 'machine' : 'symbol'
  }

  /** 节点类型的显示名 */
  function nodeName(typeId: string): string {
    return registry.node(typeId)?.name ?? '?'
  }

  /** 物品显示名（背包/提示用） */
  function itemName(itemId: string): string {
    return registry.item(itemId)?.name ?? registry.node(itemId)?.name ?? '?'
  }

  /** 物品行/节点色相（06 篇 §2.1）：工具紫、其余按「函数/符号」分色 */
  function itemHue(itemId: string): 'tool' | 'symbol' {
    return registry.item(itemId)?.toolClass ? 'tool' : 'symbol'
  }

  function foldBadgeOf(node: GameNode): number {
    return subtreeSize(node)
  }

  /** 某类型的建造成本文案（选择面板/提示用）：`铁矿×2 煤×1` */
  function costTextOf(type: NodeTypeId): string {
    return costEntries(registry.node(type)?.cost)
      .map(([item, count]) => `${registry.shortOf(item)}×${fmt(count)}`)
      .join(' ')
  }

  /** 某类型回收后能拿回的原材料清单（提示用；折算在 recycle 内做，这里只读） */
  function recyclePreview(type: NodeTypeId): [ItemId, Decimal][] {
    return recycleRefund(registry.node(type)?.cost, registry.config.recycleRate)
  }

  /** eval 结果的调试描述（调试面板「最近点击」） */
  function describeEval(node: GameNode, outcome: EvalOutcome): string {
    const name = registry.node(node.type)?.name ?? '?'
    if (outcome.recipe) {
      const gained = outcome.recipe.out
        .map(
          (out: { item: string; count?: number }) =>
            `${registry.shortOf(out.item)}×${fmt(out.count ?? 1)}`,
        )
        .join(' ')
      return outcome.effective ? `${name} → ${gained}` : `${name} → ${gained}（背包满，未接收）`
    }
    if (registry.recipesFor(node.type).length > 0) return `${name} → 配方不匹配（无产出）`
    return `${name} → 符号（无 eval 行为）`
  }

  return {
    nameOf,
    retOf,
    isHeldHint,
    chipState,
    chipKind,
    chipKindOfType,
    nodeName,
    itemName,
    itemHue,
    foldBadgeOf,
    costTextOf,
    recyclePreview,
    describeEval,
  }
}

export type DisplayHelpers = ReturnType<typeof createDisplayHelpers>
