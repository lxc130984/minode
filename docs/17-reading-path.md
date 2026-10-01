# 17 · 吃透 minode:阅读顺序 + 改造手册

> 这份文档是给**项目所有者本人**看的:上半部分是一条"从零到能改"的阅读路线
> (按依赖顺序排好,每一步说清为什么、读什么、读完该会什么);
> 下半部分是一个完整的改造手册示例(Element Plus 按需引入),
> 既是马上要做的优化,也是"一份合格改造说明长什么样"的样板。

---

## 上半 · 吃透本项目的阅读顺序

### 总原则

1. **先文档后源码**:docs/ 是这个项目的"规格书",源码是规格的实现;
   顺着文档读源码,10 分钟的源码阅读能顶裸读一小时。
2. **先数据后行为**:先搞清"游戏里有什么东西"(节点/树/注册表),
   再搞清"东西怎么动"(click/工作/拖拽),最后才是"长什么样"(组件/样式)。
3. **每层读完动手**:阅读路线里每层都配了练习,不动手等于没读。
4. 词汇全程按 [15-naming.md](15-naming.md);给别人(或 AI)提需求按
   [16-ai-collaboration.md](16-ai-collaboration.md) 的话术。

### 第 0 步 · 玩一遍(半小时)

先玩线上版走完整个青铜时代:探索 → 森林/河流 → 石斧砍柴 → 水车 →
山地 → 篝火熔炼 → 铜镐/铜斧 → 风车 → 图腾柱。
**为什么**:后面每个概念你都会有对应的肌肉记忆——读到"断链灰闪"时
你脑子里是那个具体画面,理解成本减半。

### 第 1 层 · 入门:项目是什么(半天)

| 读什么 | 为什么 | 读完该会什么 |
|---|---|---|
| [README.md](../README.md) | 一页玩法一瞥 | 说得出这个游戏的操作范式 |
| [01-overview.md](01-overview.md) | 总览+三条铁律+仓库地图 | 画出"content → api → registry → store → 组件"的分层图 |
| [12-glossary.md](12-glossary.md) | 词汇表(玩家/设计视角) | 中文黑话不再卡壳 |
| [15-naming.md](15-naming.md) | 命名规范(开发视角) | 说话用 click/接收者/断链,不用旧词 |

### 第 2 层 · 数据与内容:游戏里有什么(1 天)

| 读什么 | 配套源码 | 读完该会什么 |
|---|---|---|
| [02-data-model.md](02-data-model.md)(GameNode/NodeDef/交互/配方) | `src/game/types.ts`(183 行,全读) | 解释"数量=子树大小"和"堆=根+直接子叶" |
| [03-registry.md](03-registry.md)(三层结构/内置内容表) | `src/content/builtin.ts` 对照 | 说出注册管线:content → api(校验)→ registry |
| [08-extension.md](08-extension.md)(内容创作指南) | `src/content/bronze.ts` 对照 | **练习①**:照着 16 §4 的锡矿石示例,自己加一个物品+两条 click 反应+一条配方,跑 `minode.validate()` 零问题 |

### 第 3 层 · 引擎核心:东西怎么动(2~3 天,最重要)

| 读什么 | 配套源码 | 读完该会什么 |
|---|---|---|
| [04-store.md](04-store.md) §1(state/时钟/工作系统) | `src/game/work.ts`(96 行,全读) | 解释工作表为什么在 store 外、cycle 计时循环 |
| [04-store.md](04-store.md) §2.2(dispatchClick) | `src/stores/game.ts` 的 `dispatchClick` 函数 | 在纸上推演"点石斧→森林开工→完成后传导→篝火灰闪"的完整调用链 |
| [04-store.md](04-store.md) 其余(收纳/放置/堆叠/守卫) | 同文件的对应 action | **练习②**:在控制台按 09 §5 走完整开局链 |
| `src/game/tree.ts`(64 行) | —— | 树纯函数(findNode/removeNode)心里有底 |

### 第 4 层 · 拖拽与界面:怎么操作(1~2 天)

| 读什么 | 配套源码 | 读完该会什么 |
|---|---|---|
| [05-dnd.md](05-dnd.md)(守卫七条规则/落库整理) | `src/game/dnd.ts`(89 行) | 说出"跨区一次一个"的两条规则和 normalizePile 为何要延迟 |
| [06-components.md](06-components.md)(交互范式/组件逐个) | `src/components/NodeItem.vue`(517 行,**全项目最复杂,精读**) | 解释行上四种状态:进度条/⟵来源/灰闪/容器样式 |
| [14-visual-art.md](14-visual-art.md) | `src/styles/main.css` | **练习③**:给断链灰闪换一种你自己的视觉(改一个 keyframes) |

### 第 5 层 · 质量红线:怎么不出事(每次改代码前重读)

| 读什么 | 作用 |
|---|---|
| [10-invariants.md](10-invariants.md) | 16 条不变量,改代码前逐条对照 |
| [11-pitfalls.md](11-pitfalls.md) | 历史翻车实录——每个坑都是真实调试时间换的 |
| [09-testing.md](09-testing.md) | 验证方法:build / validate / 浏览器协议 / 三大假故障 |

### 第 6 层 · 配套(按需)

[07-save.md](07-save.md)(存档)、[13-deployment.md](13-deployment.md)(部署)、
[16-ai-collaboration.md](16-ai-collaboration.md)(协作纪律)。

### 读完的标准(自测)

- [ ] 能口述一次「点击石斧」从 `onTriggerClick` 到木头进背包的全部函数调用
- [ ] 能解释为什么水车的进度条常驻、森林的进度条到点消失
- [ ] 能独立加一个内容包并完成验证闭环(build + validate + 浏览器)
- [ ] 能说出三条最容易被违反的不变量(I-3/I-14/I-16)

---

## 下半 · 改造手册:Element Plus 按需引入

> 这是"一份合格改造手册"的样板:证据 → 方案 → 逐步操作 → 验证 → 风险回滚。
> 可以直接把本节转给执行 AI(话术已按 16 号文档规范)。

### 1. 背景与证据

- `src/main.ts:4-6`:**全量**引入 EP(组件 + 全量 CSS):
  ```ts
  import ElementPlus from "element-plus"
  import zhCn from "element-plus/es/locale/lang/zh-cn"
  import "element-plus/dist/index.css"
  ```
- 实际只用了 **7 样**:`el-button`(4 处)、`el-dropdown` 系列(5 处)、
  `el-drawer`(2 处)、`el-dialog`(1 处)、`ElMessage`、`ElMessageBox`(2 个文件)。
- 当前产物:**JS 1095KB(gzip 357KB)+ CSS 376KB(gzip 51KB)**,
  GitHub Pages 单文件全量下发——每个新玩家的首屏等待。
- 性质:**纯构建层**,零引擎/玩法改动,风险最低;预期体积砍 60% 以上。

### 2. 方案

`unplugin-auto-import` + `unplugin-vue-components`(ElementPlusResolver):
模板里的 `<el-xxx>` 由 Components 插件自动按需引入 + 注入对应样式;
`ElMessage/ElMessageBox` 这类函数式 API 由 AutoImport 插件处理
(import 处自动补样式);locale 改用 `ElConfigProvider` 包裹(按需模式下
全局 `app.use(ElementPlus,{locale})` 不复存在)。

### 3. 逐步操作

**① 装依赖**(devDependencies):

```bash
npm i -D unplugin-auto-import unplugin-vue-components
```

**② `vite.config.ts`** 顶部加两个插件的 import,`plugins` 数组改为:

```ts
import AutoImport from "unplugin-auto-import/vite"
import Components from "unplugin-vue-components/vite"
import { ElementPlusResolver } from "unplugin-vue-components/resolvers"

plugins: [
  vue(),
  AutoImport({ resolvers: [ElementPlusResolver()] }),
  Components({ resolvers: [ElementPlusResolver()] }),
]
```

**③ `src/main.ts`** 删掉全量引入,挂载行去掉 `.use(ElementPlus, …)`:

```ts
// 删: import ElementPlus from "element-plus"
// 删: import "element-plus/dist/index.css"
// 删: import zhCn from "element-plus/es/locale/lang/zh-cn"  ← 移到 App.vue(见 ④)
// 其余(内容注册、存档校验、pinia)一行不动
createApp(App).use(pinia).mount("#app")
```

**④ `src/App.vue`** 根节点包一层 ConfigProvider(组件与样式由插件自动引入,
locale 在这里接管):

```vue
<script setup lang="ts">
import zhCn from "element-plus/es/locale/lang/zh-cn"
// …原有 setup 一行不动…
</script>

<template>
  <el-config-provider :locale="zhCn">
    <div class="app" …>…原有内容…</div>
  </el-config-provider>
</template>
```

**⑤ `ElMessage` / `ElMessageBox` 的使用文件**(Inspector.vue / TopBar.vue /
store 里如有):保持 `import { ElMessage, ElMessageBox } from "element-plus"`
**显式 import 不变**——但样式不会自动来;两个解决办法任选:
- 简单(推荐):在这两个文件里补样式 import:
  `import "element-plus/es/components/message/style/css"` 与
  `import "element-plus/es/components/message-box/style/css"`;
- 或给 AutoImport 的 resolver 传 `importStyle: "sass"` 并配置 scss 入口
  (更繁琐,不必)。

### 4. 验证清单(验收标准)

- [ ] `npm run build` 零错误;产物 JS 显著变小(预期 -500KB 级)、
      CSS 显著变小(预期 -300KB 级);记录改造前后体积对比进 commit message。
- [ ] 浏览器过一遍全部 EP 交互:检查器抽屉(开/关)、配方对话框、
      TopBar 下拉菜单、移除确认框(**ElMessageBox 按钮文字应为中文**
      「确定/取消」——locale 失败的第一信号)、任意 ElMessage 提示。
- [ ] 深浅色/圆角与改造前无差(EP 主题变量覆盖仍生效于按需样式)。
- [ ] `minode.validate()` 零问题(证明内容注册未受构建层影响)。

### 5. 风险与回滚

- **兼容性风险**:本项目用 Vite 8(rolldown 内核),unplugin 系列理论上
  兼容;若 build 报插件相关错误,回退方案是**手动按需**
  (main.ts 显式 `app.component(ElButton, …)` + 每组件单独引样式,繁琐但零依赖)。
- **locale 风险**:忘记包 `el-config-provider` → MessageBox 变英文按钮,
  验证清单第 2 条专门抓这个。
- **回滚**:本改动单独成一个 commit;出问题 `git revert` 即可,
  不与任何引擎/内容改动耦合。

### 6. 交给执行 AI 的话术(按 16 号文档格式)

> 「构建层改造(允许动 vite.config.ts 与 main.ts/App.vue 的引入方式,
> 禁止碰 src/game、src/stores、src/content):按 docs/17 下半部分执行
> Element Plus 按需引入,逐条过它的验证清单,产物体积前后对比写进提交信息,
> 单独 commit。」

---

*文档完。维护约定:每当大架构变动,更新上半的阅读顺序;每当做重要优化,
照下半的格式追加手册。*
