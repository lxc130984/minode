# 08 · 扩展指南(加内容 & 运行时 API)

> registry 驱动一切:静态内容改 `src/game/registry.ts`,动态内容用 `src/game/api.ts`。

## 1. 加一个普通物品(材料/工具)

```ts
// registry.ts → NODE_DEFS 追加
{
  id: "charcoal",
  name: "木炭",
  category: "material",          // terrain | resource值实为 material | tool | functional
  icon: "wood",                  // ICONS 已有键;新图标见 §5
  maxStack: 64,                  // 可堆叠件数;工具设 1(不可堆叠)
  accent: "#5a4a3a",             // 可选:图标与名称着色
  desc: "闷烧木头得到的炭。",
  // zones 缺省 = world+backpack 都可
}
```

立即生效:图鉴出现该条目(按 category 分组)、可被 addItem/合成/交互引用。
无需改任何组件。

## 2. 加一条交互(点击产出)

```ts
// registry.ts → INTERACTIONS 追加
{ source: "hand", target: "charcoal",
  results: [],                              // 空 = 纯风味文本
  note: "一段轻脆的炭,还带着余温。" }
// 或产出型:
{ source: "stoneAxe", target: "charcoalPile",
  results: [{ type: "charcoal", chance: 0.8, count: 2 }],
  note: "斧头劈开炭堆!" }
```

语义:source 可为任意节点 type 或 `"hand"`;results 顺序判定首个命中(互斥);
未命中任何 chance → "一无所获"。

## 3. 加一条配方

```ts
// registry.ts → RECIPES 追加
{ id: "charcoal-fuel",
  category: "燃料",                       // 可选;RecipeDialog 按此分组
  inputs: [{ type: "charcoal", count: 4 }],
  output: { type: "fuel", count: 1 } }
```

合成语义:手工合成节点点击时,检测其子级挂载材料(按类型精确计数,
每个同类节点计 1,含嵌套),足量则叶优先消耗,产物 addItem 进背包。

## 4. 加一个功能节点(带行为)

四步:

```ts
// ① types.ts 扩行为联合(若复用现有行为可跳过)
export interface FurnaceBehavior { kind: "furnace"; heatPerTick: number }
export type NodeBehavior = … | FurnaceBehavior

// ② registry.ts 注册节点
{ id: "furnace", name: "熔炉", category: "functional", icon: "bench",
  zones: ["world","backpack"], permanent: true,
  behavior: { kind: "furnace", heatPerTick: 2 }, desc: "…" }

// ③ store.triggerNode 加分发分支(参数永远取自被触发节点自身!)
if (behavior?.kind === "furnace") { this.tickFurnace(node); return }
if (behavior) return   // 未知行为静默

// ④ (可选)周期逻辑挂 onClock();自触发类行为的现成实现见 tickAutoTriggers()
```

已有行为可直接复用:
- `explore`:点击定时概率产地形(参数 durationMs/successRate/pool);
- `craft`:子级材料按配方合成;
- `auto-trigger`:就位(直接挂在 `poweredBy` 指定的父类型下)后被周期驱动,
  每次驱动依次触发自身每个子节点(intervalMs;水车用它 —— 河流 → 水车 → 石斧 → 森林);
- `view-toggle`:点击开合界面(view: "backpack"|"codex";界面层 NodeItem 分发)。

**反模式(历史 bug)**:行为实现里读全局单例(如 `this.benchNode`)而不接收
被点节点——多实例时全部错乱。行为参数与结算归属必须来自**发起节点**。

## 5. 加图标

### 5.1 像素贴图(推荐,零代码)

把图片直接丢进 `src/assets/icons/`,**文件名(去扩展名)就是图标键**,
构建期自动注册(game/icons.ts 的 import.meta.glob):

```
src/assets/icons/charcoal.png  →  def 里 icon: "charcoal"
```

- 同名贴图**覆盖** lucide 同名图标——逐个换成像素风时,放文件就够了;
- 支持 png / webp / gif / svg / jpg;渲染为 `<img class="px-icon">`
  (main.css 里 `image-rendering: pixelated`,按 size prop 缩放)。

### 5.2 lucide 线条图标

```ts
import { Flame } from "lucide-vue-next"
// src/game/icons.ts → LUCIDE_ICONS 对象字面量里加一行
flame: markRaw(Flame),
```

⚠️ lucide-vue-next 的图标名会随版本变化(如 `MoreVertical→EllipsisVertical`)。
拿不准就 grep:
`grep "declare const <Name>:" node_modules/lucide-vue-next/dist/lucide-vue-next.d.ts`

### 5.3 运行时注册(试玩用,刷新即失)

```js
minode.registerIcon("flame", Flame)   // 或任意接受 { size } 的组件
```

## 6. 运行时扩展 API(src/game/api.ts)

适合:试验性内容、mod、控制台试玩。DEV 下整体挂在 `window.minode`。

| API | 签名 | 行为 |
|---|---|---|
| `registerIcon` | `(name: string, comp: Component)` | 写 ICONS |
| `registerNode` | `(def: NodeDef)` | 同 id 覆盖(NODE_DEFS 与 DEF_MAP 同步维护) |
| `registerInteraction` | `(interaction: Interaction)` | 同键覆盖 |
| `registerYield` | `(source, target, results, note)` | registerInteraction 的快捷写法 |
| `registerRecipe` | `(recipe: Recipe)` | 同 id 覆盖 |

控制台示例(DEV):

```js
minode.registerNode({ id:"charcoal", name:"木炭", category:"material",
  icon:"wood", maxStack:64, desc:"闷烧木头得到的炭。" })
__game.addItem("charcoal", 5)          // 立即获得,自动成堆
minode.registerYield("hand", "charcoal", [], "一段轻脆的炭。")
```

**生效原理**:registry 集合是 shallowReactive(03 §0),
push/索引赋值立刻触发图鉴/配方/图标的重算。**注意**:运行时注册不持久化,
刷新即失(节点会显示为"未知的节点",getDef 兜底,不崩)。

## 7. 加一个界面

当前界面分两类(见 06):
- **节点面板类**(可拖拽交互的树视图):复用 NodeBoard。需要新的数据面板时:
  1. store state 加 `GameNode[]` 根数组 + persist.pick/export/import 三处同步;
  2. `BoardId` 联合加值;`boardRoots` 加映射;
  3. NodeBoard 的双分支扩三分支(或抽成 map);
  4. dnd 的 data-zone 与守卫规则自动按 board 生效;
  5. 存档校验按需加不变量,**bump SAVE_VERSION**。
- **普通页面类**(按钮/信息):组件 + 入口(TopBar 按钮/节点 view-toggle)。
  注册 view-toggle 行为的枚举值时同步 NodeItem.onRowClick 的分发映射。

## 8. 扩展清单(改完自查)

- [ ] registry 集合仍是 shallowReactive?
- [ ] 新 def 的 zones/maxStack/workMs/maxProcess/permanent/behavior 想清楚了吗?
- [ ] 交互键 `"source>target"` 拼对了吗?
- [ ] 行为实现是否"按发起节点结算"?
- [ ] 存档结构变了吗?三处同步(pick/export/import)+ bump SAVE_VERSION?
- [ ] 上手指南(CodexView)需要更新吗?
