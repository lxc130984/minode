# 05 · 架构与工程规范

本篇给出分层、数据流、store 分层、技术选型、测试策略与复杂度预算，
以及「要不要写一个 Lisp 解释器」的完整决策。

## 1. 分层与依赖方向

```
components/   渲染与交互（只调用 store）
     │
stores/       唯一状态编排（单一 Pinia store，按职责分三个文件，D-32）
     │
engine/       纯逻辑：求值 / 匹配 / 归一化 / 物品库存 / 分解 / 存档 / 拖拽守卫
     │
content/      唯一内容包：items/nodes/recipes/config/demo（内容 id 只在这里）
```

规则：

- **依赖只能向下**。`engine/` 不 import Vue/Pinia/内容/组件——纯 TypeScript，可裸 Node 测试。
- **store 是唯一的可变状态持有者**（单一 Pinia store，D-00 #6）。树、背包、箱子、
  手持、放置模式全在一个 store；不搞多 store 互相引用。
- **组件不写玩法逻辑**：读 store 渲染、调 store 动作。
- **数值只进 config**（03 篇 §3）；**内容 id 只出现在 content/**（D-32）。

```
src/
├── engine/            # 纯逻辑（零框架）
│   ├── types.ts       # GameNode / RetState / Yield / 各 Def 类型全集
│   ├── num.ts         # Decimal 出口 + D()（唯一 import 点，未来可换库）
│   ├── node.ts        # createNode / newNodeId / findNode / subtreeSize / subtreeContains
│   ├── normalize.ts   # computeRet（单节点）/ normalizeTree（全量后序）
│   ├── registry.ts    # buildRegistry：校验 + 预编译签名哈希表 + 单产物反查表
│   ├── match.ts       # 签名键构造（childrenSignatureKey / recipeSignatureKey）
│   ├── eval.ts        # evalNode / findRecipe（手持回落）/ applyOps
│   ├── bag.ts         # 物品库存纯函数 + 成本（canAfford/payCost）+ 分解（decomposeCost）
│   ├── dnd.ts         # guardCycle（duck-typing，可单测）
│   ├── history.ts     # UndoTree（撤销树，纯逻辑）
│   └── save.ts        # serialize / deserialize / v1→v2→v3→v4 链式迁移
├── content/           # 唯一内容包（换目录 = 换游戏）
│   ├── items.ts  nodes.ts  recipes.ts  config.ts
│   ├── demo.ts        # 示例局面/起始物资（内容 id 只出现在这里，D-32）
│   └── index.ts       # export const CONTENT = buildRegistry({...})
├── stores/            # 单一 store（D-00 #6），按职责分文件（D-32）
│   ├── game.ts        # store 主体：状态 + 树写入 + 求值路由 + 建造/回收 + 转移 + 历史/存档
│   ├── display.ts     # 展示纯函数（只读注册表与节点；nameOf/retOf/chipKind/costTextOf…）
│   └── feedback.ts    # 瞬态反馈（hint/pulse/悬停/括号配对/入场标记，按节点 id 分键）
├── components/
│   ├── tree/TreeView.vue      # 根列表（拖拽容器 + 放置模式点击）
│   ├── tree/TreeNode.vue      # 递归节点（chip/括号/折叠/挤压预览）
│   ├── tree/PlacementGhost.vue # 放置模式视觉层（虚影 + FLIP 落点 ghost + 边缘自动滚动）
│   ├── inventory/NodePalette.vue ItemBag.vue ChestPanel.vue
│   ├── hud/StatBar.vue  history/HistoryPanel.vue  debug/DebugPanel.vue
├── utils/
│   ├── format.ts      # 数字格式化（科学计数）
│   └── tree-drop.ts   # DOM 读取（树内拖拽 readDrop / 放置落点 treeZoneAt / 侧栏判定）
└── __tests__/         # 按层拆分（§7）
```

## 2. 数据流

1. **结构变更流**：树内拖拽 `handleDrop → moveTreeNode` / 建造 `place` / 回收 `recycle`
   → 单次写入（先摘后插）→ **增量归一化**（只重算受影响节点与祖先链）→ 渲染自动更新。
2. **求值流**：chip 点击 → `store.chipClick`（放置模式 = 建造；否则**仅当节点构成表达式**
   才 `evalNode`，`heldItem` 作为隐式实参）→ `engine.evalNode`（静态检测含手持 →
   产出物品进背包）→ `feedback.pulse`。
3. **建造流**：选择面板 `startPlacing` → 放置模式（虚影 + FLIP 落点 ghost）→ 左键
   `placeAt` → `payCost` 原子扣费 → 插入节点 + 入场动画 → 保持放置模式。
4. **存档流**：`App.vue` 每 10s 自动保存 + `visibilitychange`/`beforeunload`；启动时读档。

### 2.1 结构写入纪律：单写者 + 摘挂不变量

- **只有 store 能写树**，所有写入都经过 `writeList(parentId, nodes)` 或 `moveTreeNode`：
  传入的节点先各自从原列表**摘下**（树中永不出现重复引用）、防环、增量归一化。
- **拖拽落点权威（D-29/D-30 教训）**：只有树是可拖列表。树内移动以 SortableJS 的
  plan 为准（真实浏览器里 `drop` 正常触发、to/index 可靠）；仅当 plan 退回源列表
  （跨列表 drop 被取消的征兆）而指针在别的列表上时，才用指针落点兜底。
  `utils/tree-drop.ts` 是唯一的 DOM 读取层。
  - ⚠️ **不要读 DOM 顺序**：vue-draggable-plus 在 `on-end` 前已把 DOM 复位。
  - ⚠️ 合成/自动化事件流里 dragend 坐标不可信——别让指针无条件覆盖 plan。
- **一致性自检与自愈**：源属主与模型不符、节点未知、防环拒绝、事件读不出意图 →
  `requestTreeRebuild()`（`renderVersion` +1，Vue 从模型整体重建树 DOM）。
- **放置模式不插真实 DOM 进预览**：ghost 是命令式管理的外来元素（`.place-ghost`），
  每次指针移动重新插位；真实拖拽开始时立即摘除，避免污染 SortableJS 的列表项映射。

## 3. 解释器决策：不写 Lisp，写「应用树求值器」

**结论：不写通用 Lisp 解释器，也不做文本阉割版。** 保留 Lisp 的 `eval/apply` 分离
思想，实现一个领域专用的应用树求值器（engine/eval.ts + match.ts，~200 行）。

**为什么不是 Lisp 解释器**：没有 reader（树由拖拽编辑）；没有任意 eval 需求
（内容是 TS 数据）；性能与确定性（固定哈希派发）；无宏/闭包/quote 需求（这些是语言
特性不是游戏特性）；复杂度预算（§10）。第三方 Lisp 库以文本解析为中心，还得写
树↔文本双向桥，得不偿失。

**保留的 Lisp 遗产**：

```
evalNode ≈ eval（点击表达式）      registry.recipeFor() ≈ apply
ret ≈ 求值结果（静态）             [?] ≈ undefined
手持 ≈ 隐式实参                    () 表示 eval（D-30）
```

**未来的门（脚本节点）**：若将来做「玩家写逻辑」，新增独立 `script/` 模块编译到
`EvalOp` 原语，引擎/注册表/结算器完全不动。条件/循环只存在于脚本模块，不污染内容数据。

## 4. 技术栈与依赖

| 依赖               | 用途                                | 备注                         |
| ------------------ | ----------------------------------- | ---------------------------- |
| vue ^3.5           | UI（递归 SFC 组件）                 |                              |
| pinia ^4           | 单一 store                          |                              |
| vue-draggable-plus | 树内拖拽（SortableJS 封装）         | 参数与坑见 06 篇 §9          |
| break_infinity.js  | Decimal 大数                        | 纪律见 §6                    |
| vite-plus (vp)     | dev/build/check/test（内置 vitest） | 测试从 `vite-plus/test` 导入 |

刻意不引入：UI 组件库、图标库、CSS 框架、状态工具库、Lisp 库。

## 5. 大数纪律

- 一切游戏数量（物品/成本/产物）用 Decimal；结构量（下标/深度）用 number。
- **替换式更新**：禁止原地 mutator（共享引用污染极难排查）。
- 全仓 Decimal 只从 `engine/num.ts` import，`D(v)` 归一化（换库只动一个文件）。

## 6. 存档与部署

- 存档：`localStorage` 单键 `minode-beta/save`，v4 纯 JSON（01 篇 §8 / 04 篇 §6）；
- 部署：GitHub Pages——推送到 `main`/`master` 触发 `.github/workflows/deploy.yml`
  （测试 → `vp run build` → 发布 `dist/`）；项目页自动带 `/仓库名/` base
  （`vite.config.ts` 的 `GITHUB_PAGES` 环境变量）。

## 7. 测试策略（89 个用例）

| 层     | 文件                                    | 测什么                                                                               |
| ------ | --------------------------------------- | ------------------------------------------------------------------------------------ |
| engine | match.spec / normalize.spec / eval.spec | 签名（两模式互不串味）、返回值、符号无响应、手持隐式实参（命中/回落/补位）           |
| engine | deep.spec                               | 四层链静态检测沿树向上、点击只产出被点表达式、[?] 传染                               |
| engine | registry.spec / bag.spec / save.spec    | 校验错误、库存纯函数（容量/扣费/分解/环安全）、v4 round-trip + v1/v2/v3 迁移         |
| engine | dnd.spec / history.spec                 | 防环守卫（duck-typing 桩）；undo 树全生命周期                                        |
| stores | store.spec                              | 集成：点击语义（()/裸符号）、建造/回收守恒、放置模式、箱子转移、树内拖拽、折叠、undo |

关键技巧：最小内容包 fixture（不依赖真实内容）；语义钉子（符号无响应、
`()` 才可 eval、`[?]` 传染、建造原子性、回收守恒）每条显式断言；
命令：`vp test`、`vp check`、**`vp run type-check`（vue-tsc，必跑）**、`vp run build`。

⚠️ `vp check` 不检查 `.vue` 脚本类型——漏跑 vue-tsc 会把「调用已删除的 store 方法」
这类死代码放进仓库（项目历史上发生过）。

## 8. 构建顺序（里程碑）

| 里程碑 | 内容                                           | 状态 |
| ------ | ---------------------------------------------- | ---- |
| M0-M4  | 引擎/树渲染/拖拽/求值/背包                     | ✅   |
| M5-M6  | 存档 / 撤销树                                  | ✅   |
| M7-M8  | 生产线模型（物品背包/建造/回收）+ 界面一体化   | ✅   |
| M9     | 内容与工具层级：多工具配方、资源消耗、配方加深 | 🔜   |
| M10    | 连续生产（自动化）：必须先出设计               | 🔜   |
| M11    | 存档迁移函数表、图鉴/解锁                      | 🔜   |

（M9 起的验收见 09 篇。）

## 9. 文档纪律

- **文档与代码同一个 PR 更新**：行为变更必须同时改对应文档小节（01 模型 / 02 求值 /
  03 注册表 / 04 背包建造 / 06 UI / 07 API）；
- 术语先查/先改 [10 篇术语表](10-glossary.md)；关键决策入 08 篇 ADR（先改台账再改代码）。

## 10. 复杂度预算与反模式

- engine ≤ 1200 行、单文件 ≤ 300 行（types.ts 例外）；store 主体 ≤ 900 行
  （D-32 后 ~820 行：状态定义 + 六个写入域天然长，超出先想拆模块而不是加行数）。
- 反模式清单（PR 评审即拒）：
  - 模块级可变单例（注册表、全局状态）；
  - 组件里写玩法逻辑或数值；内容 id 出现在 content/ 之外；
  - 逻辑代码里的裸数值字面量；数据里出现嵌套条件/表达式/循环；
  - Decimal 原地 mutator；对整树 `deep watch`；
  - 文档与代码不同步。

## 11. 检查清单

- [ ] engine 无 Vue/Pinia/content import
- [ ] 组件无玩法逻辑；store 是唯一可变状态；内容 id 只在 content/
- [ ] 新数值进 config；新规则进注册表；新原语走四步流程
- [ ] `vp check` + `vp run type-check` + `vp test` 全过；新语义有钉子测试
- [ ] 文档与代码同步更新
