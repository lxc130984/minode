import { createNode } from '@/engine/node'
import { D } from '@/engine/num'
import type { GameNode, ItemId } from '@/engine/types'

/**
 * 内容侧的示例局面（D-32 整理：**内容 id 只出现在 content/**，store 不认识具体节点类型）。
 */

/** 六层加工链：发动机厂 → 装配台 → 轧机 → 锻炉 → 冶炼炉 → 原料 */
export function buildEngineFactory(): GameNode {
  const raw = (): GameNode[] => [createNode('iron_ore'), createNode('coal'), createNode('oxygen')]
  const smelter = (): GameNode => createNode('smelter', raw())
  const forge = (): GameNode => createNode('forge', [smelter(), createNode('coal')])
  const mill = (): GameNode => createNode('rolling_mill', [forge(), smelter()])
  const assembler = (): GameNode => createNode('assembler', [mill(), smelter()])
  return createNode('engine_plant', [assembler(), forge()])
}

/** 起始树：三座矿井（原料入口）+ 森林（手持演示）+ 六层加工链 */
export function buildDemoRoots(): GameNode[] {
  return [
    createNode('mine', [createNode('iron_ore')]),
    createNode('mine', [createNode('coal')]),
    createNode('mine', [createNode('oxygen')]),
    createNode('forest'),
    buildEngineFactory(),
  ]
}

/** 压力树：count 台冶炼炉（各 3 个实参）——验证渲染/求值性能 */
export function buildStressRoots(count: number): GameNode[] {
  const types = ['iron_ore', 'coal', 'oxygen'] as const
  return Array.from({ length: count }, () =>
    createNode(
      'smelter',
      types.map((type) => createNode(type)),
    ),
  )
}

/** 起始物资：够建几台机器 + 斧头（手持演示） */
export const STARTER_ITEMS: readonly [ItemId, number][] = [
  ['iron_ore', 12],
  ['coal', 8],
  ['oxygen', 6],
  ['wood', 8],
  ['axe', 1],
]

/** Decimal 形式的起始物资（gain 入参） */
export function starterSeeds(): [ItemId, ReturnType<typeof D>][] {
  return STARTER_ITEMS.map(([item, count]) => [item, D(count)])
}
