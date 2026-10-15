# 02 · eval：静态检测与点击求值

本篇定义游戏的核心：返回值（`[]`）怎么算、点击一个节点时发生什么、手持怎么参与、结算纪律。
术语的唯一事实源是 [10 篇术语表](10-glossary.md)。

## 1. 定义与不变量

- **树 = 表达式**（同构于 Lisp 的 s 表达式：节点 = symbol，嵌套 = 括号）。节点的返回值（`[]`）是
  **静态**算出来的：任何结构变更之后，一次后序遍历（`normalizeTree`）重算全树返回值。
  - **符号**（没有配方的类型）：返回值 = 自身（原子）；显示时省略方括号。
  - **函数**（有配方的类型）：用「子节点返回值的多重集签名」做配方检测，
    命中 → 配方产物；不命中 → `[?]`。
- **`()` 表示 eval（D-30，点击与 eval 解耦）**：只有「自己构成一个表达式」的节点
  （有实参 / 函数 / 根层落单节点——即渲染括号的那些）**点击才 eval 自己的 `(…)`**；
  裸符号实参（无括号）点击**没有效果**——要 eval 它，让它成为某个括号的头。
  - 符号：点击**无响应**（没有配方，天然惰性）；
  - 函数：点击 → 再做一次配方检测（含手持，§3）→ 命中就产出；
  - **不 eval 子节点**——子节点只提供静态的返回值供签名检测。
- **求值是局部的**：父节点、兄弟、子树都不受影响。
- **eval 不消耗**：节点是 symbol，求值不消耗它；同一棵树可以无限点击（设计决策，docs/10 §1）。

## 2. 一次点击的算法

```ts
export function evalNode(node: GameNode, world: EvalWorld, options?: EvalOptions): EvalOutcome {
  // 符号/未注册：没有配方 → 点击无响应
  if (world.registry.recipeModes(node.type).length === 0) {
    return { node: node.id, recipe: undefined, effective: false }
  }
  const recipe = findRecipe(world.registry, node, options.held ?? null) // §3
  if (!recipe) return { node: node.id, recipe: undefined, effective: false } // [?]
  const ops = recipe.out.map((out) => ({ op: 'gain', id: out.item, count: out.count ?? 1 }))
  return { node: node.id, recipe, effective: applyOps(ops, world) } // gain → 产出路由（§6）
}
```

```ts
export interface EvalOutcome {
  node: NodeId
  /** 命中的配方（含手持隐式实参）；undefined = 符号/未注册/检测不通过 */
  recipe: RecipeDef | undefined
  /** 是否有实际产出（gain 被接收；UI 脉冲与调试文案用） */
  effective: boolean
}

export interface EvalWorld {
  registry: NodeRegistry
  /** 产出入口（产物 id：资源或节点类型）；返回放不下的余量（余量 < count 即部分/全部接收） */
  gain(id: string, count: Decimal): Decimal
}
```

**行为示例**

```
冶炼炉[铁]（实参：铁矿石 / 煤炭 / 氧气）
  点击 → 铁×1 进背包（只有冶炼炉产出）
  点击它的实参「铁矿石」→ 无响应（符号）
冶炼炉[?]（实参缺一个）
  点击 → 无产出（调试文案：配方不匹配）
森林[?]（空手）＋ 手持斧头
  点击 → 木材×1（含手持签名命中，见 §3）
```

## 3. 手持 = 隐式实参（唯一的「多样化点击」机制）

**手持**（`heldItem`）= 节点背包**选中格**里堆的类型。点击时它作为一个
**放在实参列表最前的隐式实参**参与被点节点的签名检测：

```ts
// engine/eval.ts
export function findRecipe(registry, node, held = null): RecipeDef | undefined {
  for (const mode of registry.recipeModes(node.type)) {
    // 先试「手持 + 子实参」签名；不中再回落空手签名——手持永不打断已有配方
    const hit = registry.recipeFor(node.type, mode, childrenSignatureKey(node.children, mode, held))
    if (hit) return hit
    if (held) {
      const fallback = registry.recipeFor(
        node.type,
        mode,
        childrenSignatureKey(node.children, mode),
      )
      if (fallback) return fallback
    }
  }
  return undefined
}
```

规则（docs/10 §4）：

- 检测顺序固定：**先含手持签名 → 再空手签名**。手持只会增加命中可能（补实参、开新配方），
  不会让原本能点的点不动；
- **内层求值永远是经典 eval**：手持只作用于**被点的那一层**；子节点提供的静态返回值
  （`[]` 显示与父级签名）一律按空手计算；
- 手持对 ordered 配方同样排最前（可补首位实参）；
- 内容侧零代码：「手持斧头点森林得木材」就是一条数据
  `{ at: 'forest', args: [{ item: 'axe' }], out: [{ item: 'wood' }] }`；
- 旧的求值通道机制（`node:<id>` / `class:<c>` / 两轴处理器注册表 / `EvalDef`）已删除
  （D-25）：它解决的问题（手持改变点击行为）由隐式实参一条规则覆盖。

## 4. 配方检测（静态）

### 4.1 签名 = 子节点返回值的多重集

- 每个子节点把自己 `ret` 的 value 条目（含 count）并入签名；
- 默认 `multiset` 模式：顺序无关、数量有关——`{铁矿石, 煤炭, 氧气}` 任意顺序都命中，
  两个铁矿石 ≠ 一个铁矿石；
- `ordered` 模式（内容可选）：按子节点顺序比较 item 序列；
- **不多不少**：多挂一个实参会失配 → `[?]`；
- **不 eval 子节点**：检测只读它们已经算好的返回值。

```ts
export interface RecipeArg {
  item: string // 资源 id 或节点类型 id
  count?: number // 需要几份/几个实参节点；默认 1
}

export interface RecipeDef {
  at: NodeTypeId // 函数类型
  match?: 'multiset' | 'ordered' // 默认 multiset
  args: readonly RecipeArg[]
  out: readonly RecipeArg[]
}
```

### 4.2 检测不通过的后果

`[?]` + 点击无产出；`[?]` 会沿树传染：任一子节点 `[?]`/未识别 → 父节点也 `[?]`。
注意 `[?]` 的语义是「**空手**检测不通过」——手持某物时可能命中（如斧头×森林）。

## 5. 效果原语与结算纪律

```ts
export interface EvalOp {
  op: 'gain'
  id: string // 产物 id（资源或节点类型）
  count: Num
}
```

结算纪律：

1. **按序结算**：ops 顺序敏感，后者看到前者的结果。
2. **产出路由（D-26）**：`gain(id, count)` 把产物（全部是物品）放进**背包**
   （容量受限，装不下丢弃余量并提示）。返回值即未接收的余量。
3. **不做嵌套条件**：数据里不出现 if/else/循环/变量。需要更复杂的判定时，
   加一个新原语（四步流程见 03 篇 §5），而不是扩展数据语法（alpha 教训，保持）。

## 6. 交互规则速查

| 交互            | 语义                                                           |
| --------------- | -------------------------------------------------------------- |
| 点击 chip       | `evalNode(id)`：只有函数响应（符号无响应）；命中即产出并 pulse |
| 拖拽 chip       | 结构编辑：树内移动 / 收进容器（docs/04）                       |
| 点击 `×`        | 收起：节点进容器、子节点上移（01 篇 §7，无门槛）               |
| 双击/滚轮背包格 | 转 1 个到对侧（开箱 = 箱子；无箱 = 树根末尾，docs/04）         |

## 7. 视觉反馈（pulse）

- 反馈集合 = 点击**产出成功**的节点（`effective === true`）。
- **反馈状态按节点 id 分键**（`pulseAt` 是 `shallowReactive` 记录）：
  只有受影响的节点重渲染。若改成整树共享的 Set/Map，每次点击会重渲染全树——
  实测 400 节点时点击渲染 57ms，分键后 1.8ms（差两个数量级，别改回去）。
- 实现沿用「先清空一帧再挂回」，否则连点（<400ms）不会重启动画：

```ts
function pulse(ids: readonly NodeId[]): void {
  clearTimeout(pulseTimer)
  clearTimeout(pulseDelay)
  for (const id of ids) delete pulseAt[id] // 先摘除
  pulseDelay = setTimeout(() => {
    for (const id of ids) pulseAt[id] = true // 挂回 → class 变化 → 动画重启
    pulseTimer = setTimeout(() => {
      for (const id of ids) delete pulseAt[id]
    }, 400)
  }, 16)
}
```

- 调试面板显示 `最近点击：冶炼炉 → 铁×1` / `铁矿石 → 符号（无 eval 行为）`。

## 8. 检查清单

- [ ] 符号点击无响应（无配方、无产出），有单测
- [ ] 函数点击：静态检测命中 → 产出按路由结算（节点→背包、资源→仓库）；实参不符 → `[?]` 且无产出，有单测
- [ ] 点击不 eval 子节点：只有被点节点产出，有单测
- [ ] `[?]` 传染（任一子未识别 → 父未识别），有单测
- [ ] 手持隐式实参：含手持命中 / 回落空手命中 / 补首位（ordered），有单测
- [ ] multiset/ordered 签名、实参「不多不少」有单测
- [ ] 内层求值不受手持影响（静态值一律空手语义）
