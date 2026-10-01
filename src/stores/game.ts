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
 * 该类型在世界里的处理上限:最多同时挂几个【直接】子节点(缺省不限)。
 * 与堆叠上限相对——世界挂载是流程(斧子只面对它的树),不数子子节点。
 */
function processLimit(type: string): number {
  const mp = getDef(type).maxProcess
  return typeof mp === "number" && mp > 0 ? mp : Infinity
}

// 历史注记:堆叠容量曾用 stackRootOf(沿同类祖先找堆根)+ canAbsorb(子树总量)
// 做递归判定,堵过三条绕过路径;自从堆恒为「根+直接子叶」(normalizePile
// 自动展平)后嵌套不复存在,递归判定随之退役(见 docs/11 §2.5)。
import type { AutoTriggerBehavior, GameNode, LogEntry, LogKind } from "../game/types"
import { nodeCount } from "../game/types"
import { countNodes, findNode, isAncestorOf, removeNode } from "../game/tree"
import {
  allWork,
  clearAllWork,
  clearWork,
  emitReject,
  startWork,
  workOf,
  type WorkKind,
} from "../game/work"

const LOG_LIMIT = 200
/** 普通工作的默认时长:未声明 workMs 的节点做一次事要花的时间 */
const DEFAULT_WORK_MS = 1500
/** 存档结构版本:不匹配时自动开新档 */
export const SAVE_VERSION = 6
/** 存档在 localStorage 里的 key(与 persist 配置共用) */
export const SAVE_KEY = "game"

/**
 * 游戏时钟:独立于 store 的响应式引用。
 * 每秒刷新但不算 store mutation,避免触发持久化插件的全量写盘。
 */
export const gameNow = ref(Date.now())

/**
 * 已播报过"开始运转"的自触发节点 id(onClock 清扫失去就位条件的)。
 * 计时循环本身是工作表里的 kind="cycle" 记录(可见进度条),
 * 这里只记播报态,不落盘。
 */
const cycleAnnounced = new Set<string>()

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

/** 统计子树材料 type→件数(每个同类节点计 1,与 takeNodes 消耗同口径) */
function countPiles(children: GameNode[]): Record<string, number> {
  const piles: Record<string, number> = {}
  const walk = (ns: GameNode[]) => {
    for (const n of ns) {
      piles[n.type] = (piles[n.type] ?? 0) + 1
      walk(n.children)
    }
  }
  walk(children)
  return piles
}

/** 配方缺料描述列表(空 = 料齐);recipeState 无效时 null */
function missingOf(state: ReturnType<typeof recipeStateOf>): string[] | null {
  if (!state) return null
  return state.inputs
    .filter((i) => !i.ok)
    .map((i) => `${getDef(i.stack.type).name}(缺 ${i.stack.count - i.have})`)
}

function craftMissingMsg(missing: string[]): string {
  return `材料不足:${missing.join("、")}。把材料节点挂到合成台下面再试。`
}

/**
 * 节点是否被占用:沿祖先上行,某个祖先有正在进行的工作(interact/craft——
 * 它的子节点是流程参与物,如石斧正在砍的森林;探索工作不占用子级)。
 * 返回占用它的祖先,无则 null。触发前置检查与行占用样式(NodeItem)
 * 共用这一处口径。
 */
export function occupierOfWorkingAncestor(roots: GameNode[], node: GameNode): GameNode | null {
  let current = node
  for (;;) {
    const parent = findNode(roots, current.id)?.parent
    if (!parent) return null
    const job = workOf(parent.id)
    if (job && (job.kind === "click" || job.kind === "craft")) return parent
    current = parent
  }
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
      return bench ? countPiles(bench.children) : {}
    },
    /** 当前配方 × 合成台材料状态 */
    recipeState(): ReturnType<typeof recipeStateOf> {
      return recipeStateOf(this.selectedRecipeId, this.benchPiles)
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
      clearAllWork() // 旧节点的工作随旧世界作废
      this.pushLog("一个崭新的世界展开了。", "info")
      this.pushLog("点击「探索」节点左侧的按钮(图标+名字)寻找地形;点击节点行可以折叠/展开子树。", "info")
    },

    /**
     * 游戏循环心跳:由 App 每秒驱动。只做"到点结算"与"计时循环播种",
     * 时钟本身在 store 之外的 gameNow 里,避免每秒触发一次存档写盘。
     * 工作结算以 endAt 时间戳对账:setTimeout 负责前台的准点结算,
     * 这里兜后台节流造成的迟到(只补一次,不做离线补算)。
     * 拖拽中整体跳过(避免与 Sortable 的落盘序列抢写)。
     */
    onClock() {
      if (this.dragging) return
      for (const [id, job] of allWork()) {
        if (gameNow.value >= job.endAt) this.resolveWork(id)
      }
      // 计时循环播种:就位的自触发节点(还没在循环中)启动可见循环;
      // 失去就位条件的清掉播报标记,重新就位时会再告知一次
      const ready = new Set<string>()
      const walk = (ns: GameNode[], parent: GameNode | null) => {
        for (const node of ns) {
          const b = autoTriggerBehaviorOf(node)
          if (b && autoTriggerReady(b, parent)) {
            ready.add(node.id)
            this.seedCycle(node, parent)
          }
          walk(node.children, node)
        }
      }
      walk(this.nodes, null)
      walk(this.backpack, null)
      for (const id of [...cycleAnnounced]) {
        if (!ready.has(id)) cycleAnnounced.delete(id)
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

    /** 点击入口:只触发,不选中——节点是可拖动的按钮,没有选中态;
     *  selectedId 由「详情/选择配方」按钮设置,用于联动检查器。 */
    clickNode(id: string) {
      const hit = findNode(this.nodes, id) ?? findNode(this.backpack, id)
      if (!hit) return
      this.dispatchClick(hit.node, "hand", false)
    },

    /**
     * click 链式传导:一个带来源(source,"hand" 或节点 type)的 click 到达节点。
     * 所有节点都会自动传导——区别只在"这个 click 让自己做什么":
     * - 普通节点:查交互表 (source, 自己)——有产出条目 → 在自己身上开工
     *   (进度条在接收者身上,节奏取来源工具的 workMs,空手取自己的),
     *   到点结算后把「来源=自己」的 click 传给子节点;纯风味 → 立即回应后
     *   继续传导;查无条目 → 自己不做事,瞬间传导(工具的瞬时转发即特例);
     *   既没活干也没子节点 → 链断在自己身上,灰闪提示。
     * - 探索/合成(玩家动作):只收空手 click,其他来源灰闪拒绝且不再传播
     *   (篝火接收不了"来自森林"的 click)。
     * - 自触发(水车):手动点击 = 立即向子节点发一轮 click(转一圈);
     *   就位后运行可见的计时循环(kind="cycle",行底进度条就是节拍),
     *   每圈到点自动发一轮。
     * 忙碌/被占用:灰闪反馈,链条停止(silent 时不打日志,视觉照播)。
     */
    dispatchClick(node: GameNode, source: string, silent = false) {
      const def = getDef(node.type)
      const behavior = def.behavior

      // 视图开关行为(如「背包」节点)由界面层处理,即时生效
      if (behavior?.kind === "view-toggle") return

      // 自触发:手动转一圈(不受自身计时循环的忙碌限制);就位则(重)开循环
      if (behavior?.kind === "auto-trigger") {
        for (const child of node.children) {
          this.dispatchClick(child, node.type, silent)
        }
        this.seedCycle(node)
        return
      }

      if (workOf(node.id)) {
        emitReject(node.id)
        if (!silent) this.pushLog(`「${def.name}」还在忙碌中……`, "warn")
        return
      }
      // 占用:祖上有正在进行的工作,本节点是流程参与物
      const occupier = occupierOfWorkingAncestor(
        findNode(this.nodes, node.id) ? this.nodes : this.backpack,
        node,
      )
      if (occupier) {
        emitReject(node.id)
        if (!silent) {
          this.pushLog(`「${def.name}」正被「${getDef(occupier.type).name}」占用着。`, "warn")
        }
        return
      }

      if (behavior?.kind === "explore" || behavior?.kind === "craft") {
        // 玩家动作(探索/合成)只收空手 click;上游传来的 click 灰闪拒绝,
        // 链条到此为止(篝火接收不了"来自森林"的 click,也不再向下传播)
        if (source !== "hand") {
          emitReject(node.id)
          if (!silent) {
            this.pushLog(`「${def.name}」接收不了来自「${getDef(source).name}」的触发。`, "warn")
          }
          return
        }
        if (behavior.kind === "craft") {
          // 预检材料:不足立即拒绝(结算时还会复核,防止工作期间材料被抽走)
          const missing = missingOf(recipeStateOf(this.selectedRecipeId, countPiles(node.children)))
          if (missing === null) return // 没有有效配方(防御路径,不应发生)
          if (missing.length > 0) {
            if (!silent) this.pushLog(craftMissingMsg(missing), "warn")
            return
          }
        }
        const kind: WorkKind = behavior.kind === "explore" ? "explore" : "craft"
        const duration =
          kind === "explore"
            ? (exploreBehaviorOf(node)?.durationMs ?? def.workMs ?? DEFAULT_WORK_MS)
            : (def.workMs ?? DEFAULT_WORK_MS)
        const job = startWork(node.id, kind, duration, silent, "hand")
        if (kind === "craft") job.recipeId = this.selectedRecipeId
        if (kind === "explore" && !silent) this.pushLog("你向着未知出发……", "info")
        job.timer = setTimeout(() => this.resolveWork(node.id), duration)
        return
      }
      if (behavior) return // 其余行为(如工厂)暂无点击语义,静默

      // 普通节点:所有节点都会自动传导——先看这个 click 让自己做什么:
      // 有产出条目 → 在自己身上开工(进度条在接收者身上,节奏由来源工具决定),
      // 到点结算后继续向下传导;查无条目/纯风味 → 自己不做事,瞬间把
      // 「来源=自己」的 click 传给子节点(工具的瞬时转发就是它的特例);
      // 既没活干也没有子节点 = 链断在自己身上,灰闪提示(挥了个空)。
      const it = findInteraction(source, node.type)
      if (it && it.results.length > 0) {
        const duration =
          source !== "hand"
            ? (getDef(source).workMs ?? def.workMs ?? DEFAULT_WORK_MS)
            : (def.workMs ?? DEFAULT_WORK_MS)
        const job = startWork(node.id, "click", duration, silent, source)
        job.timer = setTimeout(() => this.resolveWork(node.id), duration)
        return
      }
      if (it) this.trigger(source, node.type, silent) // 纯风味:接受但无事发生
      if (node.children.length > 0) {
        for (const child of node.children) {
          this.dispatchClick(child, node.type, silent)
        }
        return
      }
      if (!it) emitReject(node.id) // 无条目也无子节点:click 到这就断了
    },

    /**
     * 工作到点结算:按工作种类分发。
     * 节点在开始工作后被移走/删除 → 工作作废(静默丢弃);
     * 拖拽进行中不结算(与 Sortable 的落盘序列抢写),onClock 稍后再来。
     */
    resolveWork(nodeId: string) {
      const job = workOf(nodeId)
      if (!job) return
      if (this.dragging) return
      clearWork(nodeId)
      const hit = findNode(this.nodes, nodeId) ?? findNode(this.backpack, nodeId)
      if (!hit) return
      const node = hit.node
      if (job.kind === "explore") {
        this.finishExplore(node, job.silent)
      } else if (job.kind === "craft") {
        this.craftBench(node, job.recipeId, job.silent)
      } else if (job.kind === "cycle") {
        // 计时循环到点:向子节点发一轮「来自自己」的 click;仍就位则重新计时
        for (const child of node.children) {
          this.dispatchClick(child, node.type, true)
        }
        this.seedCycle(node, hit.parent)
      } else {
        // click 工作:结算交互产出,再把 click(来源=自己)传给子节点
        this.trigger(job.source ?? "hand", node.type, job.silent)
        for (const child of node.children) {
          this.dispatchClick(child, node.type, job.silent)
        }
      }
    },

    /**
     * 自触发节点的可见计时循环:就位(直接挂在 poweredBy 指定类型下)则
     * 挂一条 kind="cycle" 的工作(行底进度条即节拍),每圈到点由 resolveWork
     * 向子节点发 click 并重新计时;未就位/已有工作则不动。
     * 返回是否真的启动了循环。
     */
    seedCycle(node: GameNode, parentHint?: GameNode | null): boolean {
      const b = autoTriggerBehaviorOf(node)
      if (!b) return false
      if (workOf(node.id)) return false
      const parent =
        parentHint ?? findNode(this.nodes, node.id)?.parent ?? findNode(this.backpack, node.id)?.parent ?? null
      if (!autoTriggerReady(b, parent)) return false
      const intervalMs = Math.max(250, b.intervalMs) // 防内容误配 0/负数造成自旋
      const job = startWork(node.id, "cycle", intervalMs, true)
      if (!cycleAnnounced.has(node.id)) {
        cycleAnnounced.add(node.id)
        const powered = b.poweredBy ? `被${getDef(b.poweredBy).name}推动` : "开始运转"
        this.pushLog(
          `「${getDef(node.type).name}」${powered},每 ${Math.round(intervalMs / 1000)} 秒驱动一次。`,
          "info",
        )
      }
      job.timer = setTimeout(() => this.resolveWork(node.id), intervalMs)
      return true
    },

    /**
     * 解析并结算一次「来源 → 目标」交互(silent = 自动驱动的背景触发,不刷风味日志)。
     * 由 resolveWork 在工作到点时调用;无条目 → "没有效果"warn;
     * results 空 → 纯风味 note;掷骰全空 → "一无所获";命中 → 逐 drop addItem。
     */
    trigger(source: string, target: string, silent = false) {
      const interaction = findInteraction(source, target)
      if (!interaction) {
        if (!silent) {
          this.pushLog(
            `${getDef(source).name} 对 ${getDef(target).name} 似乎产生不了什么效果。`,
            "warn",
          )
        }
        return
      }
      if (interaction.results.length === 0) {
        if (!silent) this.pushLog(interaction.note, "info")
        return
      }
      const drops = rollDrops(interaction)
      if (drops.length === 0) {
        if (!silent) this.pushLog(`${interaction.note} 一无所获。`, "warn")
        return
      }
      for (const drop of drops) {
        this.addItem(drop.type, drop.count)
      }
      if (!silent) this.pushLog(interaction.note, "info")
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
     * 把节点收进背包(挂到最近一堆同类下,没有则成为新的一堆)。
     * 与跨区拖拽同一条规矩:一次一个——节点下面还挂着子节点时拒绝,
     * 玩家先把子节点一条一条移走(物理直觉:挖方块也是一个一个挖)。
     */
    nodeToItem(id: string) {
      const hit = findNode(this.nodes, id) ?? findNode(this.backpack, id)
      if (!hit) return
      const def = getDef(hit.node.type)
      if (!canPlaceInZone(def.id, "backpack")) {
        this.pushLog(`「${def.name}」没法收进背包。`, "warn")
        return
      }
      if (hit.node.children.length > 0) {
        this.pushLog(
          `「${def.name}」下面还挂着 ${hit.node.children.length} 个节点——先把它们移走,一条一条回收。`,
          "warn",
        )
        return
      }
      const inWorld = findNode(this.nodes, id)
      const removed = removeNode(inWorld ? this.nodes : this.backpack, id)
      if (!removed) return
      if (this.selectedId === id) this.selectedId = null
      this.stackIntoBackpack(removed)
      this.pushLog(`「${def.name}」已收进背包。`, "info")
    },

    /**
     * 把节点(及其子树)并入背包堆:全部展平成单件,先填进还有空间的同类堆,
     * 装不下的开新堆(根 + 直接子叶,至多 maxStack 件)。
     * 背包堆不变量:堆 = 根 + 同类叶子,没有子子节点——存储就是平的。
     */
    stackIntoBackpack(node: GameNode) {
      const type = node.type
      const limit = stackLimit(type)
      // 展平:node 自己 + 所有后代变成单件列表(后代引用全部剥离)
      const items: GameNode[] = [node]
      const walk = (ns: GameNode[]) => {
        for (const n of ns) {
          items.push(n)
          walk(n.children)
        }
      }
      walk(node.children)
      node.children = []
      for (const n of items) n.children = []
      let left = items
      // 并入现有堆(从后往前;余量按子树总量算——旧档可能有嵌套堆,防御)
      for (const pile of [...this.backpack].reverse()) {
        if (pile.type !== type) continue
        const space = limit - nodeCount(pile)
        if (space > 0) {
          const take = left.slice(0, space)
          pile.children.push(...take)
          left = left.slice(take.length)
          if (left.length === 0) return
        }
      }
      // 开新堆:根 + 最多 limit-1 个直接子,剩余继续
      while (left.length > 0) {
        const [root, ...rest] = left
        root.children = rest.slice(0, limit - 1)
        left = rest.slice(limit - 1)
        this.backpack.push(root)
      }
    },

    /**
     * 落库整理:把一个背包堆规约回「根 + 直接子叶」不变量(拖拽落库后调用,
     * 必须延迟到 Sortable 回写之后)。展平整棵子树,填到 maxStack 为止,
     * 溢出的单件回 stackIntoBackpack 重堆。世界侧不适用(挂载是流程,可嵌套)。
     */
    normalizePile(pile: GameNode) {
      if (getDef(pile.type).behavior) return // 功能节点(合成台)的子级不限制
      const limit = stackLimit(pile.type)
      const items: GameNode[] = []
      const walk = (ns: GameNode[]) => {
        for (const n of ns) {
          items.push(n)
          walk(n.children)
        }
      }
      walk(pile.children)
      pile.children = []
      for (const n of items) n.children = []
      const keep = items.slice(0, limit - 1)
      const overflow = items.slice(limit - 1)
      pile.children = keep
      if (overflow.length > 0) {
        this.pushLog(`${overflow.length} 件物品溢出到了新的堆。`, "info")
        for (const n of overflow) this.stackIntoBackpack(n)
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
    /** 探索工作到点结算:有概率在该节点下生成地形(按发起节点结算,I-7)。
     *  silent(被自动驱动):不打结算日志,地形静默出现(可见于树)。 */
    finishExplore(explorer: GameNode, silent = false) {
      const b = exploreBehaviorOf(explorer)
      if (Math.random() >= (b?.successRate ?? 0.5)) {
        if (!silent) this.pushLog("这次探索一无所获。", "warn")
        return
      }
      const terrain = rollPool(b?.pool ?? [{ type: "forest", weight: 1 }])
      const def = getDef(terrain)
      explorer.children.push(this.makeNode(terrain))
      explorer.collapsed = false // 有新发现,展开让玩家看见
      if (!this.discovered.includes(terrain)) this.discovered.push(terrain)
      if (!silent) this.pushLog(`探索成功!「${def.name}」出现在了探索节点之下。`, "gain")
    },

    // ── 手工合成(节点) ───────────────────────────────────
    selectRecipe(id: string) {
      if (getRecipe(id)) {
        this.selectedRecipeId = id
        this.pushLog(`配方已切换为「${getDef(getRecipe(id)!.output.type).name}」。`, "info")
      }
    },

    /**
     * 点击手工合成节点:检测该节点下挂载的材料并按当前配方合成。
     * 材料不足在 dispatchClick 挂工作时已预检过一次;这里是到点结算时的复核
     * (工作期间材料可能被抽走)。recipeId 用工作快照(开工时的配方),
     * 缺省当前配方;silent(被自动驱动)不打结算日志。
     */
    craftBench(bench?: GameNode, recipeId?: string, silent = false) {
      const target = bench ?? this.benchNode
      if (!target) return
      const state = recipeStateOf(recipeId ?? this.selectedRecipeId, countPiles(target.children))
      if (!state) return
      const recipe = state.recipe
      const missing = missingOf(state)
      if (missing && missing.length > 0) {
        if (!silent) this.pushLog(craftMissingMsg(missing), "warn")
        return
      }
      let unsatisfied = 0
      for (const input of recipe.inputs) {
        unsatisfied += takeNodes(target.children, input.type, input.count)
      }
      if (unsatisfied > 0) {
        // 计数与移除口径不一致的防御:不应发生
        if (!silent) this.pushLog("合成材料出现异常,已中止。", "warn")
        return
      }
      this.addItem(recipe.output.type, recipe.output.count, true)
      if (!silent) {
        this.pushLog(
          `合成成功:${recipe.inputs
            .map((i) => `${getDef(i.type).name}×${i.count}`)
            .join(" + ")} → ${getDef(recipe.output.type).name}×${recipe.output.count}`,
          "craft",
        )
      }
    },

    // ── 拖拽辅助 ─────────────────────────────────────────
    /**
     * 拖拽守卫:节点是否可以放入 board 上 owner 的子列表。
     * - ① 区域权限(zones);
     * - ② 跨区整树禁止,双向都"一次一个":背包→世界的整堆(带子节点)
     *   拒绝(放置走 placeItem,一次只放一个);世界→背包的整树拒绝
     *   (回收一条一条来,像我的世界挖方块)。带没带子树按【数据】判定
     *   (dragNode.children),不看 DOM——折叠节点的子列表不渲染,DOM 会漏判;
     * - ③④ 无 owner(面板根)或 owner 已不在树上 → 放行(根列表无上限);
     * - ⑤ 世界处理上限:owner 的直接子节点数 +1 超过 maxProcess → 拒绝
     *   (流程节点同时处理几件事,如石斧同时只砍一棵树;缺省不限);
     * - ⑥ 背包里的普通物品:子级只能挂同类(堆叠规则)且按堆根判定堆未满;
     *   功能节点不受限;
     * - ⑦ 防环(不可拖进自己的子树)。
     */
    canDropIntoChildList(dragEl: HTMLElement, board: BoardId, ownerId: string | undefined): boolean {
      const type = dragEl.dataset.ntype
      if (type && !canPlaceInZone(type, board)) return false
      const dragId = dragEl.dataset.nodeId
      const dragNode =
        dragId && dragId !== ownerId
          ? (findNode(this.nodes, dragId)?.node ?? findNode(this.backpack, dragId)?.node ?? null)
          : null
      const carriesTree = !!dragNode && dragNode.children.length > 0
      if (carriesTree) {
        if (board === "world" && dragEl.dataset.zone === "backpack") return false
        if (board === "backpack" && dragEl.dataset.zone === "tree") return false
      }
      if (!dragId || !ownerId) return true
      const owner = findNode(this.boardRoots(board), ownerId)?.node
      if (!owner) return true
      if (board === "world") {
        if (owner.children.length + 1 > processLimit(owner.type)) return false
      } else if (!getDef(owner.type).behavior) {
        // 普通物品:子级只能挂同类。容量不在这里拦——落库后 normalizePile
        // 自动展平 + 填满上限 + 溢出(背包堆恒为「根 + 直接子叶」,无嵌套)
        if (type && type !== owner.type) return false
      }
      return !isAncestorOf(this.boardRoots(board), dragId, ownerId)
    },

    // ── 存档导入/导出 ────────────────────────────────────
    /** 导出存档 JSON(与持久化结构一致) */
    exportSaveData(): string {
      return JSON.stringify({
        version: SAVE_VERSION,
        nodes: this.nodes,
        backpack: this.backpack,
        selectedRecipeId: this.selectedRecipeId,
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
      clearAllWork() // 换世界,旧节点的工作作废
      this.$patch({
        nodes: s.nodes as GameNode[],
        backpack: s.backpack as GameNode[],
        selectedRecipeId: s.selectedRecipeId as string,
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

/** 取节点自身定义声明的自触发行为(非自触发节点返回 null) */
export function autoTriggerBehaviorOf(node: GameNode): AutoTriggerBehavior | null {
  const b = getDef(node.type).behavior
  return b?.kind === "auto-trigger" ? b : null
}

/**
 * 自触发节点是否已就位:直接挂在 poweredBy 指定的类型下(缺省 = 恒就位)。
 * 驱动判定与界面状态显示共用这一处,避免两处口径漂移。
 */
export function autoTriggerReady(b: AutoTriggerBehavior, parent: GameNode | null): boolean {
  return !b.poweredBy || parent?.type === b.poweredBy
}
