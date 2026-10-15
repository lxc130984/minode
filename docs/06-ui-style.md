# 06 · UI 规范：字符风与树布局

本篇是视觉与交互的实现规范，精确到色值与间距。布局算法（**Lisp 式渲染**：括号显形嵌套、
兄弟 token 流式换行、悬挂缩进 21px/层，D-29）是本作的识别性特征，实现时**逐字对照本篇**。

## 1. 基调：字符即 UI

终端 / 电传打字机审美：界面看起来像「用字符渲染出来的程序」，而不是「被设计过的应用」。

1. **控件即文本**：按钮就是一段文本；状态变化靠前景/背景反色表达，不靠形状变化。
2. **符号承担语义**：折叠 `[-]` / `[+]`、收起 `×`（放进节点背包）、未定义 `[?]`、
   层级线 `│`（由 border 实现）。不引入任何图标库、emoji、插图。
   空子列表在拖拽中给出一条无文字的落点条（§4.2）——提示本身也只用字符级别的笔画表达。
3. **宽度即内容宽度**：所有行内控件 `white-space: nowrap`，不设 `min-width`——
   视觉上与纯文本无法区分。
4. **行距紧贴**：行内元素间距 2-4px，行间距 1-3px。信息密度优先。

## 2. 色板

| 用途                      | 色值                                                |
| ------------------------- | --------------------------------------------------- |
| 页面背景                  | `#0b0b10`                                           |
| 主文字                    | `#b9b9c2`                                           |
| 强调（hero 数值、满仓）   | `#f0f0f4` / `#e6e6ea`                               |
| 次要文字（标签、徽标）    | `#6f6f7a` / `#55555e`                               |
| 未识别（`[?]`、未知类型） | `#8a8a95`                                           |
| 留白占位（空态文字）      | `#3a3a44` / `#34343e`                               |
| 收起按钮（`×`）           | `#6f6f7a`（hover `#d6d6de`）                        |
| 边框 / 分隔线             | `#1d1d24`（容器）、`#26262e`、`#222229`（层级竖线） |
| hover 反色                | 背景 `#d6d6de` + 文字 `#0b0b10`                     |
| 拖拽预览（ghost）         | `opacity: 0.35`                                     |
| 拖拽准备（chosen）        | 背景 `#2c2c36`（只作用于直接 chip）                 |

无渐变、无阴影、无圆角（`border-radius` 一律 0）。

### 2.1 语法高亮（种类决定色相，深度只决定亮度）

像编辑器一样按「东西是什么」上色；同色系内部越深越暗：

| 种类               | 判定（store `chipKind`）                       | 色相      | 字重 |
| ------------------ | ---------------------------------------------- | --------- | ---- |
| 函数 `k-machine`   | 该类型有配方（注册表 `recipesFor().length>0`） | `#e6b04f` | 500  |
| 符号 `k-symbol`    | 无配方的类型（原子：结果 = 自身）              | `#5fc3a6` | 400  |
| 工具 `k-tool`      | 对应物品带 `toolClass`                         | `#b98fe0` | 400  |
| 未注册 `k-unknown` | 注册表里没有这个 type（存档隔离）              | `#8a8a95` | 400  |
| 结果 `[..]`        | `.chip-ret`，命中配方                          | `#94d47f` | 继承 |
| 未解析 `[?]`       | `.chip-ret` + `.is-idle`，配方未命中           | `#e09a6a` | 继承 |
| 方括号 `[ ]`       | `.chip-bracket`（**与值分色**，D-09）          | `#7c7c85` | 继承 |
| 节点槽 `k-machine` | 节点背包格：全是节点（全部可放置）             | `#e6b04f` | 400  |
| 箱子格 `k-machine` | 箱子面板格（= 节点槽，同款矩形字符槽，可取出） | `#e6b04f` | 400  |
| 资源行 `k-symbol`  | 资源仓库行：仓库里的纯资源（只读）             | `#5fc3a6` | 400  |

实现要点：

- `--ink-base`（种类色相）挂在 `.chip`，`--dim`（深度衰减）挂在 `.node[data-depth]`；
  最终文字色 = `color-mix(in oklab, var(--ink-base), #0b0b10 var(--dim))`。
- ⚠️ **`color-mix()` 里的百分比不能写 `calc()`**——写 `calc(100% - var(--dim))` 会让整条
  声明失效、回退成继承色（表现为「深层节点直接看不见」）。用两色停靠点百分比。
- 深度衰减：2/3/4/5/6+ 层分别 8/15/22/28/34%（比早期灰度表更温和，深层仍可读）。
- `[?]` 与未注册各有一档警示色，不再和普通结果同色。

## 3. 字体与字号

```css
:root {
  color-scheme: dark;
  background: #0b0b10;
  color: #b9b9c2;
  font-family:
    ui-monospace, 'Cascadia Code', 'Source Han Mono SC', 'Noto Sans Mono CJK SC', monospace;
  font-size: 13px; /* 正文基准 */
  line-height: 1.5;
}
```

- **必须等宽**；中文回退 CJK 等宽，避免中英混排宽度跳变。
- 三档字号：`26px`（hero 数值）、`13-14px`（正文/标签）、`11-12px`（数量角标/徽标）。
- 数字格式（`utils/format.ts`）：`<1000` 直接显示（小于 10 的非整数保留两位）；
  `≥1000` 科学计数 `1.23e6`。不用千分位、不用 K/M 缩写。

## 4. 树的布局算法（核心）

### 4.1 结构（Lisp 式渲染，D-29 = D-28 大纲 + 括号 + inline 流）

- **括号显形嵌套**：表达式（有实参的节点 / 无实参的函数）渲染 `(` `)`——开括号在 chip 前，
  闭括号展开时内联在最后一个实参后（`.kids-close`）、折叠/空函数时收在行内（`( f[?] )`、`…+N`）；
  **符号（原子）无括号**。括号颜色与返回值方括号同色系（D-09），hover 反色。
- **兄弟 inline 流式换行**：`.kids > .node` 是 `inline-block` 原子盒——兄弟像 token 一样
  排满换行（浏览器原生断行）；断行不再「乱」——括号就是分组的视觉边界。
- **悬挂缩进固定 21px/层**（`margin-left + padding-left + border-left`）：宽度有界，
  不做「对齐开括号」（宽度会无界，D-29 评估结论）；高度随内容增长，随页面滚动。
- **自动折叠（D-28 保留）**：默认只展开前 2 层（`FOLD_DEPTH = 2`）；大子树落到第 3 层及以下
  自动折叠；调试面板有「全部折叠/展开全部」。
- **滚动手感**：纵向 = 页面滚动；真实拖拽靠 SortableJS 的窗口自动滚动（默认配置）；
  放置模式靠视觉层 rAF 边缘自动滚动（指针停在视口上下边缘 60px 内滚页面，每帧重算落点）。

```
.root-list（块级流）
  冶炼炉[铁]<3/10> ×                     ← .node-row（根，纵向堆叠）
  │ 铁矿石<5/64> ×  煤炭<2/64> ×  氧气<1/64> ×   ← .kids（横向流式换行）
  熔炉[?]<0/16> ×                        ← 下一个根，纵向

（“│” 是 .kids 的 1px border-left，不是渲染出来的字符）
```

- **顺序 = `children` 数组顺序**，拖拽即重排、即编辑实参顺序；**没有任何自动排序**。
- 递归：每个子节点又是一个 `.node`（row + kids），深度不设上限。

### 4.2 CSS 关键值（照抄）

```css
#app {
  max-width: 860px;
  margin: 0 auto;
  padding: 12px 16px 40px;
}
.root-list {
  min-height: 160px;
  padding: 6px 8px;
  border: 1px solid #1d1d24;
} /* 块级流 → 根纵向 */
.root-list:empty::before {
  content: 'empty';
  display: block;
  padding: 8px;
  color: #3c3c46;
}
.node {
  padding: 1px 0;
}
.node-row {
  display: flex;
  align-items: center;
  gap: 3px;
}
.kids {
  /* 悬挂缩进块（21px/层 + 层级竖线）；兄弟 .node 是 inline-block 流式换行（D-29） */
  margin: 1px 0 1px 13px;
  padding-left: 8px;
  border-left: 1px solid #222229; /* 层级竖线 */
  min-height: 20px;
}
.kids > .node {
  display: inline-block; /* 兄弟像 token 一样排满换行；整体是拖拽/预览的原子盒 */
  vertical-align: top;
  margin: 1px 6px 1px 0;
}
/* 空子列表平时零尺寸（不占视觉、无噪声），拖拽时才展开成落点条 */
.kids:empty {
  min-height: 0;
  margin: 0;
  padding-left: 0;
  border-left-color: transparent;
}
.app.is-dragging .kids:empty {
  position: absolute; /* ★ 脱离布局：展开/收起都不引起回流 */
  z-index: 1;
  left: 13px;
  right: 0;
  bottom: -8px;
  height: 8px;
  padding-left: 8px;
  border-left: 1px solid #2c2c36;
}
```

- 每层缩进 = 13 + 8 = 21px（累加）。
- **空子列表提示不能放真实 DOM**：Sortable 会把容器内真实元素当作列表项，
  放真实元素会破坏「DOM 顺序 ↔ 数组」映射。落点条就是空 `.kids` 自身的绝对定位形态。
- **不渲染提示文字**：落点在拖动预览里已经可见，多一行文字只是噪声。
- **落点条必须整体位于行下方**（`bottom: -8px; height: 8px`，即占 `[行底, 行底+8]`）：
  节点一旦被插入，该列表不再 `:empty`、落点条随即消失；此时指针必须落在
  **被插入子节点的行**（属于本列表）上。若落点条与行重叠，指针会落回外层列表的行上，
  Sortable 会把节点再拽出去——嵌套会「刚进就被弹回」。
- **空子列表的展开由拖拽状态驱动**（`.app.is-dragging`，由 `on-start` / `on-end` 维护）：
  平时零尺寸避免每个叶子多一行噪声，拖动时自动变成 8px 高的落点条。

### 4.3 深度着色（静态可读）

层级越深，墨色越淡（该层的层级竖线也一并加深），静止时也能一眼看出嵌套轮廓：

| 深度 | chip 墨色 | 层级竖线  |
| ---- | --------- | --------- |
| 1    | `#d8d8de` | `#2c2c36` |
| 2    | `#c4c4cd` | `#26262e` |
| 3    | `#acacb6` | `#212129` |
| 4    | `#98989f` | `#1d1d24` |
| 5    | `#88888f` | 同 4      |
| 6+   | `#7c7c85` | 同 4      |

实现：`TreeNode` 接收 `:depth`（根为 1）并透传给子节点，渲染成 `.node[data-depth]`；
CSS 用 `--ink` / `--guide` 两个自定义属性承接——纯样式、零 JS 参与、零额外 DOM。

## 5. chip 文本与点击分区

chip 就是**一个按钮**，文本由名称与结果组成：

```html
<button class="chip" :class="[state, { pulse }]" title="点击 eval（只有函数节点会响应）">
  <span class="chip-name">冶炼炉</span><span class="chip-ret">[铁]</span>
</button>
```

- 文本构成规则见 01 篇 §1（`name[ret]`、`[?]`、原子省略、折叠徽标）。
- `.chip { display: inline-flex; white-space: nowrap; padding: 0 3px; color: #cfcfd6; cursor: grab }`；
  hover → 反色（背景 `#d6d6de`、文字 `#0b0b10`）。
- 状态类：
  - `.is-unknown`（未注册类型）：名称/`[?]` 全部 `#8a8a95`；
  - `.is-idle`（`[?]`：配方检测不通过——实参不符或子节点未识别）：`[?]` 用 `#8a8a95`。

## 6. 交互态规范

| 状态            | 表达                                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| hover（可点区） | 前景/背景互换，无过渡或极短过渡                                                                                                 |
| 拖拽准备        | **只有**被拖节点的直接 chip：`.sortable-chosen > .node-row > .chip { background: #2c2c36 }`（禁止后代选择器，否则整棵子树闪烁） |
| 拖拽预览        | `.sortable-ghost { opacity: 0.35 }`                                                                                             |
| 点击反馈        | `.chip.pulse { animation: chip-pulse 0.35s ease-out }`：0% 反色 → 100% 透明；只作用于本次产出成功的节点（02 篇 §8）             |
| 折叠钮          | `[-]` / `[+]`，颜色 `#55555e`，hover `#d6d6de`                                                                                  |
| 折叠徽标        | `+N`（子树节点数），12px、`#55555e`                                                                                             |
| 收起按钮        | `×`：`#6f6f7a`，hover `#d6d6de`——放进节点背包（无门槛，子节点上移）                                                             |

```css
.chip.pulse {
  animation: chip-pulse 0.35s ease-out;
}
@keyframes chip-pulse {
  0% {
    background: #d6d6de;
    color: #0b0b10;
  }
  100% {
    background: transparent;
  }
}
```

**pulse 重入坑**：直接替换集合时若节点 id 仍在集合中，class 不变、动画不重启——
必须「先清空 → rAF → 再挂回」（02 篇 §8 的实现）。

### 6.1 悬停：只给父节点加下划线（深树可读）

| 角色   | 元素                      | 反应                                                                         |
| ------ | ------------------------- | ---------------------------------------------------------------------------- |
| self   | 悬停的 chip               | 反色（CSS `:hover`，见 §2）                                                  |
| parent | 悬停节点的**父节点** chip | 加下划线（`#e6e6ea`、2px、offset 4px）——一眼看出「这个节点挂在哪条实参位上」 |
| 其它   | 祖先链 / 同级             | 不动                                                                         |

```css
.chip.is-hover-parent {
  text-decoration: underline;
  text-decoration-thickness: 2px; /* 细线在深色底上不够显眼（实测） */
  text-decoration-color: #e6e6ea;
  text-underline-offset: 4px;
}
```

- `setHover(id)` 只保存悬停 id，并把**父节点 id** 写进按 id 分键的 `shallowReactive` 记录
  （`hoverParentAt`）；`TreeNode` 用 `isHoveredParent(node)` 读它——**只重渲染这一对节点**
  （与 pulse 同一条纪律：不做全树高亮）。
- 父节点由 `pathTo(id)` 的倒数第二项取得（借助 id 索引，O(深度)）；不标记祖先链、不标记同级。
- 结构变更 / 重置时自动清空悬停状态（`afterStructureChange` → `setHover(null)`）。
- 只用灰阶与下划线表达，**不允许**用饱和色或加粗抢焦点。

> 历史：早期版本是「祖先链底纹 + 同级点线」，每次悬停要写十几个键、视觉噪声也大，
> 已简化为「只标父节点」。改动时同步删掉旧角色 CSS，避免两套高亮并存。

## 7. 折叠与空态

| 情形       | 表达                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------- |
| 折叠       | `.fold` 文本 `[+]`、出现 `+N` 徽标、`.kids` 整体不渲染（`v-if` 级卸载 → 结构上不可拖入） |
| 根列表为空 | `empty`（`:empty::before`，接近背景色）                                                  |
| 子列表为空 | 平时零尺寸（无噪声）；**拖拽中**展开为行下方的落点条（§4.2）                             |
| 未注册类型 | 名称显示 `?`，不可求值，可拖拽/删除                                                      |

## 8. 布局：左侧纵向节点背包 + 资源仓库

```
┌ 节点背包（侧栏，sticky）┐ ┌ 主区（树区）─────────────┐
│ 冶炼炉 熔炉 铁矿        │ │ HUD：手持 · 提示          │
│ …（27 格 = 3 列 × 9 行）│ │ 树区（§4）                │
│                         │ │ debug                     │
│ 资源仓库                 │ └───────────────────────────┘
│ 铁 × 8                  │
│ 煤 × 4                  │
└─────────────────────────┘
```

- `.app { display: flex; gap: 12px; align-items: flex-start }`；
  `.sidebar { position: sticky; top: 12px; display: flex; flex-direction: column; gap: 8px }`
  ——侧栏紧贴树区（拖拽节点入/出树的路径短），滚动时保持可见。
- `.main { flex: 1; min-width: 0 }`（HUD + 树 + debug）；`#app` 最大宽度 920px。
- 节点格是**矩形字符槽**（与 chip 同款），13px；资源行 12px。

| 元素               | 规格                                                                                                                                                                                                                          |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.bag-grid`        | 容器网格（节点背包与箱子同款）：**单个扁平列表** + `grid-template-columns: repeat(3, minmax(56px, auto))`（27 格 = 3 列 × 9 行），`gap: 2px 6px`。格位固定：拖拽不挤位（D-24）                                                |
| `.bag-slot`        | **矩形字符槽**（与 chip 同款）：`inline-flex; min-width: 56px`，无边框；`k-machine` 色相；hover 底 `#24242c`；选中反色 `#d6d6de`/`#0b0b10`。每格带 `data-bag-index` = **扁平下标**；`NodeSlot.vue` 是背包格与箱子格的统一组件 |
| `.bag-name`        | 13px；节点名（`store.nodeName`），颜色 = `k-machine`（§2.1）                                                                                                                                                                  |
| `.bag-placeholder` | 空槽 `·`，接近背景色 `#3a3a44`                                                                                                                                                                                                |
| `.warehouse`       | 资源仓库：只读纵向列表、`gap: 2px`；**无槽位、无光标、不参与拖拽**                                                                                                                                                            |
| `.wh-row`          | 一行「名称 × 数量」                                                                                                                                                                                                           |
| `.wh-name`         | 资源名（`store.resourceLabel`），颜色 = `k-symbol`（§2.1）                                                                                                                                                                    |
| `.wh-count`        | `× N`（`fmt`），`#6f6f7a`                                                                                                                                                                                                     |
| `.wh-empty`        | 空态 `空`，接近背景色 `#3a3a44`                                                                                                                                                                                               |
| `.side-title`      | 11px、`#55555e`（"节点背包" / "资源仓库" 标签）                                                                                                                                                                               |
| 光标堆             | `.cursor-stack`：`position: fixed`，跟随鼠标 +8px，`pointer-events: none`，显示光标拿着的堆（名称 × 数量）                                                                                                                    |

格子内容一律是字符（节点名），没有图标；空槽 `·` 用接近背景的 `#3a3a44`。

**容器手势**（docs/04 §3 的表是唯一事实源；tooltip 文案与之一致）：
单击 = 选中（背包）/ 取 1 个（箱子）；双击 / 滚轮 = 转 1 个到对侧；右键 = 光标拿起/放下；
拖拽 = 整组（统一落位规则）。

### 8.1 浮动窗口（箱子）

点击树上带 `panel` 的节点（当前只有 `chest`）→ 树区**蒙一层灰**（不可交互，点灰层关闭窗口），
面板在主区**左缘**（紧贴节点背包，只留 12px 缝隙）浮出一个窗口；
可以盖住树区，但左侧节点背包与资源仓库始终可见可用。

```
┌ 节点背包 ┐ ┌ 主区 ──────────────────────────────┐
│ …        │ │ HUD      ┌ 箱子 ▣ ────── × ┐ │ │ ← 贴左缘、不铺满
│ 资源仓库 │ │ 树区     │ 从背包双击/拖入   │ │ │
│          │ │ (蒙灰)   │ …27 格同款网格    │ │ │
│          │ │ debug    └──────────────────┘ │ │
└──────────┘ └──────────────────────────────────┘
```

定位与外观（`.panel`，相对 `.main`——`.main { position: relative }`）：

| 属性   | 值                                                                       |
| ------ | ------------------------------------------------------------------------ |
| 定位   | `position: absolute; top: 12px; left: 0`（主区左缘；`.main` 为定位锚点） |
| 宽度   | `min(560px, 74%)`（可盖住树区；左侧背包/仓库不被遮挡）                   |
| 高度   | 自适应，`max-height: 60vh; overflow: auto`                               |
| 边框   | `1px solid #2c2c36`                                                      |
| 背景   | `rgba(11, 11, 16, 0.96)`（半透明深底）                                   |
| 层级   | `z-index: 20`（高于树，低于光标堆 `z-index: 30`）                        |
| 内边距 | `6px 8px`；纵向 `gap: 4px`                                               |

结构（`.panel` 内自上而下）：

1. `.panel-head`：`.panel-title`（「箱子」）＋ `.panel-hint`
   （`容量 xx/128 · 背包单击/双击转入 · 点行取回`）＋ `.panel-close`（右上角 `×`）。
   标题栏可拖动窗口（原生 pointer 事件 + `setPointerCapture`，无第三方库，D-16）。
2. `.bag-list`（箱子物品行）：与背包同款；单击/滚轮 = 取 1 个回背包、双击 = 整项取回。

**可点开暗示**：带 `panel` 的节点在树上的 chip 名字后加 `.chip-panel` 标记 `▣`
（`#55555e`，低调），表示「这个节点能点开浮动窗口」。

## 9. 拖拽实现参数（vue-draggable-plus）

| 参数                     | 树根 `.root-list` / 子 `.kids`               | 容器 `.bag-grid`（背包/箱子）                                              |
| ------------------------ | -------------------------------------------- | -------------------------------------------------------------------------- |
| 数据绑定                 | `:model-value`（**树只读它渲染，不写回**）   | `:model-value`（**不写回**；落位由 store 的 `handleDrop` 处理）            |
| `group`                  | `{ name: 'nodes' }`                          | `{ name: 'nodes' }`（与树同 group；容器→树 = 放 1 个，见 docs/04 §3）      |
| `handle`                 | `.chip, .bag-slot`                           | `.bag-slot`                                                                |
| `empty-insert-threshold` | 根 `30` / 子 `8`（空落点条展开后本身可命中） | —                                                                          |
| `clone`                  | —（无 clone）                                | —                                                                          |
| `on-move`                | `guardCycle`（防环）                         | `guardContainerMove`：目标是容器 → **不做插入预览**（格位固定）；树 → 允许 |
| `on-start` / `on-end`    | `setDragging(true)`；`end` → `handleDrop`    | `startPanelDrag()`；`end` → `handleDrop`（**源容器**送事件，只处理一次）   |
| 容器标识                 | —                                            | `data-list="bag"                                                           | "chest"`（+箱子 `data-owner`）、每格 `data-bag-index` = 扁平下标 |

**落位三层分工（D-24）**：`tree-drop.ts` 读 DOM（`readDrop` 源 + 树内目标、
`slotUnderPointer`/`treeZoneUnderPointer` 指针落点）→ `drop-action.ts` 的 `routeDrop`
纯函数出动作 → `store.execDrop` 写模型。目标未知 / 被拒 → `requestTreeRebuild()` 自愈。

坑清单（全部踩过，直接复用经验）：

1. **防环用 DOM 包含判断**（`!evt.dragged.contains(evt.to)`），守卫接口用 duck-typing
   便于无 DOM 单测；数据层再加 `writeList` 校验与 `execDrop` 的 `subtreeContains` 两道纵深。
2. **落位不能读 DOM 顺序**：vue-draggable-plus 在 `on-end` 之前已把 DOM 复位
   （v-model 没变就回滚），读到的顺序是旧的 → 落位会静默变成空操作。只用
   「节点 id + 源/目标属主 + `newIndex`」这套身份信息。
3. **容器目标一律问指针**：SortableJS 报的容器落点在复位/掐预览后不可信
   （D-16~D-23 的核心教训）；`elementFromPoint → [data-bag-index]` 取格。
4. **`empty-insert-threshold` 决定空容器可拖入半径**；空提示不能是真实 DOM，
   且落点条必须整体位于行**下方**（§4.2 有原因）。
5. **e2e 驱动需要 rAF 等待**（pointerdown → dragstart → dragover×3 → drop →
   dragend，dragover 要派发到 `elementFromPoint` 命中的真实元素）。
6. **拖拽结束立刻 click 会被 Sortable 吞掉**，e2e 分两次操作。
7. **`sortable-chosen` 高亮只作用于直接 chip**（§6 选择器）。
8. **同一节点绝不能出现在两个列表里**：跨列表移动必须「先摘后插」；
   旧实现的「复制到目标」会让 Vue 的 keyed diff 与 SortableJS 的元素映射同时失配——
   症状是「拖一次之后再也拖不动」+「配方乱检测」，且折叠展开一次又暂时好。
9. **落位失败要能自愈**：`requestTreeRebuild()`（`renderVersion` +1）让 Vue 从模型整体重建树 DOM，
   等价于手动折叠展开一次；这条兜底让「DOM 与模型漂移」的旧症状不再需要人手救。
10. **合成事件 e2e 的节点拖拽**：`dragstart` 派发在 `.chip` / `.bag-slot` 上，`dragover`/`drop`
    仍要派发到 `elementFromPoint` 命中的真实元素（`.kids` / `.root-list` / `.bag-grid`）。

## 10. 反模式清单（禁止出现）

- 圆角、盒阴影、渐变、彩色遮罩、任何 `border-radius`；
- 图标库、emoji、插图、logo；
- `min-width`/`max-width` 撑出的「卡片感」；居中文本块（hero 除外）；
- chip 类控件内边距 > 3px、行内间距 > 4px；
- 过渡/动画长于 0.4s；弹窗/遮罩/抽屉（一律用 `<details>` 或行内反色替代）；
- 任何饱和色（当前调色板是纯灰阶：无警示色例外；需要警示时用反色或字重表达）。

## 11. 检查清单

- [ ] 根纵向（块级流）/ 子级横向（flex-wrap）逐字对照 §4.2 数值
- [ ] chip 是单按钮（`name[ret]`），hover 反色；符号无 `[]`，函数显示结果或 `[?]`
- [ ] `[?]`、原子省略、`+N` 徽标、空态伪元素全部符合 01/06 篇
- [ ] chosen 高亮用直接子选择器；ghost 0.35；pulse 可重入重启
- [ ] 折叠 = 子列表不渲染（不可拖入）
- [ ] 深度着色生效（`.node[data-depth]` → `--ink`/`--guide`），深树静止可读
- [ ] 悬停生效：self 反色 / 父节点下划线（D-04）；无全树重渲染
- [ ] 等宽字体 + 三档字号 + 科学计数格式；无任何反模式元素
