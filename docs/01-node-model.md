# 01 · 节点模型与显示规范

本篇定义节点的数据结构、标准显示形态、结果语义、归一化管线与序列化形状。
求值算法见 02 篇；注册表定义见 03 篇。

## 1. 显示规范（chip 文本）

节点的标准形态是**一行纯文本**：

```
name[result]
```

完整语法：

```
chip   := 折叠钮? name ret? 徽标? 收起钮?
折叠钮 := [-]（展开中） | [+]（已折叠）        —— 仅当节点有子节点
name   := NodeDef.name                        —— 未注册类型显示 '?'
ret    := 省略 | '[' 值 ']' | '[?]'
值     := registry.shortOf(id)，多值以空格分隔、数量 > 1 时写 短名×N（如 [铁 钢×2]）
         id 是资源 id 或节点类型 id（两套 id 不重复，见 03 篇 §6）
徽标   := '+' N，N = 子树节点数               —— 仅折叠时显示
收起钮 := ×（把节点放进节点背包）
```

### 1.1 `[ret]` 的显示条件

| 结果状态             | 条件                                                       | 显示         |
| -------------------- | ---------------------------------------------------------- | ------------ |
| `none`（无结果概念） | 类型既非生产型也无配方                                     | 省略         |
| `unresolved`         | 类型有配方，但子节点结果未命中任何配方；或任一子节点未识别 | `[?]`        |
| `value`              | 配方检测命中 / 原子自返                                    | `[短名]`     |
| `value` 且原子自返   | 结果 = 本节点类型本身（符号）                              | 省略（见下） |

**原子自返省略规则**（`retDisplay: 'auto'`，默认）：值为单个条目、数量 1、且条目 id 等于
本节点 `type` 时省略方括号——`铁矿石` 比 `铁矿石[铁矿石]` 更干净。
内容作者可用 `retDisplay: 'always' | 'never'` 覆盖。

### 1.2 状态示例

| 情形                     | 文本                   |
| ------------------------ | ---------------------- |
| 冶炼炉配方检测通过       | `冶炼炉[铁]`           |
| 冶炼炉实参不符           | `冶炼炉[?]`            |
| 铁矿石（原子）           | `铁矿石`               |
| 折叠（子树有 12 个节点） | `[+] 冶炼炉[铁] +12 ×` |
| 未注册类型（存档隔离）   | `? ×`                  |

布局与排序（根纵向、子级横向流式换行）见 06 篇。

## 2. 数据模型

```ts
// engine/types.ts
export type NodeId = string
export type NodeTypeId = string
export type ResourceId = string
export type Num = number | string | Decimal // 内容作者可写 number，引擎用 D() 归一

export interface GameNode {
  id: NodeId // 运行时唯一；不入存档（加载时重建）
  type: NodeTypeId // 注册表键
  children: GameNode[] // 实参列表，顺序 = 显示顺序
  collapsed: boolean // 折叠 = 不渲染子列表（因此不可拖入）
  ret: RetState // 求值结果（`[]` 里的东西）；由 normalizeTree 重算，不手改
}

export type RetState =
  { kind: 'none' } | { kind: 'unresolved' } | { kind: 'value'; items: readonly ItemAmount[] }

export interface ItemAmount {
  item: string // 资源 id 或节点类型 id（`[]` 显示用，两套 id 不重复）
  count: Decimal
}
```

三条纪律：

1. **`ret` 是派生记录（缓存）不是事实源**。事实源 = `children` + 注册表（配方定义）。
   任何读 `ret` 的渲染或玩法逻辑都应发生在 `normalizeTree` 之后。
2. **节点没有存储**。玩家资产只有两种形态：**节点背包里的节点**（全可放置）
   与**资源仓库里的资源**（不可放置的纯数量）。任何"节点内部囤东西"的机制都不属于本项目。
3. **节点 id 不入存档**：加载时整体重建，避免导入冲突（alpha 遗留问题）。

## 3. 注册表侧定义（节点相关字段）

字段全集见 03 篇；这里只列与节点形态直接相关的：

```ts
export interface NodeDef {
  id: NodeTypeId
  name: string // chip 主文本
  short?: string // 节点背包与 `[]` 用的紧凑名；默认 = name
  retDisplay?: 'auto' | 'always' | 'never' // 默认 auto（原子自返省略方括号）
  toolClass?: string // 工具类别 → 求值通道 class:<toolClass>
}

export interface ResourceDef {
  id: ResourceId
  name: string
  short?: string // `[]` 与资源仓库用；默认 = name
}
```

约定：**节点类型与资源 id 不重复**（`buildRegistry` 校验，见 03 篇 §6）；节点一律可放置。

## 4. 求值结果（computeRet）

`computeRet(node)` 是纯函数，规则按优先级：

1. 类型未注册 → `none`。
2. **任一子节点 `ret` 为 `none`/`unresolved` → 传染**：本节点 `unresolved`（不做部分匹配）。
3. 类型有配方（`recipes` 中存在 `at = 本类型` 的条目）：
   用「子节点结果多重集」（每个子节点计 1，见 02 篇 §5）做**配方检测**；
   命中 → `value`（配方产物）；未命中（实参多了/少了、或子节点未识别）→ `unresolved`（`[?]`）。
4. 类型没有配方（符号）→ `value`（结果 = 自身，条目 id = 本节点 `type`）——即**原子**
   （显示时省略方括号）。
5. 其余 → `none`。

多态匹配（含可变参数）不在此扩展：内容作者如需特殊判定，注册自定义处理器并可返回
`{ op: 'setRet' }` 显式改写（预留，见 02 篇 §6）。

## 5. 值流：结果如何向上传递

- 父节点的配方检测读的是**子节点的结果**（`ret`），所以「树的形状」= 配方的实参列表；
- 检测是**静态**的：只看子节点已经算好的结果值，**不 eval 子节点**；
- 因此点击只影响被点的那一个节点：函数命中配方就产出，符号无响应；
- 结果会沿树传染：任一子节点 `[?]` → 父节点也 `[?]`（配方断裂）；
- 树越深/越宽，可点击的函数越多，构筑本身就是成长。

```
冶炼炉[铁]                     一次点击的产出：
  铁矿石      ← 结果 铁矿石     铁 ×1（配方产物进资源仓库）
  煤炭        ← 结果 煤炭
  氧气        ← 结果 氧气
```

## 6. 归一化（normalizeTree）

结构变更（拖拽落定、增删节点、放置/收起）后调用一次：

```ts
export function normalizeTree(roots: readonly GameNode[], registry: NodeRegistry): void
```

- **单次后序遍历，O(N)**：先子后父，父节点直接用子节点已算好的 `ret` 拼签名。
- 不重排 `children`、不动 `collapsed`（折叠是 UI 状态，不影响数据）。
- 幂等：重复调用无害（拖拽会因 Sortable 的多次回写触发 2-3 次）。

防环三层（拖拽守卫 → 归一化 visiting 兜底 → `setChildren` 子树包含校验）见 06 篇。

## 7. 结构编辑规则

| 操作     | 语义                                                                             |
| -------- | -------------------------------------------------------------------------------- |
| 拖拽     | 编辑实参结构：移动/重排节点；`children` 数组顺序 = 显示顺序，**无任何自动排序**  |
| 折叠     | 不渲染子列表（`v-if` 级卸载）→ 折叠态结构上无法拖入                              |
| 收起 `×` | 把该节点**本身**放进节点背包（**无门槛**，D-12）；**子节点保持顺序上移到原位置** |
| 放置     | 节点背包里的节点移到树上（1 个节点，**移动**不消耗）；新节点没有实参             |

「收起」的理由：子节点是玩家放置的资产，整体销毁是惩罚性设计；收起让「把机器收进背包、
子节点留在原层」成为自然的构筑操作（D-12 撤回了工具门槛，`×` 无任何条件）。

## 8. 序列化（存档形状 v2）

```ts
// engine/save.ts
export const SAVE_VERSION = 2

export interface SaveV2 {
  v: 2
  savedAt: number // 墙钟毫秒
  roots: SaveNode[]
  nodeBag: (SaveNode | null)[] // 定长 config.nodeBagSize
  resources: Record<ResourceId, string> // Decimal 文本
  selected: number
}

export interface SaveNode {
  type: NodeTypeId
  collapsed: boolean
  children: SaveNode[]
}
```

规则：

- Decimal 一律 `toString()` 序列化，`D(str)` 反序列化（break_infinity 支持）。
- 节点 id 不存；加载时重建。`ret` 不存；加载后 `normalizeTree` 重算（含背包里的节点）。
- `nodeBag` 按 `config.nodeBagSize` 补齐或截断；`selected` 夹到合法范围。
- **v1 → v2 迁移**：旧 `{item, count}` 槽位按注册表分流——`registry.node(item)` 存在
  → 生成该类型节点填进 `nodeBag`（装不下的丢弃并 `warn`）；否则累加进 `resources[item]`。
- 旧存档里的 `buffer` / `auto` 字段被安全忽略（概念已移除）。
- **未知内容 id 不丢数据**：反序列化时保留 `type` 字符串；查询注册表失败按
  `unknown` 处理（名称 `?`、无结果、无行为）。

## 9. 检查清单

- [ ] chip 文本全部状态符合 §1.2 示例（含 `[?]`、原子省略、折叠徽标）
- [ ] `ret` 传染语义有单测：任一子节点未识别 → 父 `unresolved`
- [ ] `normalizeTree` 后序遍历、幂等；不重排、不动折叠
- [ ] 收起 `×`：节点本身进节点背包、子节点上移、顺序保持、无门槛
- [ ] 放置 = 节点从背包移到树（移动，不消耗），不产生任何节点内存储
- [ ] 存档 round-trip：Decimal、嵌套树、节点背包、资源仓库、未知 type 保留；v1 可迁移
