# 16 · AI 协作纪律(怎么给 AI 提需求 / AI 怎么干活)

> 目的:让"用户 ↔ AI"和"AI ↔ AI"的对话有一套固定话语,
> 提需求不出歧义、干活不出红线。术语一律按 **15-naming**。
> 两个角色:**需求方**(提要求的人)、**执行 AI**(写代码/文档的 AI)。

## 1. 需求方话术模板(照着说,AI 就能精准落位)

### 1.1 加一个物品(节点定义)

> 「新增物品 `<def.id>`(显示名「xx」),分类 `<material|tool|terrain|functional>`,
> 图标键 `<icon>`(美术会放 `assets/icons/<icon>.png`),描述「xx」,
> 堆叠上限 `<maxStack>`,工作时长 `<workMs>`ms,处理上限 `<maxProcess>`。」

未提到的字段 = 用缺省(material 64/工具 1、workMs 1500、maxProcess ∞)。
想覆盖已有物品 = 同一句但声明"覆盖内置定义"。

### 1.2 加一组 click 反应(交互)——**最核心的模板**

> 「物品 `<target>` 接收来自 `<source>` 的 click:<概率 p> 产出 `<产物>` ×n,
> 工作节奏按 `<source 的 workMs>`;note:「xx」。」
> 风味版:「物品 `<target>` 接收来自 `<source>` 的 click:无产出,
> 回应风味:「xx」。」
> 断链版:「`<target>` 不接收来自 `<source>` 的 click(不要写条目,自然灰闪)。」

规则速记:**写条目 = 接收**(有产出→接收者身上开工;无产出→回风味后继续传导);
**不写条目 = 自己不做事、瞬间继续传导;若它也没有子节点 → 灰闪断链**。
探索/合成节点只收 `"hand"` 的 click,给它们写非空手条目没有意义。

### 1.3 加一条配方

> 「配方 `<id>`(组 `<category>`,如 熔炼/石器/铜器):
> `<材料>×n + … → <产物>×n。」

### 1.4 加一个功能节点(带行为)

> 「新增功能节点 `<def.id>`:行为 `<explore|craft|auto-trigger|view-toggle>`
> + 行为参数(intervalMs / poweredBy / pool…)。
> (新行为种类 = 改引擎,需求里要明说"允许改引擎"。)」

### 1.5 改数值 / 改视觉 / 改交互

> 数值:「把 `<def.id>` 的 `<workMs|maxStack|maxProcess|chance>` 从 a 改为 b。」
> 视觉:「给 `<def.id>` 换图标/改 accent `<css color>`」(美术路径见 §3)。
> 交互:「删掉/修改 `<source>><target>` 条目:…」

### 1.6 提架构改动

> 「这是引擎改动(改 src/stores 或 src/game 的非 content 文件)。」
> 需求方明说"引擎改动"四个字,执行 AI 才允许碰引擎;否则默认**内容层零引擎改动**。

## 2. 执行 AI 纪律(红线)

1. **先读后写**:动代码前必读 docs/10-invariants、docs/11-pitfalls、
   以及目标区域文档(04 store / 05 拖拽 / 06 界面 / 08 内容 / 14 视觉)。
2. **术语合规**:代码、注释、提交信息、文档全部用 15-naming 的定名;
   出现 §1 右列旧词 = 返工。
3. **内容走 API**:加内容只写 src/content/(registerContent),
   不直接改 registry 集合、不动引擎;完成后控制台 `minode.validate()` 必须零问题。
4. **验证闭环**:`npm run build` 零错误 + 浏览器实测(docs/09 协议,
   断言状态而非 DOM;拖拽用合成 PointerEvent,页面必须前台、模块必须新鲜——
   curl 带 `/minode/` 前缀确认下发内容)。
5. **文档同步**:改了行为必须同步对应 docs;行数/表格跟着改;
   自查"文档里引用的函数名在 src 里存在"。
6. **提交规范**:一个主题一个 commit;消息首行 =「<区域>:<一句话>」,
   区域 ∈ 内容/引擎/界面/文档/修复;大改列 bullet;不明确要求不推送。
7. **审查环节**:非平凡改动在宣布完成前过一遍 reviewer 视角
   (重点:不变量清单逐条对照 + 文档一致性)。
8. **诚实汇报**:测试失败就说失败;环境假故障(dev server 陈旧模块/
   后台标签页)要按 11 §6 的鉴别法排除,不许拿环境问题当通过。

## 3. 美术协作路径(给美术/给代管美术的 AI)

- 图标:PNG 丢进 `src/assets/icons/`(文件名=图标键,像素画 16/32,
  同名覆盖 lucide)——见该目录 README;
- 需求方只需说「图标键 `xxx` 的图我放好了」;执行 AI 不需要改任何代码,
  控制台看到 `[minode] 节点 "yy" 的图标 "xxx" 未注册` 消失即确认。

## 4. 一个完整示例(需求 → 落位)

**需求方说**:
> 「新增物品 `tinOre` 显示名「锡矿石」,material,图标 `gem` 但 accent 换银灰,
> maxStack 32。它接收来自 `copperPick` 的 click:100% 产出 `tinOre`×1,
> note:「锡矿很软,铜镐轻松凿下。」;来自 `hand` 的 click 是风味:
> 「银灰色的矿脉在阳光下闪烁。」。再加配方 `smelt-bronze`(组 熔炼):
> copperOre×1 + tinOre×1 → bronzeIngot×1。」

**执行 AI 落位**(内容层,零引擎改动):在 src/content/ 加包或并入 bronze.ts:

```ts
registerContent({
  nodes: [
    { id: "tinOre", name: "锡矿石", category: "material", icon: "gem",
      maxStack: 32, accent: "#a8adb3", desc: "…" },
  ],
  interactions: [
    { source: "copperPick", target: "tinOre",
      results: [{ type: "tinOre", chance: 1, count: 1 }], note: "锡矿很软,铜镐轻松凿下。" },
    { source: "hand", target: "tinOre", results: [], note: "银灰色的矿脉在阳光下闪烁。" },
  ],
  recipes: [
    { id: "smelt-bronze", category: "熔炼",
      inputs: [{ type: "copperOre", count: 1 }, { type: "tinOre", count: 1 }],
      output: { type: "bronzeIngot", count: 1 } },  // 需 bronzeIngot 节点已注册
  ],
})
```

自查:`minode.validate()` 零问题;build 过;图鉴出现新条目;两种 click 实测符合预期。
