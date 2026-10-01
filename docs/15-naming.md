# 15 · 开发名词规范(命名法)

> 目的:让"文档、代码、对话、给 AI 的需求"使用同一套词。
> **效力**:新代码/新文档/新需求一律用本表;旧词只出现在历史叙述(11-pitfalls)里。
> 本表与 12-glossary(玩家/设计视角)互补——12 讲"是什么",15 讲"怎么叫、怎么命名"。

## 1. 核心概念(权威定名)

### 1.1 世界与交互

| 定名 | 代码标识 | 一句话定义 | 禁用的旧叫法 |
|---|---|---|---|
| 节点 | `GameNode` | 一切游玩元素的唯一形态(世界/背包里挂着的东西) | 物品、条目、方块 |
| 世界 | `"world"` / `game.nodes` | 主面板的节点树根列表 | 主界面 |
| 背包 | `"backpack"` / `game.backpack` | 分屏面板的节点树根列表 | 物品栏、储区、库存 |
| 板 | `BoardId` | 一个 NodeBoard 面板实例(现 world/backpack,可扩展) | 面板(单指浮层时用"浮层") |
| click | `dispatchClick(node, source)` | 一次带来源的点击事件,沿树向下传播的唯一口径 | 触发、triggerNode、点击分发 |
| 来源 | `source` | click 的发出者:`"hand"`(空手)或某节点 type | 点击者 |
| 接收者 | —— | click 到达的节点;工作挂在接收者身上 | 目标(仅交互表键里保留 target 一词) |
| 传导 | forward(实现为递归 dispatch) | 节点把「来源=自己」的 click 发给每个子节点 | 转发、传播 |
| 断链 | `emitReject` → `.rejected` | click 传到某节点断了(接收不了/忙碌/被占用/挥空),行灰闪 | 失败反馈、fx |
| 瞬时传导 | —— | 自己没活干(查表无产出条目)时立刻下传的节点行为(工具) | relay(已废弃的字段设想) |
| 风味 | flavor = `results: []` | 交互表条目"接受但无产出"的回应文本 | 空交互 |

### 1.2 工作与时间

| 定名 | 代码标识 | 一句话定义 | 禁用的旧叫法 |
|---|---|---|---|
| 工作 | `WorkJob` | 接收者身上的一条耗时记录(进度条数据源) | 任务、冷却 |
| 工作种类 | `WorkKind` = `click`/`explore`/`craft`/`cycle` | 到点结算走哪段逻辑 | interact(已改名 click) |
| 工作时长 | `NodeDef.workMs` | 接收者做一次事多久;工具的 workMs=它驱动的工作节奏 | 冷却时间 |
| 忙碌 | busy(`workOf(id)` 命中) | 节点有进行中的工作,click 灰闪落空 | CD 中 |
| 占用 | occupied(`occupierOfWorkingAncestor`) | 祖上有 click/craft 工作,本节点是流程参与物(置灰) | 锁定 |
| 计时循环 | `kind: "cycle"` | 自触发节点的可见节拍(常驻进度条),每圈向子节点发一轮 click | 自触发计时、autoTriggerAt |
| 驱动 | drive(手动/循环到点发 click) | 自触发节点向子节点发 click 的动作 | —— |
| 就位 | `autoTriggerReady`(poweredBy) | 自触发节点挂在指定父类型下、循环才会跑的状态 | 激活 |

### 1.3 堆叠与容量

| 定名 | 代码标识 | 一句话定义 | 禁用的旧叫法 |
|---|---|---|---|
| 堆 | pile | 背包里「根 + 同类直接子叶」的整体;数量 = 1 + children.length | 物品堆叠树 |
| 展平 | `normalizePile` | 落库整理:堆规约回不变量(展平/填满/溢出) | 展开、拆堆 |
| 堆叠上限 | `NodeDef.maxStack` | 背包一堆的最大件数(缺省 ∞) | —— |
| 处理上限 | `NodeDef.maxProcess` | 世界一个节点最多同时挂几个**直接**子节点(缺省 ∞) | 挂载上限 |
| 溢出 | overflow | 展平后超出上限的单件,重堆到别处 | —— |
| 堆叠容器 | `.stack-root` 样式 | 堆父节点的"盒子"视觉(整堆不可拖进世界) | —— |
| (历史)堆根/递归容量 | `stackRootOf`/`canAbsorb` | 已随展平不变量退役,只在 11 §2 讲历史时出现 | 不要再用来指现状 |

### 1.4 内容与注册

| 定名 | 代码标识 | 一句话定义 | 禁用的旧叫法 |
|---|---|---|---|
| 内容 | content | 一切可注册的东西:节点定义 + 交互 + 配方 | —— |
| 节点定义 | `NodeDef` | 一个节点**类型**的声明(id/name/icon/…) | 物品定义、item |
| 交互 | `Interaction`(键 `"source>target"`) | 一类 click 到一类接收者的结算规则(产出或风味) | 事件、反应 |
| 配方 | `Recipe` | 合成台消耗/产出的声明 | 合成表(表指 UI:RecipeDialog) |
| 内容包 | `ContentPack` + src/content/*.ts | 一批内容的注册单元 | 扩展、mod(除非真指运行时) |
| 注册 | `registerContent`/`registerNode`/… | 把内容放进注册表(注册即校验) | 添加、注入 |
| 注册表 | `registry.ts` 的 NODE_DEFS/INTERACTIONS/RECIPES | 引擎唯一认的运行时容器 | —— |
| 体检 | `minode.validate()` | 全量检查引用与数值,返回问题列表 | 校验(单条叫校验) |

### 1.5 界面(浮层,与"板"区分)

| 定名 | 代码/状态 | 打开方式 |
|---|---|---|
| 图鉴 | `ui.codexOpen` | TopBar 按钮 / view-toggle 节点 / `ui.toggleCodex()` |
| 检查器 | `ui.inspOpen` + `game.selectedId` | 行尾 ⋯ 按钮(`openInspector`) |
| 配方选择 | `ui.recipeOpen` | 合成台行的 ⚙ 按钮 |
| 日志 | `ui.logOpen` | 状态栏最新日志按钮 |
| 背包分屏 | `ui.backpackOpen` | 世界「背包」节点的触发按钮 |

## 2. 代码标识符约定

| 对象 | 约定 | 示例 |
|---|---|---|
| `NodeDef.id` / `GameNode.type` | 小驼峰英文,**一经发布不改名**(存档/交互键/图标键都引用它;改名=断档) | `stoneAxe`、`copperOre` |
| 交互来源/目标 | `"hand"` 或 def.id;键写作 `"source>target"` | `"stoneAxe>forest"` |
| 图标键 | = assets/icons/ 文件名(去扩展名),与 def.id 同名最优 | `copperOre.png` → `icon: "copperOre"` |
| 内容包文件 | `src/content/<主题>.ts`,小写英文 | `bronze.ts`、`farming.ts` |
| 配方 id | `<产物>-<限定>` 小驼峰 | `stone-axe`、`smelt-copper` |
| `Category` 四值 | `terrain` / `material` / `tool` / `functional`,别造新值(图鉴分组硬编码) | —— |
| `WorkKind` / behavior `kind` | 引擎枚举,加值=改引擎,内容层别碰 | —— |
| 显示名 `name` | 中文,图鉴/行内显示;可以随意改 | `石斧` |
| 注释/日志/文档用语 | 全部用 §1 的定名 | —— |

## 3. 一致性自查(写完代码/文档后)

- [ ] 全文没有出现 §1 右列的禁用旧词(历史叙述除外)?
- [ ] 新 def.id 与图标键、交互键、配方引用一致?
- [ ] 文档里引用的函数名在 src 里真实存在(grep 过)?
