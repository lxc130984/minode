# 03 · 内容注册表(src/game/registry.ts + src/content/)

> **内容的定义在 `src/content/`**,引擎只认 `registry` 里的运行时容器;
> 两者之间是 `game/api.ts`(带校验的注册层)。内置内容与扩展走**同一条路**。
>
> - 加内容(进版本库)= 在 `src/content/` 加文件 → 在 content/index.ts 挂上;
> - 试玩/动态注册 = 控制台 `minode.*`(DEV,刷新即失);
> - 两者的注册入口与校验完全一致(吃自己的狗粮,见 08)。

## 0. 三层结构

```
src/content/builtin.ts ─┐                        ┌─ registry.ts(引擎容器)
  (内置内容包)          ├─ api.ts(注册+校验) ──┤   NODE_DEFS / DEF_MAP
src/content/xxx.ts ─────┘  registerContent 等     │   INTERACTIONS / MAP
                                                  │   RECIPES
控制台 minode.*(DEV) ────────────────────────────┘   (+ put* 原语/查询)
```

所有集合都是 `shallowReactive(...)`:注册(push/索引赋值)会立刻触发
图鉴分组(CodexView 的 computed)、配方列表、图标的重算——
**普通(非响应式)集合不会触发**,注册后界面"看起来没生效"(历史坑)。
图标组件值用 `markRaw` 包裹(在 icons.ts 内处理)。

⚠️ 新增集合时同样必须包 shallowReactive;`deep` 不需要(条目内部字段视为不可变)。

## 1. 注册原语与查询(registry.ts)

| 导出 | 说明 |
|---|---|
| `putNodeDef(def)` / `putInteraction(it)` / `putRecipe(recipe)` | 注册原语:同 id/键覆盖,维护集合与索引一致;api 在其上做校验 |
| `getDef(type)` | 带兜底的查找:未知 type 返回"未知的节点"(全区域可用,不崩——运行时注册内容刷新即失的宽容兜底) |
| `zonesOf(type)` / `canPlaceInZone(type, zone)` | 区域权限唯一判定点;**拖拽守卫/收纳/放置/存档校验全部经此,勿绕过** |
| `isPermanent(type)` | 移除操作的拒绝判定 |
| `findInteraction(s, t)` | 交互精确查找(键 `"source>target"`,source 可为 `"hand"`) |
| `getRecipe(id)` / `rollDrops(it)` / `rollPool(pool)` | 配方查找;交互掷骰(顺序判定首个命中);权重随机 |

## 2. 内置内容(src/content/builtin.ts)

### 2.1 当前 10 个节点定义(逐个)

| id | category | 关键 flag | behavior | 说明 |
|---|---|---|---|---|
| `explorer` 探索 | functional | worldOnly, permanent, accent #d08a3e | `{explore, durationMs:5000, successRate:0.65, pool:[forest .65, river .35]}` | 世界自带;点击工作 5s 后概率产地形 |
| `backpackNode` 背包 | functional | worldOnly, permanent, **noChildren**, accent #b98a2f | `{view-toggle, view:"backpack"}` | 世界自带;左侧触发按钮开合背包分屏(即时,不走工作) |
| `bench` 手工合成 | functional | permanent, **zones:["backpack"]**, accent #8672bd, **workMs:2000** | `{craft}` | 背包自带;**只能在背包**;点击工作 2s 后合成 |
| `waterwheel` 水车 | functional | **maxStack:1**, **maxProcess:2**, accent #9c7b4a | `{auto-trigger, intervalMs:3000, poweredBy:"river"}` | 直接挂在河流下即就位,每 3 秒驱动其子节点(最多同时驱动两个) |
| `forest` 森林 | terrain | worldOnly, accent #3d8b57, **workMs:3000** | — | 空手翻找(工作 3s)得木棍/石子;被石斧砍得木头 |
| `river` 河流 | terrain | worldOnly, accent #2f8f96, **workMs:2500**, **maxProcess:2** | — | 空手捡石子(工作 2.5s);河上最多两台水车 |
| `stick` 木棍 | resource(实际 material) | **maxStack:64** | — | 材料(未声明 workMs → 缺省 1.5s) |
| `stone` 石子 | material | **maxStack:64** | — | 材料 |
| `wood` 木头 | material | **maxStack:64** | — | 材料 |
| `stoneAxe` 石斧 | tool | **maxStack:1**, **maxProcess:1**, accent #8672bd, **workMs:2000** | — | 不可堆叠;砍柴工作 2s;同时只处理一棵树 |

(注:材料 category 值为 `"material"`,中文标签"资源"。)

### 2.2 交互表(全部条目)

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

### 2.3 配方

```ts
{ id: "stone-axe", category: "石器",
  inputs: [{type:"stone",count:3},{type:"stick",count:2}],
  output: {type:"stoneAxe",count:1} }
{ id: "water-wheel", category: "木工",
  inputs: [{type:"wood",count:4},{type:"stick",count:2}],
  output: {type:"waterwheel",count:1} }
```

## 3. 图标映射(在 src/game/icons.ts,不在此文件)

```ts
// game/icons.ts:两种来源汇成一张 ICONS 表(键 = NodeDef.icon 的值)
// ① 像素贴图(自动):把图片丢进 src/assets/icons/ 即注册,键 = 文件名(去扩展名)
const ASSET_FILES = import.meta.glob("../assets/icons/*.{png,webp,gif,svg,jpg}",
  { eager: true, query: "?url", import: "default" })
// ② lucide 线条图标(显式):LUCIDE_ICONS 表;不能 glob 整个包(上千图标全进产物)
export const ICONS = shallowReactive({ ...LUCIDE_ICONS, ...贴图组件 })
```

- **同名时贴图覆盖 lucide**——逐个换成像素风时,放同名文件就够了。
- 贴图组件 = `<img class="px-icon">`(main.css 里 `image-rendering: pixelated`),
  接受与其他图标一致的 `{ size }` prop。美术说明见 `src/assets/icons/README.md`。
- 运行时追加/覆盖:`api.registerIcon(name, comp)`(写 ICONS,刷新即失)。
- 兜底:NodeIcon 里 `ICONS[icon] ?? ICONS.hand`。
- 图标改名坑:lucide 新版本会改名(如 `HelpCircle→无`、`MoreVertical→EllipsisVertical`),
  引用前先 grep `node_modules/lucide-vue-next/dist/lucide-vue-next.d.ts` 确认存在。

## 4. 注册 API(在 src/game/api.ts,详见 08)

`registerNode / registerInteraction / registerYield / registerRecipe / registerIcon /
registerContent(内容包批量) / validate(全量体检)`——注册即校验,
引用缺失给可操作的 console 警告。内置内容(builtin.ts)也走这一层。
