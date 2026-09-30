# 04 · 状态层(src/stores/)

> 两 个 store:`game`(全部游戏状态与动作,816 行)与 `ui`(界面开关,28 行)。
> 另有一个模块级响应式时钟 `gameNow` 与若干模块级纯函数。

## 1. game store 总览

```ts
export const useGameStore = defineStore("game", { state, getters, actions, persist })
```

### 1.1 模块级导出(非 store 成员)

| 导出 | 说明 |
|---|---|
| `SAVE_VERSION = 5` | 存档结构版本;不匹配的存档自动重置(迁移策略见 07) |
| `SAVE_KEY = "game"` | localStorage 键(persist.key 与之共用) |
| `gameNow: Ref<number>` | 游戏时钟(见 §1.4) |
| `BoardId = "world" \| "backpack"` | 面板标识;`boardRoots(board)` 返回对应根数组 |
| `isSaveValid(saved)` | 存档深度校验(见 07 §2) |
| `ensureSaveIntegrity()` | 启动时清掉不合规存档(main.ts 在 pinia 之前调用) |

### 1.2 模块级私有函数(store 外的纯逻辑)

| 函数 | 说明 |
|---|---|
| `stackLimit(type)` | `def.maxStack > 0 ? maxStack : Infinity` |
| `stackRootOf(roots, node)` | 沿**同类祖先**上行找堆根:`parent = findNode(roots, cur.id)?.parent;while(parent.type===cur.type) cur=parent`。**不越过功能节点**——挂在 bench 下的木堆,其堆根仍是那个木堆 |
| `canAbsorb(pile, whole)` | `nodeCount(pile)+nodeCount(whole) <= stackLimit(pile.type)`——容量判定的唯一形式 |
| `findNodeByType(nodes, type)` | DFS 按类型找第一个 |
| `takeNodes(list, type, n)` | **叶优先**移除 n 个同类节点,返回未满足数;移除父节点时其异类剩余子节点 splice 回上层原位置(不连带销毁) |
| `recipeStateOf(selectedId, piles)` | 配方 × 材料状态:`{recipe, inputs:[{stack,have,ok}], craftable}` |
| `exploreBehaviorOf(node)` | 取节点自身 def 的 explore 行为(非 explore 返回 null) |

### 1.3 state(全部字段)

| 字段 | 类型 | 持久化 | 说明 |
|---|---|---|---|
| `version` | number | ✓ | 恒等于 SAVE_VERSION |
| `nodes` | GameNode[] | ✓ | 世界树根列表 |
| `backpack` | GameNode[] | ✓ | 背包树根列表 |
| `selectedRecipeId` | string | ✓ | 手工合成当前配方(默认 RECIPES[0]) |
| `exploring` | boolean | ✓ | 探索进行中(全局唯一冷却) |
| `exploringNodeId` | string\|null | ✓ | 发起探索的节点 id——结算归属(多探索节点) |
| `exploreEndAt` | number | ✓ | 探索截止时间戳(ms) |
| `startedAt` | number | ✓ | 本局开始时间(playSeconds = now-startedAt) |
| `discovered` | string[] | ✓ | 已发现地形类型(图鉴点亮) |
| `log` | LogEntry[] | ✓ | 日志,上限 200(超出从头裁剪) |
| `logSeq` | number | ✓ | 日志序号发号器 |
| `selectedId` | string\|null | ✓ | 选中节点(检查器显示对象;世界∪背包∪任何位置) |
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

`onClock()` 只做一件事:`exploring && now >= exploreEndAt → resolveExplore()`。
后台标签页定时器被浏览器节流 → 结算延迟到回前台(时间戳驱动,自动对账,设计内)。

### 1.5 getters

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
| `exploreCdLeft` | 探索剩余秒(ceil,基于 gameNow) |
| `playSeconds` | 游玩秒数 |
| `lastLog` | 最新一条日志 |

## 2. actions 逐个详解

### 2.1 基础

- **reset()** — `$patch(freshState())` + 两条欢迎日志。存档重置/新档入口。
- **onClock()** — 见 §1.4。
- **pushLog(text, kind="info")** — 追加日志,超 200 裁头。kind 决定颜色(gain 绿/craft 紫/warn 橙/info 灰)。
- **newNodeId() / makeNode(type)** — 造节点:`{id:"n"+ ++uid, type, children:[], collapsed:true}`。
- **boardRoots(board)** — world→nodes,backpack→backpack。
- **select(id)** — 设置 selectedId。

### 2.2 点击与交互

- **clickNode(id)** — 核心点击分发:
  1. `findNode(nodes) ?? findNode(backpack)` 找不到直接 return;
  2. 选中;
  3. 读 def.behavior:`view-toggle` → 只选中(界面层已处理开关);`explore` → `startExplore(node)`;`craft` → `craftBench(node)`;其他 behavior → 静默;
  4. 无 behavior(普通节点):有子 → 逐子 `trigger(node.type, child.type)`;叶子 → `trigger("hand", node.type)`。
- **trigger(source, target)** — 查交互表:无条目→"没有效果"warn;results 空→纯 note;掷骰全空→"一无所获";命中→逐 drop `addItem`(随后打 note)。

### 2.3 树操作

- **toggleCollapse(id)** — 世界∪背包查找后取反 collapsed。
- **detachNode(id)** — 从**所在树**摘下节点;其子节点全部释放回该树根;清 selectedId;返回摘下的节点。
- **removeNodeById(id)** — `isPermanent` 拒绝(warn);否则 detachNode + 日志。检查器"移除"按钮入口。

### 2.4 收纳 / 放置 / 堆叠(语义最密集的一组)

- **nodeToItem(id)** — "收进背包"(检查器按钮):
  1. `canPlaceInZone(type,"backpack")` 拒绝不兼容(地形);
  2. `removeNode` 从所在树摘下(**不走 detachNode**,避免子节点散落回世界根);
  3. 子树分拣:同类子随行;`!canPlaceInZone(kid,"backpack")` → 世界根;异类 → 背包根;
  4. `stackIntoBackpack(removed)` 并入背包堆(整棵,受容量约束)。
- **stackIntoBackpack(node)** — 在背包根从后往前找第一个
  `同类型 && canAbsorb` 的堆挂进去;没有 → 成为新根。
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

- **startExplore(node)** — 全局冷却中 → "还在探索中"warn;否则
  `exploring=true; exploringNodeId=node.id; exploreEndAt=now+(行为.durationMs ?? 5000)` + 日志。
- **resolveExplore()**(由 onClock 到点触发)—
  1. `exploring=false`;
  2. 结算目标:`exploringNodeId` 查世界→背包,**兜底 explorerNode**;清空 exploringNodeId;
  3. `Math.random() >= 行为.successRate` → "一无所获";
  4. `rollPool(行为.pool)` 选地形 → `explorer.children.push(makeNode)`;
     **explorer.collapsed=false(展开让玩家看见)**;
  5. discovered 去重追加 + "探索成功"日志。

### 2.6 手工合成

- **selectRecipe(id)** — getRecipe 存在才生效;切换 + 日志。
- **craftBench(bench?)** — `target = bench ?? benchNode`:
  1. **计料**:DFS target.children,`piles[type]++`(每个节点计 1,与消耗同口径);
  2. recipeStateOf 校验;缺料 → "材料不足:xxx(缺 N)"warn 并返回;
  3. **消耗**:逐 input `takeNodes(target.children, input.type, input.count)`;
     若有未满足(计数与移除口径不一致的防御,不应发生)→ "材料出现异常,已中止";
  4. `addItem(output, silent=true)` + "合成成功"craft 日志。

## 3. 拖拽相关 action(与 05-dnd 配套阅读)

- **canDropIntoChildList(dragEl, board, ownerId)** — 拖拽总守卫,详见 05 §3。
- **settleWorldDrop(dropped)** — 堆拖进世界后的延迟结算:
  children 全部 `stackIntoBackpack` 回背包,自己留世界(collapsed=true)。
- **settleBackpackDrop(dropped)** — 节点拖进背包后的延迟整理:
  递归分拣 dropped 子树——`!canPlaceInZone(n,"backpack")` → 世界根;
  普通物品父的非同类子 → 背包根;功能节点的子级不限制。
  **不做堆合并**(玩家手动拖堆合并)。

## 4. 存档 action(详见 07-save)

- **exportSaveData()** — JSON.stringify 与 persist.pick 完全一致的字段集。
- **applySaveData(raw)** — JSON.parse → isSaveValid → $patch 全字段 → 日志;失败返回 false。

## 5. persist 配置

```ts
persist: { key: SAVE_KEY, pick: [version, nodes, backpack, selectedRecipeId,
  exploring, exploringNodeId, exploreEndAt, startedAt, discovered,
  log, logSeq, selectedId, uid] }   // dragging 不持久化
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
