/**
 * minode 核心数据模型
 * 一切游玩元素皆节点:世界树、背包、物品栏,全部是同一形态的节点。
 */

/** 节点显示分类 */
export type Category = "terrain" | "material" | "tool" | "functional"

/** 节点可以存在的区域(面板/储区) */
export type NodeZone = "world" | "backpack"

/**
 * 功能节点行为:声明式描述"点击这个节点会发生什么"。
 * 引擎按 kind 分发,新增行为只需扩展此联合类型并在 store 注册分发分支。
 */
export interface ExploreBehavior {
  kind: "explore"
  /** 探索耗时(ms) */
  durationMs: number
  /** 成功概率 0~1 */
  successRate: number
  /** 产出池:按权重随机生成到自身子级 */
  pool: Array<{ type: string; weight: number }>
}

export interface CraftBehavior {
  kind: "craft"
  /** 按当前选中配方,检测自身子级挂载的材料进行合成 */
}

/** 工厂行为(预留):周期性把输入转换为输出 */
export interface FactoryBehavior {
  kind: "factory"
  inputs: string[]
  outputs: string[]
  intervalMs: number
}

/** 视图开关行为:点击节点切换某个界面(如「背包」节点开合背包分屏) */
export interface ViewToggleBehavior {
  kind: "view-toggle"
  view: "backpack" | "codex"
}

export type NodeBehavior =
  | ExploreBehavior
  | CraftBehavior
  | FactoryBehavior
  | ViewToggleBehavior

/** 节点类型定义(注册表条目) */
export interface NodeDef {
  /** 类型 id,如 "forest" */
  id: string
  /** 显示名,如 "森林" */
  name: string
  category: Category
  /** lucide 图标组件名(在 registry 的 ICONS 中映射) */
  icon: string
  desc: string
  /** 视觉主色(css color):图标与名称着色,自定义材质/外观的入口 */
  accent?: string
  /** 只能存在于世界面板(地形、探索等) */
  worldOnly?: boolean
  /**
   * 允许存在的区域(细粒度覆盖 worldOnly):
   * 如手工合成 zones: ["world","backpack"] 表示可在世界与背包间移动,但不进物品栏。
   * 缺省:worldOnly → 仅世界;否则全区域。
   */
  zones?: NodeZone[]
  /** 禁止挂载子节点(如「背包」节点:不可折叠、不可挂载,但可挂到其他节点上) */
  noChildren?: boolean
  /** 永久节点:不可被移除、不可凭空消失(探索、手工合成) */
  permanent?: boolean
  /** 功能节点行为 */
  behavior?: NodeBehavior
}

/**
 * 节点实例:世界树 / 背包通用。
 * 数量语义:每个节点 = 1 件物品;一堆同类物品 = 一个父节点挂着同类子节点,
 * 堆的大小 = 子树大小(nodeCount)。
 */
export interface GameNode {
  id: string
  type: string
  children: GameNode[]
  collapsed?: boolean
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
  /** 配方分类(配方多了以后分组显示) */
  category?: string
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

/**
 * 节点的有效数量 = 子树大小(自己 1 件 + 挂载的同类子节点们)
 */
export const nodeCount = (n: GameNode): number =>
  1 + n.children.reduce((sum, c) => sum + nodeCount(c), 0)

/** 是否是一堆同类物品(所有后代都与自己同类) */
export const isStack = (n: GameNode): boolean =>
  n.children.every((c) => c.type === n.type && isStack(c))

/** 分类的默认标签 */
export const CATEGORY_LABELS: Record<Category, string> = {
  terrain: "地形",
  material: "资源",
  tool: "工具",
  functional: "功能",
}
