# 05 · 拖拽系统(game/dnd.ts + store 守卫)

> 本项目最复杂的子系统。所有树列表(世界根/背包根/每个节点的子列表)都是
> SortableJS 列表,共用一个 group;合法性由 `put` 守卫统一裁决;
> 落库后的整理(settle)延迟到 `setTimeout(0)`。

## 1. 参与拖拽的列表

| 列表 | 所在组件 | data-zone | group |
|---|---|---|---|
| 世界根 | NodeBoard(board=world) | `"tree"` | `treeGroup("world")` |
| 背包根 | NodeBoard(board=backpack) | `"backpack"` | `treeGroup("backpack")` |
| 各节点的子列表 | NodeItem(每个非 noChildren、非折叠空节点) | 同所在板 | `treeGroup(board, node.id)` |

`data-zone` 写在 `<ol>` 上(`NodeBoard` 根列表)与 `<li class="node-wrap">` 上(NodeItem)
——守卫靠 `dragEl.dataset.zone` 识别拖拽元素来源板。

拖拽手柄:`handle=".row-main"`(行本体);`<li>` 上还有 `data-node-id` / `data-ntype`,
守卫靠它们拿到拖拽节点的身份。

## 2. DND_COMMON(全部列表共用)

```ts
{
  animation: 150,
  forceFallback: true,        // ★ 统一桌面/移动走 fallback 虚影
  fallbackOnBody: true,       // 虚影挂 body(嵌套列表必需)
  fallbackTolerance: 3,       // 位移超过 3px 才算拖拽开始
  delay: 150,                 // 触屏按住 150ms 才进入拖拽(避免误触滚动/点击)
  delayOnTouchOnly: true,     // 鼠标不延迟
  swapThreshold: 0.55,        // 行内交换阈值
  emptyInsertThreshold: 12,   // 空列表 12px 内可插入
}
```

**虚影(拖拽跟随体)完全交给 SortableJS 的 fallback 机制**——库自己克隆元素并跟随指针。
我们只在 CSS 里微调(main.css):

```css
.sortable-fallback { width: min(70vw, 320px) !important; height: auto !important;
  opacity: .92; border-radius: 8px; background: var(--bg-panel);
  border: 1px solid var(--border); box-shadow: …; overflow: hidden; }
.sortable-fallback .child-list { display: none !important; }  /* 虚影只带一行,不带子树 */
```

⚠️ 历史:曾用原生 HTML5 DnD + 自制 setDragImage 小预览图,两者都被废弃
(原生模式合成事件测不了、预览图各端观感差),不要走回头路。

## 3. 守卫:canDropIntoChildList(dragEl, board, ownerId)

SortableJS 的 `group.put(to, from, dragEl)` 每次悬停都会调用;
我们的 put 恒等于 `game.canDropIntoChildList(dragEl, board, ownerId)`。
**这是拖拽合法性的唯一入口**,规则按序短路:

```
① 区域权限    canPlaceInZone(dragEl.dataset.ntype, board) === false → 拒绝
② 整堆禁入世界 board==="world" && dragEl.dataset.zone==="backpack"
              && dragEl.querySelector(":scope > ol.child-list .node-wrap")
              → 拒绝(带子节点的父节点=整堆,防一次性放置大量物品)
③ 无 owner    dragId 或 ownerId 缺失(面板根列表)→ 放行
④ owner 消失  findNode(boardRoots(board), ownerId) 找不到 → 放行
⑤ 同类+容量   board==="backpack" && owner 无 behavior(普通物品):
     a. dragEl 类型 ≠ owner 类型 → 拒绝(同类堆叠规则)
     b. 容量:pileRoot = stackRootOf(backpack, owner)   ← 沿同类祖先上行找堆根
        dragRoot = stackRootOf(拖拽节点所在板根, dragNode)
        dragRoot.id ≠ pileRoot.id                       ← 同一堆内部整理放行
          && !canAbsorb(pileRoot, dragNode)              ← nodeCount(堆根)+nodeCount(拖子树) > maxStack
        → 拒绝
⑥ 防环        isAncestorOf(boardRoots(board), dragId, ownerId)(含自身)→ 拒绝
```

### 为什么容量必须按"堆根"判定(三次翻车的结论)

- 第一版:比"直接子节点数 < maxStack-1" → **嵌套子堆**绕过(1 父 + 1 子堆(62 子)时直接子数=1);
- 第二版:比"owner 的子树总量" → 把木头挂到**满堆内部某个叶子**上,owner 是叶子(1+1≤64)→ 绕过;
  挂在 bench 下的堆,owner 链上找不到堆 → 绕过;
- 现行:`stackRootOf` 沿同类祖先上行(不越过功能节点),`canAbsorb(堆根, 拖子树)`。
  同时"同一堆内部整理"(dragRoot===pileRoot,总量不变)放行,避免误拦满堆重排。

## 4. 落库处理:onTreeAdd(board, owner, list, evt)

树列表的 `@add`(跨列表移入时触发)。四个动作:

1. **放置日志**:board=world 且来自背包 且 `owner===null`(根级落点)→
   "「xx」被放置进了世界";
2. **自动展开 owner**:`owner?.collapsed → false`(默认折叠的节点获得可见子树);
3. **世界拆堆**:`board==="world" && fromBackpack` →
   `setTimeout(() => game.settleWorldDrop(target), 0)`;
4. **背包分拣**:`board==="backpack" && !fromBackpack` →
   `setTimeout(() => game.settleBackpackDrop(target), 0)`。

### settleWorldDrop(dropped)

堆拖进世界(理论上已被守卫②拒绝;此函数是放置语义的兜底与 placeItem 的共享逻辑):
children 全部 `stackIntoBackpack` 回背包,自己留在世界(collapsed=true)。

### settleBackpackDrop(dropped)

节点拖进背包(任意层级)后递归分拣其子树:

```ts
fix(ns, parentType, parentFunctional):
  for n of ns:
    !canPlaceInZone(n.type,"backpack") → push 世界根(toWorld++)
    !parentFunctional && n.type !== parentType → push 背包根(toRoot++)   // 异类子释放
    其余 → n.children = fix(n.children, n.type, functional(n)) → keep
```

即:进不了背包的回世界;普通物品下只保留同类子(异类释放到背包根);
功能节点(合成台)的子级不受同类规则限制。**堆与堆之间不做自动合并**
——玩家把一堆拖到另一堆下面就是合并(受守卫⑤容量约束)。

### 为什么 settle 要 setTimeout(0)

Sortable 在同一次落盘序列里还会**回写源数组**;同步修改我们的数据会被库覆盖,
并留下 DOM/数组不一致的脏状态(历史实测:物品静默丢失、下一次拖拽失效)。
宏任务排在 Vue 渲染 flush 与 Sortable 全部同步处理之后。
代价:理论上有一帧闪变(整堆进世界先画全量再变 1),可接受,**勿改成 nextTick**(未验证)。

## 5. 与拖拽相关的 CSS 机制

- **咬合区**(投放热区放大):拖拽中 `.app.dragging .child-list.is-empty` 得到
  `min-height:14px; margin-top:-14px; padding-top:14px` ——空子列表向上咬住父行下半部,
  悬停父行下半部即"挂为子节点"(移动端友好)。平时不占空间。
  `.app.dragging` 由 NodeItem 的 `@start/@end → setDragging()` 驱动。
- **根列表撑满**:`.tree-scroll{display:flex;flex-direction:column}` +
  `.root-list{flex:1 1 auto; padding-bottom:28px}` ——列表覆盖面板底部空白,
  否则最后一个节点下方无法投放(历史 bug)。
- **堆显示前 4 个子**:`.child-list.stack-list > .node-wrap:nth-child(n+5){display:none}`
  ——**CSS 占位隐藏而非切片渲染**!保证 SortableJS 的 DOM 索引与数组索引恒对齐。
  省略行在 child-list **外部**:`<div class="stack-ellipsis" v-if="hiddenCount>0 && !node.collapsed">⋯ 还有 N 个</div>`,
  `pointer-events:none` 不参与投放命中;折叠时随子列表一起隐藏。
- **行样式**:org 式全宽行、无边框无间隙、`user-select:none`、`touch-action:manipulation`。

## 6. SortableJS / vue-draggable-plus 硬知识(踩坑实录,务必记住)

1. **用的是 vue-draggable-plus 内嵌的 Sortable 构建**,不是独立的 sortablejs 包:
   它在 `_prepareDragStart` 里用 **`mouseup`/`touchend`**(不是 `pointerup`)监听落手
   ——合成事件测试必须以 `MouseEvent("mouseup")` 收尾,发 pointerup 无效。
   (独立版 sortablejs 才有 supportPointer 的 pointerup 分支。)
2. **fallback 模式的插入判定在 50ms `setInterval(_emulateDragOver)` 里**:
   自动化拖拽必须在目标位置停留 ≥100~200ms 再松手;真人不受影响。
3. **拖拽启动走 rAF(`_dragStarted`)**:后台标签页 rAF 冻结 → 拖拽"半启动"
   (chosen 类有了、ghost 没有),后续拖拽全废。自动化时页面必须前台可见。
4. `forceFallback:true` 下桌面也走指针序列;`fallbackOnBody:true` 让虚影挂 body
   (嵌套列表正确定位的前提)。
5. `:group="treeGroup(...)"` 每次渲染生成新对象会触发库的 option 深更新,实测无碍。
6. 触屏 `delay:150 + delayOnTouchOnly` 解决"滚动 vs 拖拽"冲突;
   点击与拖拽的区分由 fallbackTolerance(3px)完成。
7. 自动化真实输入(cua.drag 等 CDP 鼠标)在 fallback 模式下因速度过快不可靠——
   用 §09 的合成 PointerEvent 协议。
