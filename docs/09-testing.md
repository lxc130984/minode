# 09 · 测试与调试

> 无单元测试框架。验证 = `npm run build`(vue-tsc 类型检查)+ 浏览器手测/自动化。
> 本文是可复现的调试方法论,含三个曾浪费大量时间的"假故障"鉴别法。

## 1. DEV 调试钩子(仅开发构建)

main.ts 在 `import.meta.env.DEV` 下暴露:

| 钩子 | 内容 | 用途 |
|---|---|---|
| `window.__game` | game store 实例 | 直接读状态/调动作/调守卫 |
| `window.minode` | 扩展 API 整体 | 运行时注册内容试玩 |
| `window.__bootErrs` | 启动错误数组 | index.html 注入的收集器;启动崩溃时页面顶部显示红条 |

例:
```js
__game.addItem("wood", 70)          // 应产生 64 + 6 两堆
__game.countItem("wood")
__game.canDropIntoChildList(fakeEl, "backpack", ownerId)   // 守卫单元测试,见 §2
minode.registerNode({…})
```

## 2. Store 层测试(推荐:确定性强)

- 状态断言:直接读 `__game.nodes/backpack/log`。
- **守卫测试**:守卫签名收 HTMLElement,但只用 dataset 和 querySelector,可传假元素:

```js
const fakePile = {
  dataset: { ntype: "wood", nodeId: "n99", zone: "backpack" },
  querySelector: () => ({})    // 非空 = "带子节点的整堆"
}
__game.canDropIntoChildList(fakePile, "world", undefined)      // false(整堆禁入世界)
__game.canDropIntoChildList({ dataset:{ntype:"wood",nodeId:"n98",zone:"backpack"}, querySelector:()=>null }, "world", undefined)  // true
```

- 动作测试:`addItem/placeItem/nodeToItem/craftBench/startExplore`(探索结算:
  `__game.exploreEndAt = 0; __game.onClock()` 跳过冷却)。

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
await sleep(500)                         // ★ 等 settle(setTimeout 0 + 渲染)
// 4) 断言状态(__game)而非 DOM;读 DOM 再等一拍
```

路径技巧:跨面板拖拽走**弧线**(升到面板标题上方 y≈80 横移再落下),
避免路径压过中间行触发意外交换。

### 每次拖拽测试前刷新页面

失败的拖拽可能把 SortableJS 留在"激活"状态(dragEl 悬挂),
后续所有 pointerdown 被吞。一次页面一次干净测试。

## 5. 常用验证脚本(store 层)

```js
// 完整玩法闭环
let g = __game, guard = 0
while (!g.discovered.includes("forest") && guard++ < 30) {
  if (!g.exploring) g.clickNode(g.explorerNode.id)
  if (g.exploring) { g.exploreEndAt = 0; g.onClock() }
}
guard = 0
while ((g.countItem("stone")<3 || g.countItem("stick")<2) && guard++ < 400)
  g.trigger("hand", "forest")
// 挂料合成
const bench = g.benchNode
for (const t of ["stone","stick"]) {
  const p = g.backpack.find(n => n.type === t)
  if (p) { g.backpack.splice(g.backpack.indexOf(p),1); bench.children.push(p) }
}
g.clickNode(bench.id)
// 放置 + 组树 + 砍柴
g.placeItem(g.backpack.find(n=>n.type==="stoneAxe").id)
const axe = g.nodes.find(n=>n.type==="stoneAxe")
const f = g.explorerNode.children.find(c=>c.type==="forest")
axe.children.push(f)
g.explorerNode.children = g.explorerNode.children.filter(c=>c.id!==f.id)
g.clickNode(axe.id)   // → 获得木头
```

守卫四场景(容量):
```js
// A 单个→满堆:false  B 整堆30→堆40(70>64):false
// C 整堆30→堆33(63≤64):true  D 满堆内部整理:true
```

## 6. 构建级验证

`npm run build` = `vue-tsc --noEmit && vite build`。
CI(GitHub Actions)同款。类型零错误是最低门槛;推送前必跑。
