import { recipeSignatureKey } from './match'
import type {
  ContentDefs,
  EngineConfig,
  ItemDef,
  ItemId,
  NodeDef,
  NodeTypeId,
  RecipeDef,
} from './types'

export type RecipeMode = 'multiset' | 'ordered'

export interface NodeRegistry {
  readonly defs: ContentDefs
  readonly config: EngineConfig
  item(id: ItemId): ItemDef | undefined
  node(id: NodeTypeId): NodeDef | undefined
  /** `[]` 与背包共用：节点类型 → node.name；物品 → item.name；未注册 → id 本身 */
  labelOf(id: string): string
  /** short ?? name；未注册 → id */
  shortOf(id: string): string
  recipesFor(type: NodeTypeId): readonly RecipeDef[]
  /** 该类型配方用到的匹配模式（去重，通常只有 1 个；无配方 = 空数组 = 符号） */
  recipeModes(type: NodeTypeId): readonly RecipeMode[]
  /** 按「模式 + 签名」O(1) 取配方；无命中返回 undefined */
  recipeFor(type: NodeTypeId, mode: RecipeMode, key: string): RecipeDef | undefined
  /** 「唯一产物是该物品」的配方（分解/回收下钻用，docs/04 §3）；没有 → undefined */
  decomposeRecipeOf(item: ItemId): RecipeDef | undefined
}

/** 已知面板 id（`NodeDef.panel` 只认这些）。 */
const PANEL_IDS = new Set(['storage'])

function validateDefs(defs: ContentDefs): string[] {
  const issues: string[] = []
  const itemIds = new Set<string>()
  const nodeIds = new Set<string>()

  defs.items.forEach((item, index) => {
    if (itemIds.has(item.id)) issues.push(`items[${index}] 重复 id: ${item.id}`)
    itemIds.add(item.id)
  })
  // 注意：物品与节点类型 id **允许同名**（如 iron_ore 既是物品又是可放置的符号节点）。
  defs.nodes.forEach((node, index) => {
    if (nodeIds.has(node.id)) issues.push(`nodes[${index}] 重复 id: ${node.id}`)
    nodeIds.add(node.id)
    if (node.panel && !PANEL_IDS.has(node.panel)) {
      issues.push(`nodes[${index}] panel 未知: ${node.panel}`)
    }
    for (const cost of node.cost ?? []) {
      if (!itemIds.has(cost.item)) {
        issues.push(`nodes[${index}] cost 引用未注册物品: ${cost.item}`)
      }
      if (cost.count !== undefined && cost.count < 0) {
        issues.push(`nodes[${index}] cost 为负: ${cost.item}`)
      }
    }
  })

  // 配方：at 必须是节点类型；out 必须是物品（产出全部进背包）；
  // args 匹配的是子节点返回值（物品 id 或节点类型 id）。
  const knownValue = (id: string): boolean => itemIds.has(id) || nodeIds.has(id)

  const recipeSignatures = new Map<string, number>()
  defs.recipes.forEach((recipe, index) => {
    if (!nodeIds.has(recipe.at)) issues.push(`recipes[${index}] at 未注册: ${recipe.at}`)
    for (const out of recipe.out) {
      if (!itemIds.has(out.item)) {
        issues.push(`recipes[${index}] out 必须是物品: ${out.item}`)
      }
      if (out.count !== undefined && out.count < 0) {
        issues.push(`recipes[${index}] count 为负: ${out.item}`)
      }
    }
    for (const arg of recipe.args) {
      if (!knownValue(arg.item)) issues.push(`recipes[${index}] item 未注册: ${arg.item}`)
      if (arg.count !== undefined && arg.count < 0) {
        issues.push(`recipes[${index}] count 为负: ${arg.item}`)
      }
    }
    const key = `${recipe.at}::${recipeSignatureKey(recipe)}`
    if (recipeSignatures.has(key)) {
      issues.push(`recipes[${index}] 与 recipes[${recipeSignatures.get(key)}] 签名重复: ${key}`)
    }
    recipeSignatures.set(key, index)
  })

  if (defs.config.bagCapacity < 1) issues.push('config.bagCapacity 必须 >= 1')
  if (defs.config.chestCapacity < 1) issues.push('config.chestCapacity 必须 >= 1')
  return issues
}

export function buildRegistry(defs: ContentDefs): NodeRegistry {
  const issues = validateDefs(defs)
  if (issues.length > 0) {
    throw new Error(`内容包校验失败:\n- ${issues.join('\n- ')}`)
  }

  const itemMap = new Map(defs.items.map((item) => [item.id, item]))
  const nodeMap = new Map(defs.nodes.map((node) => [node.id, node]))
  const recipesByType = new Map<NodeTypeId, RecipeDef[]>()
  for (const recipe of defs.recipes) {
    const list = recipesByType.get(recipe.at)
    if (list) list.push(recipe)
    else recipesByType.set(recipe.at, [recipe])
  }

  // 构建期预编译：单产物反查表（分解/回收下钻用）
  const singleOutput = new Map<ItemId, RecipeDef>()
  for (const recipe of defs.recipes) {
    if (recipe.out.length !== 1) continue
    const item = recipe.out[0]?.item as ItemId
    if (item !== undefined && !singleOutput.has(item)) singleOutput.set(item, recipe)
  }

  // 构建期预编译派发表：模式去重 + `${mode}::${签名}` → 配方
  const recipeIndex = new Map<NodeTypeId, { modes: RecipeMode[]; byKey: Map<string, RecipeDef> }>()
  for (const [type, recipes] of recipesByType) {
    const modes: RecipeMode[] = []
    const byKey = new Map<string, RecipeDef>()
    for (const recipe of recipes) {
      const mode = recipe.match ?? 'multiset'
      if (!modes.includes(mode)) modes.push(mode)
      byKey.set(`${mode}::${recipeSignatureKey(recipe)}`, recipe)
    }
    recipeIndex.set(type, { modes, byKey })
  }

  return {
    defs,
    config: defs.config,
    item: (id) => itemMap.get(id),
    node: (id) => nodeMap.get(id),
    labelOf: (id) => (nodeMap.get(id) ?? itemMap.get(id))?.name ?? id,
    shortOf: (id) => (nodeMap.get(id) ?? itemMap.get(id))?.short ?? id,
    recipesFor: (type) => recipesByType.get(type) ?? [],
    recipeModes: (type) => recipeIndex.get(type)?.modes ?? [],
    recipeFor: (type, mode, key) => recipeIndex.get(type)?.byKey.get(`${mode}::${key}`),
    decomposeRecipeOf: (item) => singleOutput.get(item),
  }
}
