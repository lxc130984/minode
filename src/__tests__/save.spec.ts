import { describe, expect, it } from 'vite-plus/test'

import { D } from '@/engine/num'
import {
  deserialize,
  serialize,
  SAVE_VERSION,
  type SaveV1,
  type SaveV2,
  type SaveV3,
  type SaveV4,
} from '@/engine/save'
import { node, TEST_DEFS, testRegistry } from './fixtures'

const registry = testRegistry()

describe('存档 round-trip (v4)', () => {
  it('保留结构/折叠/未知类型；返回值由归一化重算；id 不入存档', () => {
    const smelter = node('smelter', node('ore'), node('coal'), node('oxygen'))
    const ghost = {
      id: 'x',
      type: 'removed_content',
      children: [],
      folded: true,
      ret: { kind: 'none' } as const,
    }

    const save = serialize(
      {
        roots: [smelter, ghost],
        bag: { ore: D(2), iron: D(5) },
        chestContents: {},
      },
      1234,
    )
    expect(save.v).toBe(SAVE_VERSION)
    expect(save.v).toBe(4)
    expect(save.bag.iron).toBe('5')
    expect(Object.keys(save.roots[0] ?? {})).not.toContain('id')
    expect(JSON.parse(JSON.stringify(save))).toEqual(save) // 纯 JSON 可序列化

    const restored = deserialize(save, registry)
    expect(restored.roots).toHaveLength(2)
    const [restoredSmelter, restoredGhost] = restored.roots
    if (!restoredSmelter || !restoredGhost) throw new Error('结构丢失')
    expect(restoredSmelter.children.map((child) => child.type)).toEqual(['ore', 'coal', 'oxygen'])
    expect(restoredSmelter.ret.kind).toBe('value')
    expect(restoredGhost.folded).toBe(true)
    expect(restoredGhost.ret.kind).toBe('none')

    expect(restored.bag.ore?.toNumber()).toBe(2)
    expect(restored.bag.iron?.toNumber()).toBe(5)
    expect(restored.chestContents).toEqual({})
  })

  it('带内容的箱子：serialize → deserialize 后内容仍挂在同一节点上（物品表）', () => {
    const chest = node('chest')
    const other = node('smelter')
    const save = serialize(
      {
        roots: [chest, other],
        bag: {},
        chestContents: { [chest.id]: { coal: D(7) }, [other.id]: {} },
      },
      0,
    )
    expect(save.roots[0]?.chest).toEqual({ coal: '7' })
    // 空容器不落档
    expect(save.roots[1]?.chest).toBeUndefined()

    const restored = deserialize(save, registry)
    const [restoredChest] = restored.roots
    if (!restoredChest) throw new Error('结构丢失')
    expect(restored.chestContents[restoredChest.id]?.coal?.toNumber()).toBe(7)
    expect(Object.keys(restored.chestContents)).toHaveLength(1)
  })
})

describe('v3 → v4 迁移（生产线模型，D-26）', () => {
  it('节点堆按建造成本折算成物品；resources 直接并入背包', () => {
    const v3: SaveV3 = {
      v: 3,
      savedAt: 5,
      roots: [],
      // 旧背包：1 堆矿井（成本 2 矿）+ 1 堆矿石节点（同名物品直接折算）
      nodeBag: [
        { type: 'mine', count: '2' },
        { type: 'ore', count: '3' },
      ],
      resources: { iron: '4' },
      selected: 0,
    }

    const restored = deserialize(v3, registry)
    expect(restored.bag.ore?.toNumber()).toBe(4 + 3) // mine×2 的成本 2×2 + ore 堆 3
    expect(restored.bag.iron?.toNumber()).toBe(4)
  })

  it('旧箱子的节点堆同样按成本折算', () => {
    const v3 = {
      v: 3,
      savedAt: 0,
      roots: [
        { type: 'chest', collapsed: false, children: [], chest: [{ type: 'coal', count: '5' }] },
      ],
      nodeBag: [],
      resources: {},
      selected: 0,
    } as unknown as SaveV3

    const restored = deserialize(v3, registry)
    const chest = restored.roots[0]
    if (!chest) throw new Error('结构丢失')
    expect(restored.chestContents[chest.id]?.coal?.toNumber()).toBe(5)
  })

  it('未知内容 id 的堆被安全丢弃', () => {
    const v3: SaveV3 = {
      v: 3,
      savedAt: 0,
      roots: [],
      nodeBag: [{ type: 'ghost_type', count: '9' }],
      resources: {},
      selected: 0,
    }
    expect(deserialize(v3, registry).bag).toEqual({})
  })
})

describe('v1 / v2 链式迁移', () => {
  it('v1 槽位 → v2 节点 → v3 堆 → v4 物品背包', () => {
    const legacy: SaveV1 = {
      v: 1,
      savedAt: 9,
      roots: [],
      inventory: [
        { item: 'iron', count: '4' },
        { item: 'mine', count: '2' },
      ],
      hotbar: [{ item: 'iron', count: '3' }],
      selected: 0,
    }

    const restored = deserialize(legacy, registry)
    expect(restored.bag.iron?.toNumber()).toBe(7)
    expect(restored.bag.ore?.toNumber()).toBe(4) // mine×2 → 成本 2×2
  })

  it('旧存档里的 buffer / auto 字段被安全忽略', () => {
    const legacy = {
      v: 1,
      savedAt: 0,
      roots: [
        {
          type: 'smelter',
          collapsed: false,
          auto: { on: true, acc: 500 },
          buffer: [['iron', '5']],
          children: [],
        },
      ],
      inventory: [],
      hotbar: [],
      selected: 0,
    } as unknown as SaveV1

    const restored = deserialize(legacy, registry)
    expect(restored.roots[0]?.type).toBe('smelter')
    expect(restored.roots[0]?.children).toHaveLength(0)
  })

  it('v2 背包节点实例按 type 合并后走同一条迁移链', () => {
    const v2: SaveV2 = {
      v: 2,
      savedAt: 5,
      roots: [],
      nodeBag: [
        { type: 'mine', collapsed: false, children: [] },
        { type: 'mine', collapsed: false, children: [] },
        null,
        { type: 'ore', collapsed: false, children: [] },
      ],
      resources: { iron: '2' },
      selected: 0,
    }
    const restored = deserialize(v2, registry)
    expect(restored.bag.ore?.toNumber()).toBe(4 + 1) // mine×2 的成本 + ore 节点
    expect(restored.bag.iron?.toNumber()).toBe(2)
  })
})

describe('小容量内容包', () => {
  it('容量配置合法即可构建', () => {
    const small = testRegistry({
      ...TEST_DEFS,
      config: { bagCapacity: 8, chestCapacity: 4 },
    })
    const v4: SaveV4 = { v: 4, savedAt: 0, roots: [], bag: { ore: '2' } }
    expect(deserialize(v4, small).bag.ore?.toNumber()).toBe(2)
  })
})
