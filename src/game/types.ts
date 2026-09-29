/**
 * minode 核心数据模型
 * 一切游玩元素皆节点:世界树、背包、物品栏,全部是同一形态的节点。
 */

/** 节点/物品类别 */
export type Category = "terrain" | "tool" | "material" | "special"

/** 节点类型定义(注册表条目) */
export interface NodeDef {
  /** 类型 id,如 "forest" */
  id: string
  /** 显示名,如 "森林" */
  name: string
  category: Category
  /** lucide 图标组件名(在 registry 中统一映射) */
  icon: string
  desc: string
  /** 地形节点只能存在于世界树中 */
  terrain?: boolean
  /** 特殊节点(探索/手工合成):世界自带、不可收纳、不可移除 */
  special?: boolean
}

/** 节点实例:世界树 / 背包 / 物品栏通用 */
export interface GameNode {
  id: string
  type: string
  children: GameNode[]
  collapsed?: boolean
  /** 材料堆数量;工具/地形等单件节点省略(视为 1) */
  count?: number
}

/** 配方/交互里的物品槽位 */
export interface ItemStack {
  type: string
  count: number
}

/** 一次交互可能产生的掉落 */
export interface YieldEntry {
  type: string
  /** 概率 0~1,按顺序判定,首个命中生效 */
  chance: number
  count?: number
}

/** 交互规则:点击来源 × 点击目标 → 掉落/描述 */
export interface Interaction {
  /** 来源节点类型,"hand" 表示空手 */
  source: string
  target: string
  results: YieldEntry[]
  /** 触发时的描述文字(文字冒险风味) */
  note: string
}

/** 合成配方 */
export interface Recipe {
  id: string
  inputs: ItemStack[]
  output: ItemStack
}

export type LogKind = "gain" | "info" | "warn" | "craft"

/** 控制台日志 */
export interface LogEntry {
  seq: number
  time: number
  text: string
  kind: LogKind
}

export const isGameNode = (v: unknown): v is GameNode =>
  !!v && typeof v === "object" && Array.isArray((v as GameNode).children)

/** 节点的有效数量(材料堆按 count,单件按 1) */
export const nodeCount = (n: GameNode): number =>
  typeof n.count === "number" && n.count > 0 ? n.count : 1
