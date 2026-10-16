import { describe, expect, it } from 'vite-plus/test'

import { childrenSignatureKey, recipeSignatureKey } from '@/engine/match'
import { normalizeTree } from '@/engine/normalize'
import { node, testRegistry } from './fixtures'

const registry = testRegistry()

describe('签名键（多重集：顺序无关、数量有关，D-36 唯一模式）', () => {
  it('顺序无关：实参换序签名不变', () => {
    const a = node('smelter', node('ore'), node('coal'), node('oxygen'))
    const b = node('smelter', node('oxygen'), node('ore'), node('coal'))
    normalizeTree([a, b], registry)
    expect(childrenSignatureKey(a.children)).toBe(childrenSignatureKey(b.children))
  })

  it('数量有关：多一个实参签名不同', () => {
    const a = node('smelter', node('ore'), node('coal'), node('oxygen'))
    const b = node('smelter', node('ore'), node('ore'), node('coal'), node('oxygen'))
    normalizeTree([a, b], registry)
    expect(childrenSignatureKey(a.children)).not.toBe(childrenSignatureKey(b.children))
  })

  it('未识别子节点不参与签名（ret 非 value 剔除）', () => {
    const a = node('smelter', node('ore'), node('coal'), node('oxygen'))
    normalizeTree([a], registry)
    const broken = node('smelter', node('ore'), node('coal'), node('smelter')) // 缺氧气、多一台空炉
    normalizeTree([broken], registry)
    // 空冶炼炉 unresolved → 不入签名：签名 = {ore, coal} ≠ {ore, coal, oxygen}
    expect(childrenSignatureKey(broken.children)).not.toBe(childrenSignatureKey(a.children))
  })

  it('手持隐式实参：排在实参最前（参与多重集）', () => {
    const partial = node('smelter', node('ore'), node('coal')) // 缺氧气
    normalizeTree([partial], registry)
    const full = node('smelter', node('ore'), node('coal'), node('oxygen'))
    normalizeTree([full], registry)
    // 手持氧气补位 → 与完整实参同签名
    expect(childrenSignatureKey(partial.children, 'oxygen')).toBe(
      childrenSignatureKey(full.children),
    )
    // 不相关的手持物 → 签名不同
    expect(childrenSignatureKey(partial.children, 'axe')).not.toBe(
      childrenSignatureKey(full.children),
    )
  })
})

describe('配方键一致性（子节点路径 ↔ 配方 args 路径）', () => {
  it('精确匹配：实参不多不少', () => {
    const smelter = node('smelter', node('ore'), node('coal'), node('oxygen'))
    normalizeTree([smelter], registry)
    const recipe = registry.recipeFor('smelter', childrenSignatureKey(smelter.children))
    expect(recipe).toBeDefined()
    expect(childrenSignatureKey(smelter.children)).toBe(recipeSignatureKey(recipe!))

    smelter.children.push(node('coal'))
    normalizeTree([smelter], registry)
    expect(registry.recipeFor('smelter', childrenSignatureKey(smelter.children))).toBeUndefined()
  })

  it('同类型多条不同签名的配方共存（签名维度唯一：多重集，D-36）', () => {
    const r = testRegistry()
    expect(r.recipesFor('mine').length).toBe(2) // ore / coal 两条矿井配方
    // 重复签名的构建期拒绝在 registry.spec 有专门用例
  })
})
