# 09 · 测试与调试

> 无单元测试框架。验证 = `npm run build`(vue-tsc 类型检查)+ 浏览器手测/自动化。
> 本文是可复现的调试方法论,含三个曾浪费大量时间的"假故障"鉴别法。

## 1. DEV 调试钩子(仅开发构建)

main.ts 在 `import.meta.env.DEV` 下暴露:

| 钩子 | 内容 | 用途 |
|---|---|---|
| `window.__game` | game store 实例 | 直接读状态/调动作/调守卫 |
| `window.minode` | 内容创作 API 整体 | 运行时注册内容试玩(注册即校验) |
| `window.__bootErrs` | 启动错误数组 | index.html 注入的收集器;启动崩溃时页面顶部显示红条 |

例:
```js
__game.addItem("wood", 70)          // 应产生 64 + 6 两堆
__game.countItem("wood")
__game.canDropIntoChildList(fakeEl, "backpack", ownerId)   // 守卫单元测试,见 §2
minode.registerContent({ nodes: […], interactions: […] })  // 内容包试玩(见 08)
minode.validate()                   // 全量体检:返回问题列表,空 = 健康
```

## 2. Store 层测试(推荐:确定性强)

- 状态断言:直接读 `__game.nodes/backpack/log`。
- **守卫测试**:守卫只用 `dataset`(nodeId/ntype/zone)+ **状态数据**(子树判定
  按 dragId 查真实节点,不再看 DOM),传假元素 + 真实节点即可:

```js
// 前置:g.nodes 里有一把挂了森林的斧头 n4、一棵空闲森林 n5
const el = (nodeId, ntype, zone) => ({ dataset: { nodeId, ntype, zone } })
__game.canDropIntoChildList(el("n5", "forest", "tree"), "world", "n4")     // false(石斧处理上限 1/1)
__game.canDropIntoChildList(el("n4", "stoneAxe", "tree"), "backpack", undefined)  // false(世界整树禁入背包)
__game.canDropIntoChildList(el("n5", "forest", "tree"), "backpack", undefined)   // false(forest 世界限定)
```

- 动作测试:`addItem/placeItem/nodeToItem`(获得/收纳/放置直接生效)。
- **click 链式传导测试**(dispatchClick 是唯一口径):
  ```js
  __game.clickNode(id)                   // 空手 click,沿树传导
  __game.dispatchClick(node, "stoneAxe") // 直接发一个来自石斧的 click
  __game.resolveWork(id)                 // 跳过等待,立即结算该节点的工作
  ```
  click 的**接收者**身上出现 `.work-track` + `⟵ 来源` 标注;传导工具
  (自己无条目)瞬时无进度条;断链(接收不了/忙碌/挥空)行闪 `.rejected`;
  水车就位后是常驻 cycle 进度条,每圈向子节点发一轮 click(真实心跳观察)。
  注意:点击行**不产生 selected 类**(选中只来自详情按钮)。

- **截图/读 DOM 前确认标签页跑的是新代码**:vite HMR 在后台标签页会推迟
  重载,旧标签页残留旧 UI(实测截到过已删除的倒计时副标题)。
  开新标签页或刷新后再断言视觉。

## 3. ⚠️ 三大假故障(先排除再怀疑代码)

### 3.1 Vue 渲染是异步的

改状态后**同步读 DOM** 永远读到旧值。必须等:

```js
__game.backpack[0].collapsed = true
// ❌ 立即读 DOM → 还是旧渲染
await sleep(300)   // ✅ waitForTimeout ≥300ms 再读
```

### 3.2 vite dev server 的文件监听会静默失效

症状:改了代码、类型检查过了,但页面行为像旧代码(DOM 里还是旧组件引用)。
鉴别:`curl -s localhost:1420/src/<文件> | grep <新代码片段>`——
磁盘有、下发无 = 监听挂了。**处置:重启 `npm run dev`**。
预防:测试加载带 `?t=<时间戳>`。

### 3.3 后台标签页的浏览器节流

- rAF 冻结 → SortableJS 拖拽"半启动"(chosen 有、ghost 无);
- 定时器节流 → 探索结算延迟(时间戳驱动,回前台即对账,**这不是 bug**)。

自动化测试前确认 `document.visibilityState === "visible"`。

## 4. 拖拽 UI 测试协议(合成 PointerEvent)

**必须**用此协议;真实输入(CDP 鼠标)在 fallback 模式下太快,不可靠。

```js
// 0) 页面必须前台可见(§3.3)
// 1) 起拖:pointerdown 在行上 + 小位移
const PE = (type, x, y, target) => (target || document).dispatchEvent(
  new PointerEvent(type, { pointerId: 7, pointerType: "mouse", isPrimary: true,
    clientX: x, clientY: y, bubbles: true, cancelable: true,
    button: 0, buttons: type === "pointerup" ? 0 : 1 }))
PE("pointerdown", sx, sy, rowEl)
PE("pointermove", sx + 15, sy + 25)     // 越过 fallbackTolerance(3px)
await sleep(300)                         // ★ 等 rAF:ghost 创建
// 2) 移到目标:
PE("pointermove", tx, ty)               // 发到 document
await sleep(200)                         // ★ 停留:50ms 模拟拖放定时器跑 ≥3 拍
// 3) 落手:必须 mouseup(pointerup 无效!见 05 §6.1)
document.dispatchEvent(new MouseEvent("mouseup",
  { clientX: tx, clientY: ty, bubbles: true, cancelable: true, button: 0, buttons: 0 }))
await sleep(500)                         // ★ 等 Sortable 落盘回写 + 渲染
// 4) 断言状态(__game)而非 DOM;读 DOM 再等一拍
```

路径技巧:跨面板拖拽走**弧线**(升到面板标题上方 y≈80 横移再落下),
避免路径压过中间行触发意外交换。

### 每次拖拽测试前刷新页面

失败的拖拽可能把 SortableJS 留在"激活"状态(dragEl 悬挂),
后续所有 pointerdown 被吞。一次页面一次干净测试。

## 5. 常用验证脚本(store 层)

```js
// 完整玩法闭环(工作系统版:clickNode 挂工作,resolveWork 立即结算)
let g = __game, guard = 0
while (!g.discovered.includes("forest") && guard++ < 30) {
  g.clickNode(g.explorerNode.id)
  g.resolveWork(g.explorerNode.id)      // 跳过 5s 等待
}
guard = 0
while ((g.countItem("stone")<3 || g.countItem("stick")<2) && guard++ < 400)
  g.trigger("hand", "forest")           // 直接结算交互,不走工作
// 挂料合成
const bench = g.benchNode
for (const t of ["stone","stick"]) {
  const p = g.backpack.find(n => n.type === t)
  if (p) { g.backpack.splice(g.backpack.indexOf(p),1); bench.children.push(p) }
}
g.clickNode(bench.id); g.resolveWork(bench.id)
// 放置 + 组树 + 砍柴
g.placeItem(g.backpack.find(n=>n.type==="stoneAxe").id)
const axe = g.nodes.find(n=>n.type==="stoneAxe")
const f = g.explorerNode.children.find(c=>c.type==="forest")
axe.children.push(f)
g.explorerNode.children = g.explorerNode.children.filter(c=>c.id!==f.id)
g.clickNode(axe.id); g.resolveWork(axe.id)   // → 获得木头
```

自触发(水车)最省事的验证:**别手动 `onClock()`,就用真实 1s 心跳观察**
```js
let g = __game
const find = (ns, t) => { for (const n of ns) { if (n.type === t) return n; const h = find(n.children, t); if (h) return h } }
g.addItem("waterwheel"); g.placeItem(g.backpack.find(n => n.type === "waterwheel").id)
const wheel = find(g.nodes, "waterwheel")          // 放到世界后:摘出根、挂进河流下
const river = find(g.nodes, "river")
g.nodes.splice(g.nodes.indexOf(wheel), 1); river.children.push(wheel)
// 再把石斧挂到水车下、森林挂到石斧下;等 3~4 秒:
// countItem("wood") +1、日志只多一条"获得 木头 ×1"(自动驱动不打风味日志);
// 把 wheel 移回世界根 → 转 4 秒应 0 产出(失去动力)
```

守卫容量场景(堆叠上限 + 处理上限):
```js
// 堆叠(背包):单个→满堆:false;整堆30→堆40(70>64):false;
//             整堆30→堆33(63≤64):true;满堆内部整理:true
// 处理(世界):石斧(上限1)已挂森林,再挂一棵:false;
//             水车(上限2)挂第三把斧:false;探索(无上限)挂地形:true
```

## 6. 构建级验证

`npm run build` = `vue-tsc --noEmit && vite build`。
CI(GitHub Actions)同款。类型零错误是最低门槛;推送前必跑。
