# 04 · 状态层(src/stores/)

> 两 个 store:`game`(全部游戏状态与动作,991 行)与 `ui`(界面开关,28 行)。
> 另有一个模块级响应式时钟 `gameNow` 与若干模块级纯函数。

## 1. game store 总览

```ts
export const useGameStore = defineStore("game", { state, getters, actions, persist })
```

### 1.1 模块级导出(非 store 成员)

| 导出                                     | 说明                                                                                                                                            |
|------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------|
| `SAVE_VERSION = 6`                       | 存档结构版本;不匹配的存档自动重置(迁移策略见 07)                                                                                                |
| `SAVE_KEY = "game"`                      | localStorage 键(persist.key 与之共用)                                                                                                           |
| `gameNow: Ref<number>`                   | 游戏时钟(见 §1.4)                                                                                                                               |
| `autoTriggerBehaviorOf(node)`            | 取节点 def 声明的自触发行为;非自触发节点返回 null(组件用它判断"要不要显示驱动状态")                                                             |
| `autoTriggerReady(b, parent)`            | 自触发节点是否已就位:直接挂在 `poweredBy` 指定的类型下(缺省 = 恒就位)。**驱动判定与界面状态共用这一处口径**                                     |
| `occupierOfWorkingAncestor(roots, node)` | 节点是否被占用:沿祖先上行找有 interact/craft 工作进行的祖先(如石斧正在砍的森林),返回它或 null。**触发前置检查与 NodeItem 行置灰共用这一处口径** |
| `BoardId = "world" \| "backpack"`        | 面板标识;`boardRoots(board)` 返回对应根数组                                                                                                     |
| `isSaveValid(saved)`                     | 存档深度校验(见 07 §2)                                                                                                                          |
| `ensureSaveIntegrity()`                  | 启动时清掉不合规存档(main.ts 在 pinia 之前调用)                                                                                                 |

### 1.2 模块级私有函数(store 外的纯逻辑)

| 函数                                            | 说明                                                                                                        |
|-------------------------------------------------|-------------------------------------------------------------------------------------------------------------|
| `stackLimit(type)`                              | `def.maxStack > 0 ? maxStack : Infinity`                                                                    |
| `processLimit(type)`                            | `def.maxProcess > 0 ? maxProcess : Infinity`(世界处理上限)                                                  |
| (历史)stackRootOf/canAbsorb                     | 递归容量判定已随堆展平不变量退役,见 §2.4 与 11 §2.5                                                         |
| `findNodeByType(nodes, type)`                   | DFS 按类型找第一个                                                                                          |
| `takeNodes(list, type, n)`                      | **叶优先**移除 n 个同类节点,返回未满足数;移除父节点时其异类剩余子节点 splice 回上层原位置(不连带销毁)       |
| `recipeStateOf(selectedId, piles)`              | 配方 × 材料状态:`{recipe, inputs:[{stack,have,ok}], craftable}`                                             |
| `countPiles(children)`                          | 统计子树材料 `type→件数`(每个同类节点计 1,与 takeNodes 消耗同口径;benchPiles getter / craft 预检与复核共用) |
| `missingOf(state)` / `craftMissingMsg(missing)` | 配方缺料描述列表(state 无效为 null)/ "材料不足"日志文案的唯一来源                                           |
| `exploreBehaviorOf(node)`                       | 取节点自身 def 的 explore 行为(非 explore 返回 null)                                                        |
| `cycleAnnounced`                                | 模块级 Set(已播报"开始运转"的自触发节点 id);计时循环本身是工作表的 kind="cycle" 记录                        |

### 1.3 state(全部字段)

| 字段 | 类型 | 持久化 | 说明 |
|---|---|---|---|
| `version` | number | ✓ | 恒等于 SAVE_VERSION |
| `nodes` | GameNode[] | ✓ | 世界树根列表 |
| `backpack` | GameNode[] | ✓ | 背包树根列表 |
| `selectedRecipeId` | string | ✓ | 手工合成当前配方(默认 RECIPES[0]) |
| `startedAt` | number | ✓ | 本局开始时间(playSeconds = now-startedAt) |
| `discovered` | string[] | ✓ | 已发现地形类型(图鉴点亮) |
| `log` | LogEntry[] | ✓ | 日志,上限 200(超出从头裁剪) |
| `logSeq` | number | ✓ | 日志序号发号器 |
| `selectedId` | string\|null | ✓ | 检查器联动节点(**点击行不再选中**——由「详情/选择配方」按钮设置;世界∪背包∪任何位置) |
| `uid` | number | ✓ | 节点 id 发号器 |
| `dragging` | boolean | ✗ | 全局拖拽中标记(NodeItem @start/@end 设置;驱动 CSS 投放区显隐) |

`freshState()` 初始世界:
```
nodes    = [explorer(collapsed), backpackNode]
backpack = [bench(collapsed)]
uid = 3(n1/n2/n3 已用)
```

### 1.4 gameNow 时钟为什么在 store 外

App.vue 的心跳:`useIntervalFn(() => { gameNow.value = Date.now(); game.onClock() }, 1000)`。

若把 `now` 放进 state,每秒的 tick 都是一次 store mutation,
pinia-plugin-persistedstate 会对**每次 mutation** 全量序列化写 localStorage
(整棵世界树 + 200 条日志)——移动端主线程上的性能灾难。
放在 store 外的 ref 里,getters 引用 `gameNow.value` 仍具响应性,
但不再触发持久化。`playSeconds` 也因此不落盘(由 startedAt 推算)。

`onClock()` 里做两类"到点对账":**工作结算**(§1.5,`now >= job.endAt →
resolveWork`)与自触发驱动(§2.7)。setTimeout 负责前台准点结算,
这里兜后台节流的迟到(时间戳驱动,自动对账,只补一次不做离线补算)。

**同理,自触发的计时循环(cycle 工作)也在工作表里**,播报去重表
`cycleAnnounced` 是 store 外的模块级 Set:刷新/导入后循环从头计,不落盘。

### 1.5 工作系统(game/work.ts,store 外)

**click 的接收者做事需要时间**(workMs),到点才结算;工作中的节点忙碌,
click 打上来灰闪落空。工作记录是模块级 `reactive Map<nodeId, WorkJob>`
(`{kind: click|explore|craft|cycle, endAt, durationMs, silent, source?,
recipeId?}`),不进 store、不落盘(endAt 每拍逼近,不能引发存档写盘;
刷新后进行中的工作作废重头,不折算挂机产出;cycle 计时循环同此)。
Vue 的 Map 按键追踪,写入只触达对应行。时长:节点 `NodeDef.workMs`
声明(缺省 1500;探索以 durationMs 为准);click 工作的节奏由**来源工具**
的 workMs 决定(铜斧砍得比石斧快)。`reset()/applySaveData` 时
`clearAllWork` 全清。断链/忙碌/占用的灰闪反馈(emitReject)也在此模块。

### 1.6 getters

| getter | 语义 |
|---|---|
| `worldNodeCount` | 世界节点总数(countNodes) |
| `itemCount` | 背包整棵树节点数(= 物品总件数) |
| `selectedNode` | 按 selectedId 在世界→背包 DFS 查找 |
| `ownedMap` | 背包递归 `type→件数`(每个节点计 1) |
| `benchNode` | 世界找 bench,再背包找(历史遗留:bench 现在只能在背包,兜底保留) |
| `explorerNode` | 世界找 explorer |
| `benchPiles` | 合成台子级材料 `type→件数`,**按类型精确计数(每个同类节点计 1)**——与 takeNodes 消耗口径严格一致 |
| `recipeState` | recipeStateOf(selectedRecipeId, benchPiles) |
| `playSeconds` | 游玩秒数 |
| `lastLog` | 最新一条日志 |

## 2. actions 逐个详解

### 2.1 基础

- **reset()** — `$patch(freshState())` + `clearAllWork()` + 两条欢迎日志。存档重置/新档入口。
- **onClock()** — 每秒心跳的入口:工作到点对账结算(§1.5)+ 自触发驱动(§2.7)。
- **pushLog(text, kind="info")** — 追加日志,超 200 裁头。kind 决定颜色(gain 绿/craft 紫/warn 橙/info 灰)。
- **newNodeId() / makeNode(type)** — 造节点:`{id:"n"+ ++uid, type, children:[], collapsed:true}`。
- **boardRoots(board)** — world→nodes,backpack→backpack。
- **select(id)** — 设置 selectedId。

### 2.2 点击与交互(工作系统)

- **clickNode(id)** — 点击入口:世界∪背包查找(找不到直接 return)→ `dispatchClick(node, "hand")`。
  **不再设置 selectedId**(节点是可拖动的按钮,没有点击选中态)。
- **dispatchClick(node, source, silent=false)** — **click 链式传导的唯一口径**
  (玩家点击、链式转发、计时循环驱动全走它)。source 是 "hand" 或来源节点 type。
  **所有节点都会自动传导**,区别只在"这个 click 让自己做什么":
  1. `view-toggle` → 不分发(界面层即时处理);
  2. `auto-trigger` → 手动"转一圈":立即向子节点发 `dispatchClick(child, node.type)`,
     并 `seedCycle`(已就位则(重)启动可见计时循环);
  3. **忙碌/被占用** → `emitReject`(行灰闪)+ warn,链条停止;
  4. `explore`/`craft` → **只收空手 click**:非空手来源灰闪拒绝且不再传播
     (篝火接收不了"来自森林"的 click);craft 先预检材料
     (`countPiles`+`recipeStateOf`,缺料立即"材料不足";结算时按**快照配方**复核);
     explore 时长 = durationMs ?? workMs ?? 1500;craft = workMs ?? 1500;
  5. 普通节点:查 `findInteraction(source, node.type)`——
     - **有产出条目** → 在自己身上挂 kind="click" 的工作(进度条在**接收者**身上,
       行内显示「⟵ 来源」;时长 = 来源工具的 workMs ?? 自己的 ?? 1500——
       工具节奏决定砍伐速度),到点结算后**继续向下传导**;
     - **纯风味/查无条目** → 自己不做事,瞬间把「来源=自己」的 click 传给子节点
       (工具的瞬时转发即它的特例:自己没活干);风味条目先回应 note;
     - **既没活干也没子节点** → 灰闪(链断在自己身上,挥了个空)。
  拒绝在 silent(自动链路)时不打日志,灰闪视觉照播。
- **resolveWork(nodeId)** — 工作到点的**唯一结算入口**(setTimeout 准点调用,
  onClock 对账补迟到):摘除工作记录 → `dragging` 中不结算(等下一拍)→
  节点已不在树上则工作作废 → 按工作种类分发:
  `click` → `trigger(job.source, node.type)`(掷骰产出)后**逐子转发 click**;
  `cycle` → 逐子转发 click(silent)后 `seedCycle` 重新计时(仍就位才续);
  `explore` → `finishExplore(node)`;`craft` → `craftBench(node, job.recipeId)`
  (两者完成**不**向下传导——产出不是 click)。
- **seedCycle(node, parent?)** — 自触发节点的可见计时循环:就位
  (直接挂在 poweredBy 指定类型下)且无工作 → 挂 kind="cycle" 的工作
  (时长 = intervalMs,**行底进度条就是节拍**),首次启动打一条
  "「水车」被河流推动,每 3 秒驱动一次"日志(cycleAnnounced 播报去重,
  onClock 清扫失去就位条件的标记)。
- **trigger(source, target, silent=false)** — 查交互表并结算一次交互:
  无条目 → "没有效果"warn;results 空 → 纯 note;
  掷骰全空 → "一无所获"warn;命中 → 逐 drop `addItem`(随后打 note)。
  `silent`(自动链路)只保留 `addItem` 的产出日志——
  每 3 秒一次的背景行为不该把 200 条日志上限刷掉(I-12 同款取向:别打扰玩家)。

### 2.3 树操作

- **toggleCollapse(id)** — 世界∪背包查找后取反 collapsed。
- **detachNode(id)** — 从**所在树**摘下节点;其子节点全部释放回该树根;清 selectedId;返回摘下的节点。
- **removeNodeById(id)** — `isPermanent` 拒绝(warn);否则 detachNode + 日志。检查器"移除"按钮入口。

### 2.4 收纳 / 放置 / 堆叠(语义最密集的一组)

- **nodeToItem(id)** — "收进背包"(检查器按钮),与跨区拖拽同一条规矩"一次一个":
  1. `canPlaceInZone(type,"backpack")` 拒绝不兼容(地形);
  2. 节点还挂着子节点 → 拒绝并提示"先把它们移走,一条一条回收";
  3. `removeNode` 摘下 → `stackIntoBackpack(removed)` 并入背包堆。
- **stackIntoBackpack(node)** — 把节点(及其子树)并入背包堆:**全部展平成单件**,
  先填进还有空间的同类堆(从后往前,余量按子树总量——旧档嵌套堆防御),
  装不下的开新堆(根 + 直接子叶,至多 maxStack 件)。
- **normalizePile(pile)** — 落库整理:把一个背包堆规约回不变量
  **「堆 = 根 + 同类直接子叶,没有子子节点」**(拖堆入堆后由 onTreeAdd 延迟调用):
  展平整棵子树 → 填到 maxStack 为止 → 溢出单件回 stackIntoBackpack 重堆。
  功能节点(合成台)的子级不适用。世界侧不适用(挂载是流程,可嵌套)。
- **placeItem(id)** — "放置到世界"(检查器/双击,一次只放一个):
  1. 只在背包里找;`canPlaceInZone(type,"world")` 拒绝;
  2. `removeNode(backpack, id)`;
  3. 有子节点(堆):自己进世界(collapsed 重置 true),**孩子们逐个 stackIntoBackpack 回背包重堆**;
     单件:整体移动。
- **addItem(type, count=1, silent=false)** — 获得物品:
  - `!canPlaceInZone(type,"backpack")`(地形类产物)→ 直接 push 到世界根 ×count;
  - 否则**按组堆叠循环**:从后往前找 `同类型 && nodeCount<limit` 的堆,
    `take = min(left, limit-nodeCount)` 逐件 push 子节点;left 扣 take;
    找不到 → 新建堆(自己 + min(left-1, limit-1) 个子),`left -= 1+take`;
  - **不展开任何折叠的堆**(需求:获得物品不得打扰玩家折叠态);
  - `silent` 控制是否打"获得 ×N"日志(合成产物静默,由合成逻辑自己打)。
- **countItem(type)** — `ownedMap[type] ?? 0`。

### 2.5 探索

探索已收编进工作系统(§2.2):点击探索节点 = 挂一条 kind="explore" 的工作
(时长 = durationMs ?? workMs ?? 1500,内置 explorer 为 5000),期间行底
进度条填充、节点忙碌;出发时打"你向着未知出发……"(silent 不打)。

- **finishExplore(explorer)**(由 resolveWork 到点调用,按发起节点结算 I-7)—
  1. `Math.random() >= 行为.successRate` → "这次探索一无所获"warn;
  2. `rollPool(行为.pool)` 选地形 → `explorer.children.push(makeNode)`;
     **explorer.collapsed=false(展开让玩家看见)**;
  3. discovered 去重追加 + "探索成功"日志。

### 2.6 手工合成

- **selectRecipe(id)** — getRecipe 存在才生效;切换 + 日志。
- **craftBench(bench?)**(由 resolveWork 到点调用——点击合成台先挂
  kind="craft" 的工作,bench 默认 2000ms;缺料在挂工作**前**已被预检拦下,
  这里是到点结算时的**复核**,防工作期间材料被抽走)—
  `target = bench ?? benchNode`:
  1. **计料**:`countPiles(target.children)`(每个同类节点计 1,与消耗同口径);
  2. `recipeStateOf` + `missingOf` 校验;缺料 → "材料不足"warn 并返回;
  3. **消耗**:逐 input `takeNodes(target.children, input.type, input.count)`;
     若有未满足(计数与移除口径不一致的防御,不应发生)→ "材料出现异常,已中止";
  4. `addItem(output, silent=true)` + "合成成功"craft 日志。

### 2.7 自触发驱动(水车等)——可见计时循环

自触发已并归工作系统(不再有独立的 autoTriggerAt 计时表):

- **seedCycle(node, parent?)** — 就位(直接挂在 poweredBy 指定类型下)且无工作 →
  挂一条 kind="cycle" 的工作(intervalMs 时长)——**行底进度条就是节拍**,
  玩家看得见"它在计时"。首次启动播报一次"「水车」被河流推动,每 3 秒驱动一次"
  (cycleAnnounced 去重,onClock 清扫失位标记)。
- **循环到点(resolveWork 的 cycle 分支)** — 向每个子节点发
  `dispatchClick(child, node.type, silent=true)`(链式传导,断链灰闪),
  仍就位则 seedCycle 重新计时;失去动力则循环自然停(重新就位从零开始)。
- **手动点击** — dispatchClick 的 auto-trigger 分支:立即转一圈(发一轮 click,
  非 silent 带完整风味日志)+ seedCycle(重)启动循环。
- onClock 每秒:工作对账 + 播种(DFS 世界+背包,给就位而无循环的节点 seedCycle;
  `dragging` 中整体跳过)。水车 3s 循环 > 石斧驱动的砍伐 2s,节奏衔接;
  子节点忙碌时该次 click 灰闪落空。

## 3. 拖拽相关 action(与 05-dnd 配套阅读)

- **canDropIntoChildList(dragEl, board, ownerId)** — 拖拽总守卫,详见 05 §3:
  区域权限 / 跨区整树禁止(双向一次一个) / 世界处理上限(直接子节点数)/
  背包同类(容量不拦,落库 normalizePile 展平+溢出)/ 防环。

## 4. 存档 action(详见 07-save)

- **exportSaveData()** — JSON.stringify 与 persist.pick 完全一致的字段集。
- **applySaveData(raw)** — JSON.parse → isSaveValid → $patch 全字段 → 日志;失败返回 false。

## 5. persist 配置

```ts
persist: { key: SAVE_KEY, pick: [version, nodes, backpack, selectedRecipeId,
  startedAt, discovered, log, logSeq, selectedId, uid] }   // dragging/工作 不持久化
```

## 6. ui store(src/stores/ui.ts,28 行)

```ts
state: { backpackOpen, codexOpen, inspOpen, logOpen, recipeOpen }  // 全 boolean,默认 false
actions: toggleBackpack() / toggleCodex()
```

- **不持久化**(界面态随会话)。
- `backpackOpen`:世界里的「背包」节点 view-toggle 控制(App 渲染背包分屏)。
- `codexOpen`:TopBar 图鉴按钮(浮窗)。
- `inspOpen/logOpen/recipeOpen`:三个 Element 浮层的 v-model。
