import { childrenSignatureKey } from './match'
import { D, type Decimal } from './num'
import type { NodeRegistry } from './registry'
import type { EvalOp, GameNode, NodeId, RecipeDef } from './types'

/** 引擎与宿主（store）之间的世界接口。 */
export interface EvalWorld {
  registry: NodeRegistry
  /** 产出入口（产物 id：资源或节点类型）；返回**放不下的余量**（余量 < count 即部分/全部接收） */
  gain(id: string, count: Decimal): Decimal
}

export interface EvalOptions {
  /** 手持物 id（docs/10 §4：隐式实参，只参与被点节点的签名检测） */
  held?: string | null
}

export interface EvalOutcome {
  node: NodeId
  /** 命中的配方（含手持隐式实参）；undefined = 符号/未注册/检测不通过 */
  recipe: RecipeDef | undefined
  /** 是否有实际产出（gain 被接收） */
  effective: boolean
}

/**
 * 静态配方检测（含手持回落，docs/10 §4）：对每种模式先试「手持 + 子实参」签名，
 * 再试空手签名。手持永远不会打断已有配方——只增加命中可能。
 */
export function findRecipe(
  registry: NodeRegistry,
  node: GameNode,
  held: string | null = null,
): RecipeDef | undefined {
  for (const mode of registry.recipeModes(node.type)) {
    const hit = registry.recipeFor(node.type, mode, childrenSignatureKey(node.children, mode, held))
    if (hit) return hit
    if (held) {
      const fallback = registry.recipeFor(
        node.type,
        mode,
        childrenSignatureKey(node.children, mode),
      )
      if (fallback) return fallback
    }
  }
  return undefined
}

/**
 * 点击一个节点 = 对它做一次 eval（docs/02 §1、docs/10 §1）：
 *
 * - 返回值（`[]`）是**结构变更时静态算好**的（`computeRet`）；这里做「配方检测」；
 * - **符号**（无配方的类型）点击**什么都不会发生**；
 * - 函数：检测（含手持）→ 命中 → 产出交给 `world.gain` 按路由结算；
 * - 不 eval 子节点——子节点只提供静态返回值供签名检测。
 */
export function evalNode(node: GameNode, world: EvalWorld, options: EvalOptions = {}): EvalOutcome {
  if (world.registry.recipeModes(node.type).length === 0) {
    return { node: node.id, recipe: undefined, effective: false }
  }
  const recipe = findRecipe(world.registry, node, options.held ?? null)
  if (!recipe) return { node: node.id, recipe: undefined, effective: false }
  const ops: EvalOp[] = recipe.out.map((out) => ({
    op: 'gain',
    id: out.item,
    count: out.count ?? 1,
  }))
  return { node: node.id, recipe, effective: applyOps(ops, world) }
}

/** 结算效果原语；返回是否有实际效果（决定是否进入反馈集合）。 */
export function applyOps(ops: readonly EvalOp[], world: EvalWorld): boolean {
  let effective = false
  for (const op of ops) {
    const amount = D(op.count)
    if (amount.gt(0)) {
      // 「有效」= 余量 < count：部分接收也算有效
      if (world.gain(op.id, amount).lt(amount)) effective = true
    }
  }
  return effective
}
