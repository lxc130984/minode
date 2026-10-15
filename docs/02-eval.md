# 02 · eval：`()` 表示 eval

本篇定义点击求值：`()` 的语义、手持隐式实参、配方与签名匹配、效果结算。
术语见 [10 篇术语表](10-glossary.md)。

## 1. 定义与不变量

- **`()` 表示 eval（D-30）**：只有「自己构成一个表达式」的节点——有实参 / 函数
  （`recipesFor > 0`）/ 根层落单节点，即**渲染括号的那些**——点击才 eval 自己的 `(…)`；
  **裸符号实参点击没有效果**（要 eval 它，让它成为某个括号的头）。
- 返回值 `[]` 是**静态**的（结构变更时归一化重算，01 篇 §6）；点击只是「再检测一次」。
- **不 eval 子节点**——子节点只提供静态返回值供签名检测。
- **求值是局部的**：父节点、兄弟、子树都不受影响。
- **求值不消耗**：节点是 symbol，eval 不消耗它。
- 带 `panel` 的节点（箱子）点击 = 打开浮动窗口，不做配方求值。
- 放置模式中，树区左键 = 建造，不 eval（04 篇 §2）。

## 2. 一次点击的算法

```ts
export function evalNode(node, world, options?): EvalOutcome {
  if (world.registry.recipeModes(node.type).length === 0)
    return { node: node.id, recipe: undefined, effective: false } // 符号：无响应
  const recipe = findRecipe(world.registry, node, options.held ?? null)
  if (!recipe) return { node: node.id, recipe: undefined, effective: false } // [?]：检测不通过
  const ops = recipe.out.map((out) => ({ op: 'gain', id: out.item, count: out.count ?? 1 }))
  return { node: node.id, recipe, effective: applyOps(ops, world) } // gain → 产出路由
}
```

```ts
export interface EvalWorld {
  registry: NodeRegistry
  gain(id: string, count: Decimal): Decimal // 产出入口；返回放不下的余量
}
export interface EvalOptions {
  held?: string | null // 手持物 id（隐式实参）
}
```

**行为示例**

```
( 冶炼炉[铁] 铁矿石 煤炭 氧气 )   点击 → 铁×1 进背包（只有冶炼炉产出）
  点击实参「铁矿石」            → 无效果（裸符号，D-30）
( 冶炼炉[?] )（实参缺一个）      点击 → 无产出（配方不匹配）
( 森林[?] ) + 手持斧头           点击 → 木材×1（含手持签名命中，§3）
```

## 3. 手持 = 隐式实参（唯一的「多样化点击」机制，D-25）

**手持**（`heldItem`）= 背包**选中的物品**（单击背包行选中，再点同款取消）。
点击时它作为一个**排在实参最前的隐式实参**参与被点表达式的签名检测：

```ts
export function findRecipe(registry, node, held = null): RecipeDef | undefined {
  for (const mode of registry.recipeModes(node.type)) {
    // 先试「手持 + 实参」签名；不中再回落空手签名——手持永不打断已有配方
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

- 检测顺序固定：**先含手持签名 → 再空手签名**。手持只会增加命中可能
  （补实参、开新配方），不会让原本能点的点不动；
- **内层求值永远是经典 eval**：手持只作用于被点击的那一层；静态返回值（`[]` 显示与
  父级签名）一律按空手计算；
- 手持对 ordered 配方同样排最前（可补首位实参）；
- 内容侧零代码：「手持斧头点森林得木材」就是一条配方数据
  `{ at: 'forest', args: [{ item: 'axe' }], out: [{ item: 'wood' }] }`；
- 静态显示仍为 `[?]`（空手语义）——手持命中是点击时的加成，不改变显示承诺。

## 4. 配方检测（静态）

### 4.1 签名 = 实参返回值的键

- 每个子节点把自己 `ret` 的 value 条目（含 count）并入签名；
- 默认 `multiset` 模式：顺序无关、数量有关——`{铁矿石, 煤炭, 氧气}` 任意顺序都命中，
  两个铁矿石 ≠ 一个铁矿石；
- `ordered` 模式（内容可选）：按子节点顺序比较序列；
- **不多不少**：多挂一个实参会失配 → `[?]`；
- **不 eval 子节点**：检测只读它们已算好的返回值。

```ts
export interface RecipeDef {
  at: NodeTypeId // 函数类型
  match?: 'multiset' | 'ordered' // 默认 multiset
  args: readonly RecipeArg[] // 匹配实参签名（物品 id 或节点类型 id）
  out: readonly RecipeArg[] // 产物（必须是物品 id，校验强制）
}
```

### 4.2 检测不通过的后果

`[?]` + 点击无产出；`[?]` 沿树传染：任一子节点 `[?]`/未识别 → 父节点也 `[?]`。
注意 `[?]` 的语义是「**空手**检测不通过」——手持某物时可能命中（如斧头 × 森林）。

## 5. 效果结算与产出路由

```ts
export interface EvalOp {
  op: 'gain'
  id: string // 物品 id
  count: Num
}
```

结算纪律：

1. **按序结算**：ops 顺序敏感。
2. **产出路由（D-26）**：`gain(id, count)` 把产物放进**背包**（容量受限，装不下丢弃
   余量并提示）。`world.gain` 返回未接收的余量；部分接收也算 `effective`。
3. **不做嵌套条件**：数据里不出现 if/else/循环/变量。需要更复杂的判定时加新原语
   （四步流程见 03 篇 §5），而不是扩展数据语法（alpha 教训）。

## 6. 交互规则速查

| 交互             | 语义                                                     |
| ---------------- | -------------------------------------------------------- |
| 点击表达式 chip  | `evalNode`：只有表达式（有括号）响应；命中即产出并 pulse |
| 点击裸符号实参   | 无效果（D-30；tooltip 说明「让它成为某个括号的头」）     |
| 点击箱子节点     | 打开浮动窗口（04 篇 §4）                                 |
| 放置模式中左键   | 建造，不 eval（04 篇 §2）                                |
| 拖拽 chip / 括号 | 结构编辑：树内移动 / 拖到侧栏回收（04 篇 §5）            |

## 7. 视觉反馈（pulse）

- 反馈集合 = 点击**产出成功**的表达式（`effective === true`）；
- **按节点 id 分键**（`feedback.ts` 的 `pulseAt` 是 `shallowReactive` 记录）：
  只有受影响的节点重渲染——整树共享一个集合会让每次点击重渲染全树
  （实测 400 节点 57ms → 分键后 1.8ms，别改回去）；
- 「先清空一帧再挂回」保证连点（<400ms）能重启动画；
- 调试面板显示 `最近点击：冶炼炉 → 铁×1` / `铁矿石 → 符号（无 eval 行为）`。

## 8. 检查清单

- [ ] 符号点击无响应（无配方、无产出、不写 lastEval），有单测
- [ ] 表达式点击：检测命中 → 产出进背包；实参不符 → `[?]` 且无产出，有单测
- [ ] 点击不 eval 子节点：只有被点表达式产出，有单测
- [ ] `[?]` 传染（任一子未识别 → 父未识别），有单测
- [ ] 手持隐式实参：含手持命中 / 回落空手命中 / 补首位（ordered），有单测
- [ ] 内层求值不受手持影响（静态值一律空手语义）
- [ ] multiset/ordered 签名、实参「不多不少」有单测
