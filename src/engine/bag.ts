import { D, type Decimal } from './num'
import type { CostArg, ItemId, ItemStore } from './types'

/** 物品库存的纯函数层（背包与箱子同款形状：id → 数量，容量按总数量计）。 */

/** 库存总量（容量口径）。 */
export function bagTotal(store: ItemStore): Decimal {
  let total = D(0)
  for (const count of Object.values(store)) total = total.add(count)
  return total
}

/**
 * 放入 `count` 个 `item`（总容量受限）；装不下的部分通过 `rest` 返回（> 0）。
 * 纯函数：返回新对象，不改入参。
 */
export function bagAdd(
  store: ItemStore,
  item: ItemId,
  count: Decimal,
  capacity: number,
): { store: ItemStore; rest: Decimal } {
  if (count.lte(0)) return { store, rest: D(0) }
  const room = D(capacity).sub(bagTotal(store))
  if (room.lte(0)) return { store, rest: count }
  const put = count.lt(room) ? count : room
  const next: Record<ItemId, Decimal> = { ...store }
  next[item] = (next[item] ?? D(0)).add(put)
  return { store: next, rest: count.sub(put) }
}

/** 取出至多 `count` 个；返回剩余库存与实际取出的数量。 */
export function bagTake(
  store: ItemStore,
  item: ItemId,
  count: Decimal,
): { store: ItemStore; taken: Decimal } {
  const have = store[item]
  if (!have || have.lte(0) || count.lte(0)) return { store, taken: D(0) }
  const take = count.lt(have) ? count : have
  const left = have.sub(take)
  const next: Record<ItemId, Decimal> = { ...store }
  if (left.gt(0)) next[item] = left
  else delete next[item]
  return { store: next, taken: take }
}

/** 成本归一化：`[{item,count?}]` → `[item, Decimal]`（count 缺省 1，0 剔除）。 */
export function costEntries(cost: readonly CostArg[] | undefined): [ItemId, Decimal][] {
  const out: [ItemId, Decimal][] = []
  for (const entry of cost ?? []) {
    const count = D(entry.count ?? 1)
    if (count.gt(0)) out.push([entry.item, count])
  }
  return out
}

/** 是否付得起（背包物品是否覆盖全部成本）。 */
export function canAfford(store: ItemStore, cost: readonly CostArg[] | undefined): boolean {
  for (const [item, count] of costEntries(cost)) {
    if ((store[item] ?? D(0)).lt(count)) return false
  }
  return true
}

/** 缺口清单：`[[item, 还差数量]]`（用于提示文案）。 */
export function costGap(
  store: ItemStore,
  cost: readonly CostArg[] | undefined,
): [ItemId, Decimal][] {
  const gap: [ItemId, Decimal][] = []
  for (const [item, count] of costEntries(cost)) {
    const missing = count.sub(store[item] ?? D(0))
    if (missing.gt(0)) gap.push([item, missing])
  }
  return gap
}

/** 原子扣费：付得起 → 返回扣完后的库存；付不起 → 返回 null（库存不动）。 */
export function payCost(store: ItemStore, cost: readonly CostArg[] | undefined): ItemStore | null {
  if (!canAfford(store, cost)) return null
  let next = store
  for (const [item, count] of costEntries(cost)) {
    next = bagTake(next, item, count).store
  }
  return next
}

// ---------- 回收折算（docs/04 §3，D-35） ----------

/** 回收返还率缺省值。 */
export const DEFAULT_RECYCLE_RATE = 0.3

/**
 * 回收返还清单：**建造成本 × 返还率**，逐项精确折算（Decimal，允许小数——
 * 装配台 钢板×3+铁×2 × 30% → 钢板×0.9 + 铁×0.6）。不做递归分解、不取整；
 * 0 剔除。
 */
export function recycleRefund(
  cost: readonly CostArg[] | undefined,
  rate = DEFAULT_RECYCLE_RATE,
): [ItemId, Decimal][] {
  const refund: [ItemId, Decimal][] = []
  for (const [item, count] of costEntries(cost)) {
    const back = count.mul(D(rate))
    if (back.gt(0)) refund.push([item, back])
  }
  return refund
}
