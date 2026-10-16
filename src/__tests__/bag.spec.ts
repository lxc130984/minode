import { describe, expect, it } from 'vite-plus/test'

import {
  bagAdd,
  bagTake,
  bagTotal,
  canAfford,
  costEntries,
  costGap,
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

describe('回收折算（cost × 返还率，D-35）', () => {
  it('逐项精确折算（Decimal，允许小数），0 剔除', () => {
    // 装配台：钢板×3 + 铁×2 × 30% → 钢板×0.9 + 铁×0.6（浮点折算用 toNumber 断言）
    const refund = recycleRefund(
      [
        { item: 'plate', count: 3 },
        { item: 'iron', count: 2 },
      ],
      0.3,
    )
    const asMap = Object.fromEntries(refund.map(([id, n]) => [id, n.toNumber()]))
    expect(asMap.plate).toBeCloseTo(0.9)
    expect(asMap.iron).toBeCloseTo(0.6)
  })

  it('免费（无 cost）→ 空清单；count 缺省按 1', () => {
    expect(recycleRefund(undefined, 0.3)).toEqual([])
    expect(recycleRefund([{ item: 'ore' }], 0.5)).toEqual([['ore', D(0.5)]])
  })

  it('rate = 0 → 空清单', () => {
    expect(recycleRefund([{ item: 'ore', count: 10 }], 0)).toEqual([])
  })
})
