import { describe, expect, it } from 'vite-plus/test'

import { evalNode } from '@/engine/eval'
import { findNode } from '@/engine/node'
import { normalizeTree } from '@/engine/normalize'
import type { ContentDefs, GameNode } from '@/engine/types'
import { makeWorld, node, testRegistry } from './fixtures'

/** 四层加工链：矿石 → 铁锭 → 齿轮 → 组件（每层的实参是"能算出该物品的表达式"）。 */
const CHAIN: ContentDefs = {
  items: [
    { id: 'ore', name: '矿石', short: '矿' },
    { id: 'ingot', name: '铁锭', short: '锭' },
    { id: 'gear', name: '齿轮', short: '轮' },
    { id: 'module', name: '组件', short: '件' },
  ],
  nodes: [
    { id: 'ore', name: '矿石', short: '矿', cost: [{ item: 'ore' }] }, // 符号
    { id: 'forge', name: '锻造台' }, // 函数
    { id: 'press', name: '压机' },
    { id: 'polish', name: '研磨机' },
  ],
  recipes: [
    { at: 'forge', args: [{ item: 'ore' }], out: [{ item: 'ingot' }] },
    { at: 'forge', args: [{ item: 'ore', count: 2 }], out: [{ item: 'ingot' }] },
    { at: 'press', args: [{ item: 'ingot' }], out: [{ item: 'gear' }] },
    { at: 'polish', args: [{ item: 'gear' }], out: [{ item: 'module' }] },
  ],
  config: { bagCapacity: 64, chestCapacity: 32 },
}

const registry = testRegistry(CHAIN)

function valueOf(root: GameNode, id: string): string {
  const target = findNode([root], id)
  const ret = target?.ret
  if (!ret || ret.kind !== 'value') return ret?.kind ?? '?'
  return ret.items.map((entry) => entry.id).join(',')
}

describe('深树：静态检测 + 点击只 eval 被点节点', () => {
  it('静态检测沿树向上：每层结果都能算出来', () => {
    // 研磨机( 压机( 锻造台( 矿石 ) ) )
    const root = node('polish', node('press', node('forge', node('ore'))))
    normalizeTree([root], registry)

    const forge = root.children[0]?.children[0]
    const press = root.children[0]
    if (!forge || !press) throw new Error('链结构缺失')
    expect(valueOf(root, root.id)).toBe('module') // [组件]
    expect(valueOf(root, press.id)).toBe('gear') // [齿轮]
    expect(valueOf(root, forge.id)).toBe('ingot') // [铁锭]
    expect(valueOf(root, forge.children[0]?.id ?? '')).toBe('ore') // [矿]
  })

  it('点击顶层：只产出顶层的结果，子节点不 eval', () => {
    const root = node('polish', node('press', node('forge', node('ore'))))
    normalizeTree([root], registry)
    const world = makeWorld(registry)

    const outcome = evalNode(root, world)
    expect(outcome.effective).toBe(true)
    expect(world.gained.map((entry) => entry.id)).toEqual(['module'])
  })

  it('点击中间层：只产出它的结果，父节点不受影响', () => {
    const root = node('polish', node('press', node('forge', node('ore'))))
    normalizeTree([root], registry)
    const world = makeWorld(registry)
    const forge = root.children[0]?.children[0]
    if (!forge) throw new Error('链结构缺失')
    const before = root.ret

    evalNode(forge, world)
    expect(world.gained.map((entry) => entry.id)).toEqual(['ingot'])
    expect(root.ret).toBe(before)
  })

  it('实参不符：[?] 沿树传染，点击无产出', () => {
    // 研磨机( 压机( 锻造台 ) ) —— 锻造台少了矿石
    const root = node('polish', node('press', node('forge')))
    normalizeTree([root], registry)
    const world = makeWorld(registry)

    expect(root.ret.kind).toBe('unresolved')
    const outcome = evalNode(root, world)
    expect(outcome.effective).toBe(false)
    expect(world.gained).toHaveLength(0)
  })

  it('宽 + 深：数量参与签名（两颗矿石才配得上 ore:2 配方）', () => {
    const wide = node('polish', node('press', node('forge', node('ore'), node('ore'))))
    normalizeTree([wide], registry)
    expect(wide.ret.kind).toBe('value') // forge 命中 ore:2 → ingot → … → module

    const world = makeWorld(registry)
    evalNode(wide, world)
    expect(world.gained.map((entry) => entry.id)).toEqual(['module'])
  })
})
