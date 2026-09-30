# 02 · 数据模型(src/game/types.ts)

> 本文逐类型、逐字段解释数据模型。所有游戏逻辑都建立在这些结构之上;
> 修改任何一个字段前,先在本文档里确认它的全部消费方(用 grep 验证)。

## 1. GameNode —— 一切的基本单元

```ts
export interface GameNode {
  id: string
  type: string
  children: GameNode[]
  collapsed?: boolean
}
```

| 字段 | 说明 |
|---|---|
| `id` | 形如 `"n<数字>"`,由 store 的 `newNodeId()` 发号(`n${++uid}`)。**全局唯一**,是 findNode/removeNode/selectedId/防环判定的键。存档校验要求 `uid ≥ 所有 id 的最大数字后缀`(防撞号)。 |
| `type` | 指向 registry 里 `NodeDef.id`。未知 type 由 `getDef()` 返回兜底定义(见 03 §2.4)。 |
| `children` | 子节点数组。**必须始终是数组**——渲染层对"瞬态帧非数组"做了防御(NodeItem/Inspector 的 computed 兜底),但 store 层的所有路径都应保证这一点。 |
| `collapsed` | 折叠态。`makeNode()` 造出默认 `true`(默认折叠);三个自动展开时机:①拖入子节点(onTreeAdd 中 `owner.collapsed=false`)②探索产出地形(resolveExplore)③手工合成相关无需。**获得物品 addItem 不展开堆**(玩家折叠态保持,徽标显示总数——需求方明确要求)。 |

### 1.1 数量语义(关键!)

**没有 `count` 字段。** 历史上存在过 `count?: number` 的堆数量字段,已在 v5 存档版本中删除。
现在的数量语义:

- **每个节点 = 1 件物品**;
- 一堆同类物品 = 一个父节点挂着若干同类子节点(可任意深度嵌套);
- 堆的数量 = 子树大小。

```ts
/** 节点的有效数量 = 子树大小(自己 1 件 + 挂载的同类子节点们) */
export const nodeCount = (n: GameNode): number =>
  1 + n.children.reduce((sum, c) => sum + nodeCount(c), 0)

/** 是否是一堆同类物品(所有后代都与自己同类) */
export const isStack = (n: GameNode): boolean =>
  n.children.every((c) => c.type === n.type && isStack(c))
```

`nodeCount` 用于:堆徽标显示、容量判定(canAbsorb)、addItem 分堆逻辑。
`isStack` 用于:NodeItem 判断"背包里这是不是一个纯堆"(纯堆才显示 ×N 徽标;
挂在手工合成下的混合子树不显示,避免误导)。

**为什么这样设计**:让"数量"与"结构"合一——堆既是视觉上的小树,也是计数单位;
所有容量/消耗逻辑只需要遍历树,不需要维护额外的计数字段(历史上 count 字段
与 children 结构曾经不一致,是多个 bug 的根源,见 11-pitfalls §7)。

### 1.2 结构示例

```
背包(backpack 根数组)
├─ 手工合成(bench,功能节点)
│  ├─ 石子堆(1 + 2 子 = 3 件)
│  │  ├─ 石子
│  │  └─ 石子
│  └─ 木棍堆(1 + 1 子 = 2 件)
│     └─ 木棍
├─ 木头堆(1 + 21 子 = 22 件;UI 只显示前 4 个子 + "⋯还有17个")
└─ 石斧(单件,maxStack=1,不可有子)
```

## 2. NodeDef —— 节点类型定义

```ts
export interface NodeDef {
  id: string
  name: string
  category: Category
  icon: string
  desc: string
  accent?: string
  worldOnly?: boolean
  zones?: NodeZone[]
  noChildren?: boolean
  maxStack?: number
  permanent?: boolean
  behavior?: NodeBehavior
  slots?: SlotSpec[]
  tags?: string[]
}
```

### 逐字段说明

| 字段 | 类型/值 | 消费方 | 说明 |
|---|---|---|---|
| `id` | string | 全局 | 类型标识;GameNode.type 指向它 |
| `name` | string | 全部 UI | 显示名 |
| `category` | `"terrain" \| "resource" \| "tool" \| "functional"` | 图鉴分组、行内分类小标签 | 分类体系(词汇表见 12)。注意:不是行为判定依据,行为看 `behavior` |
| `icon` | string | NodeIcon | registry.ICONS 的键 |
| `desc` | string | 图鉴、检查器 | 描述文本 |
| `accent` | string(css color) | NodeIcon/NodeItem | 视觉主色:图标+名称着色。**自定义节点材质的入口** |
| `worldOnly` | boolean | `zonesOf()` | 仅世界。等价于 `zones: ["world"]`,是它的简写 |
| `zones` | `NodeZone[]` | `zonesOf()→canPlaceInZone()` | 允许存在的区域,细粒度。如 bench `["backpack"]`。**缺省规则**:显式 zones 优先;否则 worldOnly→`["world"]`;否则全部区域。**拖拽守卫/收纳/放置/存档校验全部经 canPlaceInZone,勿绕过** |
| `noChildren` | boolean | NodeItem | 不渲染 twisty 与子列表 = 不可挂子节点、不可折叠(背包节点)。"可被挂到其他节点上"不受影响 |
| `maxStack` | number | stackLimit→canAbsorb/addItem/守卫 | 一堆同类物品最大件数(父+子)。缺省=∞。材料 64、石斧 1 |
| `permanent` | boolean | removeNodeById | 不可移除(探索/背包节点/手工合成) |
| `behavior` | NodeBehavior | clickNode 分发 / 守卫(功能性判定) | 见 §3。**有 behavior 的节点叫"功能节点"**,其背包子级不受同类堆叠规则限制 |
| `slots` | SlotSpec[] | (预留,未实现) | 结构化子槽位,如未来工厂的"输入/输出" |
| `tags` | string[] | (预留) | 自定义分组标签 |

### SlotSpec(预留)

```ts
export interface SlotSpec {
  id: string
  label: string       // "输入" / "输出"
  accept?: string[]   // 接受的节点类型;缺省 = 任意
  max?: number        // 最多挂几个;缺省不限
}
```

## 3. NodeBehavior —— 功能节点的声明式行为

```ts
export type NodeBehavior =
  | ExploreBehavior
  | CraftBehavior
  | FactoryBehavior    // 预留
  | ViewToggleBehavior
```

| 行为 | 定义 | 点击时(store.clickNode) | 点击时(界面层 NodeItem) |
|---|---|---|---|
| `explore` | `{ kind, durationMs, successRate, pool: {type, weight}[] }` | `startExplore(node)`——参数从**被点节点自身**的 def 读取 | 任何面板都触发 + fx 动画 |
| `craft` | `{ kind }` | `craftBench(node)`——以被点节点为合成台 | 同上;行尾显示 ⚙ 配方按钮 |
| `factory` | `{ kind, inputs, outputs, intervalMs }` | 静默 return(暂无语义) | — |
| `view-toggle` | `{ kind, view: "backpack" \| "codex" }` | **只选中,不分发**(界面层处理) | 按 `behavior.view` 调 ui.toggleBackpack/toggleCodex |

设计意图:**新增一种行为 = 扩联合类型 + clickNode 加一个分发分支**,不需要碰组件
(组件只看"有没有 behavior"和"是不是 view-toggle")。
探索/合成的"按发起节点结算"是硬性要求(历史上曾回落到全局单例 benchNode,
导致第二台合成台错乱,见 11-pitfalls §8)。

## 4. 交互与配方

```ts
export interface Interaction {
  source: string              // 节点 type 或 "hand"(空手)
  target: string
  results: YieldEntry[]       // 顺序判定,首个命中生效;空数组 = 纯风味文本
  note: string                // 日志文本(文字冒险风味)
}

export interface YieldEntry {
  type: string
  chance: number              // 0~1
  count?: number              // 缺省 1
}

export interface Recipe {
  id: string
  category?: string           // 配方分组(配方多了以后 RecipeDialog 按此分组)
  inputs: ItemStack[]         // {type, count}
  output: ItemStack
}
```

交互查找是精确键 `"${source}>${target}"`(INTERACTION_MAP),**不支持通配**;
未命中时 trigger() 打"没有效果"的 warn 日志。
掉落判定 `rollDrops`:按 results 顺序掷骰,首个命中返回(互斥式,非独立叠加)。

## 5. 其他类型

```ts
export type NodeZone = "world" | "backpack"        // 区域(面板)标识
export type LogKind = "gain" | "info" | "warn" | "craft"   // 日志颜色分类

export interface LogEntry { seq: number; time: number; text: string; kind: LogKind }

export const isGameNode = (v: unknown): v is GameNode => /* children 是数组 */

export const CATEGORY_LABELS: Record<Category, string> = {
  terrain: "地形", resource: "资源", tool: "工具", functional: "功能",
}
```

`isGameNode` 是运行时类型守卫(存档校验/拖拽瞬态帧防御用)。
