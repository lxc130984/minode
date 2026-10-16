# 03 · 内容注册表与内容包

注册表是「引擎不变、内容常变」的接缝：物品、节点类型、配方、成本、数值都是数据；
引擎只提供解析、静态检测与结算。本篇给出注册表 API、校验规则与内容作者的扩展手册。

## 1. 设计目标

| 目标           | 手段                                                    |
| -------------- | ------------------------------------------------------- |
| 新增内容零侵入 | 加数据（Item/Node/Recipe/cost），不改引擎代码           |
| 引擎零内容依赖 | 注册表是**由内容包构建的实例**，不是模块级单例          |
| 可测试         | 每个测试自建实例；无跨用例污染（alpha 的 clear 教训）   |
| 可校验         | `buildRegistry` 时全量校验，dev 直接抛错                |
| 可演进         | id 冻结 + 未知 id 隔离（旧存档不因改内容而报废）        |
| 数据不是语言   | 不引入表达式/条件/循环；复杂行为 = 新原语（alpha 教训） |

## 2. 装载：从数据到注册表

```ts
// engine/registry.ts
export interface ContentDefs {
  items: readonly ItemDef[] // 物品（背包里可数的东西，建造的货币）
  nodes: readonly NodeDef[] // 可放置的节点类型（选择面板数据源，带 cost）
  recipes: readonly RecipeDef[]
  config: EngineConfig // 数值中心（§3）
}

export function buildRegistry(defs: ContentDefs): NodeRegistry // 校验 + 编译
```

```ts
// content/index.ts —— 引擎唯一入口，store 只认这一个对象
export const CONTENT: NodeRegistry = buildRegistry({ items, nodes, recipes, config })
```

```ts
export interface NodeRegistry {
  readonly defs: ContentDefs
  readonly config: EngineConfig
  item(id): ItemDef | undefined
  node(id): NodeDef | undefined
  labelOf(id): string // 节点类型 → name；物品 → name；未注册 → id
  shortOf(id): string // short ?? name；未注册 → id
  recipesFor(type): readonly RecipeDef[]
  recipeModes(type): readonly RecipeMode[] // 无配方 = 空（= 符号）
  recipeFor(type, mode, key): RecipeDef | undefined // '模式::签名' → 配方，O(1)
  decomposeRecipeOf(item): RecipeDef | undefined // 「唯一产物是该物品」的配方（回收分解用）
}
```

- **没有配方的类型 = 符号**：`recipesFor` 为空，点击天然无响应。
- 注册表构建后**只读**；运行时不注册、不卸载。
- 构建期预编译：签名哈希表（归一化与点击求值共用，不存在第二条检测路径）。

## 3. 数值中心：EngineConfig

所有「策划想调」的数字只出现在这里；引擎与内容逻辑代码中禁止裸数值字面量。

```ts
export interface EngineConfig {
  bagCapacity: number // 背包容量（物品总数量上限，当前 256）
  chestCapacity: number // 箱子容量（128）
  recycleRate?: number // 回收返还率（分解成原材料后按此比例向下取整）；缺省 0.3
}
```

## 4. 物品与节点：一体两面

```ts
export interface ItemDef {
  id: ItemId
  name: string
  short?: string
  toolClass?: string // 仅 UI 分类着色（k-tool，如斧头）；不参与求值
}

export interface NodeDef {
  id: NodeTypeId
  name: string
  short?: string
  toolClass?: string // 仅 UI 着色
  panel?: string // 点击打开的浮动窗口 id（'storage' = 箱子）
  cost?: readonly CostArg[] // 建造成本（物品列表）；缺省 = 免费
}

export interface CostArg {
  item: ItemId
  count?: number // 默认 1
}
```

- **物品与节点类型 id 允许同名**（两套命名空间分别唯一）：`iron_ore` 既是背包里的
  物品（建造货币），又是可放置的符号节点（树上的实参）——一体两面（D-26）。

## 5. 求值行为与成本 = 纯数据（零注册）

- 函数的点击行为完全由配方数据决定（02 篇 §2/§3）：检测命中 → 产出 `out`（必须是
  **物品 id**，校验强制）→ 进背包；
- **手持隐式实参**也是数据：`{ at: 'forest', args: [{ item: 'axe' }], out: [{ item: 'wood' }] }`
  即「手持斧头点击森林 → 木材」；
- **建造成本** `NodeDef.cost`：选择面板放置时原子扣费（`payCost`），回收时分解返还。

**新增效果原语的四步流程**（alpha 教训，保持）：

1. `engine/types.ts` 加操作接口并挂进 `EvalOp`；
2. `engine/eval.ts` 结算器（`applyOps`）加分支；
3. 本文档补字段表；
4. `__tests__` 补原语单测（含边界）。

## 6. 校验规则（`buildRegistry`，dev 抛错）

| 规则           | 说明                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------ |
| id 唯一        | `items` / `nodes` 各自唯一；**物品与节点允许同名**（如 iron_ore）                                                  |
| 引用完整       | `recipe.at` 必须是节点类型；`recipe.out.item` 必须是**物品**；`args.item` 是物品或节点类型；`cost.item` 必须是物品 |
| 数值合法       | 各 `count >= 0`；`config.bagCapacity / chestCapacity >= 1`                                                         |
| 配方签名不重复 | 同类型同签名（按 match 模式计算）重复 → 抛错（不静默覆盖）                                                         |

`buildRegistry` 校验失败的错误信息必须包含：出错的 def 数组、下标、id、原因。

## 7. 扩展手册（内容作者）

### 7.1 当前内容包一览

```
物品（10）: 铁矿石 煤炭 氧气 木材｜铁 钢 钢板 机械零件 发动机｜斧头（工具）
节点（11）: 铁矿石/煤炭/氧气（符号，cost=1 同名物品）
           矿井(铁矿×4) 冶炼炉(铁矿×4 煤×2) 锻炉(铁×3 煤×2) 轧机(钢×3)
           装配台(板×3 铁×2) 发动机厂(零件×3) 森林(木材×4)｜箱子(铁×4)
配方（9） : 矿井(原料)→原料物品；冶炼炉(铁矿+煤+氧)→铁；锻炉(铁+煤)→钢；
           轧机(钢+铁)→板；装配台(板+铁)→零件；发动机厂(零件+钢)→发动机；
           森林(斧头)→木材（手持演示）
```

### 7.2 加一种原料 / 一台机器（各 2 处）

```ts
// items.ts —— 新增物品（既是产出也是建造成本）
{ id: 'copper_ore', name: '铜矿石', short: '铜矿' }
{ id: 'wire', name: '铜线', short: '线' }
// nodes.ts —— 原料节点（符号实参，成本 = 1 个同名物品）与机器（带成本）
{ id: 'copper_ore', name: '铜矿石', short: '铜矿', cost: [{ item: 'copper_ore' }] }
{ id: 'wire_mill', name: '拉丝机', short: '线机', cost: [{ item: 'copper_ore', count: 4 }] }
// recipes.ts
{ at: 'mine', args: [{ item: 'copper_ore' }], out: [{ item: 'copper_ore' }] } // 矿井可采
{ at: 'wire_mill', args: [{ item: 'copper_ore', count: 2 }], out: [{ item: 'wire' }] }
```

**加手持效果**：写一条把工具放进 `args` 的配方（02 篇 §3）。
**调数值/成本**：`content/config.ts` / `NodeDef.cost`。

### 7.3 示例局面（content/demo.ts）

`buildDemoRoots()`（三矿井+森林+六层加工链）、`buildStressRoots(n)`（性能压测）、
`starterSeeds()`（起始物资）——**内容 id 只出现在 content/ 目录**（D-32），
store 不认识具体节点类型。

### 7.4 工具节点

工具就是普通物品，声明 `toolClass` 获得 `k-tool` 高亮色（紫）：

```ts
{ id: 'axe', name: '斧头', short: '斧', toolClass: 'axe' }
```

规则：`toolClass` **只影响高亮**，不参与求值（求值只看「手持类型是否出现在配方
args 里」），也不构成任何操作门槛。

## 8. 稳定与兼容

- **id 是存档契约**：发布后的 id 不改、不重用。改 id = 写迁移函数（`save.ts`）。
- **删除内容安全**：旧存档中的未知 `type` 保留并以 `?` 渲染（01 篇 §8），
  仍可被拖拽 / 回收。
- **重命名显示名安全**：`name`/`short` 不影响存档。
- 旧存档里的 `buffer` / `auto` 字段会被安全忽略（概念已移除）。

## 9. 检查清单

- [ ] `buildRegistry` 校验全部错误路径有测试（引用完整、签名重复、数值非法）
- [ ] 测试互不污染：无模块级可变注册表
- [ ] 符号类型（无配方）点击无响应，有测试
- [ ] 手持隐式实参（含手持命中 / 回落空手）有测试
- [ ] 回收折算（cost × 返还率，Decimal 精确）有测试
- [ ] 新增原语走完四步流程（类型 → 结算器 → 文档 → 单测）
- [ ] 内容包中没有任何函数与任何玩法数值字面量
