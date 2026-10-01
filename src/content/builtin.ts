/**
 * 内置内容包:开局的全部节点类型、交互规则与合成配方。
 * 经 game/api.ts 注册(与扩展/控制台同一条路)——registry 只认注册表,
 * 内置与外置没有区别。加新内容:新建 content/xxx.ts 导出内容包,
 * 在 content/index.ts 里 import 挂上即可。
 */
import { registerContent } from "../game/api"
import type { ContentPack } from "../game/api"

const pack: ContentPack = {
  nodes: [
    // ── 功能节点(常驻/行为) ──────────────────────────────
    {
      id: "explorer",
      name: "探索",
      category: "functional",
      icon: "explorer",
      worldOnly: true,
      permanent: true,
      accent: "#d08a3e",
      desc: "点击它,等上几秒——有几率在它下面发现一片新的地形。它是世界的一部分,无法收进背包。",
      behavior: {
        kind: "explore",
        durationMs: 5000,
        successRate: 0.65,
        pool: [
          { type: "forest", weight: 0.65 },
          { type: "river", weight: 0.35 },
        ],
      },
    },
    {
      id: "backpackNode",
      name: "背包",
      category: "functional",
      icon: "backpackNode",
      worldOnly: true,
      permanent: true,
      noChildren: true,
      accent: "#b98a2f",
      desc: "点击它,在右侧开合背包分屏。它是一个开关:获得的物品都会进背包,把材料整堆拖到「手工合成」下面就能批量合成。",
      behavior: { kind: "view-toggle", view: "backpack" },
    },
    {
      id: "bench",
      name: "手工合成",
      category: "functional",
      icon: "bench",
      permanent: true,
      zones: ["backpack"],
      accent: "#8672bd",
      workMs: 2000,
      desc: "把材料节点挂到它下面,点击它就会按当前配方合成,产物自动进背包。它天然生成在背包里,方便整堆挂料、批量合成。",
      behavior: { kind: "craft" },
    },
    {
      id: "waterwheel",
      name: "水车",
      category: "functional",
      icon: "waterwheel",
      maxStack: 1,
      maxProcess: 2,
      accent: "#9c7b4a",
      desc: "把它放到河流下面,水流会每 3 秒推动它一次,驱动挂在它下面的节点——比如石斧(最多同时驱动两个)。石斧下面再挂上森林,木头就会源源不断地流进背包。",
      behavior: { kind: "auto-trigger", intervalMs: 3000, poweredBy: "river" },
    },

    // ── 地形(世界限定,探索产出) ────────────────────────
    {
      id: "forest",
      name: "森林",
      category: "terrain",
      icon: "forest",
      worldOnly: true,
      accent: "#3d8b57",
      workMs: 3000,
      desc: "一片郁郁葱葱的森林。空手翻找可以捡到木棍和石子;把石斧挂在它上面就能砍到木头。",
    },
    {
      id: "river",
      name: "河流",
      category: "terrain",
      icon: "river",
      worldOnly: true,
      accent: "#2f8f96",
      workMs: 2500,
      maxProcess: 2,
      desc: "一条潺潺流淌的河。河滩上散落着被水冲刷圆润的石子;河上最多同时架起两台水车。",
    },

    // ── 材料 ─────────────────────────────────────────────
    {
      id: "stick",
      name: "木棍",
      category: "material",
      icon: "stick",
      maxStack: 64,
      desc: "枯枝断木。既是合成的材料,也可以摆成节点——虽然它自己并不会做什么。",
    },
    {
      id: "stone",
      name: "石子",
      category: "material",
      icon: "stone",
      maxStack: 64,
      desc: "一块称手的石头。是石器时代一切工具的起点。",
    },
    {
      id: "wood",
      name: "木头",
      category: "material",
      icon: "wood",
      maxStack: 64,
      desc: "用石斧砍下的木料。文明的基石,暂时先囤着。",
    },

    // ── 工具 ─────────────────────────────────────────────
    {
      id: "stoneAxe",
      name: "石斧",
      category: "tool",
      icon: "stoneAxe",
      maxStack: 1,
      maxProcess: 1,
      accent: "#8672bd",
      workMs: 2000,
      desc: "石头绑上木棍制成的斧头。把它拖到世界,再把森林挂在它下面,点击它就会砍伐森林——它一次只对一棵树下手,想同时砍两棵就再造一把。",
    },
  ],

  interactions: [
    // ── 产出型 ───────────────────────────────────────────
    {
      source: "hand",
      target: "forest",
      results: [
        { type: "stick", chance: 0.55, count: 1 },
        { type: "stone", chance: 0.3, count: 1 },
      ],
      note: "你徒手在灌木丛里翻找……",
    },
    {
      source: "hand",
      target: "river",
      results: [{ type: "stone", chance: 0.65, count: 1 }],
      note: "你蹲在河滩上,盯着水流过的碎石……",
    },
    {
      source: "stoneAxe",
      target: "forest",
      results: [{ type: "wood", chance: 1, count: 1 }],
      note: "石斧劈进树干,木屑纷飞!",
    },
    // ── 风味描述(接受但无产出;无条目 = 灰闪断链) ────────
    {
      source: "stoneAxe",
      target: "river",
      results: [],
      note: "你挥斧砍水,只溅起一片水花。",
    },
    {
      source: "stoneAxe",
      target: "stone",
      results: [],
      note: "以石击石,火星四溅,但什么也没发生。",
    },
    {
      source: "hand",
      target: "stick",
      results: [],
      note: "木棍静静地躺着。",
    },
    {
      source: "hand",
      target: "stone",
      results: [],
      note: "石子静静地躺着。",
    },
    {
      source: "hand",
      target: "wood",
      results: [],
      note: "一段厚实的木料。",
    },
  ],

  recipes: [
    {
      id: "stone-axe",
      category: "石器",
      inputs: [
        { type: "stone", count: 3 },
        { type: "stick", count: 2 },
      ],
      output: { type: "stoneAxe", count: 1 },
    },
    {
      id: "water-wheel",
      category: "木工",
      inputs: [
        { type: "wood", count: 4 },
        { type: "stick", count: 2 },
      ],
      output: { type: "waterwheel", count: 1 },
    },
  ],
}

registerContent(pack)
