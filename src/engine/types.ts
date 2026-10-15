import type { Decimal, Num } from './num'

export type NodeId = string
export type NodeTypeId = string
export type ItemId = string

// ---------- 物品 ----------

/**
 * 物品（item）= 背包里可数的东西（铁矿石/铁/木材/斧头……），是建造节点的货币（docs/10 §2）。
 * 同一个 id 可以既是物品又是节点类型（如 `iron_ore`：物品可堆在背包，节点可放在树上作实参）。
 */
export interface ItemDef {
  id: ItemId
  name: string
  /** `[]` 与背包使用的短名；缺省 = name */
  short?: string
  /** 工具类别：仅用于 UI 分类着色（k-tool）；不参与求值 */
  toolClass?: string
  /** 原材料（基础层）：分解（回收）到此为止，不再沿配方下钻 */
  raw?: boolean
}

/** 物品库存（背包 / 箱子同款形状）：id → 数量。无槽位，容量按总数量计。 */
export type ItemStore = Readonly<Record<ItemId, Decimal>>

// ---------- 节点 ----------

/**
 * 产物条目：配方的输出单位。`id` 是**物品 id**（产出全部进背包）。
 * 「产物」只在配方语境使用（docs/10 §2）。
 */
export interface Yield {
  id: string
  count: Decimal
}

export type RetState =
  | { kind: 'none' }
  | { kind: 'unresolved' }
  | { kind: 'value'; items: readonly Yield[] }

/**
 * 节点 = 表达式：类型 + 实参（子节点）+ 返回值（`[]`）。
 * **没有节点内存储**——节点只存在于树上；玩家资产全部是背包/箱子里的物品。
 */
export interface GameNode {
  id: NodeId
  type: NodeTypeId
  /** 实参列表；顺序 = 显示顺序 = 签名（ordered 模式）顺序 */
  children: GameNode[]
  /** 折叠（纯视觉收合，≠ 回收）；存档字段沿用线上名 `collapsed`（docs/10 §5） */
  folded: boolean
  /** 返回值（`[]` 里的东西）；由归一化重算，任何其他地方不得手改 */
  ret: RetState
}

/** 建造成本条目：从背包消耗的物品（缺省 count = 1）。 */
export interface CostArg {
  item: ItemId
  count?: number
}

/**
 * 节点类型 = Lisp 里的「名字」，也是选择面板里的一项：
 * - 有配方的类型是函数（点击 → eval → 产出物品进背包）；
 * - 没有配方的类型是符号（点击无响应，只作为实参被检测）；
 * - 在选择面板选中后进入放置模式：左键放置 = 消耗 `cost` 建造一个该类型节点。
 */
export interface NodeDef {
  id: NodeTypeId
  name: string
  /** 紧凑名（`[]` 用）；缺省 = name */
  short?: string
  /** 返回值显示策略；缺省 'auto'（符号自返省略方括号） */
  retDisplay?: 'auto' | 'always' | 'never'
  /** 工具类别：仅用于 UI 分类着色（k-tool）；不参与求值（手持 = 隐式实参，docs/10 §4） */
  toolClass?: string
  /** 点击该节点打开的浮动窗口 id（`'storage'` = 箱子）；有 panel 的节点通常没有配方 */
  panel?: string
  /** 建造成本（物品）；缺省/空 = 免费 */
  cost?: readonly CostArg[]
}

// ---------- 配方 ----------

export interface RecipeArg {
  /** 物品 id 或节点类型 id（匹配子节点的返回值） */
  item: string
  /** 需要几份/几个实参节点；缺省 1 */
  count?: number
}

export interface RecipeDef {
  /** 函数类型（NodeTypeId） */
  at: NodeTypeId
  /** 签名模式；缺省 multiset（顺序无关、数量有关） */
  match?: 'multiset' | 'ordered'
  args: readonly RecipeArg[]
  /** 产物全部是物品（进背包） */
  out: readonly RecipeArg[]
}

// ---------- 求值 ----------

/**
 * 效果原语：求值只声明「产出什么」，结算权在引擎（docs/02 §5）。
 * 需要新原语按 docs/03 §5 四步流程添加。
 */
export interface EvalOp {
  op: 'gain'
  /** 物品 id */
  id: string
  count: Num
}

// ---------- 内容包 ----------

export interface EngineConfig {
  /** 背包容量（物品总数量上限） */
  bagCapacity: number
  /** 箱子容量（物品总数量上限） */
  chestCapacity: number
  /** 回收返还率（分解成原材料后按此比例向下取整）；缺省 0.3 */
  recycleRate?: number
}

export interface ContentDefs {
  items: readonly ItemDef[]
  nodes: readonly NodeDef[]
  recipes: readonly RecipeDef[]
  config: EngineConfig
}
