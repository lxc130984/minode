# 01 · 项目总览

## 1. 一句话

minode 是一个"点击 + 增量 + 文字冒险"网页游戏:**一切游玩元素皆节点**,
世界与背包是两棵同构的树,玩家的全部操作只有**点击**(触发交互)和**拖拽**(组织树)。

> 设计者的原话:"节点之于 minode,如同方块之于 Minecraft。"
> 灵感来源:Markdown / Org-mode 的节点树,以及 orgro 等大纲阅读器的极简界面。

## 2. 设计哲学(三条铁律)

### 铁律一:一切皆节点

- 世界(`game.nodes`)和背包(`game.backpack`)都是 `GameNode[]`,渲染用同一个组件 `NodeBoard`。
- 没有单独的"物品"概念——物品就是放在背包里的节点;
  没有"物品栏/快捷栏"(历史上存在过,已删除,见 11-pitfalls §5)。
- 界面元素也被节点化:背包本身是世界里的一个节点(左侧触发按钮开合分屏),
  探索与手工合成是世界/背包里的功能节点。

### 铁律二:触发有方向(来源 × 目标)

每一次触发都由 `(source, target)` 二元组刻画(界面入口 = 节点左侧的
触发按钮——图标+名字合一;点击行本身是折叠/展开,见 06 §3):

- 触发**有子节点的节点**:父为 source,逐个子节点为 target,依次触发;
- 触发**叶子节点**:空手(`"hand"`)为 source,该节点为 target;
- 查交互表(INTERACTIONS)得到产出或风味文本。

示例(核心教学链):
```
空手触发森林     → (hand, forest)   → 55% 木棍 / 30% 石子
石斧下挂森林,触发石斧 → (stoneAxe, forest) → 100% 木头
```

### 铁律三:拖拽即交互

- **各区域内部 = 整棵自由搬运**(把一堆拖到另一堆下面 = 合并;重组流程树);
- **跨区域 = 一次一个**:整堆/整树禁止跨区拖——放进世界走"放置"(一次一件),
  回收进背包先把子节点一条一条移走(像 MC 挖方块);
- 世界挂载受**处理上限**(maxProcess,直接子节点数,如石斧同时只砍一棵树),
  背包挂载受**堆叠上限**(maxStack,子树总件数);
- 守卫规则(区域权限/跨区整树/处理上限/同类容量/防环)在 SortableJS 的
  `put` 里统一拦截。

## 3. 当前游戏内容

| 内容 | 形态 |
|---|---|
| 工作时长(workMs) | **触发 ≠ 瞬时结算**:点击可交互节点开始一项工作,行底进度条填充,到点结算;期间忙碌,再点无效。探索 5s、石斧砍柴 2s、合成 2s、森林翻找 3s、河流 2.5s,缺省 1.5s |
| 处理上限(maxProcess) | 世界区一个节点最多同时挂几个**直接**子节点(流程语义):石斧同时只砍一棵树、水车同时驱动两个、一条河两台水车;探索等收集节点不限。与背包的堆叠上限(子树总量)对偶。跨区搬运一次一个:整树禁拖,回收一条一条 |
| 探索(explorer) | 世界自带永久功能节点;工作 5s 后,65% 概率按权重在自身子级生成地形(森林 0.65 / 河流 0.35) |
| 背包(backpackNode) | 世界自带永久功能节点;点击开合右侧背包分屏;noChildren(不可挂子节点) |
| 手工合成(bench) | 背包自带永久功能节点;把材料堆挂它下面,点击(工作 2s)按当前配方合成 |
| 森林 / 河流 | 地形,世界限定,探索产出 |
| 木棍 / 石子 / 木头 | 材料,maxStack=64 |
| 石斧 | 工具,maxStack=1(不可堆叠) |
| 水车 | 功能节点,maxStack=1;直接挂在河流下面即就位,每 3 秒"驱动"一次自己的子节点(如石斧,石斧的工作 2s < 3s,节奏衔接) |
| 配方 | 3 石子 + 2 木棍 → 石斧(类别"石器");4 木头 + 2 木棍 → 水车(类别"木工") |

一条完整的开局流程:
探索节点 → 出森林 → 空手点森林攒材料(自动堆进背包)→ 点背包节点开分屏 →
把石子堆/木棍堆整堆拖到手工合成下 → 点手工合成得石斧 →
把石斧拖到世界(放 1 个)→ 把森林拖到石斧下面 → 点石斧砍柴得木头 →
攒 4 木头 + 2 木棍合成水车 → 水车拖到河流下面、石斧挂到水车下面 →
水流每 3 秒自动驱动石斧,木头自动进背包。

## 4. 技术栈与依赖

| 依赖 | 用途 | 备注 |
|---|---|---|
| Vue 3(`<script setup>` + TS) | UI | 全部 SFC,无 JSX |
| Pinia + pinia-plugin-persistedstate | 状态 + localStorage 存档 | persist.pick 白名单 |
| Element Plus | 对话框/抽屉/下拉/消息 | 中文 locale;浅色主题下对齐了主色 |
| lucide-vue-next | 图标 | 经 game/icons.ts 的 ICONS 间接引用 |
| sortablejs + vue-draggable-plus | 拖拽 | **注意用的是 vue-draggable-plus 内嵌的 Sortable 构建**,与独立版行为有差异(见 05-dnd §6) |
| @vueuse/core | useIntervalFn / useMediaQuery 等 | |
| Vite 8 | 构建 | `base: "/minode/"` 为 Pages 配置 |
| Tauri 2 | 桌面壳(可选) | 网页逻辑不依赖任何 Tauri API |

## 5. 仓库地图

```
minode/
├─ index.html              # 入口 HTML;含 window.__bootErrs 启动错误收集器(红条显示)
├─ vite.config.ts          # base=/minode/;dev server 1420 端口
├─ src/
│  ├─ main.ts              # 启动顺序:ensureSaveIntegrity → pinia(+persist)→ EP → mount;DEV 暴露 window.__game / window.minode
│  ├─ App.vue              # 布局壳 + 1s 游戏心跳 + 移动端边缘滑动 + 浮窗/抽屉/对话框
│  ├─ game/                # 纯逻辑层(不 import 任何组件)
│  │  ├─ types.ts   (183 行)  # 数据模型与类型 + nodeCount/isStack/CATEGORY_LABELS
│  │  ├─ icons.ts    (78 行)  # 图标注册中心:assets/icons/ 贴图自动注册 + lucide 显式表
│  │  ├─ work.ts     (56 行)  # 工作系统:触发挂工作(时长/忙碌/到点结算),进度条数据源
│  │  ├─ registry.ts (280 行) # 内容注册表(全部 shallowReactive)
│  │  ├─ tree.ts     (64 行)  # 树纯函数
│  │  ├─ dnd.ts      (83 行)  # 拖拽 group 工厂 + onTreeAdd + DND_COMMON
│  │  └─ api.ts      (81 行)  # 运行时扩展 API
│  ├─ stores/
│  │  ├─ game.ts    (871 行)  # 主 store:状态/守卫/全部游戏动作/存档(最大的文件)
│  │  └─ ui.ts       (28 行)  # 界面开关(不持久化)
│  ├─ components/
│  │  ├─ NodeBoard.vue (127)  # 节点面板基本组件(world/backpack 共用)
│  │  ├─ NodeItem.vue  (419)  # 递归行节点(渲染+拖拽+折叠+堆徽标+点击分发+工作进度条)
│  │  ├─ NodeIcon.vue  (19)   # 图标(accent 着色;ICONS 见 game/icons.ts)
│  │  ├─ CodexView.vue (172)  # 图鉴(分组)+ 上手指南
│  │  ├─ Inspector.vue  (375)  # 检查器抽屉(「详情」按钮选中节点+操作)
│  │  ├─ RecipeDialog.vue(161)# 配方选择(按 category 分组)
│  │  ├─ LogConsole.vue (97)  # 日志面板
│  │  ├─ TopBar.vue    (166)  # 品牌+图鉴开关+菜单(导出/导入/重置)
│  │  └─ StatusBar.vue (108)  # 统计+最新日志
│  └─ styles/main.css         # 全局主题 + 拖拽虚影 + 设计变量
├─ docs/                    # 本文档
├─ .github/workflows/deploy.yml  # Pages CI
└─ src-tauri/               # Tauri 壳(与网页逻辑无关)
```

分层约定:`game/` 是纯逻辑(可被 store 与组件双向引用,但不引用组件);
`stores/` 持有状态;`components/` 只消费 store 与 game/ 的导出。
唯一例外:`dnd.ts` import 了 store(守卫需要读状态),属有意为之。

## 6. 界面结构(当前)

```
┌─ TopBar:logo minode | [图鉴按钮] [⋯菜单:导出存档/导入存档/新的世界] ┐
│                                                                    │
│  NodeBoard(world,常驻)      ‖      NodeBoard(backpack,分屏)      │
│  ─ 探索 ▾                        ‖  ─ 手工合成(配方·石斧)        │
│    ─ 森林                        ‖  ─ 木头 ×22                    │
│  ─ 背包(已开启)                 ‖      ─ 木头 ×4 … ⋯还有17个      │
│  …                               ‖  …                             │
├─ StatusBar:已保存 | 世界 N | 物品 M | 时长 | ›最新日志 ────────────┤
│  浮层:图鉴浮窗(右上)、检查器抽屉(右)、日志抽屉(下)、配方对话框   │
```

- 背包分屏由世界里的「背包」节点点击开关(`ui.backpackOpen`)。
- 图鉴是右上角浮窗(`ui.codexOpen`),非模态。
- 移动端(<900px):左缘右滑开图鉴、右缘左滑开检查器;分屏变窄列。

## 7. 如何启动

```bash
npm install
npm run dev            # 网页开发 → http://localhost:1420
npm run tauri dev      # 桌面端(可选)
npm run build          # 类型检查 + 生产构建
```

⚠️ vite dev server 的文件监听会**偶发静默失效并下发旧模块**(详见 11-pitfalls §10):
改了代码但页面行为像没变时,先重启 dev server;测试时用 `?t=<时间戳>` 强制加载。
