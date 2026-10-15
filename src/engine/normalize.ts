import { childrenSignatureKey } from './match'
import { D } from './num'
import type { NodeRegistry } from './registry'
import type { GameNode, RetState } from './types'

export const RET_NONE: RetState = { kind: 'none' }
export const RET_UNRESOLVED: RetState = { kind: 'unresolved' }

/**
 * 返回值（纯函数，docs/01 §4）——即节点 `[]` 里显示的东西：
 *
 * - 有配方的类型（函数）：用**子节点的返回值签名**做静态检测，
 *   命中 → 配方产物；不命中 → `[?]`。**不 eval 子节点**，只看它们的静态值。
 * - 没有配方的类型（符号）：返回值 = 自身（原子，省略方括号）。
 * - 未注册类型 → none。
 *
 * 静态值**不含手持**（手持只作用于被点节点的点击检测，docs/10 §4）。
 */
export function computeRet(node: GameNode, registry: NodeRegistry): RetState {
  const def = registry.node(node.type)
  if (!def) return RET_NONE
  const modes = registry.recipeModes(node.type)
  if (modes.length > 0) {
    if (node.children.some((child) => child.ret.kind !== 'value')) return RET_UNRESOLVED
    for (const mode of modes) {
      const recipe = registry.recipeFor(node.type, mode, childrenSignatureKey(node.children, mode))
      if (recipe) {
        return {
          kind: 'value',
          items: recipe.out.map((out) => ({ id: out.item, count: D(out.count ?? 1) })),
        }
      }
    }
    return RET_UNRESOLVED
  }
  return { kind: 'value', items: [{ id: node.type, count: D(1) }] }
}

/** 结构变更后的单次后序遍历：重算全树返回值（docs/01 §6）。 */
export function normalizeTree(roots: readonly GameNode[], registry: NodeRegistry): void {
  const walk = (node: GameNode): void => {
    for (const child of node.children) walk(child)
    node.ret = computeRet(node, registry)
  }
  for (const root of roots) walk(root)
}
