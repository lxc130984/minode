# 06 · 界面层(App.vue + components/ + styles/main.css)

> 视觉基调:护眼浅绿 + 白,orgro 式极简;"IDE 工作台"风格已被推翻(历史,见 11-pitfalls §4)。

## 1. App.vue —— 布局壳

### 职责

1. **游戏心跳**:`useIntervalFn(() => { gameNow.value=Date.now(); game.onClock() }, 1000, {immediateCallback:true})`
   ——时钟在 store 外的原因见 04 §1.4。
2. **挂载欢迎日志**:log 为空时打两条(新世界引导)。
3. **移动端边缘滑动**:左缘(<32px)右滑 ≥64px 且横向占优 → 开图鉴;
   右缘左滑 → 开检查器。**起点落在 `[data-node-id]` 上不算边缘手势**(避免与节点拖拽冲突)。
4. 渲染骨架:TopBar / views(世界常驻 + 背包分屏)/ StatusBar + 浮层。

### 模板结构

```
.app(:class="{dragging: game.dragging}")
  TopBar
  main.views
    NodeBoard(board="world")            ← 常驻
    NodeBoard(v-if ui.backpackOpen, board="backpack")   ← 分屏
  StatusBar
  Transition > .codex-float(v-if ui.codexOpen) > CodexView + 关闭钮
  el-drawer(insp) Inspector / el-drawer(log,btt) LogConsole / el-dialog(recipe) RecipeDialog
```

`.app.dragging` 类驱动所有空子列表的咬合区显隐(05 §5)。
图鉴浮窗样式(`.codex-float`):`position:fixed; top:topbar+14; right:12;
width:min(440px,94vw); max-height:76vh; z-index:60`,Transition `float`(透明度+位移)。

## 2. NodeBoard.vue —— 节点面板基本组件

**一切"节点列表 + 可成树"的界面都用它**,差异只在 `board` prop。

### 要点

- 两条 `v-if/v-else` 分支**直接** `v-model="game.nodes"` / `v-model="game.backpack"`
  ——不用 computed 中转(历史上 computed 中转出过同步问题,11-pitfalls §9)。
- `data-zone`(tree/backpack)标在根 `<ol>` 上。
- 根列表 `.root-list`:`flex:1 1 auto; padding:0 0 28px; min-height:120px`
  ——撑满面板,底部空白也是投放区。
- 空态提示:`game.boardRoots(board).length===0` 时显示居中文案(世界/背包措辞不同)。
- meta:标题/图标/提示语按 board 切换(世界:Globe "点击节点触发 · 拖拽组织树";
  背包:Backpack "可嵌套整理 · 拖到世界即可放置")。

### Props

| prop | 类型 | 说明 |
|---|---|---|
| board | BoardId | `"world" \| "backpack"` |

## 3. NodeItem.vue —— 递归行节点(最复杂的组件)

### Props

`{ node: GameNode; board: BoardId; depth: number }`(depth 保留,当前未用于样式)。

### 关键 computed

| 名 | 语义 |
|---|---|
| `def` | getDef(node.type) |
| `selected` | game.selectedId === node.id |
| `children` | `Array.isArray(node.children) ? … : []` ——**瞬态帧防御**(拖拽中数据可能短暂非数组) |
| `hasChildren` | children.length > 0 |
| `isItemStack` | `board==="backpack" && isStack(node) && hasChildren` ——纯堆才有 ×N 徽标 |
| `stackTotal` | isItemStack ? nodeCount(node) : 0 |
| `hiddenCount` | isItemStack ? max(0, children.length-4) : 0 ——省略行数量 |
| `isFunctional` | !!def.behavior ——功能节点 |
| `isViewToggle` | behavior?.kind === "view-toggle" |
| `noChildren` | !!def.noChildren |
| `benchRecipeName` | bench 专属:当前配方产物名 |

### 点击分发 onRowClick()

```
select(node.id)
view-toggle → 按 behavior.view 调 ui.toggleCodex()/toggleBackpack() + fireFx,return
clickable = isFunctional || board==="world"
clickable → game.clickNode(node.id) + fireFx()
否则(背包里的普通节点)→ 仅选中
```

`fireFx()`:先置 false 再 rAF 置 true,600ms 后复位——触发脉冲动画
(row-pulse 背景 + icon-pop 图标弹跳;连点可重触发)。

### 行内元素(从左到右)

twisty(无子/无 noChildren 时隐藏)→ NodeIcon → 名称(def.accent 着色)→
副标题四选一(bench:配方·xx / explorer 探索中:倒计时秒 / view-toggle:已开启·已收起
(带 PanelRight 图标,读 ui.backpackOpen)/ 普通节点:分类小标签)→
flex 填充 → ×N 徽标(isItemStack)或子数胶囊 → 行尾按钮(bench 专属 ⚙ 选择配方;
通用 ⋯ 详情打开检查器)。

### 子列表

```vue
<VueDraggable v-if="!noChildren && (!node.collapsed || !hasChildren)"
  v-model="node.children" tag="ol" class="child-list"
  :class="{is-empty:!hasChildren, stack-list:isItemStack}"
  :data-zone="board==='world'?'tree':'backpack'"
  :group="treeGroup(board, node.id)" handle=".row-main" v-bind="DND_COMMON"
  @add="onTreeAdd(board, node, children, $event)"
  @start="setDragging(true)" @end="setDragging(false)">
  <NodeItem v-for="child in children" :key="child.id" … :depth="depth+1"/>
</VueDraggable>
<div v-if="hiddenCount>0 && !node.collapsed" class="stack-ellipsis">⋯ 还有 N 个</div>
```

渲染条件解读:`noChildren` 完全不渲染子列表(背包节点);
`!node.collapsed || !hasChildren` ——折叠的**空**节点仍渲染(拖拽时是投放区),
折叠的非空节点隐藏子列表。省略行独立于子列表,折叠时一并隐藏。

### 样式要点

- `.row-main`:全宽、无边框、无垂直间隙、`user-select:none`、左 2px 透明边
  (选中时染 accent)、悬停/按下高亮;触屏行高经 `@media (hover:none){:root{--row-h:40px}}` 放大。
- `.child-list`:缩进 18px + 左引导线;`.is-empty` 不画线(避免残留短竖线——历史 bug)。
- `.stack-list > .node-wrap:nth-child(n+5){display:none}`(占位隐藏,保索引)。
- 咬合区与投放提示文案("↳ 挂为子节点")只在 `.app.dragging` 下出现。

## 4. NodeIcon.vue

`<component :is="ICONS[def.icon] ?? ICONS.hand" :size :class="'cat-'+category"
:style="def.accent ? {color:def.accent} : undefined">`。
accent 是自定义节点材质/配色的入口。

## 5. CodexView.vue —— 图鉴(浮窗内容)

- `groups` computed:NODE_DEFS 按 category 分组(插入序)。
- `seen(def)`:功能节点恒 true;地形看 `game.discovered`;材料/工具看
  `ownedMap>0 || hasType(game.nodes, id)`(背包有或世界摆过)。
- `zoneLabel(def)`:zones 长度 ≥2(全区域)不标;否则" · 仅世界/仅背包"。
- 下半部分是 8 条上手指南(与当前玩法逐条核对过,改玩法时记得同步)。

## 6. Inspector.vue —— 检查器(右抽屉内容)

- 数据源:`game.selectedNode`(世界→背包 DFS;v-if 分支多,注意 noChildren 文案分支)。
- `zone` computed:世界→背包→null;`inWorld`、`isPile`(nodeCount>1)。
- 特殊面板:explorer(状态/已发现地形)、bench(当前配方 + 选择配方按钮)、
  noChildren("这是一个开关节点,不能挂载子节点")。
- 普通节点:子节点数、空手点击提示(findInteraction("hand", type)?.note)、
  子节点清单("点击它 = 依次触发")或空提示。
- 按钮显隐:收进背包 = `inWorld && canPlaceInZone(def.id,'backpack')`;
  放置到世界 = `!inWorld && canPlaceInZone(def.id,'world')`;
  移除 = `!isPermanent(def.id)`(ElMessageBox 二次确认)。

## 7. RecipeDialog.vue —— 配方选择

`list` = RECIPES × benchPiles(实时 have/need);`groups` 按 recipe.category 分组
(≥2 组才显示组标题)。点击卡片 `game.selectRecipe(id)`;选中卡高亮 + "当前配方"角标。

## 8. LogConsole.vue —— 日志

显示最近 120 条;新日志自动滚底(watch log.length);颜色按 kind;
顶栏有清空按钮。放在底部抽屉里(App 渲染)。

## 9. TopBar.vue

左:logo(Boxes)+ "minode" + 副标"一切皆节点";
右:图鉴按钮(BookOpen,active 高亮)+ el-dropdown 菜单
(导出存档/导入存档/新的世界(重置,ElMessageBox 确认))。

- **导出**:`game.exportSaveData()` → Blob 下载 `minode-<时间戳>.json`
  + 剪贴板兜底(Tauri webview 可能拦截下载)。
- **导入**:隐藏 `<input type="file" accept="application/json">` →
  `file.text()` → `game.applySaveData(text)`;失败 ElMessage 报错。
  `input.value=""` 允许重复选择同一文件。

## 10. StatusBar.vue

左:已保存(CloudCheck 绿)+ 世界 N + 物品 M + 时长(hh:mm:ss,playSeconds);
右:最新日志按钮(点击 `ui.logOpen=true` 开日志抽屉)。
移动端只留"已保存"与日志。

## 11. styles/main.css —— 主题与全局

- 设计变量(:root):调色板(bg #f3f6ec / panel 白 / accent 绿 #3d8b57 / 文字三档灰绿)、
  尺寸(--row-h 34px,触屏 40px / --topbar-h 48px / --status-h 26px)、
  字体(--mono / --sans)、--radius / --shadow。
- Element Plus 主色对齐:`--el-color-primary: var(--accent)` 等一组覆盖。
- `.row-main/.slot/.draggable` 的 `user-select:none`(需求:拖动对象禁文字选中)。
- 触发动画 keyframes:`row-pulse`(背景闪 accent-soft)、`icon-pop`(图标放大回弹)。
- 拖拽反馈:`.sortable-ghost`(占位半透明)、`.sortable-fallback`(虚影,见 05 §2)。
- 历史遗留清理:底部导航/物品栏样式已删;新增界面前先确认变量没有孤儿引用。
