/**
 * 游戏主 store:世界树 + 背包 + 探索/合成 + 日志。
 * 一切皆节点:世界与背包是两棵同构的树,拖拽就是移动节点本身。
 * 物品数量语义:每个节点 = 1 件;一堆同类物品 = 父节点挂同类子节点,
 * 堆大小 = 子树大小(nodeCount)。
 * 由 pinia-plugin-persistedstate 自动存档到 localStorage。
 */
import { defineStore } from "pinia"
import { ref } from "vue"
import {
  RECIPES,
  canPlaceInZone,
  findInteraction,
  getDef,
  getRecipe,
  isPermanent,
  rollDrops,
  rollPool,
} from "../game/registry"

/** 该类型一堆物品的最大数量(缺省不限) */
function stackLimit(type: string): number {
  const ms = getDef(type).maxStack
  return typeof ms === "number" && ms > 0 ? ms : Infinity
}

/**
 * 把 whole(整棵子树)并入 pile 后是否仍不超过堆上限。
 * 容量按"子树总件数"判定:父 + 所有后代各计 1,
 * 这样嵌套子堆/整堆搬运都无法绕过上限。
 */
function canAbsorb(pile: GameNode, whole: GameNode): boolean {
  return nodeCount(pile) + nodeCount(whole) <= stackLimit(pile.type)
}
import type { GameNode, LogEntry, LogKind } from "../game/types"
import { nodeCount } from "../game/types"
import { countNodes, findNode, isAncestorOf, removeNode } from "../game/tree"

const LOG_LIMIT = 200
/** 存档结构版本:不匹配时自动开新档 */
export const SAVE_VERSION = 5
/** 存档在 localStorage 里的 key(与 persist 配置共用) */
export const SAVE_KEY = "game"

/**
 * 游戏时钟:独立于 store 的响应式引用。
 * 每秒刷新但不算 store mutation,避免触发持久化插件的全量写盘。
 */
export const gameNow = ref(Date.now())

/** 节点面板(board)标识:世界、背包…… 未来可继续扩展同构面板 */
export type BoardId = "world" | "backpack"

interface GameState {
  version: number
  /** 世界树(根节点列表) */
  nodes: GameNode[]
  /** 背包(与世界同构的节点树) */
  backpack: GameNode[]
  /** 手工合成当前选择的配方 */
  selectedRecipeId: string
  /** 探索进行中状态 */
  exploring: boolean
  /** 发起探索的节点 id(多探索节点时结算到正确的节点下) */
  exploringNodeId: string | null
  exploreEndAt: number
  /** 本次世界开始时间(游玩时长 = now - startedAt) */
  startedAt: number
  /** 已发现过的地形类型 id(图鉴用) */
  discovered: string[]
  /** 日志(环形上限) */
  log: LogEntry[]
  logSeq: number
  selectedId: string | null
  /** 节点 id 发号器 */
  uid: number
  /** 全局拖拽中标记(不持久化) */
  dragging: boolean
}

function freshState(): GameState {
  return {
    version: SAVE_VERSION,
    // 每个世界自带:探索 + 背包开关(在世界);手工合成(在背包,方便批量挂料)
    nodes: [
      { id: "n1", type: "explorer", children: [], collapsed: true },
      { id: "n2", type: "backpackNode", children: [] },
    ],
    backpack: [{ id: "n3", type: "bench", children: [], collapsed: true }],
    selectedRecipeId: RECIPES[0]?.id ?? "",
    exploring: false,
    exploringNodeId: null,
    exploreEndAt: 0,
    startedAt: Date.now(),
    discovered: [],
    log: [],
    logSeq: 0,
    selectedId: null,
    uid: 3,
    dragging: false,
  }
}

/** 深度校验一份存档是否结构完好(防手改/旧版污染) */
export function isSaveValid(saved: unknown): boolean {
  if (!saved || typeof saved !== "object") return false
  const s = saved as Record<string, unknown>
  if (s.version !== SAVE_VERSION) return false
  if (typeof s.uid !== "number" || s.uid < 2) return false
  if (typeof s.selectedRecipeId !== "string") return false
  if (typeof s.exploring !== "boolean") return false
  if (typeof s.exploreEndAt !== "number") return false
  if (typeof s.startedAt !== "number") return false
  if (!Array.isArray(s.discovered) || !s.discovered.every((t) => typeof t === "string")) return false
  if (typeof s.logSeq !== "number") return false
  if (!(s.selectedId === null || typeof s.selectedId === "string")) return false
  if (!(s.exploringNodeId === null || s.exploringNodeId === undefined || typeof s.exploringNodeId === "string")) {
    return false
  }
  if (
    !Array.isArray(s.log) ||
    !s.log.every(
      (l) =>
        l && typeof l === "object" && typeof (l as LogEntry).seq === "number" &&
        typeof (l as LogEntry).time === "number" && typeof (l as LogEntry).text === "string",
    )
  ) {
    return false
  }
  const ids = new Set<string>()
  const nodeOk = (n: unknown): boolean => {
    if (!n || typeof n !== "object") return false
    const node = n as Record<string, unknown>
    if (typeof node.id !== "string" || ids.has(node.id)) return false
    ids.add(node.id)
    if (typeof node.type !== "string") return false
    if (!Array.isArray(node.children)) return false
    return node.children.every(nodeOk)
  }
  if (!Array.isArray(s.nodes) || !s.nodes.every(nodeOk)) return false
  if (!Array.isArray(s.backpack) || !s.backpack.every(nodeOk)) return false
  // 世界自带探索与背包开关;手工合成可以在世界或背包
  const worldTypes = new Set<string>()
  const bpTypes = new Set<string>()
  const collect = (ns: GameNode[], into: Set<string>) => {
    for (const n of ns) {
      into.add(n.type)
      collect(n.children, into)
    }
  }
  collect(s.nodes as GameNode[], worldTypes)
  collect(s.backpack as GameNode[], bpTypes)
  // 区域不变量:背包树里不应出现进不了背包的类型
  const zoneOk = (ns: GameNode[], zone: "world" | "backpack"): boolean =>
    ns.every((n) => canPlaceInZone(n.type, zone) && zoneOk(n.children, zone))
  if (!zoneOk(s.backpack as GameNode[], "backpack")) return false
  if (!worldTypes.has("explorer")) return false
  if (!worldTypes.has("backpackNode")) return false
  // 手工合成必须留在背包(不允许在世界侧存档里残留)
  if (!bpTypes.has("bench")) return false
  // uid 必须不小于已有 n<数字> id 的最大后缀,避免 newNodeId 撞 id
  let maxId = 0
  const scanIds = (ns: GameNode[]) => {
    for (const n of ns) {
      const m = /^n(\d+)$/.exec(n.id)
      if (m) maxId = Math.max(maxId, Number(m[1]))
      scanIds(n.children)
    }
  }
  scanIds(s.nodes as GameNode[])
  scanIds(s.backpack as GameNode[])
  if ((s.uid as number) < maxId) return false
  return true
}

/** 应用启动时调用:校验存档,不合规直接清掉(在 store hydrate 之前) */
export function ensureSaveIntegrity() {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return
    if (!isSaveValid(JSON.parse(raw))) localStorage.removeItem(SAVE_KEY)
  } catch {
    try {
      localStorage.removeItem(SAVE_KEY)
    } catch {
      /* ignore */
    }
  }
}

/** 在树中按类型查找(DFS) */
function findNodeByType(nodes: GameNode[], type: string): GameNode | null {
  for (const n of nodes) {
    if (n.type === type) return n
    const hit = findNodeByType(n.children, type)
    if (hit) return hit
  }
  return null
}

/**
 * 从列表里移除 n 个指定类型的节点,"先子后父":
 * - 递归先消耗子树里的同类节点;
 * - 移除某个节点自身时,其剩余(异类)子节点放回上层列表原位置,不连带销毁;
 * - 返回未满足的剩余需求(0 = 全部取到)。
 */
function takeNodes(list: GameNode[], type: string, n: number): number {
  for (let i = list.length - 1; i >= 0 && n > 0; i--) {
    const node = list[i]
    if (node.type === type) {
      n = takeNodes(node.children, type, n)
      if (n > 0) {
        const rest = node.children
        node.children = []
        if (rest.length) list.splice(i, 1, ...rest)
        else list.splice(i, 1)
        n--
      }
    } else {
      n = takeNodes(node.children, type, n)
    }
  }
  return n
}

/** 配方 × 材料状态(供 getter 使用) */
function recipeStateOf(selectedId: string, piles: Record<string, number>) {
  const recipe = getRecipe(selectedId)
  if (!recipe) return null
  const inputs = recipe.inputs.map((inp) => ({
    stack: inp,
    have: piles[inp.type] ?? 0,
    ok: (piles[inp.type] ?? 0) >= inp.count,
  }))
  return { recipe, inputs, craftable: inputs.every((i) => i.ok) }
}

export const useGameStore = defineStore("game", {
  state: (): GameState => freshState(),

  getters: {
    worldNodeCount: (s) => countNodes(s.nodes),
    /** 物品总数(背包整棵树,每个节点计 1) */
    itemCount(): number {
      let sum = 0
      const walk = (ns: GameNode[]) => {
        for (const n of ns) {
          sum += 1
          walk(n.children)
        }
      }
      walk(this.backpack)
      return sum
    },
    selectedNode: (s) => {
      if (!s.selectedId) return null
      return (
        findNode(s.nodes, s.selectedId)?.node ?? findNode(s.backpack, s.selectedId)?.node ?? null
      )
    },
    /** 各类型物品持有量(背包整棵树递归) */
    ownedMap(): Record<string, number> {
      const map: Record<string, number> = {}
      const walk = (ns: GameNode[]) => {
        for (const n of ns) {
          map[n.type] = (map[n.type] ?? 0) + 1
          walk(n.children)
        }
      }
      walk(this.backpack)
      return map
    },
    /** 手工合成台(第一个 bench 节点,可能在世界也可能在背包) */
    benchNode: (s) => findNodeByType(s.nodes, "bench") ?? findNodeByType(s.backpack, "bench"),
    explorerNode: (s) => findNodeByType(s.nodes, "explorer"),
    /** 合成台下方挂载的材料量(按类型精确计数,每个同类节点计 1) */
    benchPiles(): Record<string, number> {
      const bench = this.benchNode
      if (!bench) return {}
      const map: Record<string, number> = {}
      const walk = (ns: GameNode[]) => {
        for (const n of ns) {
          map[n.type] = (map[n.type] ?? 0) + 1
          walk(n.children)
        }
      }
      walk(bench.children)
      return map
    },
    /** 当前配方 × 合成台材料状态 */
    recipeState(): ReturnType<typeof recipeStateOf> {
      return recipeStateOf(this.selectedRecipeId, this.benchPiles)
    },
    /** 探索冷却剩余秒数 */
    exploreCdLeft(): number {
      if (!this.exploring) return 0
      return Math.max(0, Math.ceil((this.exploreEndAt - gameNow.value) / 1000))
    },
    /** 游玩秒数(由时钟推算,不落盘) */
    playSeconds(): number {
      return Math.max(0, Math.floor((gameNow.value - this.startedAt) / 1000))
    },
    lastLog: (s) => s.log[s.log.length - 1] ?? null,
  },

  actions: {
    // ── 基础 ─────────────────────────────────────────────
    reset() {
      this.$patch(freshState())
      this.pushLog("一个崭新的世界展开了。", "info")
      this.pushLog("点击「探索」节点寻找地形;点击「背包」节点开合背包分屏。", "info")
    },

    /**
     * 游戏循环心跳:由 App 每秒驱动。只做"到点结算",
     * 时钟本身在 store 之外的 gameNow 里,避免每秒触发一次存档写盘。
     */
    onClock() {
      if (this.exploring && gameNow.value >= this.exploreEndAt) {
        this.resolveExplore()
      }
    },

    pushLog(text: string, kind: LogKind = "info") {
      this.log.push({ seq: ++this.logSeq, time: Date.now(), text, kind })
      if (this.log.length > LOG_LIMIT) {
        this.log.splice(0, this.log.length - LOG_LIMIT)
      }
    },

    // ── 节点 ─────────────────────────────────────────────
    newNodeId(): string {
      return `n${++this.uid}`
    },

    makeNode(type: string): GameNode {
      // 节点默认折叠;获得子节点时会自动展开
      return { id: this.newNodeId(), type, children: [], collapsed: true }
    },

    /** 某个面板(board)的根节点列表 */
    boardRoots(board: BoardId): GameNode[] {
      return board === "world" ? this.nodes : this.backpack
    },

    select(id: string | null) {
      this.selectedId = id
    },

    clickNode(id: string) {
      const hit = findNode(this.nodes, id) ?? findNode(this.backpack, id)
      if (!hit) return
      this.selectedId = id
      const node = hit.node
      const behavior = getDef(node.type).behavior

      // 视图开关行为(如「背包」节点)由界面层处理,这里只选中
      if (behavior?.kind === "view-toggle") return

      // 功能节点:按声明式行为分发,不向子节点传导
      if (behavior?.kind === "explore") {
        this.startExplore(node)
        return
      }
      if (behavior?.kind === "craft") {
        this.craftBench(node)
        return
      }
      if (behavior) return // 其余行为(如工厂)暂无点击语义,静默

      if (node.children.length > 0) {
        // 点击父节点:以父节点为「点击来源」,依次触发每个子节点
        for (const child of node.children) {
          this.trigger(node.type, child.type)
        }
        return
      }
      // 点击叶子节点:空手点击
      this.trigger("hand", node.type)
    },

    /** 解析并结算一次「来源 → 目标」交互 */
    trigger(source: string, target: string) {
      const interaction = findInteraction(source, target)
      if (!interaction) {
        this.pushLog(
          `${getDef(source).name} 对 ${getDef(target).name} 似乎产生不了什么效果。`,
          "warn",
        )
        return
      }
      if (interaction.results.length === 0) {
        this.pushLog(interaction.note, "info")
        return
      }
      const drops = rollDrops(interaction)
      if (drops.length === 0) {
        this.pushLog(`${interaction.note} 一无所获。`, "warn")
        return
      }
      for (const drop of drops) {
        this.addItem(drop.type, drop.count)
      }
      this.pushLog(interaction.note, "info")
    },

    toggleCollapse(id: string) {
      const hit = findNode(this.nodes, id) ?? findNode(this.backpack, id)
      if (hit) hit.node.collapsed = !hit.node.collapsed
    },

    /** 从所在树的根上摘下节点:其子节点被释放回该树根层级,返回被摘下的节点 */
    detachNode(id: string): GameNode | null {
      const inWorld = findNode(this.nodes, id)
      const roots = inWorld ? this.nodes : this.backpack
      const removed = removeNode(roots, id)
      if (!removed) return null
      if (removed.children.length > 0) {
        const orphanCount = removed.children.length
        roots.push(...removed.children)
        removed.children = []
        this.pushLog(`${orphanCount} 个子节点被释放回根层级。`, "warn")
      }
      if (this.selectedId === id) this.selectedId = null
      return removed
    },

    /** 移除节点(永久节点不可移除;子节点释放回根层级) */
    removeNodeById(id: string) {
      const hit = findNode(this.nodes, id) ?? findNode(this.backpack, id)
      if (!hit) return
      const def = getDef(hit.node.type)
      if (isPermanent(def.id)) {
        this.pushLog(`「${def.name}」与世界同在,不能被移除。`, "warn")
        return
      }
      this.detachNode(id)
      this.pushLog(`节点「${def.name}」已被移除。`, "info")
    },

    /**
     * 把节点整棵收进背包(挂到最近一堆同类下,没有则成为新的一堆)。
     * 子树分拣:同类子节点随行;背包不兼容的回世界;异类子节点释放到背包根。
     */
    nodeToItem(id: string) {
      const hit = findNode(this.nodes, id) ?? findNode(this.backpack, id)
      if (!hit) return
      const def = getDef(hit.node.type)
      if (!canPlaceInZone(def.id, "backpack")) {
        this.pushLog(`「${def.name}」没法收进背包。`, "warn")
        return
      }
      const inWorld = findNode(this.nodes, id)
      const removed = removeNode(inWorld ? this.nodes : this.backpack, id)
      if (!removed) return
      if (this.selectedId === id) this.selectedId = null
      const keep: GameNode[] = []
      let released = 0
      for (const kid of removed.children) {
        if (!canPlaceInZone(kid.type, "backpack")) {
          this.nodes.push(kid)
          released++
        } else if (kid.type === removed.type) {
          keep.push(kid)
        } else {
          this.backpack.push(kid)
          released++
        }
      }
      removed.children = keep
      if (released > 0) this.pushLog(`${released} 个子节点被释放。`, "warn")
      this.stackIntoBackpack(removed)
      this.pushLog(`「${def.name}」已收进背包。`, "info")
    },

    /** 把一个节点整棵并入背包堆(挂到最近一个还能整堆吸收它的同类堆下,否则成为新根) */
    stackIntoBackpack(node: GameNode) {
      const root = [...this.backpack]
        .reverse()
        .find((n) => n.type === node.type && canAbsorb(n, node))
      if (root) {
        root.children.push(node)
      } else {
        this.backpack.push(node)
      }
    },

    /**
     * 放置到世界 = "放置"语义:一次只放置一个。
     * 有子节点的堆:自己进入世界,孩子们回背包重新堆叠;单件:整体移动。
     */
    placeItem(id: string) {
      const hit = findNode(this.backpack, id)
      if (!hit) return
      const node = hit.node
      if (!canPlaceInZone(node.type, "world")) {
        this.pushLog(`「${getDef(node.type).name}」离不开它所在的地方。`, "warn")
        return
      }
      removeNode(this.backpack, id)
      if (this.selectedId === id) this.selectedId = null
      if (node.children.length > 0) {
        const rest = node.children
        node.children = []
        node.collapsed = true
        this.nodes.push(node)
        for (const child of rest) this.stackIntoBackpack(child)
      } else {
        node.collapsed = true
        this.nodes.push(node)
      }
      this.pushLog(`「${getDef(node.type).name}」被放置进了世界。`, "info")
    },

    // ── 物品 ─────────────────────────────────────────────
    /**
     * 获得物品:并入背包里最近一堆同类物品(挂为新子节点),
     * 没有同类堆则新建一堆;进不了背包的产物(地形类)直接落世界。
     */
    addItem(type: string, count = 1, silent = false) {
      const def = getDef(type)
      if (!canPlaceInZone(type, "backpack")) {
        for (let i = 0; i < count; i++) this.nodes.push(this.makeNode(type))
      } else {
        // 按组堆叠:优先并入最近一个还能吸收的同类堆,满了就开新堆
        let left = count
        while (left > 0) {
          const limit = stackLimit(type)
          const root = [...this.backpack].reverse().find(
            (n) => n.type === type && nodeCount(n) < limit,
          )
          if (root) {
            const take = Math.min(left, limit - nodeCount(root))
            for (let i = 0; i < take; i++) root.children.push(this.makeNode(type))
            left -= take
          } else {
            // 新堆:自己 + 剩余子节点(不自动展开,徽标会显示总数)
            const pile = this.makeNode(type)
            const take = Math.min(left - 1, limit - 1)
            for (let i = 0; i < take; i++) pile.children.push(this.makeNode(type))
            left -= 1 + take
            this.backpack.push(pile)
            if (left <= 0) break
          }
        }
      }
      if (!silent) this.pushLog(`获得 ${def.name} ×${count}`, "gain")
    },

    countItem(type: string): number {
      return this.ownedMap[type] ?? 0
    },

    // ── 探索(节点) ───────────────────────────────────────
    startExplore(node: GameNode) {
      if (this.exploring) {
        this.pushLog(`还在探索中……(约 ${this.exploreCdLeft} 秒)`, "warn")
        return
      }
      const b = exploreBehaviorOf(node)
      this.exploring = true
      this.exploringNodeId = node.id
      this.exploreEndAt = Date.now() + (b?.durationMs ?? 5000)
      this.pushLog("你向着未知出发……", "info")
    },

    /** 到点结算:有概率在发起探索的节点下生成地形 */
    resolveExplore() {
      this.exploring = false
      const explorer =
        (this.exploringNodeId &&
          (findNode(this.nodes, this.exploringNodeId)?.node ??
            findNode(this.backpack, this.exploringNodeId)?.node)) ||
        this.explorerNode
      this.exploringNodeId = null
      if (!explorer) return
      const b = exploreBehaviorOf(explorer)
      if (Math.random() >= (b?.successRate ?? 0.5)) {
        this.pushLog("这次探索一无所获。", "warn")
        return
      }
      const terrain = rollPool(b?.pool ?? [{ type: "forest", weight: 1 }])
      const def = getDef(terrain)
      explorer.children.push(this.makeNode(terrain))
      explorer.collapsed = false // 有新发现,展开让玩家看见
      if (!this.discovered.includes(terrain)) this.discovered.push(terrain)
      this.pushLog(`探索成功!「${def.name}」出现在了探索节点之下。`, "gain")
    },

    // ── 手工合成(节点) ───────────────────────────────────
    selectRecipe(id: string) {
      if (getRecipe(id)) {
        this.selectedRecipeId = id
        this.pushLog(`配方已切换为「${getDef(getRecipe(id)!.output.type).name}」。`, "info")
      }
    },

    /** 点击手工合成节点:检测该节点下挂载的材料并按当前配方合成 */
    craftBench(bench?: GameNode) {
      const target = bench ?? this.benchNode
      if (!target) return
      const piles: Record<string, number> = {}
      const walk = (ns: GameNode[]) => {
        for (const n of ns) {
          piles[n.type] = (piles[n.type] ?? 0) + 1
          walk(n.children)
        }
      }
      walk(target.children)
      const state = recipeStateOf(this.selectedRecipeId, piles)
      if (!state) return
      const recipe = state.recipe
      const missing = state.inputs
        .filter((i) => !i.ok)
        .map((i) => `${getDef(i.stack.type).name}(缺 ${i.stack.count - i.have})`)
      if (missing.length > 0) {
        this.pushLog(
          `材料不足:${missing.join("、")}。把材料节点挂到「手工合成」下面再试。`,
          "warn",
        )
        return
      }
      let unsatisfied = 0
      for (const input of recipe.inputs) {
        unsatisfied += takeNodes(target.children, input.type, input.count)
      }
      if (unsatisfied > 0) {
        // 计数与移除口径不一致的防御:不应发生
        this.pushLog("合成材料出现异常,已中止。", "warn")
        return
      }
      this.addItem(recipe.output.type, recipe.output.count, true)
      this.pushLog(
        `合成成功:${recipe.inputs
          .map((i) => `${getDef(i.type).name}×${i.count}`)
          .join(" + ")} → ${getDef(recipe.output.type).name}×${recipe.output.count}`,
        "craft",
      )
    },

    // ── 拖拽辅助 ─────────────────────────────────────────
    /**
     * 拖拽守卫:节点是否可以放入 board 上 owner 的子列表。
     * - 区域权限(zones);
     * - 从背包拖"整堆"(带子节点的父节点)进世界 → 拒绝,防止一次性放置大量物品;
     *   拖单个子节点进世界 → 允许;背包内部(如挂到手工合成下)不受此限;
     * - 背包里的普通物品:子级只能挂同类(堆叠规则)且堆未满;功能节点不受限;
     * - 防环(不可拖进自己的子树)。
     */
    canDropIntoChildList(dragEl: HTMLElement, board: BoardId, ownerId: string | undefined): boolean {
      const type = dragEl.dataset.ntype
      if (type && !canPlaceInZone(type, board)) return false
      if (board === "world" && dragEl.dataset.zone === "backpack") {
        // 整堆父节点(带有子节点)不允许拖进世界
        if (dragEl.querySelector(":scope > ol.child-list .node-wrap")) return false
      }
      const dragId = dragEl.dataset.nodeId
      if (!dragId || !ownerId) return true
      const owner = findNode(this.boardRoots(board), ownerId)?.node
      if (!owner) return true
      const ownerDef = getDef(owner.type)
      if (board === "backpack" && !ownerDef.behavior) {
        // 普通物品:子级只能挂同类,且并入后不超过堆上限
        // (按子树总量判定:拖整堆、嵌套堆都无法绕过 maxStack)
        if (type && type !== owner.type) return false
        const dragNode =
          findNode(this.nodes, dragId)?.node ?? findNode(this.backpack, dragId)?.node ?? null
        if (dragNode && !canAbsorb(owner, dragNode)) return false
      }
      return !isAncestorOf(this.boardRoots(board), dragId, ownerId)
    },

    /**
     * 节点落进背包后的整理:
     * - 与背包不兼容的子树释放回世界;
     * - 普通物品下只保留同类子节点(堆叠规则),异类子节点释放到背包根;
     *   功能节点(合成台等)的子级不受同类规则限制。
     * 堆与堆之间不做自动合并 —— 想合并就把一堆拖到另一堆下面。
     */
    settleBackpackDrop(dropped: GameNode) {
      let toWorld = 0
      let toRoot = 0
      const def = getDef(dropped.type)
      const fix = (ns: GameNode[], parentType: string, parentFunctional: boolean): GameNode[] => {
        const keep: GameNode[] = []
        for (const n of ns) {
          if (!canPlaceInZone(n.type, "backpack")) {
            this.nodes.push(n)
            toWorld++
            continue
          }
          const functional = !!getDef(n.type).behavior
          if (!parentFunctional && n.type !== parentType) {
            this.backpack.push(n)
            toRoot++
            continue
          }
          n.children = fix(n.children, n.type, functional)
          keep.push(n)
        }
        return keep
      }
      dropped.children = fix(dropped.children, dropped.type, !!def.behavior)
      if (toWorld + toRoot > 0) {
        this.pushLog(`${toWorld + toRoot} 个子节点被释放${toWorld ? "(部分回世界)" : ""}。`, "warn")
      }
    },

    /**
     * 物品堆被拖进"世界"后的结算:放置语义 = 一次只放一个,
     * 余下的子节点回背包重新堆叠。
     */
    settleWorldDrop(dropped: GameNode) {
      if (dropped.children.length === 0) return
      const rest = dropped.children
      dropped.children = []
      dropped.collapsed = true
      for (const child of rest) this.stackIntoBackpack(child)
    },

    // ── 存档导入/导出 ────────────────────────────────────
    /** 导出存档 JSON(与持久化结构一致) */
    exportSaveData(): string {
      return JSON.stringify({
        version: SAVE_VERSION,
        nodes: this.nodes,
        backpack: this.backpack,
        selectedRecipeId: this.selectedRecipeId,
        exploring: this.exploring,
        exploringNodeId: this.exploringNodeId,
        exploreEndAt: this.exploreEndAt,
        startedAt: this.startedAt,
        discovered: this.discovered,
        log: this.log,
        logSeq: this.logSeq,
        selectedId: this.selectedId,
        uid: this.uid,
      })
    },

    /** 导入存档:结构校验通过后整体替换当前世界,返回是否成功 */
    applySaveData(raw: string): boolean {
      let data: unknown
      try {
        data = JSON.parse(raw)
      } catch {
        return false
      }
      if (!isSaveValid(data)) return false
      const s = data as Record<string, unknown>
      this.$patch({
        nodes: s.nodes as GameNode[],
        backpack: s.backpack as GameNode[],
        selectedRecipeId: s.selectedRecipeId as string,
        exploring: s.exploring as boolean,
        exploringNodeId: (s.exploringNodeId ?? null) as string | null,
        exploreEndAt: s.exploreEndAt as number,
        startedAt: s.startedAt as number,
        discovered: s.discovered as string[],
        log: s.log as LogEntry[],
        logSeq: s.logSeq as number,
        selectedId: s.selectedId as string | null,
        uid: s.uid as number,
      })
      this.pushLog("存档导入成功,世界已恢复。", "info")
      return true
    },
  },

  persist: {
    key: SAVE_KEY,
    pick: [
      "version",
      "nodes",
      "backpack",
      "selectedRecipeId",
      "exploring",
      "exploringNodeId",
      "exploreEndAt",
      "startedAt",
      "discovered",
      "log",
      "logSeq",
      "selectedId",
      "uid",
    ],
  },
})

/** 取节点自身定义声明的探索行为 */
function exploreBehaviorOf(node: GameNode) {
  const b = getDef(node.type).behavior
  return b?.kind === "explore" ? b : null
}
