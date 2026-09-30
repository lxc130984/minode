# 10 · 核心不变量清单

> **改任何代码前逐条对照**。每条附代码位置与"违反后的后果"。
> 这些不变量全部来自真实翻车(见 11-pitfalls 对应条目)。

## I-1 数量 = 子树大小,没有 count 字段

- **内容**:`GameNode` 只有 id/type/children/collapsed。
  任何"多少件"的计算都是 `nodeCount(n) = 1 + Σ nodeCount(children)`。
- **位置**:`game/types.ts:145`;消费方:canAbsorb/addItem/徽标/检查器。
- **违反后果**:count 与结构不一致 → 徽标/容量/消耗互相矛盾(v4 前的常态,多个 bug 源)。

## I-2 背包里普通物品的子级必须同类;功能节点的子级不受限

- **位置**:守卫 `game.ts canDropIntoChildList` 规则⑤a;
  整理 `settleBackpackDrop`(异类子释放到背包根);`nodeToItem` 分拣。
- **违反后果**:混合子树使 isStack=false(徽标消失)、合成计料混入异类。

## I-3 容量按"堆根子树总量"判定,三个入口同口径

- **内容**:`canAbsorb(pileRoot, whole) = nodeCount(pileRoot)+nodeCount(whole) ≤ stackLimit`。
  堆根 = `stackRootOf`(沿**同类祖先**上行,不越过功能节点)。
- **位置**:①守卫规则⑤b(挂到堆内任何层级都算并入整堆;同堆整理放行)
  ②`stackIntoBackpack` ③`addItem` 分堆循环。
- **违反后果**:三条历史绕过路径——直接子数判定(嵌套子堆绕过)、owner 局部判定
  (挂满堆叶子绕过)、顶层根判定(挂 bench 下的堆绕过)。

## I-4 区域归属:手工合成只在背包;探索与背包节点只在世界

- **位置**:registry def zones;存档校验(worldTypes 必含 explorer/backpackNode,
  bpTypes 必含 bench);守卫规则①(canPlaceInZone)。
- **违反后果**:bench 拖进世界(用户明确定性为 bug,cfe7a3a 修复);
  存档残留非法位置需要重置档才能恢复。

## I-5 拖进世界 = 放置一个;储区/背包内部 = 整棵搬运

- **位置**:守卫规则②(带子节点的父节点禁入世界);
  `placeItem`/`settleWorldDrop`(余量回背包重堆)。
- **违反后果**:玩家一次把 60+ 木头倒进世界,增量节奏崩坏。

## I-6 permanent 不可移除;noChildren 无子列表

- **位置**:`removeNodeById`(isPermanent 拒绝);NodeItem(noChildren 不渲染
  twisty/子列表——没有列表就没有投放目标)。
- **违反后果**:世界失去探索/背包节点 = 核心功能永久丢失(freshState 才能救回)。

## I-7 探索/合成按"发起节点"结算

- **内容**:行为参数(durationMs/successRate/pool、材料检测与消耗)取自被点节点自身 def;
  探索归属记录在 `exploringNodeId`。
- **位置**:`clickNode` 分发把 node 传入;`startExplore(node)`/`craftBench(bench)`。
- **违反后果**:多个探索/合成节点共存时互相错乱(00f308e 修复)。

## I-8 合成的计料与消耗同口径:每个同类节点计 1(含嵌套),异类后代不连带销毁

- **位置**:`benchPiles` getter / craftBench 计料(DFS 逐节点++);
  消耗 `takeNodes`(叶优先;移除父时异类剩余子 splice 回上层)。
- **违反后果**:"bench→木棍→森林"计 2 根木棍、合成把森林连带删掉(440ab35 修复)。

## I-9 存档:校验先于水合;结构变更必 bump SAVE_VERSION;三处字段同步

- **位置**:`ensureSaveIntegrity`(main.ts 最先执行);
  persist.pick ↔ exportSaveData ↔ applySaveData。
- **违反后果**:坏档崩首帧且每次刷新复现(死循环);导出/导入丢字段。

## I-10 registry 集合必须 shallowReactive;瞬态状态(gameNow / 自触发计时 / 触发特效)在 store 外

- **位置**:registry 全部集合;`gameNow` 模块级 ref;`autoTriggerAt` 模块级 Map(不落盘);
  game/fx.ts 的触发特效事件 Map(不落盘,行卸载时清条目)。
- **违反后果**:运行时注册后图鉴/配方"看似没生效"(00f308e 修复);
  每秒全量序列化写盘(移动端卡顿);计时表进 state = 每秒写盘 + 存档把挂机时长
  折算成意外产出(重新就位应当从零开始计时);特效事件进 state = 每次点击全量写盘。

## I-11 settle 一律 setTimeout(0);渲染层对瞬态帧防御

- **位置**:dnd.onTreeAdd 的两个 settle 调用;
  NodeItem/Inspector 的 `children` computed 兜底 `Array.isArray`。
- **违反后果**:同步改数据被 Sortable 回写覆盖 → 物品静默丢失;
  非数组 children 崩渲染。

## I-12 获得物品不得展开玩家折叠的堆

- **位置**:addItem(无展开逻辑;新堆默认 collapsed,徽标显示总数)。
- **例外**:拖入子节点(onTreeAdd)与探索产出会展开——那是玩家主动/需要看见结果。

## I-13 拖拽元素必须携带 data-node-id / data-ntype / data-zone

- **位置**:NodeItem 的 `<li>`;NodeBoard 根 `<ol>`(zone)。
- **消费方**:守卫(身份/来源板/整堆检测)、onTreeAdd(fromZone)。
- **违反后果**:守卫拿不到 dragId → 规则③④提前放行,堆叠/防环全部失效。
