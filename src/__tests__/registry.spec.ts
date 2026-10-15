import { describe, expect, it } from 'vite-plus/test'

import { childrenSignatureKey, childrenValues, multisetKey, orderedKey } from '@/engine/match'
import { normalizeTree } from '@/engine/normalize'
import { buildRegistry } from '@/engine/registry'
import { node, TEST_DEFS, testRegistry } from './fixtures'

describe('内容校验（生产线模型，D-26）', () => {
  it('允许物品与节点类型同名（ore 既是物品又是可放置符号）', () => {
    const registry = testRegistry()
    expect(registry.item('ore')?.name).toBe('矿石')
    expect(registry.node('ore')?.cost).toEqual([{ item: 'ore' }])
  })

  it('拒绝物品/节点各自的重复 id', () => {
    expect(() =>
      buildRegistry({ ...TEST_DEFS, items: [...TEST_DEFS.items, { id: 'ore', name: '矿' }] }),
    ).toThrow(/items\[.*\] 重复 id/)
    expect(() =>
      buildRegistry({ ...TEST_DEFS, nodes: [...TEST_DEFS.nodes, { id: 'mine', name: '井2' }] }),
    ).toThrow(/nodes\[.*\] 重复 id/)
  })

  it('拒绝配方 out 不是物品（产出必须进背包）', () => {
    expect(() =>
      buildRegistry({
        ...TEST_DEFS,
        recipes: [{ at: 'mine', args: [], out: [{ item: 'smelter' }] }], // smelter 只是节点类型
      }),
    ).toThrow(/out 必须是物品/)
  })

  it('拒绝配方引用未注册的 item / at', () => {
    expect(() =>
      buildRegistry({
        ...TEST_DEFS,
        recipes: [{ at: 'mine', args: [{ item: 'missing' }], out: [{ item: 'ore' }] }],
      }),
    ).toThrow(/item 未注册/)
    expect(() =>
      buildRegistry({
        ...TEST_DEFS,
        recipes: [{ at: 'nope', args: [], out: [{ item: 'ore' }] }],
      }),
    ).toThrow(/at 未注册/)
  })

  it('拒绝重复配方签名', () => {
    const recipe = TEST_DEFS.recipes[2]
    if (!recipe) throw new Error('fixture 配方缺失')
    expect(() => buildRegistry({ ...TEST_DEFS, recipes: [recipe, recipe] })).toThrow(/签名重复/)
  })

  it('拒绝 cost 引用未注册物品 / 负数', () => {
    expect(() =>
      buildRegistry({
        ...TEST_DEFS,
        nodes: [...TEST_DEFS.nodes, { id: 'x', name: 'X', cost: [{ item: 'ghost' }] }],
      }),
    ).toThrow(/cost 引用未注册物品/)
    expect(() =>
      buildRegistry({
        ...TEST_DEFS,
        nodes: [...TEST_DEFS.nodes, { id: 'x', name: 'X', cost: [{ item: 'ore', count: -1 }] }],
      }),
    ).toThrow(/cost 为负/)
  })

  it('拒绝非法 config', () => {
    expect(() =>
      buildRegistry({ ...TEST_DEFS, config: { bagCapacity: 0, chestCapacity: 8 } }),
    ).toThrow(/bagCapacity 必须 >= 1/)
    expect(() =>
      buildRegistry({ ...TEST_DEFS, config: { bagCapacity: 8, chestCapacity: 0 } }),
    ).toThrow(/chestCapacity 必须 >= 1/)
  })

  it('接受合法的 panel 值（storage）；拒绝未知 panel id', () => {
    expect(testRegistry().node('chest')?.panel).toBe('storage')
    expect(() =>
      buildRegistry({
        ...TEST_DEFS,
        nodes: [...TEST_DEFS.nodes, { id: 'win', name: '窗', panel: 'nope' }],
      }),
    ).toThrow(/panel 未知/)
  })
})

describe('物品与标签', () => {
  const registry = testRegistry()

  it('item / node 分别解析注册表', () => {
    expect(registry.item('iron')?.name).toBe('铁')
    expect(registry.item('smelter')).toBeUndefined() // 机器不是物品
    expect(registry.node('smelter')?.name).toBe('冶炼炉')
    expect(registry.node('iron')).toBeUndefined() // 物品不自动成为节点
  })

  it('labelOf 节点类型 → name、物品 → name、未注册 → id', () => {
    expect(registry.labelOf('ore')).toBe('矿石') // 同名：两者名字一致
    expect(registry.labelOf('iron')).toBe('铁')
    expect(registry.labelOf('ghost')).toBe('ghost')
  })

  it('shortOf 取 short，未注册 → id', () => {
    expect(registry.shortOf('ore')).toBe('矿')
    expect(registry.shortOf('gear')).toBe('轮')
    expect(registry.shortOf('ghost')).toBe('ghost')
  })
})

describe('配方派发索引', () => {
  const registry = testRegistry({
    ...TEST_DEFS,
    nodes: [...TEST_DEFS.nodes, { id: 'mixer', name: '混合器' }],
    recipes: [
      { at: 'mixer', args: [{ item: 'ore' }, { item: 'coal' }], out: [{ item: 'iron' }] },
      {
        at: 'mixer',
        match: 'ordered',
        args: [{ item: 'ore' }, { item: 'coal' }],
        out: [{ item: 'gear' }],
      },
    ],
  })

  it('recipeModes 去重且无配方为空', () => {
    expect(registry.recipeModes('mixer')).toEqual(['multiset', 'ordered'])
    expect(registry.recipeModes('ore')).toEqual([])
  })

  it('同一 (type, key) 下 multiset 与 ordered 各命中自己的配方', () => {
    const mixer = node('mixer', node('ore'), node('coal'))
    normalizeTree([mixer], registry)
    const multiKey = childrenSignatureKey(mixer.children, 'multiset')
    const orderedSignature = childrenSignatureKey(mixer.children, 'ordered')
    expect(multiKey).toBe(multisetKey(childrenValues(mixer)))
    expect(orderedSignature).toBe(orderedKey(childrenValues(mixer)))
    expect(registry.recipeFor('mixer', 'multiset', multiKey)?.out).toEqual([{ item: 'iron' }])
    expect(registry.recipeFor('mixer', 'ordered', orderedSignature)?.out).toEqual([
      { item: 'gear' },
    ])
    // 两模式互不串味：拿另一模式的键去查必然落空
    expect(registry.recipeFor('mixer', 'ordered', multiKey)).toBeUndefined()
    expect(registry.recipeFor('mixer', 'multiset', orderedSignature)).toBeUndefined()
  })
})
