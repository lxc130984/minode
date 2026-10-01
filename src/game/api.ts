/**
 * 内容创作 API:游戏开发者(内置内容 src/content/、扩展、控制台)共用的
 * 唯一入口。内置内容也用同一套 API 注册(吃自己的狗粮,保证它对
 * "大量内容"真的够用)。
 *
 * 心智模型:一切内容 = 节点(node)+ 交互(interact/yield)+ 配方(recipe)。
 * 注册即校验:引用缺失(图标没画、交互/配方引用了未注册节点)会给出
 * 可操作的 console 警告;minode.validate() 随时全量体检。
 *
 * 静态内容 = 在 src/content/ 下加一个文件 export 内容包,再在
 * content/index.ts 里挂上(进版本库、随构建打包);
 * 动态内容 = 控制台/运行时调 minode.*(刷新即失,适合试玩)。
 */
import type { Component } from "vue"
import {
  DEF_MAP,
  INTERACTIONS,
  NODE_DEFS,
  RECIPES,
  putInteraction,
  putNodeDef,
  putRecipe,
} from "./registry"
import { ICONS } from "./icons"
import type { Interaction, NodeDef, Recipe } from "./types"

const warn = (msg: string): void => {
  console.warn(`[minode] ${msg}`)
}

/** 注册图标组件(像素贴图直接放 src/assets/icons/ 即自动注册,无需本 API) */
export function registerIcon(name: string, comp: Component): void {
  ICONS[name] = comp
}

/** 注册/覆盖一个节点类型 */
export function registerNode(def: NodeDef): void {
  if (!def.id || !def.name) {
    warn(`节点缺少 id/name:${JSON.stringify(def).slice(0, 80)}`)
    return
  }
  if (def.icon && !ICONS[def.icon]) {
    warn(
      `节点「${def.id}」的图标 "${def.icon}" 未注册——把同名图片丢进 src/assets/icons/ 即自动注册,` +
        `或先 minode.registerIcon("${def.icon}", 组件)`,
    )
  }
  putNodeDef(def)
}

/** 注册/覆盖一条交互规则(点击来源 × 点击目标 → 产出/风味) */
export function registerInteraction(interaction: Interaction): void {
  if (interaction.source !== "hand" && !DEF_MAP[interaction.source]) {
    warn(`交互 ${interaction.source}>${interaction.target}:来源 "${interaction.source}" 还没注册(node)`)
  }
  if (!DEF_MAP[interaction.target]) {
    warn(`交互 ${interaction.source}>${interaction.target}:目标 "${interaction.target}" 还没注册(node)`)
  }
  for (const r of interaction.results) {
    if (!DEF_MAP[r.type]) {
      warn(`交互 ${interaction.source}>${interaction.target} 的掉落 "${r.type}" 还没注册(node)`)
    }
  }
  putInteraction(interaction)
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

/** 注册/覆盖一条合成配方(同 id 覆盖) */
export function registerRecipe(recipe: Recipe): void {
  if (!recipe.id) {
    warn(`配方缺少 id:${JSON.stringify(recipe).slice(0, 80)}`)
    return
  }
  for (const s of [...recipe.inputs, recipe.output]) {
    if (!DEF_MAP[s.type]) {
      warn(`配方 "${recipe.id}" 引用了未注册的节点 "${s.type}"`)
    }
  }
  putRecipe(recipe)
}

/** 内容包:批量注册(顺序敏感——先 nodes,再 interactions/recipes) */
export interface ContentPack {
  nodes?: NodeDef[]
  interactions?: Interaction[]
  recipes?: Recipe[]
}

export function registerContent(pack: ContentPack): void {
  for (const n of pack.nodes ?? []) registerNode(n)
  for (const i of pack.interactions ?? []) registerInteraction(i)
  for (const r of pack.recipes ?? []) registerRecipe(r)
}

/** 全量体检:图标引用/交互双方/配方材料是否都有着落;返回问题列表(空 = 健康) */
export function validateContent(): string[] {
  const problems: string[] = []
  for (const d of NODE_DEFS) {
    if (d.icon && !ICONS[d.icon]) problems.push(`节点 "${d.id}" 的图标 "${d.icon}" 未注册`)
    for (const [k, v] of [["workMs", d.workMs], ["maxStack", d.maxStack], ["maxProcess", d.maxProcess]] as const) {
      if (typeof v === "number" && v <= 0) problems.push(`节点 "${d.id}" 的 ${k} 必须是正数(当前 ${v})`)
    }
    const b = d.behavior
    if (b?.kind === "auto-trigger" && b.intervalMs <= 0) {
      problems.push(`节点 "${d.id}" 的 intervalMs 必须是正数(当前 ${b.intervalMs})`)
    }
  }
  for (const i of INTERACTIONS) {
    if (i.source !== "hand" && !DEF_MAP[i.source]) {
      problems.push(`交互 ${i.source}>${i.target}:来源未注册`)
    }
    if (!DEF_MAP[i.target]) problems.push(`交互 ${i.source}>${i.target}:目标未注册`)
    for (const r of i.results) {
      if (!DEF_MAP[r.type]) problems.push(`交互 ${i.source}>${i.target} 的掉落 "${r.type}" 未注册`)
    }
  }
  for (const r of RECIPES) {
    for (const s of [...r.inputs, r.output]) {
      if (!DEF_MAP[s.type]) problems.push(`配方 "${r.id}" 引用了未注册的节点 "${s.type}"`)
    }
  }
  if (problems.length) warn(`内容体检发现 ${problems.length} 个问题:\n- ${problems.join("\n- ")}`)
  return problems
}

/** 扩展 API 整体(便于整体挂载;DEV 下挂 window.minode) */
export const minodeApi = {
  registerIcon,
  registerNode,
  registerInteraction,
  registerYield,
  registerRecipe,
  registerContent,
  validate: validateContent,
}
