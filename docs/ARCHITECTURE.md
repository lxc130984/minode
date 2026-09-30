# minode 架构文档(AI 交接版)

> 本文档面向接手开发的 AI 或工程师,力求完整描述当前架构、每一处不变量(invariant)、
> 历史上踩过的坑及其解法。**修改代码前请先通读本文,尤其是「核心不变量」与「已知坑」两节。**
>
> - 线上:<https://lxc130984.github.io/minode/>
> - 仓库:`git@github.com:lxc130984/minode.git`,分支 `main`,推送即自动部署
> - 技术栈:Vue 3(`<script setup>` + TS)+ Pinia(持久化)+ Element Plus + lucide-vue-next
>   + SortableJS(经 vue-draggable-plus)+ Vite;Tauri 桌面壳(可选,不影响网页逻辑)

---

## 1. 游戏是什么(设计哲学)

一个"点击 + 增量 + 文字冒险"游戏。三条铁律:

1. **一切游玩元素皆节点**:世界、背包、物品,全部是同一形态的 `GameNode`,组成树。
   "节点之于 minode,如同方块之于 Minecraft"。
2. **两个原语**:点击(触发交互)与拖拽(组织树)。没有其他操作。
3. **点击有方向**:点击来源(source)× 点击目标(target)→ 查交互表得产出。
   点击**父节点**时,父为 source、逐个子节点为 target 依次触发;
   点击**叶子节点**时空手(hand)为 source。

当前内容:探索节点(定时概率产地形)、手工合成节点(按配方消耗子级材料)、
森林/河流地形、木棍/石子/木头材料、石斧工具;配方:3 石子 + 2 木棍 → 石斧。

## 2. 目录结构

```
src/
├─ main.ts                 # 入口:存档完整性校验 → pinia(+persist)→ ElementPlus → 挂载;DEV 下暴露 window.__game / window.minode
├─ App.vue                 # 布局壳 + 游戏心跳(1s) + 移动端边缘滑动 + 图鉴浮窗/抽屉/对话框
├─ game/                   # 纯逻辑层(不含 Vue 组件)
│  ├─ types.ts             # 数据模型:GameNode/NodeDef/行为联合类型/nodeCount 等
│  ├─ registry.ts          # 内容注册表(shallowReactive):节点定义/交互表/配方/图标
│  ├─ tree.ts              # 树纯函数:findNode/removeNode/isAncestorOf/walkNodes/countNodes/hasType
│  ├─ dnd.ts               # 拖拽:SortableJS group 工厂、@add 处理、DND_COMMON 选项
│  └─ api.ts               # 运行时扩展 API:registerNode/registerInteraction/registerRecipe…
├─ stores/
│  ├─ game.ts              # 主 store(约 800 行):状态/getters/全部游戏动作 + 存档
│  └─ ui.ts                # 界面开关(不持久化):backpackOpen/codexOpen/inspOpen/logOpen/recipeOpen
├─ components/
│  ├─ NodeBoard.vue        # 节点面板基本组件(board 属性区分世界/背包,双分支直绑 store 数组)
│  ├─ NodeItem.vue         # 递归行节点:渲染 + 子列表拖拽 + 折叠 + 堆徽标/省略号 + 点击分发
│  ├─ NodeIcon.vue         # 图标(def.icon → registry.ICONS,带 accent 着色)
│  ├─ CodexView.vue        # 图鉴(分组)+ 上手指南(浮窗内容)
│  ├─ Inspector.vue        # 检查器抽屉内容(选中节点详情 + 收纳/放置/移除按钮)
│  ├─ RecipeDialog.vue     # 配方选择对话框(按 category 分组)
│  ├─ LogConsole.vue       # 日志面板(底部抽屉)
│  ├─ TopBar.vue           # 品牌 + 图鉴开关 + 菜单(导出/导入/重置)
│  └─ StatusBar.vue        # 状态栏:节点数/物品数/时长 + 最新日志(点击开日志抽屉)
└─ styles/main.css         # 全局主题(护眼浅绿)+ 拖拽虚影 + 底部样式变量
```

`.github/workflows/deploy.yml` = Pages 部署;`vite.config.ts` 的 `base: "/minode/"` 勿删。

## 3. 数据模型(src/game/types.ts)

### 3.1 GameNode —— 一切的基本单元

```ts
interface GameNode {
  id: string        // "n<递增数字>",uid 发号器在 store,存档校验会检查 uid ≥ 最大后缀
  type: string      // 对应 registry 里 NodeDef.id
  children: GameNode[]
  collapsed?: boolean  // 默认折叠(makeNode 造出来就是 true),获得子节点时自动展开
}
```

**没有 count 字段**(已删除)。数量语义:

- **每个节点 = 1 件物品**;
- 一堆同类物品 = 一个父节点挂着若干同类子节点(可多层嵌套);
- `nodeCount(n) = 1 + Σ nodeCount(children)`(**子树大小 = 堆的数量**);
- `isStack(n)` = 所有后代都与自己同类(背包里判断"这是不是一个纯堆"用于显示 ×N 徽标)。

### 3.2 NodeDef —— 节点类型定义(内容的核心扩展点)

```ts
interface NodeDef {
  id: string
  name: string
  category: "terrain" | "resource" | "tool" | "functional"  // 图鉴分组
  icon: string                 // registry.ICONS 的键
  desc: string
  accent?: string              // 视觉主色(css color),图标与名称着色 = 材质自定义入口
  worldOnly?: boolean          // 仅世界(地形/探索); zones 的简写
  zones?: NodeZone[]           // 允许区域:["world"|"backpack"];缺省=worldOnly?["world"]:全部
  noChildren?: boolean         // 不渲染子列表/折叠钮(背包节点),即"不可挂载子节点"
  permanent?: boolean          // 不可移除(探索/手工合成/背包节点)
  maxStack?: number            // 一堆同类物品最大件数(缺省不限);材料=64,石斧=1
  behavior?: NodeBehavior      // 功能节点的声明式行为
  slots?: SlotSpec[]           // (预留)结构化子槽位,如工厂的"输入/输出"
  tags?: string[]
}
```

### 3.3 NodeBehavior —— 声明式行为(点击分发依据)

```ts
type NodeBehavior =
  | { kind: "explore"; durationMs; successRate; pool: {type, weight}[] }  // 定时概率产地形到自身子级
  | { kind: "craft" }            // 按当前配方检测自身子级材料并合成
  | { kind: "factory"; ... }     // (预留,勿删)
  | { kind: "view-toggle"; view: "backpack" | "codex" }  // 点击开合界面(背包节点)
```

**无 behavior 的节点** = 普通节点,点击走"父触发子 / 空手"传导。

### 3.4 Interaction / Recipe

```ts
interface Interaction {        // 交互表条目,键 = "source>target"
  source: string               // 节点 type 或 "hand"
  target: string
  results: { type; chance; count? }[]  // 顺序判定,首个命中生效;空数组=纯风味文本
  note: string                 // 文字冒险风味的日志文本
}
interface Recipe { id; category?; inputs: ItemStack[]; output: ItemStack }
```

## 4. 内容注册表(src/game/registry.ts)

**所有集合都是 `shallowReactive`**——这是硬要求:api.ts 运行时注册后,
图鉴分组(CodexView 的 computed)、配方列表、图标必须立即刷新。
新增集合时同样要包 shallowReactive;图标组件用 `markRaw` 包(避免 Vue 代理组件)。

导出内容:

| 导出 | 说明 |
|---|---|
| `ICONS: Record<string, Component>` | 图标名 → lucide 组件(shallowReactive) |
| `NODE_DEFS: NodeDef[]` / `DEF_MAP` / `getDef(type)` | 节点定义表;getDef 对未知 type 返回兜底 def(zones=全部) |
| `zonesOf(type)` / `canPlaceInZone(type, zone)` | 区域权限的唯一判定点 |
| `isPermanent(type)` | 永久节点判定 |
| `INTERACTIONS` / `INTERACTION_MAP` / `findInteraction(s, t)` | 交互表 |
| `RECIPES` / `getRecipe(id)` | 配方表 |
| `rollDrops(interaction)` / `rollPool(pool)` | 概率工具 |

当前内置定义(8 个):explorer(探索,世界,permanent,explore 行为)、
backpackNode(背包,**noChildren**,permanent,worldOnly,view-toggle 行为)、
bench(手工合成,**zones: ["backpack"]**,permanent,craft 行为)、
forest/river(地形,worldOnly)、stick/stone/wood(材料,maxStack 64)、
stoneAxe(工具,maxStack 1)。

## 5. 主 store(src/stores/game.ts)

### 5.1 状态(state,均持久化,除标注外)

```
version(=SAVE_VERSION=5) / nodes(世界根) / backpack(背包根)
selectedRecipeId / exploring / exploringNodeId / exploreEndAt
startedAt / discovered[] / log[](上限200) / logSeq / selectedId / uid
dragging(不持久化;全局拖拽中标记,控制 CSS 投放区显隐)
```

- `gameNow`(模块级 ref,不在 store 内):游戏时钟,由 App 的心跳每秒更新。
  **故意放在 store 外**——放 store 里每秒 tick 会触发持久化插件全量写盘。
- `onClock()` 心跳只做一件事:探索到点结算(`exploring && now >= exploreEndAt`)。
  后台标签页定时器节流会延迟结算,时间戳驱动,回前台即对账(设计如此,非 bug)。

### 5.2 关键 getters

`worldNodeCount` / `itemCount`(背包节点总数)/ `ownedMap`(类型→件数,背包递归)/
`benchNode`(世界找 bench 再背包找)/ `explorerNode` / `benchPiles`(合成台子级材料,**按类型精确计数,每个同类节点计 1**,与消耗口径一致)/ `recipeState` / `exploreCdLeft` / `playSeconds` / `lastLog`。

### 5.3 动作(actions)速览

| 动作 | 语义要点 |
|---|---|
| `clickNode(id)` | 世界∪背包查找;behavior 分发(view-toggle 只选中;explore/craft 传**被点节点**;其余静默);普通节点父触发子/空手 |
| `trigger(s, t)` | 查交互表结算,产出走 addItem |
| `addItem(type, count, silent)` | **按组堆叠**:找"最近一个还能整棵吸收"的同类堆并入,满了开新堆;进不了背包的产物(地形类)直接落世界根;**不自动展开堆**(玩家折叠状态保持,徽标显示总数) |
| `stackIntoBackpack(node)` | 整棵并入背包:找 `canAbsorb` 的同类堆,否则成新根 |
| `placeItem(id)` | "放置到世界" = **一次只放一个**:堆则自己出去、孩子们回背包重堆;单件整体移动 |
| `nodeToItem(id)` | "收进背包" = 整棵收纳:同类子树随行,异类子节点释放背包根,进不了背包的回世界 |
| `detachNode(id)` | 摘下节点,子节点释放回所在树根 |
| `removeNodeById(id)` | permanent 拒绝;否则同 detach |
| `craftBench(bench?)` | 按 recipeState 校验(缺料列出缺口),`takeNodes` 叶优先消耗,**计数与消耗同口径(每同类节点计 1)** |
| `startExplore(node)` / `resolveExplore()` | 行为参数取自**发起节点**的 def(exploringNodeId 记录归属);产地形挂到该节点下并展开 |
| `canDropIntoChildList(dragEl, board, ownerId)` | 拖拽总守卫(见 §7.2) |
| `settleWorldDrop(dropped)` / `settleBackpackDrop(dropped)` | 拖拽落库整理(见 §7.3) |
| `exportSaveData()` / `applySaveData(raw)` | 导出/导入存档(导入先过 isSaveValid) |

### 5.4 存档系统

- `SAVE_VERSION = 5`,`SAVE_KEY = "game"`;**任何破坏存档结构的改动都必须 bump SAVE_VERSION**
  (旧档会被自动重置,这是有意的迁移策略)。
- `ensureSaveIntegrity()` 在 **main.ts 里、pinia 创建之前**调用:不合规存档直接删除。
  必须在 hydrate 前做——否则坏数据会在首帧渲染时崩掉应用。
- `isSaveValid(saved)` 深度校验:version/uid/字段类型/递归节点结构(id 唯一、children 是数组)、
  **不变量**:explorer 与 backpackNode 必须在世界树、bench 必须在背包树、
  背包树不得出现 `canPlaceInZone(t,"backpack")===false` 的类型、uid ≥ 所有 `n<数字>` id 最大后缀。
- 持久化经 `pinia-plugin-persistedstate`,`persist.pick` 白名单(不含 dragging);
  exportSaveData 字段与 pick 一一对应。

## 6. 界面层

### 6.1 布局(App.vue)

```
┌ TopBar:品牌 | 图鉴开关 | 菜单(导出/导入/重置) ┐
│ views: NodeBoard(world,常驻) + NodeBoard(backpack,分屏) │  ← 背包分屏由世界里的「背包」节点开关
└ StatusBar:统计 + 最新日志 ┘
浮层:图鉴浮窗(右上,Transition)、检查器抽屉(右)、日志抽屉(下)、配方对话框
```

- 没有底部导航、没有物品栏(均已删除,历史遗留代码不要再引入)。
- 移动端:左缘右滑开图鉴、右缘左滑开检查器;起点落在 `[data-node-id]` 上时不视为边缘手势。
- 视觉主题:护眼浅绿 + 白,orgro 式全宽行节点(无边框无间隙)、缩进引导线。

### 6.2 NodeBoard / NodeItem

- `NodeBoard` 接 `board: BoardId`,**两条 v-if 分支直接 `v-model="game.nodes"` / `"game.backpack"`**
  (不要改成 computed 中转,历史上出过同步问题)。根列表 `flex:1` 撑满面板——
  否则底部空白不是投放区。
- `NodeItem` 递归渲染:行(点击/选中/fx 脉冲动画/徽标)+ 子列表(VueDraggable)。
  - `noChildren` def:不渲染 twisty 与子列表(背包节点)。
  - 子列表渲染条件 `!node.collapsed || !hasChildren`(折叠的空节点仍渲染投放区)。
  - 背包堆:同类堆(isStack)显示 `×nodeCount` 徽标;子节点只显示前 4 个
    (CSS `nth-child(n+5){display:none}` **占位隐藏,不是不渲染**——保持 SortableJS 索引对齐),
    其后显示"⋯ 还有 N 个"省略行(在 child-list **外部**,`v-if="hiddenCount>0 && !node.collapsed"`)。
  - 点击分发:view-toggle → `ui.toggleBackpack/toggleCodex`;functional 或世界板 → `game.clickNode`;背包板普通节点 → 仅选中。
  - 拖到(拖拽中的)折叠父节点获得子节点时 `onTreeAdd` 自动展开 owner。

### 6.3 ui store(不持久化)

`backpackOpen / codexOpen / inspOpen / logOpen / recipeOpen` + `toggleBackpack/toggleCodex`。

## 7. 拖拽系统(src/game/dnd.ts + store 守卫)★重点★

### 7.1 结构

所有列表(世界根/背包根/每个节点的子列表)共用 group `"minode"`:
`treeGroup(board, ownerId?)` 工厂返回 `{name, pull:true, put:守卫}`。
守卫即 store 的 `canDropIntoChildList(dragEl, board, ownerId)` —— **拖拽合法性的唯一入口**。
(历史上存在过物品栏的 `storageGroup`/`onHotbarAdd`,已随物品栏删除。)

`DND_COMMON`(所有列表共用):`forceFallback:true, fallbackOnBody:true, fallbackTolerance:3,
delay:150, delayOnTouchOnly:true, swapThreshold:0.55, emptyInsertThreshold:12, animation:150`。

**虚影(拖拽跟随体)完全交给 SortableJS 的 fallback 机制**,CSS 只在 `.sortable-fallback`
上微调(收窄宽度/隐藏子树)。不要自绘虚影或用原生 setDragImage(都试过,不好)。

### 7.2 守卫规则(canDropIntoChildList,按序)

1. **区域权限**:`canPlaceInZone(type, board)` → false 拒绝(bench 进不了世界、地形出不了世界…)。
2. **整堆禁入世界**:board=world 且 dragEl 来自背包(`dataset.zone==="backpack"`)且
   带子节点(`querySelector(":scope > ol.child-list .node-wrap")`)→ 拒绝。
   = "一次只放置一个"的拖拽侧实现;**背包内部(挂到手工合成下等)不受此限**。
3. 同类堆规则(board=backpack 且 owner 无 behavior):子级必须同类;
   **容量按堆根判定**(见下);同堆内部整理(总量不变)放行。
4. **防环**:`!isAncestorOf(boardRoots, dragId, ownerId)`(含自身)。

**容量必须按"堆根"判定**(历史上三次翻车的点):
`stackRootOf(roots, node)` 沿**同类祖先**上行找堆根(不越过功能节点——挂在 bench 下的木堆,
其堆根仍是那个木堆);`canAbsorb(pile, whole) = nodeCount(pile)+nodeCount(whole) <= stackLimit`。
即:挂到满堆内部的叶子、或挂在功能节点下的满堆,都无法绕过 maxStack。

### 7.3 落库整理(settle,均在 `setTimeout(0)` 后执行)

`onTreeAdd(board, owner, list, evt)`(树列表 @add)分派:

- **背包→世界**:根级落点打日志;`settleWorldDrop`:堆只留 1 个,余下子节点经
  `stackIntoBackpack` 回背包重堆(放置语义)。
- **任意→背包**(非背包内部移动):`settleBackpackDrop`:递归分拣 dropped 子树——
  进不了背包的回世界根;**普通物品下只保留同类子节点**(异类释放到背包根);
  功能节点的子级不受同类规则限制。堆与堆之间**不做自动合并**(玩家拖一堆到另一堆下即合并)。
- 任何 owner 为折叠态时自动展开。

**为什么 setTimeout(0)**:Sortable 在同一次落盘序列里还会回写源数组,
同步修改会被覆盖并留下 DOM/数组不一致的脏状态;宏任务在 Vue 渲染 flush 之后、
且在 Sortable 全部同步处理之后执行。(副作用:理论上有一帧闪变,可接受,勿改 nextTick。)

### 7.4 SortableJS 相关的硬知识(踩坑实录,务必记住)

- **vue-draggable-plus 内嵌的 Sortable 构建用 `mouseup/touchend` 监听落手,
  不监听 pointerup**(与独立版 sortablejs 不同)。合成事件测试必须用 `MouseEvent('mouseup')` 收尾。
- fallback 模式的插入判定在 **50ms `setInterval(_emulateDragOver)`** 里:
  自动化拖拽必须在目标位置**停留 ≥100ms 再松手**;真人不受影响。
- 拖拽启动走 rAF(`_dragStarted`):**后台标签页 rAF 冻结**会导致拖拽半启动
  (chosen 有、ghost 无),自动化测试时页面必须在前台。
- `:group="treeGroup(...)"` 每次渲染生成新对象会触发库的 option 深更新,实测无碍。
- 空列表投放:`.app.dragging .child-list.is-empty` 的"咬合区"(margin-top 负值)
  让父行下半部也可投放,同时平时不占空间。
- 隐藏堆子节点用 CSS `display:none` 而非切片渲染,保证 newIndex 与数组对齐。

## 8. 扩展 API(src/game/api.ts)

`registerIcon(name, comp)` / `registerNode(def)` / `registerInteraction(i)` /
`registerYield(s, t, results, note)` / `registerRecipe(r)`(同名 id 覆盖)。
DEV 下挂在 `window.minode`。注册即生效依赖 registry 的 shallowReactive(§4)。

**加一个新物品/节点的三步**:① registry.NODE_DEFS 加 def(或运行时 registerNode);
② 需要掉落就加 INTERACTIONS 条目;③ 需要合成就加 RECIPES。图鉴/图标/引擎自动生效。

**加功能节点**:NodeDef 带 behavior 即可;新行为种类需扩 NodeBehavior 联合类型 +
在 `clickNode` 加一个分发分支(参数从被点节点自身的 def 读取,勿写死单例)。

## 9. 测试方法(浏览器自动化)

- dev:`npm run dev`(1420 端口)。**vite 文件监听会偶发静默失效、下发旧模块**——
  页面行为诡异时先重启 dev server;测试前带 `?t=<ts>` 强制加载。
- DEV 钩子:`window.__game`(store 实例)、`window.minode`(扩展 API)、
  `window.__bootErrs`(index.html 里的启动错误收集,页面上会显示红条)。
- **store 层测试**(推荐,确定性):通过 `__game` 直接调动作/守卫
  (守卫可传 `{dataset:{...}, querySelector:()=>null}` 的假元素)。
  改状态后读 DOM 必须**等渲染**(waitForTimeout ≥300ms),Vue 更新是异步的!
- **拖拽 UI 测试**:PointerEvent 协议(pointerdown→move 启动→等 rAF→move 到目标→
  **停留 200ms**→`MouseEvent('mouseup')` 收尾);弧线路径绕开中间行(经面板顶部横移)。
  真实输入(cua.drag)在 fallback 模式下因太快而不可靠。
- 构建:`npm run build` = vue-tsc 类型检查 + vite 产出,CI 同款。

## 10. 部署

GitHub Pages,`base:"/minode/"`;推 main → Actions(node20 + npm ci + build + deploy-pages,
`enablement:true` 自动启用 Pages),约 1 分钟生效。改仓库名需同步改 base。
存档在浏览器 localStorage——**线上更新后需强刷**;玩家存档跨版本靠 SAVE_VERSION 重置。

## 11. 核心不变量清单(改代码前对照)

1. 每节点=1 件;数量=子树大小;**count 字段不存在,任何地方不要再引入**。
2. 背包里普通物品的子级必须**同类**;功能节点(behavior)的子级不限。
3. 容量三同口径:`addItem` / `stackIntoBackpack` / 拖拽守卫 都按
   **堆根子树总量 + 被并子树总量 ≤ maxStack**。
4. 手工合成:zones=["backpack"],永远在背包;explorer 与 backpackNode:永远在世界。
5. 拖进世界=放置 1 个;储区之间/背包内部=整棵搬运。
6. permanent 节点不可移除;noChildren 节点无子列表。
7. 探索/合成按**发起节点**的 def 行为结算(exploringNodeId)。
8. 合成的计料与消耗同为"每同类节点计 1"(含嵌套),异类后代不连带销毁(takeNodes 叶优先)。
9. 存档校验先于 hydrate;结构变更必 bump SAVE_VERSION。
10. registry 集合必须 shallowReactive;gameNow 时钟在 store 外。

## 12. 已知限制与预留

- `FactoryBehavior`(输入/输出/周期)与 `SlotSpec` 已定义未实现——工厂类功能的接入点。
- `ViewToggleBehavior.view` 目前仅 "backpack"/"codex" 两值,NodeItem 分发处硬编码映射。
- getDef 对未注册 type 返回全区域兜底 def(运行时注册的内容刷新后丢失,节点会变"未知类型")。
- 后台标签页探索结算延迟(时间戳驱动,回前台对账,设计内)。
- 超限的历史存档堆不会被自动拆分(守卫只拦新增)。
- 无单元测试框架;验证依赖 build + 浏览器手测/自动化(§9)。

## 13. 词汇表

| 术语 | 含义 |
|---|---|
| board / 面板 | 一个节点树视图,BoardId = world \| backpack |
| 堆(stack) | 同类父子链;堆根=沿同类祖先上行的顶端;堆大小=nodeCount |
| 放置 | 拖/按钮把物品从背包放进世界,一次 1 件 |
| 收纳 | 把世界节点整棵收回背包(nodeToItem) |
| 功能节点 | 带 behavior 的节点(explore/craft/view-toggle/预留 factory) |
| settle | 拖拽落库后的延迟整理(settleWorldDrop/settleBackpackDrop) |
| 咬合区 | 拖拽时空子列表向上延伸出的投放区(CSS margin-top 负值) |
