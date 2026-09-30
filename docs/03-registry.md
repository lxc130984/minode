# 03 · 内容注册表(src/game/registry.ts)

> 游戏的全部"内容"集中在这一个文件:节点类型、图标、交互规则、配方。
> **加内容 = 只改这里(或运行时经 game/api.ts 注册),引擎与界面自动生效。**

## 0. 总原则:shallowReactive

```ts
import { markRaw, shallowReactive } from "vue"
```

所有集合都是 `shallowReactive(...)`:

| 集合 | 类型 |
|---|---|
| `ICONS` | `shallowReactive<Record<string, Component>>` |
| `NODE_DEFS` / `DEF_MAP` | `shallowReactive` 数组/记录 |
| `INTERACTIONS` / `INTERACTION_MAP` | 同上 |
| `RECIPES` | 同上 |

为什么:运行时注册(api.registerNode 等)做的是 push/索引赋值;
**普通(非响应式)集合不会触发**图鉴分组(CodexView 的 computed)、配方列表、
图标的重算——注册后界面"看起来没生效"。
shallowReactive 让第一层变更(增删改条目)立即触发依赖。
图标组件值额外用 `markRaw` 包裹(避免 Vue 代理组件对象)。

⚠️ 新增集合时同样必须包 shallowReactive;`deep` 不需要(条目内部字段视为不可变)。

## 1. ICONS —— 图标映射

```ts
export const ICONS = shallowReactive<Record<string, Component>>({
  forest: markRaw(TreePine), river: markRaw(Waves), stone: markRaw(Mountain),
  stick: markRaw(Wand), wood: markRaw(Logs), stoneAxe: markRaw(Axe),
  hand: markRaw(Hand), explorer: markRaw(Compass), bench: markRaw(Soup),
  backpackNode: markRaw(Backpack),
})
```

- 键 = NodeDef.icon 的值;值 = lucide-vue-next 组件。
- 运行时追加:`api.registerIcon(name, comp)`。
- 兜底:NodeIcon 里 `ICONS[icon] ?? ICONS.hand`。
- 图标改名坑:lucide 新版本会改名(如 `HelpCircle→无`、`MoreVertical→EllipsisVertical`),
  引用前先 grep `node_modules/lucide-vue-next/dist/lucide-vue-next.d.ts` 确认存在。

## 2. NODE_DEFS / DEF_MAP / getDef

### 2.1 当前 8 个内置定义(逐个)

| id | category | 关键 flag | behavior | 说明 |
|---|---|---|---|---|
| `explorer` 探索 | functional | worldOnly, permanent, accent #d08a3e | `{explore, durationMs:5000, successRate:0.65, pool:[forest .65, river .35]}` | 世界自带;点击探索 |
| `backpackNode` 背包 | functional | worldOnly, permanent, **noChildren**, accent #b98a2f | `{view-toggle, view:"backpack"}` | 世界自带;点击开合背包分屏 |
| `bench` 手工合成 | functional | permanent, **zones:["backpack"]**, accent #8672bd | `{craft}` | 背包自带;**只能在背包** |
| `forest` 森林 | terrain | worldOnly, accent #3d8b57 | — | 空手翻找得木棍/石子;被石斧砍得木头 |
| `river` 河流 | terrain | worldOnly, accent #2f8f96 | — | 空手捡石子 |
| `stick` 木棍 | resource(实际 material) | **maxStack:64** | — | 材料 |
| `stone` 石子 | material | **maxStack:64** | — | 材料 |
| `wood` 木头 | material | **maxStack:64** | — | 材料 |
| `stoneAxe` 石斧 | tool | **maxStack:1**, accent #8672bd | — | 不可堆叠 |

(注:材料 category 值为 `"material"`,中文标签"资源"。)

### 2.2 DEF_MAP

`id → def` 的索引(`Object.fromEntries(NODE_DEFS.map(...))`,同样 shallowReactive)。
registerNode 会同时维护两者。

### 2.3 zonesOf / canPlaceInZone —— 区域权限唯一判定点

```ts
export function zonesOf(type: string): NodeZone[] {
  const def = DEF_MAP[type]
  if (!def) return ALL_ZONES            // 未注册:全区域(兜底宽松)
  if (def.zones) return def.zones       // 显式 zones 优先
  if (def.worldOnly) return ["world"]   // worldOnly 简写
  return ALL_ZONES                      // ["world","backpack"]
}
export function canPlaceInZone(type, zone) { return zonesOf(type).includes(zone) }
```

**消费方**(不要绕过它们另写判断):
拖拽守卫 `canDropIntoChildList`、收纳 `nodeToItem`、放置 `placeItem`、
settle 分拣(`settleBackpackDrop`/`nodeToItem`)、存档校验 `zoneOk`。

### 2.4 getDef —— 带兜底的查找

```ts
export function getDef(type: string): NodeDef {
  return DEF_MAP[type] ?? { id: type, name: type, category: "material",
    icon: "hand", desc: "未知的节点。", zones: ALL_ZONES }
}
```

未知 type(运行时注册内容在刷新后丢失)显示为"未知的节点"、全区域可用。
这是**有意的宽松兜底**——已放在世界/背包里的节点不会因注册表缺失而崩。

### 2.5 isPermanent

`!!DEF_MAP[type]?.permanent`——移除操作的拒绝判定。

## 3. INTERACTIONS / findInteraction —— 交互表

键规则:`"${source}>${target}"`;`source` 可以是 `"hand"`。
`findInteraction(s, t)` 精确查找,未命中返回 undefined。

### 当前全部条目

| source | target | 产出 | note |
|---|---|---|---|
| hand | forest | 55% 木棍×1 / 30% 石子×1 | 你徒手在灌木丛里翻找…… |
| hand | river | 65% 石子×1 | 你蹲在河滩上,盯着水流过的碎石…… |
| stoneAxe | forest | 100% 木头×1 | 石斧劈进树干,木屑纷飞! |
| hand | stoneAxe | (空,风味) | 这把石斧还没挂在任何目标上…… |
| stoneAxe | river | (空) | 你挥斧砍水,只溅起一片水花。 |
| stoneAxe | stone | (空) | 以石击石,火星四溅,但什么也没发生。 |
| hand | stick | (空) | 木棍静静地躺着。 |
| hand | stone | (空) | 石子静静地躺着。 |
| hand | wood | (空) | 一段厚实的木料。 |
| forest | stoneAxe | (空) | 森林「使用」石斧?这个挂法好像反了。 |

`results: []` = 纯风味文本(不掷骰)。产出判定:`rollDrops` 顺序掷骰首个命中,
全部未命中 → trigger 打"一无所获"。

## 4. RECIPES / getRecipe

```ts
{ id: "stone-axe", category: "石器",
  inputs: [{type:"stone",count:3},{type:"stick",count:2}],
  output: {type:"stoneAxe",count:1} }
```

## 5. 概率工具

```ts
rollDrops(interaction)  // 顺序判定 results,首个 chance 命中返回 [{type,count}]
rollPool(pool)          // 权重随机;total=Σweight,r=rand*total,依次减,减到负即中
```

rollPool 用于探索产出的权重池(forest 0.65 / river 0.35)。
