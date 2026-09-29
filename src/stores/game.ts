/**
 * 游戏主 store:世界树 + 背包/物品栏(同为节点) + 探索/合成 + 日志。
 * 一切皆节点:拖拽在 世界树 / 物品栏 / 背包 之间就是移动节点本身。
 * 由 pinia-plugin-persistedstate 自动存档到 localStorage。
 */
import { defineStore } from "pinia"
import { ref } from "vue"
import {
  EXPLORE_MS,
  EXPLORE_SUCCESS_RATE,
  RECIPES,
  findInteraction,
  getDef,
  getRecipe,
  isLockedToWorld,
  rollDrops,
  rollTerrain,
} from "../game/registry"
import type { GameNode, LogEntry, LogKind } from "../game/types"
import { nodeCount as pileCount } from "../game/types"
import { countNodes, findNode, isAncestorOf, removeNode } from "../game/tree"

export const HOTBAR_SLOTS = 10
const LOG_LIMIT = 200
/** 存档结构版本:不匹配时自动开新档 */
export const SAVE_VERSION = 3
/** 存档在 localStorage 里的 key(与 persist 配置共用) */
export const SAVE_KEY = "game"

/**
 * 游戏时钟:独立于 store 的响应式引用。
 * 每秒刷新但不算 store mutation,避免触发持久化插件的全量写盘。
 */
export const gameNow = ref(Date.now())

/** 节点面板(board)标识:世界、背包…… 未来可继续扩展同构面板 */
export type BoardId = "world" | "backpack"

type Zone = "hotbar" | "backpack"

interface GameState {
  version: number
  /** 世界树(根节点列表) */
  nodes: GameNode[]
  /** 物品栏(快速栏,最多 10 堆) */
  hotbar: GameNode[]
  /** 背包(与世界同构的节点树) */
  backpack: GameNode[]
  /** 手工合成当前选择的配方 */
  selectedRecipeId: string
  /** 探索进行中状态 */
  exploring: boolean
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
    // 每个世界自带:探索 + 手工合成
    nodes: [
      { id: "n1", type: "explorer", children: [], collapsed: true },
      { id: "n2", type: "bench", children: [], collapsed: true },
    ],
    hotbar: [],
    backpack: [],
    selectedRecipeId: RECIPES[0]?.id ?? "",
    exploring: false,
    exploreEndAt: 0,
    startedAt: Date.now(),
    discovered: [],
    log: [],
    logSeq: 0,
    selectedId: null,
    uid: 2,
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
    if (node.count !== undefined && !(typeof node.count === "number" && node.count > 0)) {
      return false
    }
    if (!Array.isArray(node.children)) return false
    return node.children.every(nodeOk)
  }
  if (!Array.isArray(s.nodes) || !s.nodes.every(nodeOk)) return false
  // 世界必须同时自带探索与手工合成
  const types = new Set<string>()
  const collect = (ns: GameNode[]) => {
    for (const n of ns) {
      types.add(n.type)
      collect(n.children)
    }
  }
  collect((s.nodes as GameNode[]) ?? [])
  if (!types.has("explorer") || !types.has("bench")) return false
  const pilesOk = (list: unknown) => Array.isArray(list) && list.every(nodeOk)
  return pilesOk(s.hotbar) && pilesOk(s.backpack)
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

export const useGameStore = defineStore("game", {
  state: (): GameState => freshState(),

  getters: {
    worldNodeCount: (s) => countNodes(s.nodes),
    /** 物品总数(物品栏+背包整棵树,递归统计) */
    itemCount(): number {
      let sum = 0
      const walk = (ns: GameNode[]) => {
        for (const n of ns) {
          sum += pileCount(n)
          walk(n.children)
        }
      }
      walk(this.hotbar)
      walk(this.backpack)
      return sum
    },
    selectedNode: (s) => {
      if (!s.selectedId) return null
      return (
        findNode(s.nodes, s.selectedId)?.node ??
        findNode(s.backpack, s.selectedId)?.node ??
        s.hotbar.find((n) => n.id === s.selectedId) ??
        null
      )
    },
    /** 各类型物品持有量(背包按整棵树递归统计) */
    ownedMap(): Record<string, number> {
      const map: Record<string, number> = {}
      const walk = (ns: GameNode[]) => {
        for (const n of ns) {
          map[n.type] = (map[n.type] ?? 0) + pileCount(n)
          walk(n.children)
        }
      }
      walk(this.hotbar)
      walk(this.backpack)
      return map
    },
    /** 手工合成台(第一个 bench 节点) */
    benchNode: (s) => findNodeByType(s.nodes, "bench"),
    explorerNode: (s) => findNodeByType(s.nodes, "explorer"),
    /** 合成台下方挂载的材料总量 */
    benchPiles: (s) => sumPiles(findNodeByType(s.nodes, "bench")?.children ?? []),
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
      this.pushLog("点击「探索」节点,5 秒后有几率在它下面发现新的地形。", "info")
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

    makeNode(type: string, count?: number): GameNode {
      // 节点默认折叠;获得子节点时会自动展开
      const n: GameNode = { id: this.newNodeId(), type, children: [], collapsed: true }
      if (count != null && count > 1) n.count = count
      return n
    },

    /** 某个面板(board)的根节点列表 */
    boardRoots(board: BoardId): GameNode[] {
      return board === "world" ? this.nodes : this.backpack
    },

    select(id: string | null) {
      this.selectedId = id
    },

    clickNode(id: string) {
      const hit = findNode(this.nodes, id)
      if (!hit) return
      this.selectedId = id
      const node = hit.node
      const def = getDef(node.type)

      if (def.special) {
        // 特殊节点有自己的点击行为,不向子节点传导
        if (node.type === "explorer") this.startExplore()
        else if (node.type === "bench") this.craftBench()
        return
      }

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

    /** 从树上摘下节点:其子节点被释放回世界根层级,返回被摘下的节点 */
    detachNode(id: string): GameNode | null {
      const hit = findNode(this.nodes, id)
      if (!hit) return null
      const removed = removeNode(this.nodes, id)
      if (!removed) return null
      if (removed.children.length > 0) {
        const orphanCount = removed.children.length
        this.nodes.push(...removed.children)
        removed.children = []
        this.pushLog(`${orphanCount} 个子节点被释放回世界根层级。`, "warn")
      }
      if (this.selectedId === id) this.selectedId = null
      return removed
    },

    /** 移除节点(特殊节点不可移除;子节点释放回根层级) */
    removeNodeById(id: string) {
      const hit = findNode(this.nodes, id)
      if (!hit) return
      const def = getDef(hit.node.type)
      if (def.special) {
        this.pushLog(`「${def.name}」是世界的一部分,不能被移除。`, "warn")
        return
      }
      this.detachNode(id)
      this.pushLog(`节点「${def.name}」已从世界移除。`, "info")
    },

    /** 把节点收进物品栏(地形/特殊节点不可) */
    nodeToItem(id: string) {
      const hit = findNode(this.nodes, id)
      if (!hit) return
      const def = getDef(hit.node.type)
      if (isLockedToWorld(def.id)) {
        this.pushLog(`「${def.name}」没法收进物品栏。`, "warn")
        return
      }
      const removed = this.detachNode(id)
      if (!removed) return
      removed.children = []
      this.addPile("hotbar", removed)
      this.pushLog(`「${def.name}」已收回物品栏。`, "info")
    },

    /** 把物品栏/背包里的整堆节点放置为世界根节点(子节点释放回储区根) */
    placeItem(id: string) {
      let pile: GameNode | undefined
      const hi = this.hotbar.findIndex((n) => n.id === id)
      if (hi >= 0) {
        pile = this.hotbar.splice(hi, 1)[0]
      } else {
        pile = removeNode(this.backpack, id) ?? undefined
      }
      if (!pile) return
      const released = releaseChildren(pile, this.nodes, this.backpack)
      if (released > 0) this.pushLog(`${released} 个子节点被释放。`, "warn")
      pile.collapsed = true
      this.nodes.push(pile)
      this.pushLog(`「${getDef(pile.type).name}」被放置进了世界。`, "info")
    },

    // ── 物品 ─────────────────────────────────────────────
    /** 获得物品:优先并入已有堆 → 优先进物品栏 → 溢出进背包 */
    addItem(type: string, count = 1, silent = false) {
      const def = getDef(type)
      this.addCount("hotbar", type, count)
      this.enforceHotbarOverflow()
      if (!silent) this.pushLog(`获得 ${def.name} ×${count}`, "gain")
    },

    /** 向某储区增加数量:优先并入该区已有堆 → 背包已有堆 → 新建堆 */
    addCount(zone: Zone, type: string, count: number) {
      const list = this.zoneList(zone)
      const existing = list.find((n) => n.type === type)
      if (existing) {
        existing.count = pileCount(existing) + count
        return
      }
      if (zone === "backpack" || list.length < HOTBAR_SLOTS) {
        list.push(this.makeNode(type, count))
        return
      }
      // 物品栏满且无同类堆 → 优先并入背包已有堆,再不然才新建
      const bpExisting = this.backpack.find((n) => n.type === type)
      if (bpExisting) {
        bpExisting.count = pileCount(bpExisting) + count
      } else {
        this.backpack.push(this.makeNode(type, count))
      }
    },

    /** 把一个整堆节点并入储区(保留堆语义,同样优先并入已有堆) */
    addPile(zone: Zone, pile: GameNode) {
      const list = this.zoneList(zone)
      const existing = list.find((n) => n.type === pile.type && n !== pile)
      if (existing) {
        existing.count = pileCount(existing) + pileCount(pile)
        return
      }
      if (zone === "backpack" || list.length < HOTBAR_SLOTS) {
        pile.children = []
        list.push(pile)
        return
      }
      const bpExisting = this.backpack.find((n) => n.type === pile.type && n !== pile)
      if (bpExisting) {
        bpExisting.count = pileCount(bpExisting) + pileCount(pile)
      } else {
        pile.children = []
        this.backpack.push(pile)
      }
    },

    /** 合并同类型堆(带子树的堆不参与,避免吞掉子树) */
    consolidate(zone: Zone) {
      const list = this.zoneList(zone)
      const merged: GameNode[] = []
      for (const n of list) {
        if (n.children.length > 0) {
          merged.push(n)
          continue
        }
        const hit = merged.find((m) => m.type === n.type && m.children.length === 0)
        if (hit) hit.count = pileCount(hit) + pileCount(n)
        else merged.push(n)
      }
      list.splice(0, list.length, ...merged)
    },

    zoneList(zone: Zone): GameNode[] {
      return zone === "hotbar" ? this.hotbar : this.backpack
    },

    enforceHotbarOverflow() {
      if (this.hotbar.length > HOTBAR_SLOTS) {
        const overflow = this.hotbar.splice(HOTBAR_SLOTS)
        for (const pile of overflow) this.addPile("backpack", pile)
        this.consolidate("backpack")
        this.pushLog(
          `物品栏已满,${overflow.map((n) => getDef(n.type).name).join("、")}转入了背包。`,
          "warn",
        )
      }
    },

    countItem(type: string): number {
      let sum = 0
      const walk = (ns: GameNode[]) => {
        for (const n of ns) {
          if (n.type === type) sum += pileCount(n)
          walk(n.children)
        }
      }
      walk(this.hotbar)
      walk(this.backpack)
      return sum
    },

    // ── 探索(节点) ───────────────────────────────────────
    startExplore() {
      if (this.exploring) {
        this.pushLog(`还在探索中……(约 ${this.exploreCdLeft} 秒)`, "warn")
        return
      }
      this.exploring = true
      this.exploreEndAt = Date.now() + EXPLORE_MS
      this.pushLog("你向着未知出发……", "info")
    },

    /** 到点结算:有概率在探索节点下生成地形 */
    resolveExplore() {
      this.exploring = false
      const explorer = findNodeByType(this.nodes, "explorer")
      if (!explorer) return
      if (Math.random() >= EXPLORE_SUCCESS_RATE) {
        this.pushLog("这次探索一无所获。", "warn")
        return
      }
      const terrain = rollTerrain()
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

    /** 点击手工合成节点:检测其下挂载的材料并按当前配方合成 */
    craftBench() {
      const state = this.recipeState
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
      const bench = this.benchNode
      if (!bench) return
      for (const input of recipe.inputs) {
        let left = input.count
        for (let i = bench.children.length - 1; i >= 0 && left > 0; i--) {
          const pile = bench.children[i]
          if (pile.type !== input.type) continue
          const have = pileCount(pile)
          const take = Math.min(have, left)
          left -= take
          if (have - take > 0) pile.count = have - take
          else bench.children.splice(i, 1)
        }
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
    /** 拖拽守卫:节点是否可以进入物品栏/背包(地形与特殊节点离不开世界) */
    canEnterStorage(dragEl: HTMLElement): boolean {
      const type = dragEl.dataset.ntype
      if (type && isLockedToWorld(type)) return false
      return true
    },

    /** 拖拽守卫:节点是否可以放入 board 上 owner 的子列表(防环) */
    canDropIntoChildList(dragEl: HTMLElement, board: BoardId, ownerId: string | undefined): boolean {
      if (board !== "world" && !this.canEnterStorage(dragEl)) return false
      const dragId = dragEl.dataset.nodeId
      if (!dragId || !ownerId) return true
      return !isAncestorOf(this.boardRoots(board), dragId, ownerId)
    },

    /**
     * 节点落进储区(物品栏/背包)后的整理:
     * 子树释放(地形/特殊回世界,其余回背包根)、同级同堆合并、物品栏超格溢出。
     */
    settleStorageDrop(zone: Zone, list: GameNode[], dropped: GameNode) {
      const released = releaseChildren(dropped, this.nodes, this.backpack)
      if (released > 0) {
        this.pushLog(`${released} 个子节点被释放。`, "warn")
      }
      mergeSiblings(list)
      if (zone === "hotbar") this.enforceHotbarOverflow()
    },

    // ── 存档导入/导出 ────────────────────────────────────
    /** 导出存档 JSON(与持久化结构一致) */
    exportSaveData(): string {
      return JSON.stringify({
        version: SAVE_VERSION,
        nodes: this.nodes,
        hotbar: this.hotbar,
        backpack: this.backpack,
        selectedRecipeId: this.selectedRecipeId,
        exploring: this.exploring,
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
        hotbar: s.hotbar as GameNode[],
        backpack: s.backpack as GameNode[],
        selectedRecipeId: s.selectedRecipeId as string,
        exploring: s.exploring as boolean,
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
      "hotbar",
      "backpack",
      "selectedRecipeId",
      "exploring",
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

function findNodeByType(nodes: GameNode[], type: string): GameNode | null {
  for (const n of nodes) {
    if (n.type === type) return n
    const hit = findNodeByType(n.children, type)
    if (hit) return hit
  }
  return null
}

/** 同级同类型堆合并(只影响传入列表本身,不动子层级;带子树的堆不参与合并,避免吞掉子树) */
function mergeSiblings(list: GameNode[]) {
  for (let i = 0; i < list.length; i++) {
    const a = list[i]
    if (a.children.length > 0) continue
    for (let j = list.length - 1; j > i; j--) {
      const b = list[j]
      if (b.children.length > 0) continue
      if (a.type === b.type) {
        a.count = pileCount(a) + pileCount(b)
        list.splice(j, 1)
      }
    }
  }
}

/** 释放一个节点挂着的子树:地形/特殊回世界根,其余回背包根 */
function releaseChildren(node: GameNode, world: GameNode[], backpack: GameNode[]): number {
  if (!node.children?.length) return 0
  const orphans = node.children
  node.children = []
  for (const o of orphans) {
    if (isLockedToWorld(o.type)) world.push(o)
    else backpack.push(o)
  }
  return orphans.length
}

/** 汇总一组堆节点的数量 */
function sumPiles(nodes: GameNode[]): Record<string, number> {
  const map: Record<string, number> = {}
  for (const n of nodes) {
    map[n.type] = (map[n.type] ?? 0) + pileCount(n)
  }
  return map
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
