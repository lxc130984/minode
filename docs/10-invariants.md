# 10 · 核心不变量清单

> **改任何代码前逐条对照**。每条附代码位置与"违反后的后果"。
> 这些不变量全部来自真实翻车(见 11-pitfalls 对应条目)。

## I-1 数量 = 子树大小,没有 count 字段

- **内容**:`GameNode` 只有 id/type/children/collapsed。
  任何"多少件"的计算都是 `nodeCount(n) = 1 + Σ nodeCount(children)`。
- **位置**:`game/types.ts:145`;消费方:canAbsorb/addItem/徽标/检查器。
- **违反后果**:count 与结构不一致 → 徽标/容量/消耗互相矛盾(v4 前的常态,多个 bug 源)。

## I-2 背包里普通物品的子级必须同类;功能节点的子级不受限

- **位置**:守卫 `game.ts canDropIntoChildList` 规则⑥a;
  跨区整树守卫(②/②b)从源头拦截。
- **违反后果**:混合子树使 isStack=false(徽标消失)、合成计料混入异类。

## I-3 容量按"堆根子树总量"判定,三个入口同口径

- **内容**:`canAbsorb(pileRoot, whole) = nodeCount(pileRoot)+nodeCount(whole) ≤ stackLimit`。
  堆根 = `stackRootOf`(沿**同类祖先**上行,不越过功能节点)。
- **位置**:①守卫规则⑥b(挂到堆内任何层级都算并入整堆;同堆整理放行)
  ②`stackIntoBackpack` ③`addItem` 分堆循环。
- **违反后果**:三条历史绕过路径——直接子数判定(嵌套子堆绕过)、owner 局部判定
  (挂满堆叶子绕过)、顶层根判定(挂 bench 下的堆绕过)。

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
  twisty/子列表——没有列表就没有投放目标)。
- **违反后果**:世界失去探索/背包节点 = 核心功能永久丢失(freshState 才能救回)。

## I-7 探索/合成按"发起节点"结算

- **内容**:行为参数(durationMs/successRate/pool、材料检测与消耗)取自被点节点自身 def;
  工作挂在发起节点上,结算(resolveWork → finishExplore/craftBench)对着同一个节点。
- **位置**:`triggerNode` 挂工作把 node 传入;`finishExplore(node)`/`craftBench(bench)`。
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

- **位置**:registry 全部集合;`gameNow` 模块级 ref;`autoTriggerAt` 模块级 Map(不落盘);
  game/work.ts 的工作 Map(不落盘,reset/导入存档时全清)。
- **违反后果**:运行时注册后图鉴/配方"看似没生效"(00f308e 修复);
  每秒全量序列化写盘(移动端卡顿);计时/工作表进 state = 每秒写盘 + 存档把挂机时长
  折算成意外产出(重新就位/刷新应当从零开始)。

## I-14 触发一律挂工作;resolveWork 是唯一结算入口;忙碌判定只看 workOf

- **内容**:triggerNode 对 explore/craft/普通节点一律 `startWork`(view-toggle 与
  auto-trigger 驱动除外——即时/由子节点工作);结算只经 `resolveWork`(setTimeout
  准点 + onClock 对账);"还在忙碌"判定只读 `workOf(node.id)`,别另设忙碌标志。
- **位置**:`triggerNode`/`resolveWork`(game.ts);game/work.ts。
- **违反后果**:出现第二套结算路径(如直接调 craftBench 绕过工作)→ 部分节点
  瞬时结算、进度条与真实进度脱节、忙碌拦截失效。

## I-15 世界处理上限只数直接子节点;堆叠上限数整个子树

- **内容**:`maxProcess`(世界,流程语义)= owner 的**直接**子节点数上限;
  `maxStack`(背包,堆叠语义)= 堆根**子树总件数**上限。两者判定入口:
  守卫规则⑤/⑥,别在别处另写容量判断。
- **位置**:`processLimit`/`stackLimit`/`canAbsorb`(game.ts);守卫
  canDropIntoChildList;addItem/stackIntoBackpack(堆叠侧的程序化入口)。
- **违反后果**:两套口径混淆后,世界流程节点被"堆叠总量"误拦(斧头看子子
  节点)或背包堆被"直接子数"绕过(嵌套子堆)。

## I-16 触发先过前置检查;流程参与物在祖先工作期间被占用

- **内容**:triggerNode 在任何分发/挂工作之前依次检查 忙碌(workOf)→ 占用
  (occupierOfWorkingAncestor:祖上有 interact/craft 工作)→ 可做性
  (craft 预检材料;interact 需子节点有条目/空手有产出)。注定无效果的
  触发**立即**拒绝/回应,不走工作时长;占用判定与行置灰样式(NodeItem)
  共用 `occupierOfWorkingAncestor` 一处口径。craft 工作快照配方 id,
  结算不受期间切配方影响;silent 对合成/探索结算日志同样生效。
- **位置**:`triggerNode`/`finishExplore(…, silent)`/`craftBench(…, recipeId, silent)`
  (game.ts);`occupierOfWorkingAncestor` 导出。
- **违反后果**:缺料/空挂也要硬等几秒(用户明确反对);或占用态判定
  在引擎与视图两处各写一套,出现"能点但显示占用"之类的裂痕;
  自动驱动的合成/探索刷屏日志。
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
