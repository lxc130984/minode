# 05 · 架构与工程规范

本篇给出分层、数据流、技术选型、以及「要不要写一个 Lisp 解释器」的完整决策。
目标是长期可维护：内容持续膨胀、引擎保持小。

## 1. 分层与依赖方向

```
components/   渲染与交互（只调用 store）
     │
stores/       唯一状态编排（game.ts）
     │
engine/       纯逻辑：注册表 / 求值 / 结算 / 节点背包 / 归一化 / 存档 / 拖拽守卫
     │
content/      唯一内容包：Node/Resource/Recipe/Eval/Config 数据（+少量处理器）
```

规则：

- **依赖只能向下**。`engine/` 不 import Vue/Pinia/内容/组件——纯 TypeScript，可裸 Node 测试。
- **store 是唯一的可变状态持有者**。树、节点背包、资源仓库、手持、反馈集合全在一个 store；
  不搞多 store 互相引用。
- **组件不写玩法逻辑**：读 store 渲染、调 store 动作、声明交互守卫；
  文本与布局逻辑放 06 篇规定的 CSS/计算属性里。
- **数值只进 config**（03 篇 §3）。

```
src/
├── engine/            # 纯逻辑（零框架）
│   ├── types.ts       # GameNode / RetState / EvalOp / Defs 类型全集
│   ├── num.ts         # Decimal 出口 + D()（唯一 import 点，未来可换库）
│   ├── node.ts        # createNode / newNodeId / findNode / subtreeSize
│   ├── normalize.ts   # computeRet（单节点）/ normalizeTree（全量后序）
│   ├── registry.ts    # buildRegistry：校验 + 预编译配方派发表
│   ├── match.ts       # 签名键构造（childrenSignatureKey / recipeSignatureKey）
│   ├── eval.ts        # evalNode / findRecipe / applyOps（点击单节点求值，手持=隐式实参）
│   ├── bag.ts         # 物品库存纯函数（bagAdd/bagTake/canAfford/payCost/bagTotal）
│   ├── dnd.ts         # guardCycle（duck-typing，可单测）
│   ├── history.ts     # UndoTree（撤销树，纯逻辑）
│   └── save.ts        # serialize / deserialize / v1→v2→v3 链式迁移
├── content/           # 唯一内容包（换目录 = 换游戏）
│   ├── nodes.ts  resources.ts  recipes.ts  config.ts
│   └── index.ts       # export const CONTENT = buildRegistry({...})
├── stores/game.ts     # 唯一 store
├── components/
│   ├── tree/TreeView.vue     # 根列表（拖拽容器 + 放置模式点击）
│   ├── tree/TreeNode.vue     # 递归节点（chip / 折叠 / 子列表 / 挤压预览）
│   ├── tree/PlacementGhost.vue # 放置模式虚影（跟随指针）
│   ├── inventory/NodePalette.vue ItemBag.vue ChestPanel.vue
│   ├── hud/StatBar.vue       # 顶部信息条（手持/提示）
│   ├── history/HistoryPanel.vue
│   └── debug/DebugPanel.vue  # 调试（补货/示例树/重置）
├── utils/
│   ├── format.ts        # 数字格式化（科学计数）
│   └── tree-drop.ts     # DOM 读取（树内拖拽 readDrop / 放置落点 treeZoneAt / 侧栏判定）
└── __tests__/           # 按层拆分
```

## 2. 三条数据流

1. **结构变更流**：树内拖拽 `handleDrop → moveTreeNode` / 建造 `place` / 回收 `recycle`
   → 单次写入（摘挂 + 插入）→ **增量归一化**（只重算受影响节点与祖先链）→ 渲染自动更新。
2. **求值流**：chip 点击 → `store.chipClick`（放置模式 = 建造；否则 `evalNode`，
   `heldItem` = 选中背包物品）→ `engine.evalNode`（只有被点节点执行：配方检测含手持
   隐式实参 → 产出物品进背包）→ `pulse([node.id])`。
3. **建造流**：选择面板 `startPlacing` → 放置模式（虚影 + 挤压预览）→ 左键 `placeAt`
   → `payCost` 原子扣费 → 插入节点 → 保持放置模式。
4. **存档流**：`App.vue` 每 10s 自动保存 + `visibilitychange`/`beforeunload` 时保存；启动时读档。

### 2.1 结构写入纪律：单写者 + 摘挂不变量

- **只有 store 能写树**，且所有写入都经过 `writeList(parentId, nodes)`：
  传入节点先各自从原列表**摘下**，再整列写入。
  - 不变量：**同一节点对象在树中只出现一次**。旧实现让「跨列表移动」退化成
    「复制到目标、原处残留」——那正是「配方经常错检测 / 拖拽拖不动」的根因（重复 id 让
    Vue 的 keyed diff 与 SortableJS 的元素映射双双失配）。
- **拖拽与放置的落点（D-26）**：只有树是可拖列表。树内移动用 SortableJS 的 `newIndex`
  （树允许预览，值可靠）；放置模式的落点（`treeZoneAt`）与「拖到侧栏 = 回收」
  （`pointerOverSidebar`）一律问指针。`utils/tree-drop.ts` 是唯一的 DOM 读取层。
  - ⚠️ **不要读 DOM 顺序**：vue-draggable-plus 会在 `on-end` 之前把 DOM 复位，
    读到的是复位前顺序（落位会静默变成空操作）。
  - ⚠️ **放置模式不插真实 DOM**：挤压预览用 `place-gap-*` 的 margin 让位（06 篇 §9 坑 4）。
- **一致性自检与自愈**：落位请求里的源属主与模型父节点不符、节点未知、防环拒绝、
  事件读不出意图 → `requestTreeRebuild()`（`renderVersion` +1，Vue 从模型整体重建树 DOM）；
  这也等价于「手动折叠展开一次」的那种恢复。

### 2.2 值模型：一个域，一张派发表

- 节点值域只有一种形状：`RetState = none | unresolved | value{items: ItemAmount[]}`。
  符号 = `value`（自身 ×1）；函数 = 命中配方的产物，未命中 = `unresolved`（显示 `[?]`）。
- **派发表在注册表构建期预编译**：`Map<NodeTypeId, { modes, byKey: Map<'模式::签名', RecipeDef> }>`。
  归一化（`computeRet`）与点击求值（`EvalApi.findRecipe`）共用同一张表——
  不再有「每个节点 × 每条配方现场拼签名串」的线性扫描，也没有两条会走偏的检测路径。
- 签名键有两种模式（multiset / ordered），键前缀带模式 → 两种模式永不互相命中。

### 2.3 增量归一化

- `afterStructureChange(affected?)`：给了 `affected` 就只重算这些节点**及其祖先链**
  （`parentOf` 索引提供父链，O(深度)）；不给就全量后序（启动 / 读档 / 兜底）。
- 移动子树时子树内部值不变（只换了父），所以只需要重算「新旧两个列表属主 + 各自祖先」；
  这条正是「搬走一个实参后祖先链的 `[]` 没刷新」的防线（`store.spec` 有回归用例）。
- ⚠️ **种子必须深者优先**：新节点是作为某父节点的实参插进去的，父节点要读到子节点的**新** `ret`；
  若先算父再算子，父会被 `done` 集合挡掉、留下按旧值算出的结果（D-14 落地时真踩过一次，
  `refreshValues` 现在按父链深度降序处理种子）。

## 3. 解释器决策：不写 Lisp，写「应用树求值器」

**结论：不写通用 Lisp 解释器，也不做它的文本阉割版。**
我们保留 Lisp 的 `eval/apply` 分离思想，实现一个**领域专用的应用树求值器**
（估计 300-500 行，含结算），它是引擎的一部分，不是独立语言。

需求盘点（用户给的全部玩法诉求 → 对应的引擎能力）：

| 诉求                     | 需要的机制                            |
| ------------------------ | ------------------------------------- |
| 父节点=函数、子节点=实参 | 静态签名检测 + 处理器分发（registry） |
| 结果沿树向上确定         | `ret` 派生记录 + 传染（`[?]`）        |
| 点击 = 一次 eval         | `evalNode`（单节点、有界）            |
| 求值有种类（手持工具）   | 通道候选 × 两轴注册表                 |
| `[?]` 未定义             | `unresolved` 状态（不是错误）         |
| 配方可多、可判定         | 签名匹配（multiset/ordered）          |
| 符号不可点击             | 没有处理器 → 无响应                   |
| 大量内容                 | 内容包 + 校验 + 稳定 id               |

**为什么不是 Lisp 解释器（完整版）**：

1. 没有 reader 需求——树由**拖拽**编辑，不解析文本；写 reader 是纯粹的无用复杂度。
2. 没有 `eval` 任意代码的需求——内容由我们以 TypeScript 提供（类型检查、IDE、打包齐全）；
   玩家不写代码，所以没有沙箱/安全/资源限制问题。
3. 性能与确定性：一次点击可能触碰深树，固定处理器分发比通用解释器（环境对象、
   符号查找、GC 压力）更快、更可预测。
4. 无宏/闭包/quote/环境链的需求——这些是语言特性，不是游戏特性。
5. 可调试性：TypeScript 调用栈 + 类型错误 > 自研语言的运行时错误。
6. 复杂度预算（§10）：真正需要的是 ~300-500 行的求值器，而不是 2k+ 行的语言实现。

**第三方库评估（明确不用）**：`lispy`/`@jcubic/lips`/`sexp-parser` 等——要么以文本
解析为中心（我们无文本），要么实现为完整 REPL 环境（体积、异步、调试体验都不可控），
要么无维护。引入后还要为「树 ↔ 文本」写双向桥，得不偿失。

**「阉割版」保留的 Lisp 遗产**（这些才是我们要的）：

```
evalNode ≈ eval（单节点）        registry.handler() ≈ apply
ret ≈ 求值结果（静态）           [?] ≈ undefined
EvalOp ≈ 原语化的求值效果        EvalContext ≈ 环境（只读+随机源）
```

**未来的门（脚本节点）**：如果将来真要做「玩家写逻辑」的玩法，
正确路径是新增独立的 `script/` 模块（文本 → 自研/第三方迷你语言 → 编译成 `EvalOp`
序列），按沙箱权限注入 `EvalContext`；**引擎、注册表、结算器完全不动**。
条件/循环等语言特性只存在于脚本模块里，不污染内容数据（alpha 教训：
数据里出现 if/else 的那天，就是失控的开始）。

## 4. 技术栈与依赖

| 依赖               | 版本    | 用途                                | 备注                         |
| ------------------ | ------- | ----------------------------------- | ---------------------------- |
| vue                | ^3.5.42 | UI（递归 SFC 组件）                 | 已装                         |
| pinia              | ^4.0.3  | 单一 store                          | 已装                         |
| vue-draggable-plus | ^0.6.1  | 嵌套 + 跨层拖拽（SortableJS 封装）  | 已装；参数与坑见 06 篇       |
| break_infinity.js  | ^2.2.0  | Decimal 大数                        | 已装；纪律见 §5              |
| vite-plus          | 1.0.0   | dev/build/check/test（内置 vitest） | 测试从 `vite-plus/test` 导入 |

刻意不引入：UI 组件库、图标库、CSS 框架、状态工具库、Lisp 库（§3 理由）。

## 5. 大数纪律

- 一切数量/速率/容量用 Decimal；从第一天就用（迁移成本远高于起始成本）。
- **替换式更新**：只允许 `node.ret = ...`、`nodeBag.value = [...]`、`resources.value = {...}` 这类新实例赋值；
  **禁止** `fromNumber`/`fromString` 等原地 mutator（共享引用污染极难排查）。
- 全仓 Decimal 只从 `engine/num.ts` import；`D(v)` 归一化 number/string。
  （将来若要换 `break_eternity.js`，只动这一个文件。）
- 结构量（下标、步数、节点背包格数）用 number；游戏量（数量）用 Decimal。

## 6. 存档

- `SaveV2`（01 篇 §8；v1 自动迁移）；`localStorage` 单键 `minode-beta/save`；
  自动保存：10s 间隔 + `visibilitychange`。
- 载入流程：`parse → migrate → 重建 id → normalizeTree → 未知内容隔离`。
- 迁移函数表按 `v` 递增；将来提供导出/导入文本（预留）。
- **撤销树**（07 篇 §4.4）：局面历史不写进存档——每个历史节点是一份**完整局面快照**，
  保存的一定是当前节点；读档后历史重建为单节点。快照格式与存档同构（`serialize`/`deserialize`）。

## 7. 测试策略

| 层     | 文件                                    | 测什么                                                                         |
| ------ | --------------------------------------- | ------------------------------------------------------------------------------ |
| engine | match.spec / normalize.spec / eval.spec | 签名（两模式互不串味）、派发表命中、符号无响应、手持隐式实参（命中/回落/补位） |
| engine | deep.spec                               | 四层链静态检测沿树向上、点击只产出被点节点、[?] 传染、宽+深签名                |
| engine | registry.spec / bag.spec / save.spec    | 校验错误、容器纯函数（含 bagRearrange）、序列化 v3 round-trip + v1/v2 迁移     |
| engine | dnd.spec                                | 防环守卫（duck-typing 桩对象，无 DOM）                                         |
| engine | history.spec                            | undo 树：线性 record/undo/redo、去重、分叉、amend 合并、容量裁剪               |
| utils  | drop-action.spec                        | 落位路由矩阵（纯函数：merge/swap/placeOne/stow/moveTree/cycle 拒绝）           |
| stores | store.spec                              | 集成：点击链、手持点击、三动词、落位守恒、落位摘挂不变量、增量归一化、undo 树  |

关键技巧：

- **最小内容包 fixture**：测试用 `buildRegistry(minimal)`，不依赖真实内容；
- **语义钉子**：符号无响应、点击只 eval 被点节点、`[?]` 传染、收起/落位守恒——每条都有显式断言；
- 命令：`vp test`、`vp check`（fmt+lint）、**`vp run type-check`（vue-tsc，必跑）**、`vp run build`。
  ⚠️ `vp check` 不检查 `.vue` 脚本类型——漏跑 vue-tsc 会把「调用已删除的 store 方法」这类
  死代码放进仓库（项目历史上发生过）。

## 8. 构建顺序（里程碑与验收）

| 里程碑 | 内容                                      | 验收                                               |
| ------ | ----------------------------------------- | -------------------------------------------------- |
| M0     | engine：类型/num/registry/match/normalize | 单测：一条链（矿+煤+氧→铁）的签名与 ret 正确       |
| M1     | 树渲染（静态）：chip 文本/折叠/空态       | 与 06 篇 §2 示例逐字一致                           |
| M2     | 拖拽：嵌套容器/跨层/防环/树 ↔ 背包移动    | e2e：重排、跨层、拖入后代被拒                      |
| M3     | 求值：点击 eval / 通道 / 结算 / pulse     | 符号无响应、函数命中产出按路由结算                 |
| M4     | 节点背包/资源仓库：槽位/手持/放置/收起    | 守恒检查通过；产出路由正确                         |
| M5     | 存档：serialize/deserialize/autosave      | round-trip 单测 + 手动刷新验证                     |
| M6     | 撤销树：UndoTree + 历史面板 + 快捷键      | 撤销/重做/分叉/穿梭 + 拖拽合并成一步（07 篇 §4.4） |

M0-M4 是「可玩骨架」的定义；M5 之后进入内容与数值扩张阶段。
（历史上的「自动化」设计已按需求移除：**点击是唯一的 eval 入口**。）

**当前进度**：M0-M6 全部落地——引擎 + 100 个单测（纯表达式语义：无节点内存储、无自动化）、
六层加工链内容 + 矿井 + 森林/斧头（手持隐式实参演示，D-25）、
树渲染/折叠（语法高亮：函数/符号/工具分色，深度只降亮度）、嵌套与跨层拖拽（零回流 + 单写者落位）、
**容器交互重构（D-24：三动词 + 统一落位规则 + 纯函数路由）**、
点击 eval（只有函数响应，手持参与检测，产出按路由结算）、左侧节点背包 + 资源仓库、
localStorage 存档、撤销树（分叉 + 穿梭）。引擎侧：配方派发预编译为哈希表，
归一化增量到「受影响节点 + 祖先链」。
性能基线：400 节点点击到下一帧 ≈ 1 帧（16.7ms）；反馈状态必须保持按节点分键（02 篇 §7）。

## 9. 与 alpha 的关系

**借鉴**（UI 与工程经验，不涉及引擎思路）：

- 06 篇的美术规范（色板/密度/反模式清单）、布局与排序算法、拖拽参数与坑清单；
- 「效果原语 + 内容包」的数据化哲学（引擎小、内容大）；
- pulse 反馈的重入坑、数字格式化规则、Decimal 纪律。

**明确不借鉴**：

- alpha 的引擎核心：节点身份 = 子节点身份多重集、两跳点击派发——与本作
  「父=函数、子=参数、点击=求值子树」是不同模型；
- 模块级可变注册表（本作实例化，见 03 篇）；
- 「没有独立背包」的设定（本作有节点背包与资源仓库，见 04 篇）；
- 文档与代码漂移（alpha README 与实际内容包不一致）——本作规定：
  **文档与代码同一个 PR 更新**，行为变更必须同时改 01/02/03 的对应小节。

alpha 的「失败根因」在仓库内没有复盘文档（已穷尽检查：无相关 commit/文档），
本作的相应对策是把「设计规范文档化 + 里程碑验收」作为流程，而不是复刻猜测。

## 10. 复杂度预算与反模式

- engine ≤ 1200 行、单文件 ≤ 300 行（types.ts 例外）；超预算先想「是不是该加原语/拆内容」。
- 反模式清单（PR 评审即拒）：
  - 模块级可变单例（注册表、全局状态）；
  - 组件里写玩法逻辑或数值；
  - 逻辑代码里的裸数值字面量；
  - 数据里出现嵌套条件/表达式/循环；
  - Decimal 原地 mutator；
  - 对整树 `deep watch`（统计一律 computed 派生，树规模 <1e3 时直接遍历）；
  - 文档与代码不同步。

## 11. 检查清单

- [ ] engine 无 Vue/Pinia/content import（lint 或脚本可查）
- [ ] 组件无玩法逻辑；store 是唯一可变状态
- [ ] 新数值进 config；新规则进注册表；新原语走四步流程
- [ ] `vp check` + `vp test` 全过；新语义有钉子测试
- [ ] 文档与代码同步更新（01/02/03/06 对应小节）
