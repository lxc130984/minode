# 07 · API 参考与接手指南

面向要接手这套代码的开发者：模块边界、全部公开 API、时序约定、常见任务手册。
与代码同步维护——改签名必须改本篇（05 篇 §9 的文档纪律）。

## 0. 新人上手路径（约 30 分钟）

1. 读 `docs/00-vision.md` 建立「树 = 表达式、点击 = eval」的心智模型；
2. `vp install && vp dev`，打开页面点几下：点 `矿井[铁矿]` 得 1 个铁矿石；
   点 `冶炼炉[铁]` 得 1 个铁；点「铁矿石」这类符号没有任何响应（调试面板的「最近点击」会显示原因）；
3. 读 `src/engine/types.ts`（全部类型与语义注释）；
4. 读 `src/content/*`（符号表 + 矿井 + 六层加工链：铁矿石 → 冶炼炉 → 锻炉 → 轧机 → 装配台 → 发动机厂）；
5. 想改玩法 → 看 §7 手册；想改引擎 → 先读 `docs/02-eval.md`。

命令：`vp dev`（开发）/ `vp test`（单测）/ `vp check`（格式+lint）/ `vp run type-check`（vue-tsc，
**必跑**：`vp check` 不检查 `.vue` 脚本类型）/ `vp run build`（类型检查 + 构建）。
测试从 `vite-plus/test` 导入（vitest 由 Vite+ 内置）。

## 1. 模块地图与依赖方向

```
components/ ──▶ stores/game.ts ──▶ engine/ ──▶（零依赖：不 import vue/pinia/内容）
                     │
                     └──▶ content/（构建出 CONTENT 注册表实例）
```

| 目录              | 职责                                          | 硬约束                            |
| ----------------- | --------------------------------------------- | --------------------------------- |
| `src/engine/`     | 求值、静态配方检测、节点背包、归一化、存档    | 纯 TS，零框架依赖，可裸 Node 测试 |
| `src/content/`    | 节点/资源/配方/数值（唯一内容包）             | 只 import `engine` 类型与函数     |
| `src/stores/`     | 唯一可变状态（Pinia setup store）与全部写动作 | 组件不得绕过 store 直接改引擎对象 |
| `src/components/` | 渲染 + 交互声明（拖拽守卫、节流）             | 不写玩法逻辑、不出现玩法数值      |

## 2. 引擎 API

### 2.1 `engine/num.ts` — 大数纪律

```ts
export { Decimal } // break_infinity.js 的 Decimal
export type Num = number | string | Decimal
export function D(value: Num): Decimal // 归一化；全仓唯一的 Decimal 创建入口
```

- 只允许**替换式更新**（`node.ret = ...`、`slots[i] = { item, count }`）；
  **禁止** `fromNumber`/`fromString` 等原地 mutator。
- 换大数库只改这一个文件。

### 2.2 `engine/types.ts` — 类型全集（含文档注释）

| 类型           | 关键点                                                                                                                 |
| -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `GameNode`     | `{ id, type, children, folded, ret }`；**没有节点内存储**；`ret` 只由归一化写（`folded` 的存档字段名仍是 `collapsed`） |
| `RetState`     | `none` / `unresolved`（`[?]`）/ `value`（`items: Yield[]`）                                                            |
| `Yield`        | `{ id, count }` 产物条目（`id` = 资源或节点类型 id；曾用名 `ItemAmount`，D-13/D-24）                                   |
| `ResourceDef`  | `{ id, name, short? }`；不可放置的纯数量，只进资源仓库                                                                 |
| `NodeDef`      | `{ id, name, short?, retDisplay?, toolClass?, panel? }`；节点全可放置；**有配方 = 函数，无配方 = 符号**                |
| `RecipeDef`    | `{ at, match?('multiset'\|'ordered'), args, out }`                                                                     |
| `EvalOp`       | `{ op: 'gain', id, count }`——唯一的效果原语；新原语走四步流程（03 篇 §5）                                              |
| `EngineConfig` | 数值中心：`nodeBagSize` / `nodeStackLimit` / `chestSize`                                                               |

### 2.3 `engine/node.ts` — 节点构造与遍历

```ts
export function newNodeId(): string
export function createNode(type: NodeTypeId, children: GameNode[] = []): GameNode
export function findNode(roots: readonly GameNode[], id: string): GameNode | undefined // 先序
export function subtreeSize(node: GameNode): number // 后代数量（不含自身）
export function subtreeContains(node: GameNode, id: string): boolean
```

### 2.4 `engine/match.ts` — 签名与配方检测

```ts
export function childrenValues(node: GameNode): Yield[] // 子 ret 的 value 条目
export function multisetKey(values): string // 顺序无关、数量有关
export function orderedKey(values): string // 顺序敏感
export function signatureKey(values, mode): string
export function recipeSignatureKey(recipe: RecipeDef): string // 由 args 生成
export function childrenSignatureKey(
  children: readonly GameNode[],
  mode,
  held?: string | null,
): string
// 直接由子节点构造；held 给定时作为隐式实参排最前（docs/10 §4）
```

### 2.5 `engine/normalize.ts` — 结果求解与归一化

```ts
export const RET_NONE: RetState
export const RET_UNRESOLVED: RetState
export function computeRet(node, registry): RetState
export function normalizeTree(roots: readonly GameNode[], registry): void // 后序 O(N)，幂等
```

规则见 01 篇 §4：未知类型 → `none`；函数（子未识别 / 配方检测不通过）→ `unresolved`（`[?]`）；
符号 → 原子自返。`normalizeTree` 只重算 `ret`，**不动** `children` / `collapsed`。

### 2.6 `engine/registry.ts` — 内容装载

```ts
export interface NodeRegistry {
  readonly defs: ContentDefs
  readonly config: EngineConfig
  resource(id): ResourceDef | undefined
  node(id): NodeDef | undefined
  labelOf(id): string // 节点类型/资源 → name；未注册 → id 本身
  shortOf(id): string // short ?? name；未注册 → id
  recipesFor(type): readonly RecipeDef[]
  recipeModes(type): readonly RecipeMode[] // 该类型配方用到的匹配模式（无配方 = 空 = 符号）
  recipeFor(type, mode, key): RecipeDef | undefined // '模式::签名' → 配方，O(1)
}
export function buildRegistry(defs: ContentDefs): NodeRegistry // 校验不过 → throw（信息含数组/下标/id）
```

- **没有配方的类型 = 符号**：`recipeModes` 为空，点击天然无响应（无处理器派发，D-25）。
- 校验清单：id 唯一（nodes/resources 各自唯一且两套 id 不重复）、引用完整（`recipe.at` 为节点类型、
  `recipe.args/out.item` 为资源或节点类型）、数值合法（`count >= 0`、config 三项 >= 1）、
  同类型配方签名不重复。

### 2.7 `engine/eval.ts` — 点击求值

```ts
export interface EvalWorld {
  registry: NodeRegistry
  gain(id: string, count: Decimal): Decimal // 产出入口；返回未接收的余量
}
export interface EvalOptions {
  held?: string | null // 手持物 id（docs/10 §4：隐式实参，只参与被点节点的签名检测）
}
export function findRecipe(registry, node, held = null): RecipeDef | undefined
// 先试「手持 + 子实参」签名，再回落空手签名（手持永不打断已有配方）
export function evalNode(node, world, options?): EvalOutcome // 单节点：配方检测（含手持）→ 产出
export function applyOps(ops, world): boolean // 返回是否有实际效果
export interface EvalOutcome {
  node: NodeId
  recipe: RecipeDef | undefined // undefined = 符号/未注册/检测不通过
  effective: boolean
}
```

- **只有点击会调用它，且只 eval 被点的节点**；子节点只提供静态返回值供签名检测；
- 符号 → `recipe: undefined`、无产出；函数命中配方 → `gain` 按路由结算（节点→节点背包、
  资源→资源仓库）；
- `world.gain` 返回**未接收的余量**（节点背包满时 > 0，由 store 决定丢弃与告警）。

### 2.8 `engine/bag.ts` — 容器纯函数

```ts
export function bagEmpty(count: number): NodeBag
export function bagAddType(bag, type, count, limit): { bag: NodeBag; rest: Decimal } // 先并堆再占新格
export function bagRearrange(bag, from, to, limit): NodeBag // 同容器落格：空格=搬、同类=并、异类=换
export function bagSwap(bag, a, b): NodeBag
export function bagTakeAt(bag, index, count?): { bag: NodeBag; taken: NodeStack | null }
export function bagPlaceAt(
  bag,
  index,
  type,
  count,
  limit,
): { bag: NodeBag; rest: Decimal; placed: Decimal } // 尊重落点
```

- 全部**纯函数**（返回新数组，不改入参；满/空槽时返回同一引用）。
- 容器只放节点堆（全可放置）；资源不存在于此，走资源仓库（`Record<ResourceId, Decimal>`）。

### 2.9 `engine/save.ts` — 存档

```ts
export const SAVE_VERSION = 4
export const SAVE_KEY = 'minode-beta/save'
export function serialize(state: GameSnapshot, savedAt: number): SaveV4
export function deserialize(save: SaveV1 | SaveV2 | SaveV3 | SaveV4, registry): GameSnapshot // 链式迁移 + 重建 id + normalizeTree
```

- `SaveV4 = { v, savedAt, roots, bag(物品表) }`；Decimal 以字符串存；
  节点 id 不入档（箱子内容挂在节点条目 `SaveNode.chest` = 物品表上）；
- 迁移链：v1（槽位）→ v2（节点实例）→ v3（节点堆）→ v4（物品背包）：
  v3 的节点堆按**建造成本 × 数量**折算成物品（保价值），旧 `resources` 直接并入（04 篇 §6）；
- 未知内容 id 原样保留（渲染 `?`，01 篇 §8）；手持/放置模式是瞬态，不入档。

### 2.10 `engine/dnd.ts` — 拖拽守卫

```ts
export function guardCycle(evt: DragMoveLikeEvent): boolean // 目标列表在被拖子树内 → 拒绝
```

### 2.11 `engine/registry.ts` — 配方派发表（预编译）

```ts
export type RecipeMode = 'multiset' | 'ordered'
recipeModes(type: NodeTypeId): readonly RecipeMode[]      // 该类型配方用到的模式（通常 1 个）
recipeFor(type, mode, key): RecipeDef | undefined         // '模式::签名' → 配方，O(1)
```

构建期把每条配方算一次 `recipeSignatureKey` 存进哈希表；`computeRet`（归一化）与
`findRecipe`（点击求值）共用这张表 —— 不存在第二条会走偏的检测路径。

`engine/match.ts` 的 `childrenSignatureKey(children, mode, held?)` 直接从子节点构造签名键
（`held` = 手持隐式实参），与 `signatureKey(childrenValues(node), mode)` 逐字等价（有测试钉住）。

### 2.12 `engine/history.ts` — undo 树（纯逻辑）

```ts
export interface HistoryEntry { id; parent; children; label; at; snapshot } // snapshot = 完整局面 JSON 文本
export interface HistoryStep { id; label; at; current }
export class UndoTree {
  constructor(initialSnapshot: string, label = '初始', at = 0)
  record(snapshot: string, label: string, at: number): boolean // 与当前局面相同 → 忽略
  amend(snapshot: string, at: number): boolean // 改写当前节点（合并连续回写）；根不改写
  undo(): HistoryEntry | undefined // 回父节点
  redo(): HistoryEntry | undefined // 走最近记录的子节点（分支取最新）
  jump(id: number): HistoryEntry | undefined // 自由穿梭
  path(): HistoryEntry[] // 根 → 当前
  branches(): HistoryEntry[] // 当前节点的分支（按记录顺序）
  canUndo() / canRedo(): boolean
  steps(): { path: HistoryStep[]; branches: HistoryStep[] }
  readonly entry / size
}
```

零框架依赖、纯内存；快照由 `engine/save.ts` 的 `serialize`/`deserialize` 往返。
容量 `MAX_ENTRIES = 300`：超出时丢弃「不在当前路径上」的最旧叶子（同刻取最小 id），
**不破坏当前路径的可达性**。用法与不变量见 §4.4。

### 2.13 `utils/drop-action.ts` — 落位路由（纯函数）

```ts
export type SlotRef =
  { area: 'bag'; index: number } | { area: 'chest'; node: NodeId; index: number }
export type DragSource =
  { kind: 'slot'; ref: SlotRef } | { kind: 'tree'; node: NodeId; owner: NodeId | null }
export type DropTarget =
  { kind: 'slot'; ref: SlotRef } | { kind: 'tree'; owner: NodeId | null; index: number }
export type DropAction =
  | { act: 'none'; why: 'same-slot' | 'empty-source' | 'cycle' }
  | { act: 'merge'; from: SlotRef; to: SlotRef } // 空/同类格 = 并入（溢出留源格）
  | { act: 'swap'; from: SlotRef; to: SlotRef } // 异类格 = 交换（可跨容器）
  | { act: 'placeOne'; from: SlotRef; owner: NodeId | null; index: number }
  | { act: 'stow'; node: NodeId; into: SlotRef }
  | { act: 'moveTree'; node: NodeId; from: NodeId | null; to: NodeId | null; index: number }
export function routeDrop(
  from: DragSource,
  to: DropTarget,
  stackAt: (ref) => NodeStack | null,
): DropAction
export function sameSlot(a, b): boolean
export function sameContainer(a, b): boolean
```

统一规则见 docs/04 §3；`drop-action.spec` 有完整路由矩阵。

### 2.14 `utils/tree-drop.ts` — 落位意图读取（DOM 层）

```ts
export interface DragEndLike {
  item?: unknown
  from?: unknown
  to?: unknown
  newIndex?: unknown
}
export function readDrop(evt): { from: DragSource; to: DropTarget } | null // 读不出 → null（调用方重建树）
export function slotUnderPointer(evt): SlotRef | null // elementFromPoint → [data-bag-index]
export function treeZoneUnderPointer(evt): { owner: NodeId | null; index: number } | null
export function guardContainerMove(evt): boolean // 容器目标 → 不做插入预览
```

只读**身份**（`data-node-id` / `data-bag-index`），
**不读列表顺序**（`on-end` 时 DOM 已被 vue-draggable-plus 复位，见 05 篇 §2.1）。
容器格的扁平下标直接来自 `data-bag-index`（容器是单列表，无列映射）。

## 3. 内容包 API

```ts
// src/content/index.ts —— 引擎唯一入口
export const CONTENT: NodeRegistry = buildRegistry({ nodes, recipes, resources, config })
```

扩展方式（加节点/资源/配方/工具/特殊处理器）见 `docs/03-content-registry.md` §7；
六层加工链的完整示例也在那一节。

## 4. store API（`stores/game.ts`）

`useGameStore()`（Pinia setup store，id `game`）。

### 4.1 状态

| 名称                  | 类型                                       | 说明                                                            |
| --------------------- | ------------------------------------------ | --------------------------------------------------------------- |
| `registry`            | `NodeRegistry`                             | 当前内容包（只读实例）                                          |
| `roots`               | `Ref<GameNode[]>`                          | 树（唯一事实源）                                                |
| `nodeBag`             | `Ref<NodeBag>`                             | 节点背包：`(NodeStack \| null)[]`，定长 `config.nodeBagSize`    |
| `chestContents`       | `Ref<Record<NodeId, NodeBag>>`             | 箱子内容（按节点 id 索引；存档挂在节点条目上）                  |
| `panel`               | `Ref<{ kind: 'storage'; nodeId } \| null>` | 当前打开的浮动窗口                                              |
| `resources`           | `Ref<ResourceStore>`                       | 资源仓库：`Record<ResourceId, Decimal>`，只读展示               |
| `selected`            | `Ref<number>`                              | 选中背包格下标（手持来源）                                      |
| `heldStack`           | `Computed<NodeStack \| null>`              | 选中格的堆（HUD「手持」显示）                                   |
| `heldItem`            | `Computed<string \| null>`                 | 手持物 id（= 选中格类型）；作为隐式实参参与点击检测（02 篇 §3） |
| `cursor`              | `Ref<NodeStack \| null>`                   | 光标拿着的堆（右键拿起/放下，任何容器格可交换）                 |
| `activeBagIndex`      | `Ref<number \| null>`                      | 续转格（双击后单击同格 = 每次再转 1 个）                        |
| `dragging`            | `Ref<boolean>`                             | 拖拽中（驱动空落点条展开）                                      |
| `renderVersion`       | `Ref<number>`                              | 树视图版本；+1 = 从模型整体重建树 DOM（落位失败自愈）           |
| `hint`                | `Ref<string>`                              | HUD 一次性提示（转移 / 背包满等），2.6s 自动清空                |
| `lastEval`            | `Ref<string>`                              | 最近一次点击的结果描述（如 `冶炼炉 → 铁×1`），调试面板展示      |
| `historySteps`        | `Computed`                                 | undo 树当前视图：`{ path, branches }`（`HistoryStep[]`，§4.4）  |
| `canUndo` / `canRedo` | `Computed`                                 | 撤销 / 重做可用性（驱动按钮 disabled 态）                       |

瞬态反馈是**按节点 id 分键**的 `shallowReactive` 记录（`pulseAt`），
只有受影响节点重渲染——**不要**改回整树共享的 Set/Map（实测 400 节点时点击 57ms → 1.8ms）。

### 4.2 动作

**容器三动词（docs/04 §3 / docs/10 §4，D-24）**：

| 动作          | 签名                                    | 说明                                                                             |
| ------------- | --------------------------------------- | -------------------------------------------------------------------------------- |
| `placeOne`    | `(from: SlotRef, owner, at) => boolean` | 放置：容器格取 1 个节点插入树的指定列表（**永远 1 个**）                         |
| `stow`        | `(nodeId, into?: SlotRef) => boolean`   | 收起：节点本体 + 箱子内容进容器（`into` 指定箱子格），子节点上移；放不下整次拒绝 |
| `transferOne` | `(ref: SlotRef) => boolean`             | 转移 1 个到对侧（背包→箱子/树根；箱子→背包）                                     |
| `slotPress`   | `(ref: SlotRef) => boolean`             | 左键：背包 = 选中 / 续转；箱子 = 取 1 个                                         |
| `slotWheel`   | `(ref: SlotRef) => boolean`             | 滚轮 = 转 1 个到对侧（= 双击）                                                   |
| `cursorPick`  | `(ref: SlotRef) => void`                | 右键：光标与该格整堆交换（背包格 / 箱子格通用）                                  |
| `handleDrop`  | `(evt: DragEndLike) => void`            | 拖拽唯一入口：读 DOM → `routeDrop` → `execDrop`；失败重建树视图                  |
| `execDrop`    | `(action: DropAction) => boolean`       | 执行落位动作（merge/swap/placeOne/stow/moveTree；手势与拖拽共用）                |

**树结构 / 求值 / 历史 / 存档**：

| 动作                                                   | 签名                                | 说明                                                                 |
| ------------------------------------------------------ | ----------------------------------- | -------------------------------------------------------------------- |
| `evalNode`                                             | `(id) => EvalOutcome \| null`       | 点击求值（`heldItem` 参与检测）；产出按路由结算并 pulse；箱子 = 开窗 |
| `setChildren` / `setRoots`                             | `(id \| null, nodes) => boolean`    | 声明式写列表：节点先摘挂再写入（防重复引用）、防环、增量归一化       |
| `toggleFold`                                           | `(id) => void`                      | 折叠 / 展开（纯视觉，≠ 收起）                                        |
| `openPanel` / `closePanel` / `panelOf`                 |                                     | 浮动窗口（箱子）                                                     |
| `requestTreeRebuild`                                   | `() => void`                        | `renderVersion` +1：Vue 从模型整体重建树 DOM（自愈）                 |
| `afterStructureChange`                                 | `(affected?) => void`               | 重建索引 + 增量（或全量）归一化                                      |
| `setHover` / `setDragging` / `startPanelDrag`          |                                     | 悬停标记；拖拽态；容器侧拖拽                                         |
| `undo` / `redo` / `jumpTo`                             | `() => boolean` / `(id) => boolean` | 撤销 / 重做（走最近分支）/ 穿梭到任意历史节点（§4.4）                |
| `dump` / `loadFrom`                                    | `() => string` / `(raw) => boolean` | 纯序列化（测试/导出用）                                              |
| `saveGame` / `loadGame`                                | `() => void` / `() => boolean`      | localStorage 读写（无存储环境自动跳过）                              |
| `spawnDemo` / `spawnStress` / `grantStarter` / `reset` |                                     | 调试面板用                                                           |

时序约定：**一切树结构变更必须经过 `execDrop`/`setChildren`/`setRoots`/`placeOne`/`stow`**
——它们内部会做摘挂（同一节点不会出现在两个列表）→
`afterStructureChange`（增量归一化）。直接改 `node.children` 会让索引、父索引与 `ret` 失配。
（旧容器 API——`applyDrop`/`moveSlot`/`moveInBag`/`chestStore`/`chestTake`/`transferWholeStack`/
`bagClick`/`bagDoubleClick`/`bagWheel`/`bagPick`/`handleChestDrop`/`takeOneFromChest`——
已随 D-24 删除。）

### 4.3 展示辅助（组件只调这些）

```ts
nameOf(node): string                    // 未注册 → '?'
retOf(node): string | null              // '[?]' / 短名（多值空格分隔、count>1 显示 ×N）/ null = 省略
chipState(node): 'ok' | 'idle' | 'unknown'
chipKind(node): 'machine' | 'symbol' | 'tool' | 'unknown'  // 节点高亮分类（06 篇 §2.1）
isPulsing(node): boolean
isHoveredParent(node): boolean          // 该节点是否为「被悬停节点的父节点」（06 篇 §6.1）
foldBadgeOf(node): number
resourceLabel(resourceId): string       // 资源显示名（= registry.shortOf）
```

### 4.4 撤销树（undo 树）

撤销不是线性栈而是**树**：在历史中间做新操作不抹掉原有未来，而是分叉；玩家可自由穿梭回任意分支。
纯逻辑在 `engine/history.ts`（§2.12），store 只负责「何时快照」与「快照如何落回局面」。

**快照颗粒度**：每个历史节点 = 一次**完整局面**（`serialize` 后的 JSON 文本，`savedAt` 固定 0
以便同一局面得到同一文本）。不做差分——差分省内存但极易在注册表/内容演进后失效。

**记录时机**：一切会改变局面或存档形状的入口都记一条标签：

| 入口                                              | 标签                       | `coalesce`                     |
| ------------------------------------------------- | -------------------------- | ------------------------------ |
| `setChildren` / `setRoots` / `execDrop(moveTree)` | `拖拽`                     | 是（一次拖拽多次回写合并一步） |
| `stow`                                            | `收起 <名>`                | 否                             |
| `placeOne` / `transferOne` / `execDrop`           | `放置/存入/取出/转移 <名>` | 是                             |
| `slotPress` 续转 / `cursorPick`                   | `容器整理` / `光标搬运`    | 是                             |
| `evalNode`                                        | `eval <名>`                | 否                             |
| 调试面板（示例树 / 压力树 / 补货 / 重置）         | `示例树` 等                | 否                             |
| 读档                                              | `读档`                     | —                              |

- `coalesce = true`：当前节点不是初始节点、标签相同、且距上次记录 < `COALESCE_MS = 200`
  时，用 `amend` **改写**当前节点而不是新开一条——一次拖拽会触发多次回写（每个受影响的列表各一次），
  合并后只留一步，否则撤销要按十几下。
- `record` 对「与当前局面完全相同」的快照直接忽略：重排到原位、放置失败等空操作不进历史。
- **读档 / 重置 / 无档启动都会重建整棵树**（`resetHistory`，标签分别为 `读档` / `重置` / `初始`）：
  历史不入存档，读档后从单节点历史重新开始；启动时的示例树/补货发生在建树之前，不产生历史步骤。

**撤销 / 重做 / 穿梭**：`undo` 回父节点；`redo` 走**最近记录**的子节点（多分支时选它，
其它分支用面板点选）；`jumpTo(id)` 直接落到任意历史节点。三者共用 `applySnapshot`：
`deserialize → roots/nodeBag/resources/selected`，并清空光标、pulse、`lastEval`，
最后 `afterStructureChange()`（重建 id 索引 + 归一化）。**历史结构本身在任何操作下都不被删改**
（除容量裁剪），所以穿梭是纯粹的可逆动作。

**容量**：`MAX_ENTRIES = 300`，超出时丢弃「不在当前路径上」的最旧叶子（同刻取最小 id）。
当前路径、以及各分支的**可达性**始终保留；`prune` 只动叶子。

**响应式桥接**：`UndoTree` 是普通类（不属于 reactive 图），store 用 `historyVersion` 计数器
在每次改动后 +1，`historySteps` / `canUndo` / `canRedo` 三个 computed 读取它来跟随更新。

**UI**：树区下方的 `history/HistoryPanel.vue` —— 路径行（`初始 → eval 矿井 → …`，当前节点高亮）

- 分支行（`分支 …`，点击即穿梭）+ `[撤销] [重做]` + 快捷键提示；
  `App.vue` 全局键位 `Ctrl/Cmd+Z` 撤销、`Ctrl/Cmd+Shift+Z` / `Ctrl/Cmd+Y` 重做。

**已知取舍**：历史不持久化（刷新即从当前局面重建单节点历史）；快照为全量文本，
300 条上限是「内存换实现简单」的显式取舍（06/07 篇的复杂度预算）。

## 5. 组件契约

| 组件                       | 输入                                                                                   | 事件               | 备注                                                                          |
| -------------------------- | -------------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------- |
| `tree/TreeView.vue`        | 无（读 store）                                                                         | 无                 | 根列表；**只读** `:model-value`，落位走 `on-start`/`on-end` → `handleDrop`    |
| `tree/TreeNode.vue`        | `node: GameNode`, `depth?: number`（根为 1，自动透传）                                 | 无                 | 递归；递归名 = 文件名（`TreeNode`）                                           |
| `inventory/NodeBag.vue`    | 无                                                                                     | 无                 | 节点背包单列表网格（`data-list="bag"`）；`on-end` → `handleDrop`；光标堆跟随  |
| `inventory/NodeSlot.vue`   | `stack: NodeStack \| null`, `index`, `area: 'bag'\|'chest'`, `chestNode?`, `selected?` | 无（直接调 store） | 背包格与箱子格的**统一组件**；`data-bag-index` = 扁平下标；tooltip 遵循手势表 |
| `inventory/ChestPanel.vue` | 无                                                                                     | 无                 | 箱子浮动窗口（标题栏原生拖动）；格子由 `NodeSlot` 渲染（`data-list="chest"`） |
| `inventory/Warehouse.vue`  | 无                                                                                     | 无                 | 资源仓库只读列表（名称 × 数量）                                               |
| `hud/StatBar.vue`          | 无                                                                                     | 无                 | 手持名 / 提示                                                                 |
| `debug/DebugPanel.vue`     | 无                                                                                     | 无                 | 示例树 / 压力树 / 补货 / 存档 / 读档 / 重置 / 最近点击                        |
| `history/HistoryPanel.vue` | 无                                                                                     | 无                 | undo 树：路径 / 分支 / 撤销重做按钮（§4.4）                                   |

拖拽配置（06 篇 §9）：只有树是 Sortable 列表（`group: 'nodes'`、`on-move: guardCycle` 防环）；
落位走 `handleDrop`。背包/箱子是物品行列表，不参与拖拽（D-26）。
`PlacementGhost.vue` 管理放置模式的视觉层：光标 chip + 命令式插入的 `.place-ghost`
（同 `sortable-ghost` 观感，120ms FLIP；真实拖拽时摘除）+ 视口边缘自动滚动（rAF 滚页面）。

## 6. 开发工具

- **dev 挂载点**：开发模式下 `window.__minode` = store（`src/App.vue` 顶部）。
  例：`__minode.spawnStress(100)`；`__minode.lastEval`。
- **调试面板**：页面底部 `debug`，含「最近点击」一行（如 `冶炼炉 → 铁×1`、`铁矿石 → 符号（无 eval 行为）`）。
- **性能自查**：`__minode.spawnStress(100)` 后用 DevTools Performance 录制点击；
  验收口径 = 点击到下一帧 ≤ 1 帧（16.7ms）。注意 dev 模式带 Vue DevTools/inspector 开销。

## 7. 常见任务手册

| 想做什么        | 动哪里                                                           | 注意                                            |
| --------------- | ---------------------------------------------------------------- | ----------------------------------------------- |
| 加一种原料/节点 | `content/nodes.ts`                                               | 符号只需一条数据；要可点击就给它加配方          |
| 加一种资源      | `content/resources.ts`                                           | 资源不可放置，只进资源仓库                      |
| 加一台机器      | `content/nodes.ts` + `content/recipes.ts`                        | 同类型签名不能重复                              |
| 加手持效果      | `content/recipes.ts`（工具放进 `args`，如 `forest(axe) → wood`） | 手持 = 隐式实参（02 篇 §3）；先含手持再回落空手 |
| 新增效果原语    | `engine/types.ts` → `engine/eval.ts` → 文档 → 测试               | 四步流程（03 篇 §5）                            |
| 调数值          | `content/config.ts` / `NodeDef.*`                                | 逻辑代码禁止裸数值                              |
| 加深流程树      | 在 `recipes.ts` 继续接配方（参考六层链）                         | 树越深，一次点击的产出越多                      |
| 换整套内容      | 新建 `content-<name>/` 并改 `CONTENT`                            | 引擎/store/组件不动                             |
| 改 UI 风格      | `src/assets/*.css`                                               | 遵守 06 篇的反模式清单                          |
| 查术语          | `docs/10-glossary.md`                                            | 唯一词汇事实源；新词先入表再用                  |

## 8. 约定与反模式

- 不许绕过 store 改状态；组件只读 store + 调动作。
- **节点没有存储**：任何"节点内部囤东西"的设计都属于回退，先读 01 篇 §2 纪律。
- **不许手改 `node.ret`**（只有归一化/求值写）；不许对 `children` 直接赋值（走回写动作）。
- **不许模块级可变单例**（注册表是实例；反馈状态在 store 内）。
- **Decimal 替换式**；`engine/num.ts` 之外的 `new Decimal(...)` 视为缺陷（`D()` 除外）。
- **文档与代码同步**：签名/行为变更必须同时改 01/02/03/04/06/07 的对应小节。
- 新数值进 config；新规则进注册表；新语义配钉子测试。

## 9. FAQ

- **点击很卡？** 先 `__minode.spawnStress(100)` 量「点击→下一帧」；确认是不是 dev 工具开销
  （prod 构建对比），再检查是否有人把反馈状态改回整树共享引用。
- **`[?]` 出现？** 配方检测不通过：检查实参是否「不多不少」、子节点是否都被识别
  （任一子 `unresolved` 会传染）。
- **某个节点没产出？** 它是符号（没有处理器，点击本就不该有响应）或它的 `[]` 是 `[?]`
  （配方不匹配）。调试面板的「最近点击」会显示是符号还是配方不匹配。
- **节点背包满了？** 节点类产出丢弃余量（DEV 下每种只 warn 一次），资源类产出照常入仓库；
  先清出格子或收起/放置节点。
- **存档出现 `?` 节点？** 内容 id 被删/改名。id 是存档契约，改 id 必须加迁移函数。
- **想加脚本节点（玩家写逻辑）？** 不要动引擎；按 05 篇 §3 的「未来的门」新增独立模块，
  编译到 `EvalOp` 原语。
