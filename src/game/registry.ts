/**
 * 内容注册表(引擎侧):节点类型、交互规则、合成配方的运行时容器。
 * 引擎与界面只认这里;内容(内置 src/content/ 或运行时扩展)统一经
 * game/api.ts 注册进来——api 之上做校验,本文件只维护集合与索引一致性。
 *
 * 所有集合都是 shallowReactive:注册(push/索引赋值)会立刻反映到
 * 消费它们的 computed 与组件渲染里(图鉴分组/配方列表/图标)。
 */
import { shallowReactive } from "vue"
import type { Interaction, NodeDef, NodeZone, Recipe } from "./types"

/** 全部节点类型定义(经 registerNode 填充) */
export const NODE_DEFS: NodeDef[] = shallowReactive([])
export const DEF_MAP: Record<string, NodeDef> = shallowReactive({} as Record<string, NodeDef>)

/** 交互规则表:source(可为 "hand")× target → 产出/风味 */
export const INTERACTIONS: Interaction[] = shallowReactive([])
export const INTERACTION_MAP: Record<string, Interaction> = shallowReactive(
  {} as Record<string, Interaction>,
)

/** 合成配方 */
export const RECIPES: Recipe[] = shallowReactive([])

// ── 注册原语(api.ts 在其上做校验;也可直接用于无校验的热替换) ──

/** 注册/覆盖一个节点类型(同 id 覆盖,维护 NODE_DEFS 与 DEF_MAP) */
export function putNodeDef(def: NodeDef): void {
  const existing = DEF_MAP[def.id]
  if (existing) {
    const idx = NODE_DEFS.indexOf(existing)
    if (idx >= 0) NODE_DEFS[idx] = def
  } else {
    NODE_DEFS.push(def)
  }
  DEF_MAP[def.id] = def
}

/** 注册/覆盖一条交互(同 "source>target" 键覆盖) */
export function putInteraction(interaction: Interaction): void {
  const key = `${interaction.source}>${interaction.target}`
  const existing = INTERACTION_MAP[key]
  if (existing) {
    const idx = INTERACTIONS.indexOf(existing)
    if (idx >= 0) INTERACTIONS[idx] = interaction
  } else {
    INTERACTIONS.push(interaction)
  }
  INTERACTION_MAP[key] = interaction
}

/** 注册/覆盖一条配方(同 id 覆盖) */
export function putRecipe(recipe: Recipe): void {
  const idx = RECIPES.findIndex((r) => r.id === recipe.id)
  if (idx >= 0) RECIPES[idx] = recipe
  else RECIPES.push(recipe)
}

// ── 查询(引擎与界面的唯一口径) ──

const ALL_ZONES: NodeZone[] = ["world", "backpack"]

export function getDef(type: string): NodeDef {
  return (
    DEF_MAP[type] ?? {
      id: type,
      name: type,
      category: "material",
      icon: "hand",
      desc: "未知的节点。",
      zones: ALL_ZONES,
    }
  )
}

/** 节点允许存在的区域 */
export function zonesOf(type: string): NodeZone[] {
  const def = DEF_MAP[type]
  if (!def) return ALL_ZONES
  if (def.zones) return def.zones
  if (def.worldOnly) return ["world"]
  return ALL_ZONES
}

/** 节点能否进入某区域 */
export function canPlaceInZone(type: string, zone: NodeZone): boolean {
  return zonesOf(type).includes(zone)
}

/** 永久节点(不可移除) */
export const isPermanent = (type: string): boolean => !!DEF_MAP[type]?.permanent

export function findInteraction(source: string, target: string): Interaction | undefined {
  return INTERACTION_MAP[`${source}>${target}`]
}

export const getRecipe = (id: string): Recipe | undefined =>
  RECIPES.find((r) => r.id === id)

/** 掷骰:按顺序判定,首个命中的掉落生效 */
export function rollDrops(interaction: Interaction): { type: string; count: number }[] {
  for (const entry of interaction.results) {
    if (Math.random() < entry.chance) {
      return [{ type: entry.type, count: entry.count ?? 1 }]
    }
  }
  return []
}

/** 按权重随机选取 */
export function rollPool(pool: Array<{ type: string; weight: number }>): string {
  const total = pool.reduce((s, p) => s + p.weight, 0)
  let r = Math.random() * total
  for (const item of pool) {
    r -= item.weight
    if (r < 0) return item.type
  }
  return pool[0]?.type ?? "forest"
}
