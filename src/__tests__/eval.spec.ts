import { describe, expect, it } from 'vite-plus/test'

import { evalNode } from '@/engine/eval'
import { normalizeTree } from '@/engine/normalize'
import type { ContentDefs } from '@/engine/types'
import { makeWorld, node, TEST_DEFS, testRegistry, type TestWorld } from './fixtures'

const registry = testRegistry()

describe('eval：只有点击才发生，且只 eval 被点的节点', () => {
  it('符号：点击无响应（没有配方）', () => {
    const ore = node('ore')
    normalizeTree([ore], registry)
    const world = makeWorld(registry)

    const outcome = evalNode(ore, world)
    expect(outcome.recipe).toBeUndefined()
    expect(outcome.effective).toBe(false)
    expect(world.gained).toHaveLength(0)
  })

  it('函数：静态检测命中 → 产出', () => {
    const smelter = node('smelter', node('ore'), node('coal'), node('oxygen'))
    normalizeTree([smelter], registry)
    const world = makeWorld(registry)

    const outcome = evalNode(smelter, world)
    expect(outcome.recipe).toBeDefined()
    expect(outcome.effective).toBe(true)
    expect(world.gained.map((entry) => entry.id)).toEqual(['iron'])
  })

  it('函数：实参不符 → [?] 且点击无产出', () => {
    const broken = node('smelter', node('ore'), node('coal'))
    normalizeTree([broken], registry)
    const world = makeWorld(registry)

    const outcome = evalNode(broken, world)
    expect(outcome.recipe).toBeUndefined()
    expect(outcome.effective).toBe(false)
    expect(world.gained).toHaveLength(0)
    expect(broken.ret.kind).toBe('unresolved')
  })

  it('点击函数不会 eval 子节点：只有被点节点产出', () => {
    // 冶炼炉(矿井(矿石), 煤炭, 氧气)：矿井提供「矿石」这一返回值，但它自己不被 eval
    const smelter = node('smelter', node('mine', node('ore')), node('coal'), node('oxygen'))
    normalizeTree([smelter], registry)
    const world = makeWorld(registry)

    evalNode(smelter, world)
    expect(world.gained.map((entry) => entry.id)).toEqual(['iron']) // 矿井没有产出
  })

  it('点击子节点只影响它自己（父节点结果不变）', () => {
    const mine = node('mine', node('ore'))
    const smelter = node('smelter', mine, node('coal'), node('oxygen'))
    normalizeTree([smelter], registry)
    const world = makeWorld(registry)
    const before = smelter.ret

    evalNode(mine, world)
    expect(world.gained.map((entry) => entry.id)).toEqual(['ore'])
    expect(world.gainedOf('iron')).toBe(0)
    expect(smelter.ret).toBe(before)
  })
})

describe('手持 = 隐式实参（docs/10 §4）', () => {
  it('手持斧头点击森林：含手持签名命中 → 木材', () => {
    const forest = node('forest')
    normalizeTree([forest], registry)
    const world = makeWorld(registry)

    expect(forest.ret.kind).toBe('unresolved') // 静态值不含手持：空手 [?]
    const outcome = evalNode(forest, world, { held: 'axe' })
    expect(outcome.recipe).toBeDefined()
    expect(world.gainedOf('wood')).toBe(1)
  })

  it('空手点击森林：无产出', () => {
    const forest = node('forest')
    normalizeTree([forest], registry)
    const world = makeWorld(registry)

    const outcome = evalNode(forest, world)
    expect(outcome.recipe).toBeUndefined()
    expect(world.gained).toHaveLength(0)
  })

  it('手持回落：手持斧头点矿井仍命中空手配方（手持不打断已有配方）', () => {
    const mine = node('mine', node('ore'))
    normalizeTree([mine], registry)
    const world = makeWorld(registry)

    const outcome = evalNode(mine, world, { held: 'axe' })
    expect(outcome.recipe).toBeDefined()
    expect(world.gainedOf('ore')).toBe(1)
  })

  it('手持也可以补足普通配方（如同放在实参位）', () => {
    const smelter = node('smelter', node('ore'), node('coal')) // 缺氧气
    normalizeTree([smelter], registry)
    const world = makeWorld(registry)

    expect(evalNode(smelter, world).effective).toBe(false)
    const outcome = evalNode(smelter, world, { held: 'oxygen' })
    expect(outcome.recipe).toBeDefined()
    expect(world.gainedOf('iron')).toBe(1)
  })

  it('ordered 模式：手持排在实参序列最前（可补首位实参）', () => {
    // 装配台(矿石, 煤炭) 是 ordered：手持矿石补首位 → (矿石, 煤炭) 命中
    const partial = node('assembler', node('coal')) // 空手缺首位
    normalizeTree([partial], registry)
    const world = makeWorld(registry)

    expect(evalNode(partial, world).effective).toBe(false)
    expect(evalNode(partial, world, { held: 'ore' }).effective).toBe(true)
  })
})

describe('产出结算：余量 < count 才算有效', () => {
  const defs: ContentDefs = {
    ...TEST_DEFS,
    nodes: [...TEST_DEFS.nodes, { id: 'faucet', name: '水龙头', short: '水' }],
    recipes: [...TEST_DEFS.recipes, { at: 'faucet', args: [], out: [{ item: 'iron', count: 5 }] }],
  }
  const build = (): TestWorld => makeWorld(testRegistry(defs))

  it('全部接收 → 有效', () => {
    expect(evalNode(node('faucet'), build()).effective).toBe(true)
  })

  it('部分接收（余量 3 < 5）→ 有效', () => {
    const world = build()
    world.gain = (_id, count) => count.sub(2) // 余量 3 < 5：部分接收也算有效
    expect(evalNode(node('faucet'), world).effective).toBe(true)
  })

  it('完全放不下（余量 = count）→ 无效', () => {
    const world = build()
    world.gain = (_id, count) => count
    expect(evalNode(node('faucet'), world).effective).toBe(false)
  })
})
