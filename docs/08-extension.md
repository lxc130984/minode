# 08 · 内容创作指南(src/content/ + game/api.ts)

> 加游戏内容的**唯一入口**是 `game/api.ts`;内置内容与扩展走同一条路。
> - **静态内容(进版本库,推荐)**:`src/content/` 下加文件 → content/index.ts 挂上;
> - **动态内容(试玩/控制台,DEV)**:`minode.*`(刷新即失);
> - 注册即校验:引用缺失会有可操作的 `[minode]` console 警告;
>   `minode.validate()` 随时全量体检。
> - 图标(美术)单独走 `src/assets/icons/` 丢文件(见 §5),不用写代码。

## 1. 加一批内容(推荐姿势:内容包)

```ts
// src/content/metal.ts —— 新内容包
import { registerContent } from "../game/api"
import type { ContentPack } from "../game/api"

registerContent({
  nodes: [
    { id: "charcoal", name: "木炭", category: "material", icon: "charcoal",
      maxStack: 64, accent: "#5a4a3a", desc: "闷烧木头得到的炭。" },
    { id: "fuel", name: "燃料", category: "material", icon: "charcoal",
      maxStack: 16, desc: "压实的炭块,能烧很久。" },
    { id: "furnace", name: "熔炉", category: "functional", icon: "bench",
      permanent: true, workMs: 3000,
      behavior: { kind: "craft" }, desc: "…" },
  ],
  interactions: [
    { source: "hand", target: "charcoal", results: [], note: "一段轻脆的炭,还带着余温。" },
  ],
  recipes: [
    { id: "charcoal-fuel", category: "燃料",
      inputs: [{ type: "charcoal", count: 4 }],
      output: { type: "fuel", count: 1 } },
  ],
})
```

```ts
// src/content/index.ts —— 挂上即随构建生效
import "./builtin"
import "./metal"     // ← 新内容包
```

包内**顺序敏感**:先 nodes,再 interactions/recipes(后两者引用前者,
顺序反了会在注册时吃到"还没注册"的警告——包末尾调一次
`minode.validate()` 可确认最终状态干净)。

## 2. 单条注册(控制台/运行时,DEV 挂 window.minode)

```js
minode.registerNode({ id:"charcoal", name:"木炭", category:"material",
  icon:"wood", maxStack:64, desc:"闷烧木头得到的炭。" })
__game.addItem("charcoal", 5)              // 立即获得,自动成堆
minode.registerYield("hand", "charcoal", [], "一段轻脆的炭。")
minode.registerContent({ nodes:[…], interactions:[…], recipes:[…] })   // 批量
minode.validate()                          // 全量体检,返回问题列表(空=健康)
```

运行时注册**不持久化**,刷新即失(节点显示为"未知的节点",getDef 兜底,不崩)——
验证效果后再落进 src/content/。

## 3. 节点定义速查(NodeDef 逐字段)

| 字段 | 说明 |
|---|---|
| `id` / `name` | 类型标识(GameNode.type 指向)/ 显示名 |
| `category` | `"terrain" \| "material" \| "tool" \| "functional"`(图鉴分组;行为看 behavior,不看它) |
| `icon` | 图标键:像素贴图 = assets/icons/ 文件名;lucide = game/icons.ts 键。缺了会有警告 |
| `accent?` | 视觉主色:图标/名称/进度条/触发按钮着色 |
| `worldOnly?` / `zones?` | 区域权限(缺省全区域;显式 zones 优先) |
| `maxStack?` | 堆叠上限(背包,子树总件数);材料 64 / 工具 1 |
| `workMs?` | 工作时长(触发后多久结算);缺省 1500 |
| `maxProcess?` | 处理上限(世界,直接子节点数);缺省不限 |
| `noChildren?` / `permanent?` | 不可挂子 / 不可移除 |
| `behavior?` | 功能行为(explore/craft/auto-trigger/view-toggle/factory 预留) |
| `slots?` / `tags?` | 预留 |

## 4. 加一个功能节点(带行为)

```ts
// ① 若需要新行为:types.ts 扩行为联合
export interface FurnaceBehavior { kind: "furnace"; heatPerTick: number }
export type NodeBehavior = … | FurnaceBehavior
// ② 内容包里注册节点(behavior 参数永远取自**被触发节点自身**的 def)
// ③ store.triggerNode 加分发分支 + 前置检查;周期逻辑挂 onClock()
// ④ (可选)CodexView 上手指南同步
```

已有行为可直接复用(详见 02 §3 / 04 §2.2):`explore`(定时概率产地形)、
`craft`(子级材料按配方合成)、`auto-trigger`(就位后被周期驱动,水车)、
`view-toggle`(点击开合界面)。

**反模式(历史 bug)**:行为实现里读全局单例(如 `this.benchNode`)而不接收
被点节点——多实例时全部错乱。行为参数与结算归属必须来自**发起节点**。

## 5. 加图标(美术,零代码)

把图片直接丢进 `src/assets/icons/`,**文件名(去扩展名)就是图标键**:

```
src/assets/icons/charcoal.png  →  def 里 icon: "charcoal"
```

- 支持 png / webp / gif / svg / jpg;推荐像素画 16×16 或 32×32(渲染 pixelated);
- **同名覆盖 lucide**——替掉某个线框图标只需放同名文件;
- 完整说明见 `src/assets/icons/README.md`(给美术的)。

lucide 线条图标(如需):`game/icons.ts` 的 LUCIDE_ICONS 表加一行
(图标名随版本变动,先 grep d.ts 确认;`markRaw` 包裹)。

## 6. 加一个界面

- **节点面板类**(可拖拽的树视图):复用 NodeBoard,见 04 §boardRoots/存档三处同步;
- **普通页面类**:组件 + 入口(TopBar / view-toggle 节点)。

## 7. 扩展清单(改完自查)

- [ ] 内容包放 src/content/ 并在 index.ts 挂上了?
- [ ] `minode.validate()` 零问题(控制台无 [minode] 警告)?
- [ ] 新 def 的 zones/maxStack/workMs/maxProcess/permanent/behavior 想清楚了吗?
- [ ] 交互键 `"source>target"` 拼对了吗(source 可为 "hand")?
- [ ] 行为实现是否"按发起节点结算"?
- [ ] 存档结构变了吗?三处同步(pick/export/import)+ bump SAVE_VERSION?
- [ ] 上手指南(CodexView)需要更新吗?
