import { D } from '@/engine/num'
import { createNode } from '@/engine/node'
import { buildRegistry, type NodeRegistry } from '@/engine/registry'
import type { EvalWorld } from '@/engine/eval'
import type { ContentDefs, GameNode, Yield } from '@/engine/types'

/**
 * 最小内容包（生产线模型，docs/08 D-26）：物品（含原料与工具）+ 可放置节点（带成本）+ 配方。
 * `forest(axe) → wood` 用于钉住「手持 = 隐式实参」（docs/10 §4）。
 */
export const TEST_DEFS: ContentDefs = {
  items: [
    { id: 'ore', name: '矿石', short: '矿' },
    { id: 'coal', name: '煤', short: '煤' },
    { id: 'oxygen', name: '氧', short: '氧' },
    { id: 'iron', name: '铁', short: '铁' },
    { id: 'gear', name: '齿轮', short: '轮' },
    { id: 'wood', name: '木材', short: '木' },
    { id: 'axe', name: '斧头', short: '斧', toolClass: 'axe' },
  ],
  nodes: [
    // 符号节点（原料的树上面孔；同名物品是背包里的货币）
    { id: 'ore', name: '矿石', short: '矿', cost: [{ item: 'ore' }] },
    { id: 'coal', name: '煤', short: '煤', cost: [{ item: 'coal' }] },
    { id: 'oxygen', name: '氧', short: '氧', cost: [{ item: 'oxygen' }] },
    // 函数（点击 → eval → 产出物品进背包）
    { id: 'mine', name: '矿井', short: '井', cost: [{ item: 'ore', count: 2 }] },
    {
      id: 'smelter',
      name: '冶炼炉',
      short: '炉',
      cost: [
        { item: 'ore', count: 4 },
        { item: 'coal', count: 2 },
      ],
    },
    { id: 'assembler', name: '装配台', short: '台', cost: [{ item: 'iron', count: 2 }] },
    { id: 'forest', name: '森林', short: '林', cost: [{ item: 'wood', count: 2 }] },
    // 特殊节点（箱子）
    {
      id: 'chest',
      name: '箱子',
      short: '箱',
      panel: 'storage',
      cost: [{ item: 'iron', count: 4 }],
    },
  ],
  recipes: [
    { at: 'mine', args: [{ item: 'ore' }], out: [{ item: 'ore' }] },
    { at: 'mine', args: [{ item: 'coal' }], out: [{ item: 'coal' }] },
    {
      at: 'smelter',
      args: [{ item: 'ore' }, { item: 'coal' }, { item: 'oxygen' }],
      out: [{ item: 'iron' }],
    },
    {
      at: 'assembler',
      match: 'ordered',
      args: [{ item: 'ore' }, { item: 'coal' }],
      out: [{ item: 'gear' }],
    },
    // 手持斧头点击森林 → 木材（斧头 = 隐式实参）
    { at: 'forest', args: [{ item: 'axe' }], out: [{ item: 'wood' }] },
  ],
  config: { bagCapacity: 64, chestCapacity: 32 },
}

export function testRegistry(defs: ContentDefs = TEST_DEFS): NodeRegistry {
  return buildRegistry(defs)
}

export interface TestWorld extends EvalWorld {
  gained: Yield[]
  /** 累计获得某 id 的数量 */
  gainedOf(id: string): number
}

export function makeWorld(registry: NodeRegistry): TestWorld {
  const gained: Yield[] = []
  return {
    registry,
    gained,
    gain: (id, count) => {
      gained.push({ id, count })
      return D(0)
    },
    gainedOf: (id) =>
      gained
        .filter((entry) => entry.id === id)
        .reduce((sum, entry) => sum + entry.count.toNumber(), 0),
  }
}

/** 便捷建树：`node('smelter', node('ore'), node('coal'))`。 */
export function node(type: string, ...children: GameNode[]): GameNode {
  return createNode(type, children)
}
