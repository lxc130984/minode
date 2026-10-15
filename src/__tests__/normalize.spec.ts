import { describe, expect, it } from 'vite-plus/test'

import { normalizeTree } from '@/engine/normalize'
import { createNode } from '@/engine/node'
import { node, testRegistry } from './fixtures'

const registry = testRegistry()

describe('求值结果（[] 里的东西）', () => {
  it('符号：结果 = 自身', () => {
    const ore = node('ore')
    normalizeTree([ore], registry)
    expect(ore.ret.kind).toBe('value')
    if (ore.ret.kind === 'value') {
      expect(ore.ret.items).toHaveLength(1)
      expect(ore.ret.items[0]?.id).toBe('ore')
    }
  })

  it('函数：静态检测子节点结果签名；命中 → 产物，不符 → [?]', () => {
    const smelter = node('smelter', node('ore'), node('coal'), node('oxygen'))
    normalizeTree([smelter], registry)
    expect(smelter.ret.kind).toBe('value')
    if (smelter.ret.kind === 'value') expect(smelter.ret.items[0]?.id).toBe('iron')

    const miss = node('smelter', node('ore'), node('coal'))
    normalizeTree([miss], registry)
    expect(miss.ret.kind).toBe('unresolved') // 少一个实参

    const extra = node('smelter', node('ore'), node('coal'), node('oxygen'), node('oxygen'))
    normalizeTree([extra], registry)
    expect(extra.ret.kind).toBe('unresolved') // 多一个实参
  })

  it('检测是静态的：函数的结果可以基于另一个函数的结果（不 eval 它）', () => {
    // 冶炼炉(矿井(矿石), 煤炭, 氧气) —— 矿井的结果是「矿石」
    const tree = node('smelter', node('mine', node('ore')), node('coal'), node('oxygen'))
    normalizeTree([tree], registry)
    expect(tree.ret.kind).toBe('value')
    if (tree.ret.kind === 'value') expect(tree.ret.items[0]?.id).toBe('iron')
  })

  it('未识别子节点传染：任一子 unresolved → 父 unresolved', () => {
    const tree = node('smelter', node('ore'), node('coal'), node('oxygen'))
    tree.children[1] = createNode('unknown_type')
    normalizeTree([tree], registry)
    expect(tree.ret.kind).toBe('unresolved')
  })

  it('未知类型自身结果 = none', () => {
    const ghost = createNode('unknown_type')
    normalizeTree([ghost], registry)
    expect(ghost.ret.kind).toBe('none')
  })
})

describe('归一化管线', () => {
  it('幂等；不动折叠与顺序', () => {
    const smelter = node('smelter', node('ore'), node('coal'), node('oxygen'))
    smelter.folded = true
    normalizeTree([smelter], registry)
    const firstRet = smelter.ret
    normalizeTree([smelter], registry)
    expect(smelter.ret).toEqual(firstRet)
    expect(smelter.folded).toBe(true)
    expect(smelter.children.map((child) => child.type)).toEqual(['ore', 'coal', 'oxygen'])
  })
})
