# 14 · 视觉与艺术创作指南(图标 / 配色 / 样式 / 动效)

> 面向"想改外观"的 AI / 美术向开发。先讲清**视觉决策链的架构**,
> 再逐项给"改什么 → 去哪改 → 怎么改"的操作说明,最后是动效设计与扩展新视觉钩子的方法。

---

## 1. 架构总览:视觉决策链(三层)

```
┌─ 第 1 层:数据(每个节点类型一份) ────────────────────────────┐
│  registry.ts → NodeDef                                        │
│    icon:    "forest"     ← 图标键(指向 game/icons.ts 的 ICONS)│
│    accent:  "#3d8b57"    ← 该类型的视觉主色(css color)       │
│    category:"terrain"    ← 间接决定分类小标签的颜色类          │
└───────────────────────────────────────────────────────────────┘
                              ↓ 消费
┌─ 第 2 层:组件(把数据翻译成 DOM) ────────────────────────────┐
│  NodeIcon.vue   : <component :is="ICONS[def.icon] ?? hand"    │
│                   :style="def.accent && {color: accent}">     │
│  NodeItem.vue   : 行结构;名称 :style="accent";行 :style 绑    │
│                   定 --node-accent CSS 变量;类绑定 selected/  │
│                   functional/view-toggle/work-track/cat-xxx   │
└───────────────────────────────────────────────────────────────┘
                              ↓ 挂载
┌─ 第 3 层:表现(CSS) ─────────────────────────────────────────┐
│  styles/main.css : 全局主题(:root 调色板/尺寸/字体变量)、    │
│                    Element Plus 对齐、拖拽反馈、触发动画        │
│  NodeItem <style scoped> : 行/徽标/折叠钮等结构样式            │
│  各组件 <style scoped>    : 自己的布局样式                      │
└───────────────────────────────────────────────────────────────┘
```

**核心约定:样式是"按类型"而不是"按实例"**——同一 type 的所有节点共享一套外观
(这正是"换个图标/配色 = 改一条 def"的原因)。若未来需要每实例皮肤,
见 §7.3 的扩展路径。

另一个关键事实:**主题色全部走 CSS 变量**(`:root` 里的 `--accent` 等),
组件样式只引用变量——所以换全局配色只动 main.css 一处。

---

## 2. 给节点/物品换图标

> 图标系统在 `src/game/icons.ts`:像素贴图**自动注册**(丢文件即生效),
> lucide 线条图标显式声明,同名时贴图覆盖 lucide。
> 消费端(NodeIcon)只认 `ICONS[键]`,不关心来源。

### 2.1 方法一:像素贴图(推荐,零代码)

把图片直接丢进 `src/assets/icons/`,文件名(去扩展名)就是图标键:

```
src/assets/icons/charcoal.png  →  def 里 icon: "charcoal"
```

- 支持 png / webp / gif / svg / jpg,构建期 import.meta.glob 自动注册;
- 文件名即键的语义:只剥**最后一个**扩展名(`wood.v2.png` → 键 `wood.v2`);
  大小写敏感;同名不同扩展(`wood.png` + `wood.svg`)按字母序后者覆盖前者;
- 渲染为 `<img class="px-icon">`(main.css:`image-rendering: pixelated`,
  按 size prop 缩放)——**不吃 accent 着色**(位图没有 currentColor);
- **同名覆盖 lucide**:想替掉某个线框图标,放一张同名贴图即可,
  逐个迁移像素风不用改任何代码。

### 2.2 方法二:改用已有图标(最快)

```ts
// registry.ts → NODE_DEFS 里对应 def
{ id: "wood", icon: "wood" → 改成 ICONS 里已有的任何键,如 "stick" }
```
可用键 = ICONS 的键名(lucide:forest / river / stone / stick / stoneAxe /
hand / explorer / bench / backpackNode / waterwheel;贴图:assets/icons/ 下的文件名)。

### 2.3 方法三:注册一个新 lucide 图标

```ts
// src/game/icons.ts:顶部 import,再进 LUCIDE_ICONS 对象字面量
import { Flame } from "lucide-vue-next"
// …
flame: markRaw(Flame),
// 然后 def.icon: "flame"
```

⚠️ **lucide 图标名随版本变动**(例:`HelpCircle` 已不存在、
`MoreVertical→EllipsisVertical`、`TerminalSquare→SquareTerminal`)。
引用前必须验证存在:

```bash
grep "declare const Flame:" node_modules/lucide-vue-next/dist/lucide-vue-next.d.ts
```

⚠️ 必须 `markRaw()` 包裹——否则 Vue 会代理组件对象(性能 + 潜在告警)。

### 2.4 方法四:任意 SVG 组件(突破 lucide 限制)

lucide 的组件就是渲染 `<svg>` 的函数组件,自定义 SVG 包装成同样接口
(接受 `{ size }` 返回 svg)后,运行时挂进 ICONS 或在 icons.ts 里注册:

```tsx
const MyGem = (props: { size?: number }) =>
  h('svg', { width: props.size ?? 15, height: props.size ?? 15, viewBox: '0 0 24 24' },
    h('path', { d: 'M12 2 L22 12 L12 22 L2 12 Z', fill: 'currentColor' }))
minode.registerIcon("myGem", markRaw(MyGem))   // 运行时;或写进 icons.ts
```

### 2.5 方法五:运行时(不改源码,试玩/差异化)

```js
import { Flame } from "lucide-vue-next"        // 控制台里可用 window 上的
minode.registerIcon("flame", Flame)             // DEV 下已挂 window.minode
minode.registerNode({ ...def, icon: "flame" })  // 覆盖或新建
```
运行时注册**不持久化**(刷新即失),适合验证效果后再落进源码。

### 2.6 图标渲染链细节(NodeIcon.vue 全文即 19 行)

```
ICONS[getDef(type).icon] ?? ICONS.hand   ← 未知类型兜底手型图标
:size="size ?? 15"
class="nt-icon cat-{category}"           ← 分类类(可做图标底色/滤镜钩子)
:style="def.accent ? { color: accent } : undefined"   ← 主色着色
```
lucide 图标用 `currentColor`,所以 **accent 天然作用于图标描边**;
像素贴图是 `<img>`,accent 只作用于名称文字(位图不吃着色)。

---

## 3. 给节点换配色

### 3.1 单类型主色:NodeDef.accent

```ts
{ id: "forest", accent: "#3d8b57", … }
```
accent 同时作用三处:
1. 图标颜色(NodeIcon 内联 style);
2. 节点名称文字色(NodeItem `:style="def.accent ? { color: def.accent }"`);
3. 写入行内 CSS 变量 `--node-accent`(NodeItem 行上)——**工作进度条
   消费它**(行底细线填的就是这个色,见 §5),其他样式也可用它,
   记得带 fallback:`var(--node-accent, var(--accent))`,例如:
   ```css
   .row-main.selected { border-left-color: var(--node-accent, var(--accent)); }
   ```

任何合法 css color 都行:`#hex` / `rgb()` / `var(--orange)` 等。

### 3.2 分类小标签颜色

行内分类标签(`地形/资源/工具/功能`)按 category 着色,
在 **NodeItem 的 scoped style** 里:

```css
.nt-cat.cat-terrain { color: var(--green); }   /* 地形绿 */
.nt-cat.cat-tool    { color: var(--purple); }  /* 工具紫 */
/* material 无规则 → 默认 --fg-faint */
```
改法:改这里的 `var(...)` 或新增 `.nt-cat.cat-xxx` 规则。

### 3.3 全局主题(整套配色)

**只改 `styles/main.css` 的 `:root`**,全站跟随(组件只引用变量):

| 变量 | 用途 | 当前值 |
|---|---|---|
| `--bg` / `--bg-panel` / `--bg-soft` | 页面底 / 面板底 / 软底 | #f3f6ec / #fff / #f8faf3 |
| `--hover` / `--active` | 行悬停 / 按下 | #edf3e3 / #e2eed4 |
| `--border` / `--guide` | 边框 / 缩进引导线 | #e2e8d6 / #dde6cd |
| `--fg` / `--fg-dim` / `--fg-faint` | 文字三档 | #37423a / #6e7d6f / #9aa896 |
| `--accent` / `--accent-soft` | 主色 / 主色淡底(选中态) | #3d8b57 / rgba |
| `--green/--orange/--red/--purple/--cyan` | 语义色(日志/标签) | … |
| `--row-h/--topbar-h/--status-h` | 尺寸(触屏自动放大行高,见 §6.5) | 34/48/26px |
| `--mono/--sans` | 字体栈 | … |
| `--radius/--shadow` | 圆角 / 阴影 | 10px / … |

另外三处全局视觉:
- `body` 背景:一层超淡径向渐绿渐变 + `--bg`(换暗色主题时改这里和调色板);
- Element Plus 对齐:`--el-color-primary: var(--accent)` 等(按钮/抽屉跟随主色);
- 滚动条:细 + #c9d6bb。

**做暗色主题的最小步骤**:复制一份 `:root` 值改为暗色 →(可选)加
`prefers-color-scheme` 媒体查询或手动切换 `html.dark` 类;组件无需动。
注意 EP 也有暗色包(`element-plus/theme-chalk/dark/css-vars.css`),历史上用过又移除。

---

## 4. 行节点样式解剖(改"长相"的主战场)

NodeItem 的行(`.row-main`)从左到右:

```
[(图标) 名称]=触发按钮/身份块  [副标题/分类标签] [flex填充] [×N徽标|子数胶囊] [⚙(bench)] [⋯]
```

| 元素 | 类名 | 关键样式(scoped,NodeItem) |
|---|---|---|
| 行容器 | `.row-main` | 全宽、高 var(--row-h)、无边框、左 2px 透明边、圆角 7、user-select:none;点击=折叠/展开 |
| 悬停/按下 | `:hover/:active` | `--hover`/`--active` 底色 |
| 选中 | `.selected` | `--accent-soft` 底 + 左边框染 `--accent` |
| 功能节点 | `.functional` | 名称 600 加粗 |
| 视图开关 | `.view-toggle` | 名称 700 |
| 触发按钮/身份块 | `.nt-id` / `.act-trigger` | 行最左侧,图标+名字合一:accent 6% 极淡底胶囊(悬停 14%、按下 17%+scale .97)、高 26px(触屏 28px,≈行高 76%);不可触发的行为同构静态块(同 padding 对齐,无底色);`.row-main.expanded` 时按钮加 inset 1px accent 22% 细描边(展开态线索) |
| 名称 | `.nt-name` | accent 内联着色;nowrap(在身份块内) |
| 副标题 | `.nt-sub` | 11px 淡色;`.view-state` 背包开合态;`.auto-state` 水车就位态 |
| 分类标签 | `.nt-cat` + `.cat-xxx` | 10px;terrain 绿 / tool 紫 |
| 堆徽标 | `.nt-pile` | `×N`(nodeCount),11px mono |
| 子数胶囊 | `.nt-kids` | 10px,软底+边框圆胶囊 |
| 行尾按钮 | `.row-act` | 24px;透明度 .35(悬停/选中→1;触屏恒 .55);hover 底色 |

**子列表**(`.child-list`):缩进 18px + 1px 左引导线(`--guide`);
空列表不画线(避免残留短竖线);`.stack-list`(堆)下
`> .node-wrap:nth-child(n+5){display:none}` 占位隐藏;省略行 `.stack-ellipsis`
在列表外、`pointer-events:none`。

**改"行风格"的典型操作**:
- 想要卡片式(有边框/间距):改 `.row-main` 加 border/margin —— 但注意拖拽索引
  依赖 DOM 顺序而非视觉,加间距安全;加**外边距**会影响咬合区定位,需同步调
  `.app.dragging .child-list.is-empty` 的负 margin 值;
- 想改选中样式:`.row-main.selected`;
- 想改堆徽标:`.nt-pile`。

---

## 5. 动效设计

### 5.1 现有动效清单

| 动效 | 触发 | 实现 | 位置 |
|---|---|---|---|
| **工作进度条** work-track | 节点开始做事(触发挂上工作) | 行底 2px 细线,该类型 accent 色从左向右匀速填满,到点结算后消失 | NodeItem scoped keyframes;数据源 game/work.ts |
| 触发按钮反馈 | .act-trigger | hover 加深/按下 scale .97;展开态 inset 细描边 | NodeItem scoped |
| 行悬停渐变 | :hover | background transition 0.12s | NodeItem scoped |
| 拖拽占位 | 拖动中 | `.sortable-ghost` opacity .35 | main.css |
| 拖拽虚影 | fallback 拖动 | 库克隆 + CSS 微调(§5.4) | main.css |
| 列表重排动画 | 拖放 | SortableJS `animation:150` | DND_COMMON |
| 图鉴浮窗进出 | 开/关 | Vue `<Transition name="float">` opacity+translateY 0.16s | App.vue |
| 抽屉/对话框 | EP 内建 | el-drawer/el-dialog 自带 | — |

(历史:触发反馈迭代过三轮——①fireFx 图标弹跳+背景闪(嫌潦草)→
②水平色波/灰波表达成功与无效(嫌花哨,已删)→③工作进度条:
反馈服务于信息(这件事要做多久)而不是装饰。)

### 5.2 工作进度条的架构(game/work.ts)

**数据与视觉分离**:store 挂工作(reactive Map),NodeItem 拉取渲染:

```
store 触发(triggerNode)           game/work.ts                   NodeItem
点击/自动驱动同源     ──挂──▶  reactive Map<nodeId, WorkJob>  ──读──▶  .work-track
  startWork + setTimeout          {kind, endAt, durationMs,       animation-duration
  resolveWork 到点结算             silent}(store 外,不落盘)      = 剩余时间,scaleX 填充
  onClock 按 endAt 对账
```

- **进度即剩余时间**:挂载行元素时 `animation-duration = endAt − Date.now()`,
  CSS `scaleX(0→1)` linear forwards 匀速填满——纯 transform 无布局开销,
  无 JS 帧驱动;到点结算清掉工作记录,细线随 v-if 消失。
- **Map 按键追踪**:Vue 的 reactive Map 让写入只触达对应行的 computed,
  不惊动整棵树;reset/导入存档时 clearAllWork 全清。
- **颜色**:该类型自己的 accent(`--node-accent`,缺省全局 `--accent`)
  85% 透明度——2px 细线在浅底上太淡会看不见,刻意不降。
- **位置**:行底贴边(left/right/bottom 0),行 `overflow: hidden` 裁进
  圆角;`pointer-events: none` 不挡拖拽手柄。

想改观感:NodeItem scoped 的 `.work-track`(颜色/粗细/位置);
节奏数值在 registry 的 `workMs`(见 03 §2.1)。

**未来扩展(同一数据源,引擎零改动)**:
- 完成时的轻反馈:resolveWork 处订阅 endAt 清除瞬间做一次性小动效;
- 忙碌态扩展:进度条之外加行内"忙碌"图标/文字(读同一个 workOf);
- 按类型差异化:NodeDef 加进度条样式字段,NodeItem 渲染时读取。

### 5.3 动效设计原则(项目约定)

1. **克制、护眼**:淡入淡出/轻位移为主,无弹跳过场、无大面积闪烁;
2. **短**:交互反馈 ≤600ms,浮层过渡 ~160ms;
3. **可连发**:fx 用 rAF 重触发;不做"播放中屏蔽点击";
4. **不阻塞**:全部纯 CSS 动画,无 JS 帧驱动;遵循 `prefers-reduced-motion`
   的适配还没做(可作为改进项);
5. **有语义**:gain 绿 / warn 橙 / craft 紫(日志与状态栏共用语义色变量)。

### 5.4 拖拽虚影(重要约定:不要自造)

虚影 = SortableJS `forceFallback` 机制的官方克隆(跟随指针),我们只微调:

```css
/* main.css */
.sortable-fallback {
  width: min(70vw, 320px) !important;   /* 库写了内联宽高,必须 !important 覆盖 */
  height: auto !important;
  opacity: 0.92; border-radius: 8px;
  background: var(--bg-panel); border: 1px solid var(--border);
  box-shadow: 0 8px 22px rgba(50,80,50,.22);
  overflow: hidden;
}
.sortable-fallback .child-list { display: none !important; }  /* 只带一行不带子树 */
```
历史教训:自制 setDragImage 预览图、原生 DnD 默认虚影都试过被弃——
**改虚影观感只动这两个规则**,不要换机制(用户明确要求用库的方案)。

---

## 6. 响应式与触屏

1. **断点**:`@media (hover: none)`(触屏)在 `:root` 放大 `--row-h` 到 40px,
   NodeItem 里把 `.row-act` 常显(opacity .55);其余布局断点 900px(App/各组件)。
2. **拖拽 vs 滚动**:`delay:150 + delayOnTouchOnly`(按住 150ms 才拖)。
3. **边缘手势**:App.vue 左缘右滑开图鉴、右缘左滑开检查器
   (起点在 `[data-node-id]` 上不触发,避免和拖拽打架)。
4. `user-select:none` 全部可拖动元素(main.css `.row-main` 等规则)——需求方明确要求。
5. 省略行/咬合区都考虑了手指目标尺寸(咬合区 ≥14px + emptyInsertThreshold 12)。

---

## 7. 扩展新的视觉钩子(架构方法)

### 7.1 标准三步:加 def 字段 → 绑类/样式 → 写 CSS

以"给某类节点加发光"为例:

```ts
// ① types.ts NodeDef 加字段
glow?: boolean

// ② registry.ts 给想要的 def 设 true(如 stoneAxe)

// ③ NodeItem.vue 行上绑类
:class="{ …, 'has-glow': def.glow }"

// ④ CSS(scoped 可,若涉及子组件用全局)
.row-main.has-glow .nt-icon { filter: drop-shadow(0 0 4px var(--node-accent, var(--accent))); }
```
文字类自定义(chipLabel/chipColor)、行底色(rowTint)、徽标形状等同理。
**凡是"按类型"的外观差异都走这条路**,引擎零改动。

### 7.2 颜色优先用变量

新样式尽量 `var(--xxx)`;要新语义色就在 `:root` 加变量,
避免散落的硬编码 hex(现在语义色变量:green/orange/red/purple/cyan)。

### 7.3 每实例皮肤(目前不支持,扩展路径)

现状:外观只由 type 决定。若要"这把石斧是传说品质":
1. `GameNode` 加可选字段(如 `skin?: string`)——**需 bump SAVE_VERSION**
   并同步 pick/export/import 三处(见 07);
2. NodeItem 读 `node.skin` 优先于 def 的视觉字段;
3. 产出逻辑(addItem/craft)决定何时写 skin。

### 7.4 需要动结构的视觉(改模板)

行内新增元素(如左侧品质色条):NodeItem 模板 + scoped CSS。
注意三件事:
- 新元素不要成为拖拽手柄的障碍(手柄是整个 `.row-main`,行内点击目标要 `.stop` 或不响应);
- 嵌套内容样式引用子组件时 scoped 需 `:deep()`;
- 别破坏 `nth-child(n+5)` 占位隐藏对 `.node-wrap` 直接子级的假设。

---

## 8. 修改速查表

| 想改什么 | 去哪改 |
|---|---|
| 某物品图标 | 像素贴图:丢进 src/assets/icons/ 即注册,def.icon = 文件名(零代码);lucide:game/icons.ts(§2) |
| 某节点颜色 | registry.ts → def.accent |
| 分类标签颜色 | NodeItem.vue scoped → `.nt-cat.cat-xxx` |
| 全局配色/主题 | styles/main.css `:root` 调色板(+ body 背景 + EP 对齐) |
| 行长相(卡片式/紧凑) | NodeItem.vue scoped → `.row-main` 及相邻规则 |
| 选中态样式 | `.row-main.selected` |
| 堆徽标/子数胶囊 | `.nt-pile` / `.nt-kids` |
| 工作进度条 | NodeItem scoped `.work-track`(颜色/粗细);节奏数值 registry `workMs`;数据源 game/work.ts(§5.2) |
| 拖拽虚影 | main.css `.sortable-fallback`(只微调,勿换机制) |
| 拖拽重排速度 | dnd.ts DND_COMMON `animation` |
| 图鉴浮窗动画 | App.vue `.float-*` 过渡类 |
| 行高(触屏) | main.css `@media (hover:none)` 的 `--row-h` |
| 字体 | main.css `--mono / --sans` |
| 日志/语义色 | `:root` 的 green/orange/red/purple/cyan |

## 9. 检查清单与已知坑

- [ ] lucide 图标名 grep 过 d.ts 确认存在?markRaw 包了?
- [ ] 新 CSS 用了变量而非硬编码色?
- [ ] scoped 样式作用到子组件了吗(需要 :deep 吗)?keyframes 需要全局吗?
- [ ] 覆盖库的内联样式(虚影宽高)用 !important 了吗?
- [ ] 加间距/边框后,咬合区的负 margin 值还匹配吗?
- [ ] 触屏(hover:none)下可用性(按钮常显、目标 ≥40px)?
- [ ] 改了 GameNode 结构的话:SAVE_VERSION + 三处同步?
- [ ] 深浅色对比度(护眼浅绿底上的淡色文字是刻意分层,别一刀切提黑);
- [ ] `--node-accent` 已被工作进度条消费(work-track);其他消费点记得 fallback:
      `var(--node-accent, var(--accent))`。
