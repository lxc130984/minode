/**
 * 内容包:青铜时代——从石器到铜器的完整时代弧线。
 *
 * 进度线:探索发现山地 → 石斧劈岩偶得铜矿石(引导)→ 木+石搭篝火熔炼
 * → 铜锭打造铜镐/铜斧 → 风车(露天通用驱动器)驱动工具自动化 → 图腾柱(奇观终点)。
 * 纯内容实现,零引擎改动;并顺带演示"覆盖内置定义"(探索节点的产出池)。
 */
import { registerContent } from "../game/api"
import type { ContentPack } from "../game/api"

const pack: ContentPack = {
  nodes: [
    // ── 覆盖内置:探索的产出池加入山地 ─────────────────────
    {
      id: "explorer",
      name: "探索",
      category: "functional",
      icon: "explorer",
      worldOnly: true,
      permanent: true,
      accent: "#d08a3e",
      desc: "点击它,等上几秒——有几率在它下面发现一片新的地形(森林、河流,或裸露矿脉的山地)。它是世界的一部分,无法收进背包。",
      behavior: {
        kind: "explore",
        durationMs: 5000,
        successRate: 0.65,
        pool: [
          { type: "forest", weight: 0.5 },
          { type: "river", weight: 0.3 },
          { type: "mountain", weight: 0.2 },
        ],
      },
    },

    // ── 新地形 ─────────────────────────────────────────────
    {
      id: "mountain",
      name: "山地",
      category: "terrain",
      icon: "mountain",
      worldOnly: true,
      accent: "#8a6d4f",
      workMs: 3000,
      maxProcess: 2,
      desc: "裸露着岩层与矿脉的陡坡。空手只能捡到碎石;石斧偶尔能劈出一点铜矿石——想大干一场,你需要一把铜镐。",
    },

    // ── 新材料 ─────────────────────────────────────────────
    {
      id: "copperOre",
      name: "铜矿石",
      category: "material",
      icon: "gem",
      maxStack: 32,
      accent: "#3f9d7a",
      desc: "泛着绿色光泽的矿石。把它挂到篝火下面,火焰会替你完成剩下的工作。",
    },
    {
      id: "copperIngot",
      name: "铜锭",
      category: "material",
      icon: "coins",
      maxStack: 32,
      accent: "#c47f4e",
      desc: "熔炼成型的铜块,泛着温暖的金属光泽。铜器时代的基石。",
    },

    // ── 新工具 ─────────────────────────────────────────────
    {
      id: "copperPick",
      name: "铜镐",
      category: "tool",
      icon: "pickaxe",
      maxStack: 1,
      maxProcess: 1,
      accent: "#c47f4e",
      workMs: 2000,
      desc: "铜头矿镐。挂在山地下面点击它,每一镐都能凿下铜矿石——百发百中。",
    },
    {
      id: "copperAxe",
      name: "铜斧",
      category: "tool",
      icon: "stoneAxe",
      maxStack: 1,
      maxProcess: 2,
      accent: "#c47f4e",
      workMs: 1500,
      desc: "锋利的铜斧,劈柴又快又狠:一次砍伐能收获两根木头,而且能同时照看两棵树。",
    },

    // ── 新功能节点 ────────────────────────────────────────
    // 篝火是世界侧的合成台(craft):挂矿石按"熔炼"配方消耗矿石产出铜锭;
    // 注意:craft 是玩家动作,只收空手 click(引擎规则)——驱动器驱动的是工具
    {
      id: "campfire",
      name: "篝火",
      category: "functional",
      icon: "flame",
      worldOnly: true,
      maxStack: 1,
      maxProcess: 2,
      accent: "#d3542e",
      workMs: 2500,
      desc: "世界里的熔炼台:把铜矿石挂在它下面,选中「熔炼」组里的铜锭配方,点击篝火,矿石就被烧成铜锭。火口不大,同时只架得住两堆矿石。",
      behavior: { kind: "craft" },
    },
    {
      id: "windmill",
      name: "风车",
      category: "functional",
      icon: "wind",
      worldOnly: true,
      maxStack: 1,
      maxProcess: 2,
      accent: "#6ba3c8",
      desc: "不需要河流——只要立在世界里,风车每 5 秒驱动一次挂在它下面的节点。比起水车慢一些,但架得再多也不挑地方。",
      behavior: { kind: "auto-trigger", intervalMs: 5000 },
    },
    {
      id: "totem",
      name: "图腾柱",
      category: "functional",
      icon: "landmark",
      worldOnly: true,
      maxStack: 1,
      maxProcess: 3,
      accent: "#c9a227",
      desc: "部落的丰碑。它每 8 秒鼓舞一次挂在它下面的工具——慢,但庄严。这是这片土地走向铜器时代的证明。",
      behavior: { kind: "auto-trigger", intervalMs: 8000 },
    },
  ],

  interactions: [
    // 山地:空手捡石 → 石斧偶得铜矿(引导)→ 铜镐必得
    // note 一律"搜寻语态":掷骰落空时引擎会拼接" 一无所获"
    {
      source: "hand",
      target: "mountain",
      results: [{ type: "stone", chance: 0.7, count: 1 }],
      note: "你在坡脚翻捡着碎石……",
    },
    {
      source: "stoneAxe",
      target: "mountain",
      results: [{ type: "copperOre", chance: 0.25, count: 1 }],
      note: "你抡起石斧劈向岩层,期待着金属的光泽……",
    },
    {
      source: "copperPick",
      target: "mountain",
      results: [{ type: "copperOre", chance: 1, count: 1 }],
      note: "铜镐凿进矿脉!",
    },
    // 铜斧:一次两根木头
    {
      source: "copperAxe",
      target: "forest",
      results: [{ type: "wood", chance: 1, count: 2 }],
      note: "铜斧锋利无比!",
    },
    // 风味
    {
      source: "hand",
      target: "copperOre",
      results: [],
      note: "泛着绿光的矿石,沉甸甸地压手。",
    },
    {
      source: "hand",
      target: "copperIngot",
      results: [],
      note: "一块温热的铜锭,边缘还留着火的余温。",
    },
    {
      source: "copperPick",
      target: "forest",
      results: [],
      note: "你抡起矿镐砍树……镐头深深嵌进树干,效果惨不忍睹。",
    },
    {
      source: "copperAxe",
      target: "mountain",
      results: [],
      note: "斧头不是凿子——敲了半天只留下几道白印。",
    },
  ],

  recipes: [
    {
      id: "smelt-copper",
      category: "熔炼",
      inputs: [{ type: "copperOre", count: 1 }],
      output: { type: "copperIngot", count: 1 },
    },
    {
      id: "campfire",
      category: "营地",
      inputs: [
        { type: "wood", count: 4 },
        { type: "stone", count: 3 },
      ],
      output: { type: "campfire", count: 1 },
    },
    {
      id: "windmill",
      category: "木工",
      inputs: [
        { type: "wood", count: 8 },
        { type: "stone", count: 2 },
      ],
      output: { type: "windmill", count: 1 },
    },
    {
      id: "copper-pick",
      category: "铜器",
      inputs: [
        { type: "copperIngot", count: 2 },
        { type: "stick", count: 2 },
      ],
      output: { type: "copperPick", count: 1 },
    },
    {
      id: "copper-axe",
      category: "铜器",
      inputs: [
        { type: "copperIngot", count: 2 },
        { type: "stick", count: 2 },
      ],
      output: { type: "copperAxe", count: 1 },
    },
    {
      id: "totem",
      category: "奇观",
      inputs: [
        { type: "copperIngot", count: 6 },
        { type: "wood", count: 8 },
      ],
      output: { type: "totem", count: 1 },
    },
  ],
}

registerContent(pack)
