# 03 · 内容注册表与内容包

注册表是「引擎不变、内容常变」的接缝：节点类型、资源、配方、数值都是数据；
引擎只提供解析、静态检测与结算。本篇给出注册表 API、校验规则与内容作者的扩展手册。

## 1. 设计目标

| 目标           | 手段                                                    |
| -------------- | ------------------------------------------------------- |
| 新增内容零侵入 | 加数据（Node/Resource/Recipe/Eval），不改引擎代码       |
| 引擎零内容依赖 | 注册表是**由内容包构建的实例**，不是模块级单例          |
| 可测试         | 每个测试自建实例；无跨用例污染（alpha 的 clear 教训）   |
| 可校验         | `buildRegistry` 时全量校验，dev 直接抛错                |
| 可演进         | id 冻结 + 未知 id 隔离（旧存档不因改内容而报废）        |
| 数据不是语言   | 不引入表达式/条件/循环；复杂行为 = 新原语（alpha 教训） |

## 2. 装载：从数据到注册表

```ts
// engine/registry.ts
export interface ContentDefs {
  nodes: readonly NodeDef[]
  recipes: readonly RecipeDef[]
  resources: readonly ResourceDef[]
  config: EngineConfig // 数值中心（§3）
}

export function buildRegistry(defs: ContentDefs): NodeRegistry // 校验 + 编译（§6）
```

```ts
// content/index.ts —— 引擎唯一入口，store 只认这一个对象
export const CONTENT: NodeRegistry = buildRegistry({ nodes, recipes, resources, config })
```

```ts
export interface NodeRegistry {
  readonly defs: ContentDefs
  readonly config: EngineConfig
  resource(id: ResourceId): ResourceDef | undefined
  node(id: NodeTypeId): NodeDef | undefined
  labelOf(id: string): string // 节点类型 → name；资源 → name；未注册 → id 本身
  shortOf(id: string): string // short ?? name；未注册 → id
  recipesFor(type: NodeTypeId): readonly RecipeDef[]
  recipeModes(type: NodeTypeId): readonly RecipeMode[] // 无配方 = 空（= 符号）
  recipeFor(type, mode, key): RecipeDef | undefined // '模式::签名' → 配方，O(1)
}
```

- **没有配方的类型 = 符号**：`recipeModes` 为空，点击天然无响应（引擎不为其做任何事）。
- 注册表构建后**只读**；运行时不注册、不卸载。

## 3. 数值中心：EngineConfig

所有「策划想调」的数字只出现在这里；引擎与内容逻辑代码中禁止裸数值字面量。

```ts
export interface EngineConfig {
  bagCapacity: number // 背包容量（物品总数量上限，256）
  chestCapacity: number // 箱子容量（128）
}
```

## 4. 求值行为与建造成本 = 纯数据（零注册）

函数的点击行为完全由配方数据决定（02 篇 §2/§3）：

- 静态检测命中 → 产出 `out`（必须是**物品 id**，全部进背包）；不命中 → `[?]` 且无产出；
- **手持隐式实参**也是数据：`{ at: 'forest', args: [{ item: 'axe' }], out: [{ item: 'wood' }] }`
  即「手持斧头点击森林 → 木材」（02 篇 §3）；
- **建造成本**是 `NodeDef.cost`（物品列表，docs/04 §2）：选择面板放置时原子扣费，
  回收全额返还。

（旧的 `EvalDef` 自定义处理器与求值通道已随 D-25 删除——它解决的问题由手持隐式实参一条规则覆盖。）

## 5. 新增效果原语的四步流程

**新增效果原语的四步流程**（alpha 教训，保持）：

1. `engine/types.ts` 加操作接口并挂进 `EvalOp` 联合；
2. `engine/eval.ts` 结算器（`applyOps`）加分支；
3. 本文档补字段表；
4. `__tests__` 补原语单测（含边界）。

## 6. 校验规则（`buildRegistry`，dev 抛错）

| 规则           | 说明                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------ |
| id 唯一        | `items` / `nodes` 各自唯一；**物品与节点类型允许同名**（如 iron_ore）                                              |
| 引用完整       | `recipe.at` 必须是节点类型；`recipe.out.item` 必须是**物品**；`args.item` 是物品或节点类型；`cost.item` 必须是物品 |
| 数值合法       | 各 `count >= 0`；`config.bagCapacity / chestCapacity >= 1`                                                         |
| 配方签名不重复 | 同类型同签名（按 match 模式计算）重复 → 抛错（不静默覆盖）                                                         |

`buildRegistry` 校验失败的错误信息必须包含：出错的 def 数组、下标、id、原因。

## 7. 扩展手册（内容作者）

### 7.1 参考流程树：六层加工链（当前内容包）

```
                  （点击产出）
矿井(铁矿石|煤炭|氧气) → 对应原料          ← 唯一的原料入口（函数：矿井(x) = x）
冶炼炉(铁矿石+煤炭+氧气) → 铁              ← 第 2 层
锻炉(铁+煤炭)           → 钢              ← 第 3 层
轧机(钢+铁)             → 钢板            ← 第 4 层
装配台(钢板+铁)         → 机械零件        ← 第 5 层
发动机厂(机械零件+钢)   → 发动机          ← 第 6 层（顶层）
```

落地成节点树（`spawnDemo`：三座矿井 + 六层工厂，共 27 个节点、深度 6）：

```
矿井[铁矿石]      矿井[煤炭]      矿井[氧气]
发动机厂[发动机]
  装配台[机械零件]
    轧机[钢板] → 锻炉[钢] → 冶炼炉[铁] → 铁矿石/煤炭/氧气；煤炭
    冶炼炉[铁] → 铁矿石/煤炭/氧气
  锻炉[钢] → 冶炼炉[铁] → 铁矿石/煤炭/氧气；煤炭
```

**加一种原料 / 一台机器（各 2 处）**：

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

**加手持效果**：写一条把工具放进 `args` 的配方（手持 = 隐式实参，02 篇 §3）：

```ts
// 手持斧头点击森林 → 木材（空手点森林 = [?]）
{ at: 'forest', args: [{ item: 'axe' }], out: [{ item: 'wood' }] }
```

**换内容包**：新建 `content-<name>/` 与自己的 `buildRegistry`；
引擎、store、组件全部不动。`content/` 只是「第一套内容」的默认名字。

### 7.2 工具节点

工具就是普通节点类型，声明 `toolClass` 可获得 `k-tool` 高亮色（06 篇 §2.1）：

```ts
{ id: 'axe', name: '斧头', short: '斧', toolClass: 'axe' }
```

规则：

- `toolClass` **只影响高亮**，不参与求值（求值只看「手持类型是否出现在配方 args 里」），
  也不构成任何操作门槛——`×`（收起）无门槛（D-12）；
- 工具有配方时仍是函数（点击 eval）；无配方则为符号（点击无响应），只作实参/手持。

## 8. 稳定与兼容

- **id 是存档契约**：发布后的 id 不改、不重用。改 id = 写迁移函数（`save.ts`）。
- **删除内容安全**：旧存档中的未知 `type` 保留并以 `?` 渲染（01 篇 §8），
  仍可被拖拽 / 收起 / 放置（无内容依赖）。
- **重命名显示名安全**：`name`/`short` 不影响存档。
- 旧存档里的 `buffer` / `auto` 字段会被安全忽略（这两个概念已移除）。

## 9. 检查清单

- [ ] `buildRegistry` 校验全部错误路径有测试（引用完整、签名重复、数值非法）
- [ ] 测试互不污染：无模块级可变注册表
- [ ] 符号类型（无配方）点击无响应，有测试
- [ ] 手持隐式实参（含手持命中 / 回落空手）有测试
- [ ] 新增原语走完四步流程（类型 → 结算器 → 文档 → 单测）
- [ ] 内容包中没有任何函数与任何玩法数值字面量
