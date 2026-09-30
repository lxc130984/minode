/**
 * 内容扩展 API:运行时注册自定义节点/交互/配方。
 * 适合试验性内容、mod 式扩展、控制台快速试玩(DEV 下挂到 window.minode)。
 *
 * 例:
 *   import { registerNode, registerRecipe } from "@/game/api"
 *   registerNode({
 *     id: "charcoal",
 *     name: "木炭",
 *     category: "material",
 *     icon: "wood",
 *     desc: "闷烧木头得到的炭。",
 *     accent: "#5a4a3a",
 *     zones: ["world", "backpack"],
 *   })
 */
import {
  DEF_MAP,
  ICONS,
  INTERACTION_MAP,
  INTERACTIONS,
  NODE_DEFS,
  RECIPES,
} from "./registry"
import type { Component } from "vue"
import type { Interaction, NodeDef, Recipe } from "./types"

/** 注册图标(lucide 组件),供 registerNode 的 icon 字段引用 */
export function registerIcon(name: string, comp: Component): void {
  ICONS[name] = comp
}

/** 注册/覆盖一个节点类型定义 */
export function registerNode(def: NodeDef): void {
  if (DEF_MAP[def.id]) {
    const idx = NODE_DEFS.findIndex((d) => d.id === def.id)
    if (idx >= 0) NODE_DEFS[idx] = def
  } else {
    NODE_DEFS.push(def)
  }
  DEF_MAP[def.id] = def
}

/** 注册/覆盖一条交互规则(点击来源 × 点击目标 → 产出) */
export function registerInteraction(interaction: Interaction): void {
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

/** 注册交互的快捷写法 */
export function registerYield(
  source: string,
  target: string,
  results: Interaction["results"],
  note: string,
): void {
  registerInteraction({ source, target, results, note })
}

/** 注册/覆盖一条合成配方(同名 id 覆盖) */
export function registerRecipe(recipe: Recipe): void {
  const idx = RECIPES.findIndex((r) => r.id === recipe.id)
  if (idx >= 0) RECIPES[idx] = recipe
  else RECIPES.push(recipe)
}

/** 扩展 API 整体(便于整体挂载) */
export const minodeApi = {
  registerIcon,
  registerNode,
  registerInteraction,
  registerYield,
  registerRecipe,
}
