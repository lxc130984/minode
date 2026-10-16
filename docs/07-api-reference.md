# 07 · API 参考与接手指南

面向要接手这套代码的开发者：模块边界、公开 API、时序约定、常见任务手册。
与代码同步维护——改签名必须改本篇（05 篇 §9 的文档纪律）。

## 0. 新人上手路径（约 30 分钟）

1. 读 `docs/00-vision.md` 建立「节点树 = Lisp、`()` = eval、生产线经济」的心智模型；
2. `vp install && vp dev`，点几下：选择面板选「矿井」→ 树区左键建造 → 点 `( 矿井[铁矿] )`
   得铁矿物品；手持斧头点 `( 森林[?] )` 得木材（调试面板看「最近点击」）；
3. 读 `src/engine/types.ts`（全部类型与语义注释）；
4. 读 `src/content/*`（物品 / 节点+成本 / 配方 / 示例局面）；
5. 想改玩法 → 看 §7 手册；想改引擎 → 先读 `docs/02-eval.md` 与 `docs/08`（ADR）。

命令：`vp dev` / `vp test` / `vp check` / `vp run type-check`（**必跑**：`vp check`
不检查 `.vue` 脚本类型）/ `vp run build`。测试从 `vite-plus/test` 导入。

## 1. 模块地图与依赖方向

```
components/ ──▶ stores/（game + display + feedback）──▶ engine/ ──▶（零依赖）
                        │
                        └──▶ content/（构建出 CONTENT 注册表实例）
```

| 目录              | 职责                                       | 硬约束                            |
| ----------------- | ------------------------------------------ | --------------------------------- |
| `src/engine/`     | 求值、静态检测、库存、分解、归一化、存档   | 纯 TS，零框架依赖，可裸 Node 测试 |
| `src/content/`    | 物品/节点/配方/成本/数值/示例局面          | 内容 id 只出现在这里              |
| `src/stores/`     | 唯一可变状态（单一 Pinia store，分三文件） | 组件不得绕过 store 改引擎对象     |
| `src/components/` | 渲染 + 交互声明                            | 不写玩法逻辑、不出现玩法数值      |

## 2. 引擎 API

### 2.1 `engine/num.ts` — 大数纪律

```ts
export { Decimal } // break_infinity.js
export type Num = number | string | Decimal
export function D(value: Num): Decimal // 归一化；全仓唯一 Decimal 创建入口
```

只允许**替换式更新**；换大数库只改这一个文件。

### 2.2 `engine/types.ts` — 类型全集（含文档注释）

| 类型           | 关键点                                                                                         |
| -------------- | ---------------------------------------------------------------------------------------------- |
| `GameNode`     | `{ id, type, children, folded, ret }`；**节点只存在于树上**；`folded` 存档字段名是 `collapsed` |
| `RetState`     | `none` / `unresolved`（`[?]`）/ `value`（`items: Yield[]`）                                    |
| `Yield`        | `{ id, count }` 产物条目（id = 物品 id；曾用名 `ItemAmount`）                                  |
| `ItemDef`      | `{ id, name, short?, toolClass?, raw? }`；`raw` = 分解终点                                     |
| `ItemStore`    | `Record<ItemId, Decimal>`；背包与箱子的形状（容量按总数量计）                                  |
| `NodeDef`      | `{ id, name, short?, retDisplay?, toolClass?, panel?, cost? }`                                 |
| `CostArg`      | `{ item, count? }` 建造成本条目                                                                |
| `RecipeDef`    | `{ at, match?('multiset'\|'ordered'), args, out }`；`out` 必须是物品                           |
| `EvalOp`       | `{ op: 'gain', id, count }`——唯一效果原语                                                      |
| `EngineConfig` | `bagCapacity / chestCapacity / recycleRate?`                                                   |

### 2.3 `engine/node.ts` — 节点构造与遍历

```ts
export function newNodeId(): string // 运行时 id；不入存档
export function createNode(type, children?): GameNode
export function findNode(roots, id): GameNode | undefined // 先序
export function subtreeSize(node): number // 后代数量（折叠徽标）
export function subtreeContains(node, id): boolean // 防环校验
```

### 2.4 `engine/match.ts` — 签名与配方检测

```ts
export function childrenValues(node): Yield[] // 子 ret 的 value 条目
export function multisetKey(values) / orderedKey(values) / signatureKey(values, mode)
export function recipeSignatureKey(recipe): string // 由 args 生成
export function childrenSignatureKey(children, mode, held?): string
// 直接由子节点构造；held 给定时作为隐式实参排最前（docs/10 §4）
```

### 2.5 `engine/normalize.ts` — 返回值求解与归一化

```ts
export const RET_NONE / RET_UNRESOLVED
export function computeRet(node, registry): RetState // 纯函数（docs/01 §4）
export function normalizeTree(roots, registry): void // 后序 O(N)，幂等
```

### 2.6 `engine/registry.ts` — 内容装载

```ts
export interface NodeRegistry {
  defs / config
  item(id) / node(id)
  labelOf(id) / shortOf(id) // 未注册 → id 本身
  recipesFor(type)
  recipeModes(type) // 空 = 符号
  recipeFor(type, mode, key) // '模式::签名' → 配方，O(1)
}
export function buildRegistry(defs): NodeRegistry // 校验不过 → throw
```

校验清单见 03 篇 §6。

### 2.7 `engine/eval.ts` — 点击求值

```ts
export interface EvalWorld {
  registry
  gain(id, count): Decimal /* 余量 */
}
export interface EvalOptions {
  held?: string | null /* 手持物 id */
}
export function findRecipe(registry, node, held?): RecipeDef | undefined
// 先试「手持 + 实参」签名，再回落空手签名（手持永不打断已有配方）
export function evalNode(node, world, options?): EvalOutcome
export function applyOps(ops, world): boolean // 是否有实际效果
export interface EvalOutcome {
  node
  recipe: RecipeDef | undefined
  effective: boolean
}
```

- 只有表达式（有配方的类型）产出；产物进背包（`world.gain` 返回余量）。

### 2.8 `engine/bag.ts` — 物品库存与成本（纯函数）

```ts
export function bagTotal(store): Decimal
export function bagAdd(store, item, count, capacity): { store; rest }
export function bagTake(store, item, count): { store; taken }
export function costEntries(cost): [ItemId, Decimal][]
export function canAfford(store, cost): boolean
export function costGap(store, cost): [ItemId, Decimal][] // 缺口（提示用）
export function payCost(store, cost): ItemStore | null // 原子扣费；付不起 → null
export const DEFAULT_RECYCLE_RATE = 0.3
export function decomposeCost(cost, ctx): Record<ItemId, Decimal> // 全量分解（环安全）
export function recycleRefund(cost, ctx, rate?): [ItemId, Decimal][] // 分解 × 返还率向下取整
```

### 2.9 `engine/save.ts` — 存档

```ts
export const SAVE_VERSION = 4
export const SAVE_KEY = 'minode-beta/save'
export function serialize(state: GameSnapshot, savedAt): SaveV4
export function deserialize(save: SaveV1 | SaveV2 | SaveV3 | SaveV4, registry): GameSnapshot
// v1→v2→v3→v4 链式迁移（v3 节点堆按建造成本折算成物品）+ 重建 id + normalizeTree
```

未知内容 id 原样保留（渲染 `?`）；手持/放置模式不入档（04 篇 §6）。

### 2.10 `engine/dnd.ts` / `engine/history.ts`

```ts
export function guardCycle(evt): boolean // 拖拽防环守卫（duck-typing，可单测）
export class UndoTree { record / amend / undo / redo / jump / path / branches / steps }
// 撤销树：分叉 + 穿梭；快照 = serialize 文本；容量 300（prune 只动非路径叶子）
```

### 2.11 `utils/tree-drop.ts` — 落点读取（DOM 层）

```ts
export function readDrop(evt): TreeDropPlan | null // 树内拖拽（SortableJS 计划）
export function treeZoneAt(evt): { owner; index } | null // 放置落点（指针，二维中点）
export function pointerOverSidebar(evt): boolean // 拖到侧栏 = 回收
```

只读**身份**（`data-node-id`），不读列表顺序（05 篇 §2.1）。

## 3. 内容包 API

```ts
// src/content/index.ts —— 引擎唯一入口
export const CONTENT: NodeRegistry = buildRegistry({ items, nodes, recipes, config })

// src/content/demo.ts —— 示例局面（内容 id 只出现在 content/）
export function buildDemoRoots(): GameNode[]
export function buildStressRoots(count): GameNode[]
export function starterSeeds(): [ItemId, Decimal][]
```

扩展方式（加物品/节点/配方/成本/手持效果）见 `docs/03-content-registry.md` §7。

## 4. store API（`stores/game.ts` + display + feedback）

`useGameStore()`（Pinia setup store，id `game`；分层见 05 篇 §1）。

### 4.1 状态

| 名称                                               | 类型                                      | 说明                                        |
| -------------------------------------------------- | ----------------------------------------- | ------------------------------------------- |
| `registry`                                         | `NodeRegistry`                            | 当前内容包（只读实例）                      |
| `roots`                                            | `Ref<GameNode[]>`                         | 树（唯一事实源；节点只存在于树上）          |
| `bag`                                              | `Ref<ItemStore>`                          | 背包：`物品 → 数量`（容量 ≤ `bagCapacity`） |
| `chestContents`                                    | `Ref<Record<NodeId, ItemStore>>`          | 箱子内容（按节点 id 索引）                  |
| `panel`                                            | `Ref<{ kind:'storage'; nodeId } \| null>` | 当前浮动窗口                                |
| `selectedItem`                                     | `Ref<ItemId \| null>`                     | 选中的背包物品（手持来源）                  |
| `heldItem`                                         | `Computed<ItemId \| null>`                | 手持物 id（隐式实参）                       |
| `placing`                                          | `Ref<NodeTypeId \| null>`                 | 放置模式：虚影类型                          |
| `pointer`/`placingZone`                            | `shallowRef`                              | 指针 / 落点（仅放置模式追踪）               |
| `palette`                                          | `Computed`                                | 选择面板条目（= `registry.defs.nodes`）     |
| `dragging` / `renderVersion` / `lastEval` / `hint` |                                           | 拖拽态 / 自愈版本 / 调试文案 / HUD 提示     |
| `historySteps` / `canUndo` / `canRedo`             | `Computed`                                | 撤销树视图（§4.4）                          |

瞬态反馈按节点 id 分键（`feedback.ts`：pulse/悬停/配对/入场），只有受影响节点重渲染。

### 4.2 动作

**求值与点击**：

| 动作        | 签名                          | 说明                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `chipClick` | `(id, event?) => void`        | 放置模式 = 建造；否则**仅当节点构成表达式（有括号）才 eval** |
| `evalNode`  | `(id) => EvalOutcome \| null` | 求值（手持参与）；箱子 = 开窗；产出进背包并 pulse            |

**建造 / 回收**：

| 动作            | 签名                           | 说明                                       |
| --------------- | ------------------------------ | ------------------------------------------ |
| `startPlacing`  | `(type) => void`               | 进入/退出放置模式（再点同款取消）          |
| `cancelPlacing` | `() => void`                   | 右键 / Esc / 开窗时触发                    |
| `place`         | `(type, owner, at) => boolean` | 建造：原子扣费 + 插入 + 入场动画           |
| `placeAt`       | `(x, y) => boolean`            | 按指针落点建造（放置模式左键动作）         |
| `affordable`    | `(type) => boolean`            | 选择面板可用态                             |
| `recycle`       | `(nodeId) => boolean`          | 回收：分解成原材料 × 返还率 + 箱子内容原样 |

**树结构**：

| 动作                                                                 | 说明                                                    |
| -------------------------------------------------------------------- | ------------------------------------------------------- |
| `moveTreeNode`                                                       | 树内移动（源属主自检 + 防环 + 深处自动折叠 + 入场动画） |
| `handleDrop`                                                         | 拖拽唯一入口：侧栏 = 回收 / plan 优先 + 指针兜底        |
| `setChildren`/`setRoots`                                             | 声明式写列表（先摘后插、防环、增量归一化）              |
| `toggleFold`/`setAllFolded`                                          | 折叠（点括号/徽标）；全部收/展                          |
| `requestTreeRebuild`/`afterStructureChange`/`setDragging`/`setHover` | 自愈/收尾/拖拽态/悬停                                   |

**背包与箱子**：`itemRowClick`（手持/转入）、`itemRowDouble`、`chestRowClick`、
`chestRowDouble`、`transferToChest(item, all?)`、`transferFromChest(item, all?)`。

**窗口 / 历史 / 存档 / 调试**：`openPanel`/`closePanel`/`panelOf`；`undo`/`redo`/`jumpTo`；
`dump`/`loadFrom`/`saveGame`/`loadGame`；`spawnDemo`/`spawnStress`/`grantStarter`/`reset`。

**展示（display.ts 纯函数）**：`nameOf` / `retOf` / `chipState` / `chipKind` /
`chipKindOfType` / `nodeName` / `itemName` / `itemHue` / `foldBadgeOf` / `costTextOf` /
`recyclePreview` / `describeEval` / `isHeldHint`（手持可命中提示，`retOf` 绑定 `heldItem`，D-34）。

**瞬态（feedback.ts）**：`hint` / `setHint` / `isPulsing` / `isHoveredParent` /
`setParenPair` / `isParenMatched` / `isAppearing`。

时序约定：**一切树结构变更必须经过 `moveTreeNode`/`setChildren`/`setRoots`/`place`/
`recycle`**——它们内部做摘挂 + 增量归一化。直接改 `node.children` 会让索引、父索引
与 `ret` 失配。

### 4.3 撤销树（undo 树）

撤销是**树**不是栈：中间做新操作 = 分叉；`jumpTo` 自由穿梭；快照 = 完整局面
（`serialize` 文本，不做差分）；记录时机与 coalesce（200ms 合并）见 05 篇；
容量 300，prune 只丢弃不在当前路径上的最旧叶子。历史不入存档，读档后单节点重建。

## 5. 组件契约

| 组件                                                | 输入                        | 备注                                                     |
| --------------------------------------------------- | --------------------------- | -------------------------------------------------------- |
| `tree/TreeView.vue`                                 | 无                          | 根列表；放置模式点击；拖拽 → `handleDrop`                |
| `tree/TreeNode.vue`                                 | `node`, `depth?`, `isHead?` | 递归；括号（拖把手 + 点击折叠 + 配对高亮）；完全纵向大纲 |
| `tree/PlacementGhost.vue`                           | 无                          | 放置视觉层：光标 chip + FLIP 落点 ghost + 边缘自动滚动   |
| `inventory/NodePalette.vue`                         | 无                          | 选择面板（类型+成本；付不起暗淡）                        |
| `inventory/ItemBag.vue`                             | 无                          | 背包物品行（容量徽标；行点击 = 手持/转移）               |
| `inventory/ChestPanel.vue`                          | 无                          | 箱子浮动窗口（标题栏拖动；物品行转移）                   |
| `hud/StatBar.vue`                                   | 无                          | 手持 / 提示                                              |
| `history/HistoryPanel.vue` / `debug/DebugPanel.vue` | 无                          | 撤销树面板 / 调试                                        |

## 6. 开发工具

- **dev 挂载点**：DEV 模式 `window.__minode` = store（`App.vue`）。
- **调试面板**：示例树 / 压力树 / 起始物资 / 全部折叠 / 展开全部 / 存档 / 读档 / 重置 /
  最近点击。
- **性能自查**：`__minode.spawnStress(100)` + DevTools Performance；验收 = 点击到下一帧
  ≤ 1 帧（16.7ms）。反馈状态必须保持按节点分键。

## 7. 常见任务手册

| 想做什么        | 动哪里                                                     | 注意                                |
| --------------- | ---------------------------------------------------------- | ----------------------------------- |
| 加一种物品      | `content/items.ts`                                         | 是产出/成本就引用它；原材料标 `raw` |
| 加一种原料/节点 | `content/items.ts`（同名物品）+ `content/nodes.ts`（cost） | 符号只一条数据；要可点就给它加配方  |
| 加一台机器      | `content/nodes.ts`（cost）+ `content/recipes.ts`           | 同类型签名不能重复；out 必须是物品  |
| 加手持效果      | `content/recipes.ts`（工具放进 `args`）                    | 先含手持再回落空手（02 篇 §3）      |
| 调数值/成本     | `content/config.ts` / `NodeDef.cost`                       | 逻辑代码禁止裸数值                  |
| 加深流程树      | `content/recipes.ts` 继续接配方                            | 树越深，一次点击的产出越值钱        |
| 换整套内容      | 新建 `content-<name>/` 并改 `CONTENT`                      | 引擎/store/组件不动                 |
| 改 UI 风格      | `src/assets/*.css`                                         | 遵守 06 篇反模式清单                |
| 新增效果原语    | `engine/types.ts` → `engine/eval.ts` → 文档 → 测试         | 四步流程（03 篇 §5）                |
| 查术语          | `docs/10-glossary.md`                                      | 唯一词汇事实源；新词先入表再用      |

## 8. 约定与反模式

- 不许绕过 store 改状态；组件只读 store + 调动作。
- **节点没有存储**；**不许手改 `node.ret`**；不许对 `children` 直接赋值。
- **不许模块级可变单例**；**内容 id 只出现在 content/**。
- **Decimal 替换式**；`engine/num.ts` 之外的 `new Decimal` 视为缺陷。
- **文档与代码同步**：签名/行为变更必须同时改对应文档。

## 9. FAQ

- **点击没反应？** 它可能是裸符号实参（`()` 才可 eval，D-30）或 `[?]`（空手检测不通过，
  试试手持某物）。调试面板「最近点击」会显示原因。
- **`[?]` 出现？** 实参「不多不少」、子节点都被识别（任一子 `unresolved` 会传染）。
- **背包满了？** 物品类产出丢弃余量并提示；先回收/转移腾容量。
- **存档出现 `?` 节点？** 内容 id 被删/改名。id 是存档契约，改 id 必须加迁移函数。
- **想加脚本节点？** 按 05 篇 §3「未来的门」新增独立模块，不动引擎。
