/**
 * 游戏内容注册表:节点类型、交互规则、合成配方。
 * 新内容只需要在这里追加定义,界面与引擎自动生效。
 */
import type { Component } from "vue"
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
} from "lucide-vue-next"
import type { Interaction, NodeDef, Recipe } from "./types"

/** lucide 图标映射 */
export const ICONS: Record<string, Component> = {
  forest: TreePine,
  river: Waves,
  stone: Mountain,
  stick: Wand,
  wood: Logs,
  stoneAxe: Axe,
  hand: Hand,
  explorer: Compass,
  bench: Soup,
}

/** 全部节点/物品类型定义 */
export const NODE_DEFS: NodeDef[] = [
  {
    id: "explorer",
    name: "探索",
    category: "special",
    special: true,
    icon: "explorer",
    desc: "点击它,等上 5 秒——有几率在它下面发现一片新的地形。它是世界的一部分,无法收进背包。",
  },
  {
    id: "bench",
    name: "手工合成",
    category: "special",
    special: true,
    icon: "bench",
    desc: "把材料节点挂到它下面,点击它就会按当前配方合成。点击行尾的调校按钮可以更换配方。",
  },
  {
    id: "forest",
    name: "森林",
    category: "terrain",
    terrain: true,
    icon: "forest",
    desc: "一片郁郁葱葱的森林。空手翻找可以捡到木棍和石子;把石斧挂在它上面就能砍到木头。",
  },
  {
    id: "river",
    name: "河流",
    category: "terrain",
    terrain: true,
    icon: "river",
    desc: "一条潺潺流淌的河。河滩上散落着被水冲刷圆润的石子。",
  },
  {
    id: "stick",
    name: "木棍",
    category: "material",
    icon: "stick",
    desc: "枯枝断木。既是合成的材料,也可以摆成节点——虽然它自己并不会做什么。",
  },
  {
    id: "stone",
    name: "石子",
    category: "material",
    icon: "stone",
    desc: "一块称手的石头。是石器时代一切工具的起点。",
  },
  {
    id: "wood",
    name: "木头",
    category: "material",
    icon: "wood",
    desc: "用石斧砍下的木料。文明的基石,暂时先囤着。",
  },
  {
    id: "stoneAxe",
    name: "石斧",
    category: "tool",
    icon: "stoneAxe",
    desc: "石头绑上木棍制成的斧头。把它拖到世界,再把森林挂在它下面,点击它就会砍伐森林。",
  },
]

export const DEF_MAP: Record<string, NodeDef> = Object.fromEntries(
  NODE_DEFS.map((d) => [d.id, d]),
)

export const getDef = (type: string): NodeDef =>
  DEF_MAP[type] ?? {
    id: type,
    name: type,
    category: "material",
    icon: "hand",
    desc: "未知的节点。",
  }

export const isTerrain = (type: string): boolean => !!DEF_MAP[type]?.terrain
export const isSpecial = (type: string): boolean => !!DEF_MAP[type]?.special
/** 无法收进物品栏/背包的节点(地形与特殊节点) */
export const isLockedToWorld = (type: string): boolean =>
  !!DEF_MAP[type]?.terrain || !!DEF_MAP[type]?.special

/** 交互规则表:source(来源) + target(目标) => 产出 */
export const INTERACTIONS: Interaction[] = [
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
]

const INTERACTION_MAP: Record<string, Interaction> = Object.fromEntries(
  INTERACTIONS.map((i) => [`${i.source}>${i.target}`, i]),
)

export function findInteraction(source: string, target: string): Interaction | undefined {
  return INTERACTION_MAP[`${source}>${target}`]
}

/** 合成配方 */
export const RECIPES: Recipe[] = [
  {
    id: "stone-axe",
    inputs: [
      { type: "stone", count: 3 },
      { type: "stick", count: 2 },
    ],
    output: { type: "stoneAxe", count: 1 },
  },
]

export const getRecipe = (id: string): Recipe | undefined =>
  RECIPES.find((r) => r.id === id)

/** 探索生成地形的权重(forest 优先) */
export const EXPLORE_POOL: Array<{ type: string; weight: number }> = [
  { type: "forest", weight: 0.65 },
  { type: "river", weight: 0.35 },
]

/** 探索参数 */
export const EXPLORE_MS = 5000
/** 探索成功概率 */
export const EXPLORE_SUCCESS_RATE = 0.65

/** 掷骰:按顺序判定,首个命中的掉落生效 */
export function rollDrops(interaction: Interaction): { type: string; count: number }[] {
  for (const entry of interaction.results) {
    if (Math.random() < entry.chance) {
      return [{ type: entry.type, count: entry.count ?? 1 }]
    }
  }
  return []
}

/** 按权重随机选一个探索地形 */
export function rollTerrain(): string {
  const r = Math.random()
  let acc = 0
  for (const item of EXPLORE_POOL) {
    acc += item.weight
    if (r < acc) return item.type
  }
  return EXPLORE_POOL[0]?.type ?? "forest"
}
