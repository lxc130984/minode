import { describe, expect, it } from 'vite-plus/test'

import {
  bagAdd,
  bagTake,
  bagTotal,
  canAfford,
  costEntries,
  costGap,
  decomposeCost,
  payCost,
  recycleRefund,
} from '@/engine/bag'
import { D } from '@/engine/num'
import type { ItemStore } from '@/engine/types'

describe('bagTotal / bagAdd（容量按总数量计）', () => {
  it('总量 = 各物品数量之和', () => {
    const store: ItemStore = { ore: D(3), coal: D(2) }
    expect(bagTotal(store).toNumber()).toBe(5)
    expect(bagTotal({}).toNumber()).toBe(0)
  })

  it('容量内放入；不改入参', () => {
    const store: ItemStore = { ore: D(3) }
    const { store: next, rest } = bagAdd(store, 'coal', D(2), 10)
    expect(next).toEqual({ ore: D(3), coal: D(2) })
    expect(rest.toNumber()).toBe(0)
    expect(store).toEqual({ ore: D(3) })
  })

  it('同类累加；装不下返回 rest（已放的部分不丢）', () => {
    const store: ItemStore = { ore: D(3) }
    const part = bagAdd(store, 'ore', D(10), 8)
    expect(part.store.ore?.toNumber()).toBe(8)
    expect(part.rest.toNumber()).toBe(5)

    const full = bagAdd(store, 'coal', D(1), 3) // 容量已被 ore 占满
    expect(full.store).toBe(store) // 原样返回（同一引用）
    expect(full.rest.toNumber()).toBe(1)
  })

  it('count <= 0 → 无操作', () => {
    const store: ItemStore = { ore: D(1) }
    expect(bagAdd(store, 'ore', D(0), 10).store).toBe(store)
  })
})

describe('bagTake', () => {
  it('取部分 / 取整项（键删除）/ 超取截断', () => {
    const store: ItemStore = { ore: D(3), coal: D(1) }
    expect(bagTake(store, 'ore', D(1)).store).toEqual({ ore: D(2), coal: D(1) })
    expect(bagTake(store, 'coal', D(1)).store).toEqual({ ore: D(3) })
    const over = bagTake(store, 'ore', D(99))
    expect(over.taken.toNumber()).toBe(3)
    expect(over.store).toEqual({ coal: D(1) })
  })

  it('没有 / count<=0 → 原样返回，taken = 0', () => {
    const store: ItemStore = { ore: D(1) }
    expect(bagTake(store, 'coal', D(1)).taken.toNumber()).toBe(0)
    expect(bagTake(store, 'ore', D(0)).taken.toNumber()).toBe(0)
  })
})

describe('成本（costEntries / canAfford / costGap / payCost）', () => {
  const cost = [{ item: 'ore', count: 2 }, { item: 'coal' }] as const

  it('costEntries 归一化：count 缺省 1，0 剔除', () => {
    expect(costEntries([{ item: 'ore' }, { item: 'coal', count: 0 }])).toEqual([['ore', D(1)]])
    expect(costEntries(undefined)).toEqual([])
  })

  it('canAfford：够 / 不够 / 恰好', () => {
    expect(canAfford({ ore: D(3), coal: D(1) }, cost)).toBe(true)
    expect(canAfford({ ore: D(3) }, cost)).toBe(false)
    expect(canAfford({ ore: D(2), coal: D(1) }, cost)).toBe(true)
    expect(canAfford({}, undefined)).toBe(true) // 免费永远付得起
  })

  it('costGap：只列缺口', () => {
    expect(costGap({ ore: D(1) }, cost)).toEqual([
      ['ore', D(1)],
      ['coal', D(1)],
    ])
    expect(costGap({ ore: D(5), coal: D(2) }, cost)).toEqual([])
  })

  it('payCost：原子扣费；不够 → null（库存不动）', () => {
    expect(payCost({ ore: D(3), coal: D(1) }, cost)).toEqual({ ore: D(1) })
    const poor: ItemStore = { ore: D(3) }
    expect(payCost(poor, cost)).toBeNull()
    expect(poor).toEqual({ ore: D(3) })
  })
})

describe('分解（回收 → 原材料，docs/04 §3）', () => {
  // 铁炉(矿+煤+氧) → 铁；锻造(铁+煤) → 钢（fixtures 的注册表语义）
  const ctx = {
    isRaw: (id: string) => ['ore', 'coal', 'oxygen'].includes(id),
    recipeOf: (id: string) => {
      if (id === 'iron')
        return { args: [{ item: 'ore' }, { item: 'coal' }, { item: 'oxygen' }], outCount: D(1) }
      if (id === 'steel') return { args: [{ item: 'iron' }, { item: 'coal' }], outCount: D(1) }
      return undefined
    },
  }

  it('原材料原样保留；非原材料沿单产物配方的实参递归下钻', () => {
    expect(decomposeCost([{ item: 'ore', count: 2 }], ctx)).toEqual({ ore: D(2) })
    // iron×1 → 矿1 煤1 氧1
    expect(decomposeCost([{ item: 'iron' }], ctx)).toEqual({ ore: D(1), coal: D(1), oxygen: D(1) })
    // steel×2 → (铁1 煤1)×2 → 矿2 煤2 氧2 + 煤2 = 矿2 煤4 氧2
    const steel = decomposeCost([{ item: 'steel', count: 2 }], ctx)
    expect(steel.ore?.toNumber()).toBe(2)
    expect(steel.coal?.toNumber()).toBe(4)
    expect(steel.oxygen?.toNumber()).toBe(2)
  })

  it('无配方的物品原样保留（工具/孤品）；环安全', () => {
    expect(decomposeCost([{ item: 'axe' }], ctx)).toEqual({ axe: D(1) })
    const loop = {
      isRaw: () => false,
      recipeOf: (id: string) =>
        id === 'a'
          ? { args: [{ item: 'b' }], outCount: D(1) }
          : { args: [{ item: 'a' }], outCount: D(1) },
    }
    // a↔b 互相引用：不无限递归，回环处（第二个 a）按「原样保留」落袋
    expect(decomposeCost([{ item: 'a' }], loop)).toEqual({ a: D(1) })
  })

  it('recycleRefund：全量分解 × 返还率向下取整（0 剔除）', () => {
    // 冶炼炉成本 矿4 煤2 → ×0.3 → 矿×1、煤×0
    expect(
      recycleRefund(
        [
          { item: 'ore', count: 4 },
          { item: 'coal', count: 2 },
        ],
        ctx,
        0.3,
      ),
    ).toEqual([['ore', D(1)]])
    // iron×4 → 矿4 煤4 氧4 → ×0.3 → 各×1
    expect(recycleRefund([{ item: 'iron', count: 4 }], ctx, 0.3)).toEqual([
      ['ore', D(1)],
      ['coal', D(1)],
      ['oxygen', D(1)],
    ])
  })
})
