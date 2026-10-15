import { describe, expect, it } from 'vite-plus/test'

import {
  childrenSignatureKey,
  childrenValues,
  multisetKey,
  orderedKey,
  recipeSignatureKey,
  signatureKey,
} from '@/engine/match'
import { normalizeTree } from '@/engine/normalize'
import { D } from '@/engine/num'
import { node, testRegistry } from './fixtures'
import type { GameNode } from '@/engine/types'

const registry = testRegistry()

/** 遍历一棵树，对每个节点断言两条签名路径一致。 */
function assertKeysAgree(root: GameNode): void {
  const check = (current: GameNode): void => {
    for (const mode of ['multiset', 'ordered'] as const) {
      expect(childrenSignatureKey(current.children, mode)).toBe(
        signatureKey(childrenValues(current), mode),
      )
    }
    for (const child of current.children) check(child)
  }
  check(root)
}

describe('签名键', () => {
  it('multiset 顺序无关、数量有关', () => {
    const ab = multisetKey([
      { id: 'ore', count: D(1) },
      { id: 'coal', count: D(1) },
    ])
    const ba = multisetKey([
      { id: 'coal', count: D(1) },
      { id: 'ore', count: D(1) },
    ])
    const aab = multisetKey([
      { id: 'ore', count: D(2) },
      { id: 'coal', count: D(1) },
    ])
    expect(ab).toBe(ba)
    expect(ab).not.toBe(aab)
  })

  it('ordered 顺序敏感', () => {
    const forward = orderedKey([
      { id: 'ore', count: D(1) },
      { id: 'coal', count: D(1) },
    ])
    const reversed = orderedKey([
      { id: 'coal', count: D(1) },
      { id: 'ore', count: D(1) },
    ])
    expect(forward).not.toBe(reversed)
  })

  it('childrenSignatureKey 与 signatureKey(childrenValues) 逐节点一致', () => {
    const tree = node(
      'smelter',
      node('mine', node('ore'), node('ore')),
      node('coal'),
      node('assembler', node('ore'), node('coal')),
    )
    // 含非 value 子节点的分支也要覆盖
    const unresolved = node('smelter', node('smelter', node('iron')))
    normalizeTree([tree, unresolved], registry)
    assertKeysAgree(tree)
    assertKeysAgree(unresolved)
  })
})

describe('配方键一致性', () => {
  it('精确匹配：实参不多不少', () => {
    const smelter = node('smelter', node('ore'), node('coal'), node('oxygen'))
    normalizeTree([smelter], registry)
    const recipe = registry.recipeFor(
      'smelter',
      'multiset',
      childrenSignatureKey(smelter.children, 'multiset'),
    )
    expect(recipe).toBeDefined()
    expect(childrenSignatureKey(smelter.children, 'multiset')).toBe(recipeSignatureKey(recipe!))

    smelter.children.push(node('coal'))
    normalizeTree([smelter], registry)
    expect(
      registry.recipeFor('smelter', 'multiset', childrenSignatureKey(smelter.children, 'multiset')),
    ).toBeUndefined()
  })

  it('ordered 配方只按位置命中', () => {
    const right = node('assembler', node('ore'), node('coal'))
    const wrong = node('assembler', node('coal'), node('ore'))
    normalizeTree([right, wrong], registry)
    expect(
      registry.recipeFor('assembler', 'ordered', childrenSignatureKey(right.children, 'ordered')),
    ).toBeDefined()
    expect(
      registry.recipeFor('assembler', 'ordered', childrenSignatureKey(wrong.children, 'ordered')),
    ).toBeUndefined()
  })
})
