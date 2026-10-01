# 10 · 核心不变量清单

> **改任何代码前逐条对照**。每条附代码位置与"违反后的后果"。
> 这些不变量全部来自真实翻车(见 11-pitfalls 对应条目)。

## I-1 数量 = 子树大小,没有 count 字段

- **内容**:`GameNode` 只有 id/type/children/collapsed。
  任何"多少件"的计算都是 `nodeCount(n) = 1 + Σ nodeCount(children)`
  (背包堆满足展平不变量时 = 1 + children.length,递归只是防御旧档)。
- **位置**:`game/types.ts`;消费方:addItem/stackIntoBackpack/徽标/检查器。
- **违反后果**:count 与结构不一致 → 徽标/容量/消耗互相矛盾(v4 前的常态)。

## I-2 背包里普通物品的子级必须同类;功能节点的子级不受限

- **位置**:守卫 `game.ts canDropIntoChildList` 规则⑥a;
  跨区整树守卫(②/②b)从源头拦截。
- **违反后果**:混合子树使 isStack=false(徽标消失)、合成计料混入异类。

## I-3 背包堆恒为「根 + 同类直接子叶」;容量 = 直接子节点数,至多 maxStack

- **内容**:堆叠树不嵌套(拖堆入堆自动展平,超上限填满溢出)。
  容量不变量:`pile.children.length ≤ maxStack-1`;三个入口同口径:
  ①`normalizePile`(落库规约)②`stackIntoBackpack`(展平并入)③`addItem`
  (分堆循环)。守卫⑥只拦异类,容量一律交给落库整理。
- **位置**:game.ts normalizePile/stackIntoBackpack/addItem;dnd.onTreeAdd 延迟调用。
- **违反后果**:嵌套树回潮(存储不可读)+ 旧版三条绕过路径复活
  (见 11 §2.5 历史)。

## I-4 区域归属:手工合成只在背包;探索与背包节点只在世界

- **位置**:registry def zones;存档校验(worldTypes 必含 explorer/backpackNode,
  bpTypes 必含 bench);守卫规则①(canPlaceInZone)。
- **违反后果**:bench 拖进世界(用户明确定性为 bug,cfe7a3a 修复);
  存档残留非法位置需要重置档才能恢复。

## I-5 跨区搬运一次一个:背包→世界放置一个;世界→背包回收一条一条

- **内容**:两个方向的拖拽都禁止"带子树的节点"整棵跨区——放置走 placeItem
  (一次一个),回收先把子节点一条一条移走(像 MC 挖方块)。
  各区域**内部**仍是整棵自由搬运。
- **位置**:守卫规则②/②b(按数据判定子树,不看 DOM——折叠节点漏判的旧坑
  见 11-pitfalls §1.9);`placeItem`(余量回背包重堆);`nodeToItem`
  (有子节点 → 拒绝提示)。
- **违反后果**:玩家一次把 60+ 木头倒进世界(或整棵杂树塞进背包),
  增量节奏与堆叠规则(I-2)双双崩坏。

## I-6 permanent 不可移除;noChildren 无子列表

- **位置**:`removeNodeById`(isPermanent 拒绝);NodeItem(noChildren 不渲染
  子列表——没有列表就没有投放目标)。
- **违反后果**:世界失去探索/背包节点 = 核心功能永久丢失(freshState 才能救回)。

## I-7 探索/合成按"发起节点"结算

- **内容**:行为参数(durationMs/successRate/pool、材料检测与消耗)取自被点节点自身 def;
  工作挂在被点节点上,结算(resolveWork → finishExplore/craftBench)对着同一个节点。
- **位置**:`dispatchClick` 挂工作把 node 传入;`finishExplore(node)`/`craftBench(bench)`。
- **违反后果**:多个探索/合成节点共存时互相错乱(00f308e 修复)。

## I-8 合成的计料与消耗同口径:每个同类节点计 1(含嵌套),异类后代不连带销毁

- **位置**:`benchPiles` getter / craftBench 计料(DFS 逐节点++);
  消耗 `takeNodes`(叶优先;移除父时异类剩余子 splice 回上层)。
- **违反后果**:"bench→木棍→森林"计 2 根木棍、合成把森林连带删掉(440ab35 修复)。

## I-9 存档:校验先于水合;结构变更必 bump SAVE_VERSION;三处字段同步

- **位置**:`ensureSaveIntegrity`(main.ts 最先执行);
  persist.pick ↔ exportSaveData ↔ applySaveData。
- **违反后果**:坏档崩首帧且每次刷新复现(死循环);导出/导入丢字段。

## I-10 registry 集合必须 shallowReactive;瞬态状态(gameNow / 自触发计时 / 工作表)在 store 外

- **位置**:registry 全部集合;`gameNow` 模块级 ref;`cycleAnnounced` 模块级 Set(cycle 计时循环在工作表里,不落盘);
  game/work.ts 的工作 Map(不落盘,reset/导入存档时全清)。
- **违反后果**:运行时注册后图鉴/配方"看似没生效"(00f308e 修复);
  每秒全量序列化写盘(移动端卡顿);计时/工作表进 state = 每秒写盘 + 存档把挂机时长
  折算成意外产出(重新就位/刷新应当从零开始)。

## I-14 click 链式传导:dispatchClick 是唯一口径;工作挂接收者身上;循环用 cycle

- **内容**:一次点击 = 带来源(source="hand" 或节点 type)的 click 事件,
  只经 `dispatchClick` 传播(玩家点击/链式转发/计时循环驱动同源)。
  **所有节点都会自动传导**:普通节点查 (source, 自己)——有产出条目→挂
  kind="click" 工作在**接收者**身上(时长取来源工具 workMs),结算后继续下传;
  查无条目/纯风味→瞬间下传;没活干也没子节点→灰闪。探索/合成只收空手
  click,非空手灰闪拒绝且不再传播。自触发用 kind="cycle" 可见计时循环,
  每圈到点发一轮 click。结算只经 resolveWork;忙碌只读 workOf。
- **位置**:`dispatchClick`/`resolveWork`/`seedCycle`(game.ts);game/work.ts。
- **违反后果**:第二套结算/分发路径 → 部分节点瞬时结算、断链反馈失灵、
  自动化链路(风车→篝火/斧→森林)脱节。

## I-15 处理上限数直接子节点;堆叠上限数整堆件数(恒平)

- **内容**:`maxProcess`(世界,流程语义)= owner 的**直接**子节点数上限
  (守卫⑤);`maxStack`(背包)=「根+直接子叶」堆的件数上限(normalizePile/
  stackIntoBackpack/addItem 三入口,守卫⑥只拦异类)。别在别处另写容量判断。
- **位置**:`processLimit`/`stackLimit`(game.ts);守卫;normalizePile。
- **违反后果**:两套口径混淆后,世界流程节点被"堆叠总量"误拦(斧头看子子
  节点)或背包嵌套树回潮。

## I-16 断链必须灰闪;占用与忙碌灰闪落空;craft 缺料立即拒绝

- **内容**:dispatchClick 的拒绝路径(接收不了/忙碌/被占用/挥空)一律
  `emitReject` 灰闪,silent 不打日志但视觉照播;占用判定与行置灰共用
  `occupierOfWorkingAncestor` 一处口径;craft 预检材料缺料立即拒绝,
  工作快照配方 id,silent 对合成/探索结算日志生效。
- **位置**:`dispatchClick`/`finishExplore(…, silent)`/`craftBench(…, recipeId, silent)`
  (game.ts);`occupierOfWorkingAncestor` 导出;emitReject(game/work.ts)。
- **违反后果**:断链无反馈(玩家一头雾水);占用判定两套口径;
  缺料硬等工作时长(用户明确反对)。
- **规模化备忘**:occupied 每行 O(深度×树) 的 findNode,当前规模无感;
  节点到千级时给 GameNode 加父指针或维护"工作祖先"集合。

## I-11 渲染层对瞬态帧防御(settle 体系已退役)

- **位置**:NodeItem/Inspector 的 `children` computed 兜底 `Array.isArray`。
  历史上的 dnd settle(setTimeout(0) 落库整理)已随跨区整树守卫(05 §4)
  删除,该条经验保留在 11-pitfalls §1.1 备查。
- **违反后果**:非数组 children 崩渲染。

## I-12 获得物品不得展开玩家折叠的堆

- **位置**:addItem(无展开逻辑;新堆默认 collapsed,徽标显示总数)。
- **例外**:拖入子节点(onTreeAdd)与探索产出会展开——那是玩家主动/需要看见结果。

## I-13 拖拽元素必须携带 data-node-id / data-ntype / data-zone

- **位置**:NodeItem 的 `<li>`;NodeBoard 根 `<ol>`(zone)。
- **消费方**:守卫(身份/来源板/整堆检测)、onTreeAdd(fromZone)。
- **违反后果**:守卫拿不到 dragId → 规则③④提前放行,堆叠/防环全部失效。
