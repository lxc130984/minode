# minode 文档中心

> 面向 AI / 工程师交接的完整文档。按序阅读即可全面掌握本项目;
> 改代码前**必读** `10-invariants.md`(不变量)与 `11-pitfalls.md`(踩坑实录)。

| 文档 | 内容 | 什么时候读 |
|---|---|---|
| [01-overview.md](01-overview.md) | 项目是什么、设计哲学、技术栈、仓库地图、如何启动 | 第一次接手 |
| [02-data-model.md](02-data-model.md) | GameNode / NodeDef / 行为联合 / 交互与配方结构、数量语义 | 改任何数据结构前 |
| [03-registry.md](03-registry.md) | 内容注册表全解:每个导出、每个内置定义逐字段说明 | 加内容前 |
| [04-store.md](04-store.md) | 主 store 逐个详解:state 字段、getter、全部 action 的签名/语义/边界,ui store,游戏时钟 | 改游戏逻辑前 |
| [05-dnd.md](05-dnd.md) | 拖拽系统:group 工厂、四条守卫规则、settle 生命周期、SortableJS 硬知识 | 改拖拽/堆叠前 |
| [06-components.md](06-components.md) | 界面层:App 布局、9 个组件逐一(Props/computed/模板/样式)、主题 CSS | 改界面前 |
| [07-save.md](07-save.md) | 存档系统:结构、校验规则全列表、导入导出、版本迁移策略 | 改存档结构前 |
| [08-extension.md](08-extension.md) | 扩展指南:加物品/节点/交互/配方/功能节点,运行时 API 全解 | 加新内容时 |
| [09-testing.md](09-testing.md) | 测试与调试:DEV 钩子、store 层测试、拖拽 UI 测试协议、常见"假故障" | 验证改动时 |
| [10-invariants.md](10-invariants.md) | 核心不变量清单(带代码位置与违规后果) | **每次改代码前** |
| [11-pitfalls.md](11-pitfalls.md) | 历史踩坑实录(每个 bug 的根因/修复/教训,含 commit 号) | **每次改代码前** |
| [12-glossary.md](12-glossary.md) | 项目自造术语表 | 遇到黑话时 |
| [13-deployment.md](13-deployment.md) | 部署与 CI:GitHub Pages、Actions 工作流、注意事项 | 发版/改仓库时 |

## 快速事实卡

- 线上地址:<https://lxc130984.github.io/minode/>
- 仓库:`git@github.com:lxc130984/minode.git`,分支 `main`,推送即自动部署(~1 分钟)
- 本地开发:`npm install && npm run dev`(http://localhost:1420)
- 构建:`npm run build`(= vue-tsc 类型检查 + vite 产出,CI 同款)
- 桌面端:`npm run tauri dev`(Tauri 壳,网页逻辑完全一致)
- 代码规模:约 3100 行(src/ 下),无单元测试框架,验证靠构建 + 浏览器手测/自动化
