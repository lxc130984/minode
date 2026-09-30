/**
 * 游戏内容注册表:节点类型、交互规则、合成配方。
 * 新内容只需在这里(或通过 game/api.ts 运行时注册)追加定义,
 * 界面与引擎自动生效。
 *
 * 所有集合都是 shallowReactive:运行时注册(push/索引赋值)会立刻
 * 反映到消费它们的 computed 与组件渲染里。
 */
import { markRaw, shallowReactive, type Component } from "vue"
import {
  TreePine,
  Waves,
  Mountain,
  Wand,
  Logs,
  Axe,
  Hand,
  Compass,
  Soup,
  Backpack,
} from "lucide-vue-next"
import type { Interaction, NodeDef, NodeZone, Recipe } from "./types"

/** lucide 图标映射(自定义节点可通过 api.registerIcon 追加) */
export const ICONS = shallowReactive<Record<string, Component>>({
  forest: markRaw(TreePine),
  river: markRaw(Waves),
  stone: markRaw(Mountain),
  stick: markRaw(Wand),
  wood: markRaw(Logs),
  stoneAxe: markRaw(Axe),
  hand: markRaw(Hand),
  explorer: markRaw(Compass),
  bench: markRaw(Soup),
  backpackNode: markRaw(Backpack),
})

/** 全部节点类型定义 */
export const NODE_DEFS: NodeDef[] = shallowReactive([
  {
    id: "explorer",
    name: "探索",
    category: "functional",
    icon: "explorer",
    worldOnly: true,
    permanent: true,
    accent: "#d08a3e",
    desc: "点击它,等上几秒——有几率在它下面发现一片新的地形。它是世界的一部分,无法收进背包。",
    behavior: {
      kind: "explore",
      durationMs: 5000,
      successRate: 0.65,
      pool: [
        { type: "forest", weight: 0.65 },
        { type: "river", weight: 0.35 },
      ],
    },
  },
  {
    id: "backpackNode",
    name: "背包",
    category: "functional",
    icon: "backpackNode",
    worldOnly: true,
    permanent: true,
    noChildren: true,
    accent: "#b98a2f",
    desc: "点击它,在右侧开合背包分屏。它是一个开关:获得的物品都会进背包,把材料整堆拖到「手工合成」下面就能批量合成。",
    behavior: { kind: "view-toggle", view: "backpack" },
  },
  {
    id: "bench",
    name: "手工合成",
    category: "functional",
    icon: "bench",
    permanent: true,
    zones: ["backpack"],
    accent: "#8672bd",
    desc: "把材料节点挂到它下面,点击它就会按当前配方合成,产物自动进背包。它天然生成在背包里,方便整堆挂料、批量合成。",
    behavior: { kind: "craft" },
  },
  {
    id: "forest",
    name: "森林",
    category: "terrain",
    icon: "forest",
    worldOnly: true,
    accent: "#3d8b57",
    desc: "一片郁郁葱葱的森林。空手翻找可以捡到木棍和石子;把石斧挂在它上面就能砍到木头。",
  },
  {
    id: "river",
    name: "河流",
    category: "terrain",
    icon: "river",
    worldOnly: true,
    accent: "#2f8f96",
    desc: "一条潺潺流淌的河。河滩上散落着被水冲刷圆润的石子。",
  },
  {
    id: "stick",
    name: "木棍",
    category: "material",
    icon: "stick",
    maxStack: 64,
    desc: "枯枝断木。既是合成的材料,也可以摆成节点——虽然它自己并不会做什么。",
  },
  {
    id: "stone",
    name: "石子",
    category: "material",
    icon: "stone",
    maxStack: 64,
    desc: "一块称手的石头。是石器时代一切工具的起点。",
  },
  {
    id: "wood",
    name: "木头",
    category: "material",
    icon: "wood",
    maxStack: 64,
    desc: "用石斧砍下的木料。文明的基石,暂时先囤着。",
  },
  {
    id: "stoneAxe",
    name: "石斧",
    category: "tool",
    icon: "stoneAxe",
    maxStack: 1,
    accent: "#8672bd",
    desc: "石头绑上木棍制成的斧头。把它拖到世界,再把森林挂在它下面,点击它就会砍伐森林。",
  },
])

export const DEF_MAP: Record<string, NodeDef> = shallowReactive(
  Object.fromEntries(NODE_DEFS.map((d) => [d.id, d])) as Record<string, NodeDef>,
)

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

/** 交互规则表:source(来源) + target(目标) => 产出 */
export const INTERACTIONS: Interaction[] = shallowReactive([
  {
    source: "hand",
    target: "forest",
    results: [
      { type: "stick", chance: 0.55, count: 1 },
      { type: "stone", chance: 0.3, count: 1 },
    ],
    note: "你徒手在灌木丛里翻找……",
  },
  {
    source: "hand",
    target: "river",
    results: [{ type: "stone", chance: 0.65, count: 1 }],
    note: "你蹲在河滩上,盯着水流过的碎石……",
  },
  {
    source: "stoneAxe",
    target: "forest",
    results: [{ type: "wood", chance: 1, count: 1 }],
    note: "石斧劈进树干,木屑纷飞!",
  },
  // —— 风味描述(无产出) ——
  {
    source: "hand",
    target: "stoneAxe",
    results: [],
    note: "这把石斧还没挂在任何目标上。把一个节点拖到它下面,再点击它试试。",
  },
  {
    source: "stoneAxe",
    target: "river",
    results: [],
    note: "你挥斧砍水,只溅起一片水花。",
  },
  {
    source: "stoneAxe",
    target: "stone",
    results: [],
    note: "以石击石,火星四溅,但什么也没发生。",
  },
  {
    source: "hand",
    target: "stick",
    results: [],
    note: "木棍静静地躺着。",
  },
  {
    source: "hand",
    target: "stone",
    results: [],
    note: "石子静静地躺着。",
  },
  {
    source: "hand",
    target: "wood",
    results: [],
    note: "一段厚实的木料。",
  },
  {
    source: "forest",
    target: "stoneAxe",
    results: [],
    note: "森林「使用」石斧?这个挂法好像反了。",
  },
])

const INTERACTION_MAP: Record<string, Interaction> = shallowReactive(
  Object.fromEntries(INTERACTIONS.map((i) => [`${i.source}>${i.target}`, i])) as Record<string, Interaction>,
)
export { INTERACTION_MAP }

export function findInteraction(source: string, target: string): Interaction | undefined {
  return INTERACTION_MAP[`${source}>${target}`]
}

/** 合成配方 */
export const RECIPES: Recipe[] = shallowReactive([
  {
    id: "stone-axe",
    category: "石器",
    inputs: [
      { type: "stone", count: 3 },
      { type: "stick", count: 2 },
    ],
    output: { type: "stoneAxe", count: 1 },
  },
])

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
