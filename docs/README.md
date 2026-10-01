# minode 文档中心

> 面向 AI / 工程师交接的完整文档。按序阅读即可全面掌握本项目;
> 改代码前**必读** `10-invariants.md`(不变量)与 `11-pitfalls.md`(踩坑实录)。

| 文档 | 内容 | 什么时候读 |
|---|---|---|
| [01-overview.md](01-overview.md) | 项目是什么、设计哲学、技术栈、仓库地图、如何启动 | 第一次接手 |
| [02-data-model.md](02-data-model.md) | GameNode / NodeDef / 行为联合 / 交互与配方结构、数量语义 | 改任何数据结构前 |
| [03-registry.md](03-registry.md) | 内容三层结构(content/api/registry)、内置定义逐字段说明 | 加内容前 |
| [04-store.md](04-store.md) | 主 store 逐个详解:state 字段、getter、全部 action 的签名/语义/边界,ui store,游戏时钟 | 改游戏逻辑前 |
| [05-dnd.md](05-dnd.md) | 拖拽系统:group 工厂、七条守卫规则(区域/跨区整树/处理上限/堆叠/防环)、SortableJS 硬知识 | 改拖拽/堆叠前 |
| [06-components.md](06-components.md) | 界面层:App 布局、9 个组件逐一(Props/computed/模板/样式)、主题 CSS | 改界面前 |
| [07-save.md](07-save.md) | 存档系统:结构、校验规则全列表、导入导出、版本迁移策略 | 改存档结构前 |
| [08-extension.md](08-extension.md) | 内容创作指南:内容包(src/content/)、注册 API 与校验、美术图标流程 | 加新内容时 |
| [09-testing.md](09-testing.md) | 测试与调试:DEV 钩子、store 层测试、拖拽 UI 测试协议、常见"假故障" | 验证改动时 |
| [10-invariants.md](10-invariants.md) | 核心不变量清单(带代码位置与违规后果) | **每次改代码前** |
| [11-pitfalls.md](11-pitfalls.md) | 历史踩坑实录(每个 bug 的根因/修复/教训,含 commit 号) | **每次改代码前** |
| [12-glossary.md](12-glossary.md) | 项目自造术语表 | 遇到黑话时 |
| [13-deployment.md](13-deployment.md) | 部署与 CI:GitHub Pages、Actions 工作流、注意事项 | 发版/改仓库时 |
| [14-visual-art.md](14-visual-art.md) | 视觉与艺术创作:图标/配色/行样式/动效的架构与改法、扩展新视觉钩子 | 改外观/加美术内容时 |
| [15-naming.md](15-naming.md) | 开发名词规范:权威定名/禁用旧词/代码标识符约定/一致性自查 | 写代码、写文档、提需求前 |
| [16-ai-collaboration.md](16-ai-collaboration.md) | AI 协作纪律:需求话术模板/执行红线/美术路径/完整示例 | 给 AI 提需求、AI 接活前 |
| [17-reading-path.md](17-reading-path.md) | 吃透本项目的阅读顺序(六层路线+自测)+ 改造手册样板(EP 按需引入) | 第一次想系统掌握项目、做构建层优化时 |

## 快速事实卡

- 线上地址:<https://lxc130984.github.io/minode/>
- 仓库:`git@github.com:lxc130984/minode.git`,分支 `main`,推送即自动部署(~1 分钟)
- 本地开发:`npm install && npm run dev`(http://localhost:1420)
- 构建:`npm run build`(= vue-tsc 类型检查 + vite 产出,CI 同款)
- 桌面端:`npm run tauri dev`(Tauri 壳,网页逻辑完全一致)
- 代码规模:约 3700 行(src/ 下),无单元测试框架,验证靠构建 + 浏览器手测/自动化
