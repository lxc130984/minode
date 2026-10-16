import { D, type Decimal } from './num'
import type { GameNode, Yield, RecipeDef, RecipeArg } from './types'

/** 签名键：**多重集**（顺序无关、数量有关）——唯一的匹配模式（D-36）。 */
function multisetKeyOf(values: Iterable<Yield>): string {
  const counts = new Map<string, Decimal>()
  for (const value of values) {
    counts.set(value.id, (counts.get(value.id) ?? D(0)).add(value.count))
  }
  return [...counts.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([id, count]) => `${id}:${count.toString()}`)
    .join('|')
}

/** 手持隐式实参（docs/10 §4）：排在实参最前。 */
function* withHeld(held: string | null, amounts: Generator<Yield>): Generator<Yield> {
  if (held) yield { id: held, count: D(1) }
  yield* amounts
}

/** 直接遍历子节点 ret 的 value 条目（未识别的不参与签名），不落中间数组。 */
function* childAmounts(children: readonly GameNode[]): Generator<Yield> {
  for (const child of children) {
    if (child.ret.kind === 'value') yield* child.ret.items
  }
}

/**
 * 直接由子节点列表构造签名键；`held` 给定时作为隐式实参与检测。
 * 与归一化（`computeRet`）、点击求值（`findRecipe`）共用同一键语义。
 */
export function childrenSignatureKey(
  children: readonly GameNode[],
  held: string | null = null,
): string {
  return multisetKeyOf(withHeld(held, childAmounts(children)))
}

function argAmounts(args: readonly RecipeArg[]): Yield[] {
  return args.map((arg) => ({ id: arg.item, count: D(arg.count ?? 1) }))
}

export function recipeSignatureKey(recipe: RecipeDef): string {
  return multisetKeyOf(argAmounts(recipe.args))
}
