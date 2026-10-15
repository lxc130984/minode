import { D, type Decimal } from './num'
import type { GameNode, Yield, RecipeDef, RecipeArg } from './types'

/** 子节点 ret 的 value 条目（未识别的不参与签名）。 */
export function childrenValues(node: GameNode): Yield[] {
  const values: Yield[] = []
  for (const child of node.children) {
    if (child.ret.kind === 'value') values.push(...child.ret.items)
  }
  return values
}

/** 多重集键：顺序无关、数量有关。 */
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

/** 序列键：顺序敏感（ordered 模式）。 */
function orderedKeyOf(values: Iterable<Yield>): string {
  const parts: string[] = []
  for (const value of values) parts.push(`${value.id}:${value.count.toString()}`)
  return parts.join('>')
}

export function multisetKey(values: readonly Yield[]): string {
  return multisetKeyOf(values)
}

export function orderedKey(values: readonly Yield[]): string {
  return orderedKeyOf(values)
}

export function signatureKey(values: readonly Yield[], mode: 'multiset' | 'ordered'): string {
  return mode === 'ordered' ? orderedKey(values) : multisetKey(values)
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
 * 直接用子节点列表构造签名键；`held` 给定时作为隐式实参与与检测。
 * 语义与 `signatureKey(withHeld(held, childrenValues(node)), mode)` 一致。
 */
export function childrenSignatureKey(
  children: readonly GameNode[],
  mode: 'multiset' | 'ordered',
  held: string | null = null,
): string {
  return mode === 'ordered'
    ? orderedKeyOf(withHeld(held, childAmounts(children)))
    : multisetKeyOf(withHeld(held, childAmounts(children)))
}

function argAmounts(args: readonly RecipeArg[]): Yield[] {
  return args.map((arg) => ({ id: arg.item, count: D(arg.count ?? 1) }))
}

export function recipeSignatureKey(recipe: RecipeDef): string {
  return signatureKey(argAmounts(recipe.args), recipe.match ?? 'multiset')
}
