# minode · 节点世界

一个"点击 + 增量 + 文字冒险"网页游戏:一切游玩元素皆**节点**,世界与背包是两棵同构的树,核心操作只有**点击**(触发交互)与**拖拽**(组织节点树)。

> 🌐 在线游玩:<https://lxc130984.github.io/minode/>

## 玩法一瞥

- 点击**探索**节点,有几率在它下面发现森林、河流等地形
- 空手点击**森林**可以捡到木棍和石子,自动堆进背包
- **手工合成**节点天然生成在背包里:把材料堆整堆挂到它下面,点击即合成(如 3 石子 + 2 木棍 → 石斧)
- 把石斧放到世界里,再把森林拖到它下面,点击**石斧**就会砍伐森林产出木头
- 点击**背包**节点开合背包分屏;世界与背包之间自由拖拽(拖进世界 = 放置一个)
- 背包里同类物品自动堆叠成一棵小树(显示前 4 个 + 省略号)
- 存档自动保存在浏览器本地,支持导出/导入 JSON

## 文档

完整的架构与交接文档(数据模型、注册表、store、拖拽系统、组件、存档、
扩展指南、测试方法、核心不变量、踩坑实录、词汇表、部署):
**[docs/](docs/README.md)** —— 改代码前请先读 [docs/10-invariants.md](docs/10-invariants.md)
与 [docs/11-pitfalls.md](docs/11-pitfalls.md)。

## 技术栈

Vue 3 + TypeScript + Pinia(持久化)+ Element Plus + lucide 图标;
节点树拖拽基于 SortableJS / vue-draggable-plus;
桌面壳为 Tauri(本仓库同时是 Tauri 应用,`npm run tauri dev`)。

## 开发

```bash
npm install
npm run dev          # 网页开发 (http://localhost:1420)
npm run tauri dev    # Tauri 桌面端
npm run build        # 类型检查 + 生产构建
```

推送到 `main` 会通过 GitHub Actions 自动部署到 Pages。
