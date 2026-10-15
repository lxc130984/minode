# minode-beta

一个「节点树 = Lisp 表达式」的点击增量沙盒游戏。**节点就是 symbol，嵌套就是括号，
`()` 表示 eval**——整棵树就是一段可以拖拽编辑的 Lisp 代码。

```
( 发动机厂[引擎]
   ( 装配台[零件]
      ( 轧机[板] …+10 )
      ( 冶炼炉[铁]
         铁矿石
         煤炭
         氧气 )
      … )
   ( 锻炉[钢] … ) )
```

## 玩法概念

- **表达式**：父节点是函数，子节点是实参；`(a b c)` 的返回值静态显示为 `a[值]`。
- **`()` = eval**：点击一个**表达式**（渲染括号的节点）= 求值它自己，产出物品进背包；
  裸符号实参点击无效果。
- **手持 = 隐式实参**：选中背包物品（如斧头）再点击，手持物参与配方检测
  （手持斧头点森林 → 木材）。
- **生产线经济**：资产只有物品（背包，容量受限）。**选择面板**选节点类型 →
  光标挂**虚影**进入放置模式 → 左键**消耗物品建造**（可连续建造，右键/Esc 取消）；
  `×` **回收** = 分解成原材料按 30% 返还。
- **编辑器手感**：括号配对高亮（emacs show-paren）、点 `)` 折叠 / 点 `…+N` 展开、
  拖括号移动整棵子表达式、FLIP 动画的挤压预览与「括号生长」入场。
- eval 不消耗：节点是 symbol，同一棵树可以无限点击；真正的成本是建造节点。
- 内容（物品/节点/配方/成本/数值）全部数据化，注册表装载，引擎保持小。

## 快速开始

```sh
vp install          # 安装依赖（Vite+ 统一工具链）
vp dev              # 开发服务器
vp check            # 格式 + lint
vp run type-check   # 类型检查（vue-tsc，必跑：vp check 不检查 .vue 脚本）
vp test             # 单元测试（89 个）
vp run build        # 类型检查 + 生产构建
```

技术栈：Vue 3 + TypeScript + Pinia（单 store）+ vue-draggable-plus（树内拖拽）+
break_infinity.js（Decimal 大数）。

## 部署（GitHub Pages）

推送到 `main`/`master` 即自动部署（`.github/workflows/deploy.yml`）：
CI 跑测试 → `vp run build` → 发布 `dist/` 到 GitHub Pages。

- 仓库为项目页（`用户名.github.io/仓库名/`）时，构建自动带 `/仓库名/` 的 base；
- 在仓库 Settings → Pages 选择 **GitHub Actions** 作为部署来源即可。

## 设计文档

实现规范在 [`docs/`](docs/README.md)——**代码与文档必须同步**；写任何东西前先查
[术语表](docs/10-glossary.md)（唯一词汇事实源）：

| 文档                                        | 内容                                         |
| ------------------------------------------- | -------------------------------------------- |
| [00 总览](docs/00-vision.md)                | 理念、Lisp 对应表、核心循环、决策摘要        |
| [01 节点模型](docs/01-node-model.md)        | 数据模型、chip 显示规范、返回值语义、存档 v4 |
| [02 求值](docs/02-eval.md)                  | `()` = eval、手持隐式实参、配方检测、结算    |
| [03 注册表](docs/03-content-registry.md)    | 内容包、校验、建造成本、扩展手册             |
| [04 背包与建造](docs/04-items-inventory.md) | 选择面板、放置模式、回收分解、箱子           |
| [05 架构](docs/05-architecture.md)          | 分层、数据流、测试、复杂度预算               |
| [06 UI 规范](docs/06-ui-style.md)           | 字符风美术、Lisp 渲染、动画、拖拽参数与坑    |
| [07 API 参考](docs/07-api-reference.md)     | 全量 API、接手指南、常见任务手册             |
| [08 决策台账](docs/08-decisions.md)         | ADR：关键决策与代价（改大东西前先读）        |
| [09 路线图](docs/09-roadmap.md)             | 里程碑与验收、健康度复查机制                 |
| [10 术语表](docs/10-glossary.md)            | **唯一词汇事实源**：术语/代码对照、废弃词表  |
