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

/** 在 roots 里找 nodeId 所属的顶层节点(堆根) */
/**
 * 沿同类祖先上行,找到节点所属"堆"的根。
 * 容量必须按堆根判定:挂到堆内部任何层级(包括叶子)都算并入整堆;
 * 堆挂在功能节点(如手工合成)下时,堆根仍是同类链的顶端,不越过功能节点。
 */
function stackRootOf(roots: GameNode[], node: GameNode): GameNode {
  let current = node
  for (;;) {
    const parent = findNode(roots, current.id)?.parent
    if (parent && parent.type === current.type) current = parent
    else return current
  }
}

/**
 * 把 whole(整棵子树)并入 pile 后是否仍不超过堆上限。
 * 容量按"子树总件数"判定:父 + 所有后代各计 1,
 * 这样嵌套子堆/整堆搬运都无法绕过上限。
 */
function canAbsorb(pile: GameNode, whole: GameNode): boolean {
  return nodeCount(pile) + nodeCount(whole) <= stackLimit(pile.type)
}
import type { AutoTriggerBehavior, GameNode, LogEntry, LogKind } from "../game/types"
import { nodeCount } from "../game/types"
import { countNodes, findNode, isAncestorOf, removeNode } from "../game/tree"
import { allWork, clearAllWork, clearWork, startWork, workOf, type WorkKind } from "../game/work"

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
 * 自触发节点的下一次驱动时间(node id → 时间戳 ms)。
 * 与 gameNow 同理放在 store 之外:每秒都可能变化,不该触发持久化写盘,
 * 也不需要落盘(刷新/导入存档后重新计时)。
 */
const autoTriggerAt = new Map<string, number>()

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
  return `材料不足:${missing.join("、")}。把材料节点挂到「手工合成」下面再试。`
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
    if (job && (job.kind === "interact" || job.kind === "craft")) return parent
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
      this.pushLog("点击「探索」节点寻找地形;点击「背包」节点开合背包分屏。", "info")
    },

    /**
     * 游戏循环心跳:由 App 每秒驱动。只做"到点结算",
     * 时钟本身在 store 之外的 gameNow 里,避免每秒触发一次存档写盘。
     * 工作结算以 endAt 时间戳对账:setTimeout 负责前台的准点结算,
     * 这里兜后台节流造成的迟到(只补一次,不做离线补算)。
     */
    onClock() {
      if (!this.dragging) {
        for (const [id, job] of allWork()) {
          if (gameNow.value >= job.endAt) this.resolveWork(id)
        }
      }
      this.tickAutoTriggers()
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
      this.triggerNode(hit.node)
    },

    /**
     * 触发一个节点 = 让它开始做事:语义与"点击它"完全一致(自触发行为也走
     * 这里,"被驱动"与"被点击"是同一条路径)。
     * 做事需要时间(work):挂一条工作记录,行底进度条随之填充,到点由
     * resolveWork 结算(交互掷骰/合成/探索产出)。工作中的节点忙碌,
     * 再次触发无效(现实里不可能一瞬间砍一棵树)。
     * 视图开关(如「背包」节点)即时生效,不走工作;自触发节点(水车)被
     * 触发 = 立即驱动子节点,忙碌的是子节点们。
     * silent:自动驱动(水车等)用——结算时只记产出,不刷风味/一无所获日志。
     */
    triggerNode(node: GameNode, silent = false) {
      const def = getDef(node.type)
      const behavior = def.behavior

      // 视图开关行为(如「背包」节点)由界面层处理,即时生效,不受忙碌/占用影响
      if (behavior?.kind === "view-toggle") return

      // 前置检查(任何分发/挂工作之前):忙碌与被占用对一切触发一视同仁——
      // 注定没有效果的触发立即拒绝/回应,不白等工作时长
      if (workOf(node.id)) {
        if (!silent) this.pushLog(`「${def.name}」还在忙碌中……`, "warn")
        return
      }
      // 占用:祖上有正在进行的工作(interact/craft),本节点是流程参与物
      // (如石斧正在砍的那棵森林)——被占用期间不可自行触发
      const occupier = occupierOfWorkingAncestor(
        findNode(this.nodes, node.id) ? this.nodes : this.backpack,
        node,
      )
      if (occupier) {
        if (!silent) {
          this.pushLog(`「${def.name}」正被「${getDef(occupier.type).name}」占用着。`, "warn")
        }
        return
      }

      if (behavior?.kind === "auto-trigger") {
        this.driveAutoTrigger(node, silent)
        return
      }
      if (behavior && behavior.kind !== "explore" && behavior.kind !== "craft") {
        return // 其余行为(如工厂)暂无点击语义,静默
      }

      const kind: WorkKind =
        behavior?.kind === "explore" ? "explore" : behavior?.kind === "craft" ? "craft" : "interact"
      if (kind === "craft") {
        // 预检材料:不足立即拒绝(结算时还会复核,防止工作期间材料被抽走)
        const missing = missingOf(recipeStateOf(this.selectedRecipeId, countPiles(node.children)))
        if (missing === null) return // 没有有效配方(防御路径,不应发生)
        if (missing.length > 0) {
          if (!silent) this.pushLog(craftMissingMsg(missing), "warn")
          return
        }
      } else if (kind === "interact") {
        if (node.children.length > 0) {
          // 流程节点:子节点里没有任何可交互条目 → 立即告知,不空转
          if (!node.children.some((c) => findInteraction(node.type, c.type))) {
            if (!silent) {
              this.pushLog(`「${def.name}」对下面的节点似乎都产生不了什么效果。`, "warn")
            }
            return
          }
        } else {
          const it = findInteraction("hand", node.type)
          if (!it || it.results.length === 0) {
            // 空手摸一把没有产出可言(纯提示/风味):立即回应,不耗时
            this.trigger("hand", node.type, silent)
            return
          }
        }
      }

      const duration =
        kind === "explore"
          ? (exploreBehaviorOf(node)?.durationMs ?? getDef(node.type).workMs ?? DEFAULT_WORK_MS)
          : (getDef(node.type).workMs ?? DEFAULT_WORK_MS)
      const job = startWork(node.id, kind, duration, silent)
      if (kind === "craft") job.recipeId = this.selectedRecipeId // 快照:结算按开工时的配方
      if (kind === "explore" && !silent) this.pushLog("你向着未知出发……", "info")
      // 前台准点结算;后台节流的迟到由 onClock 按 endAt 时间戳对账。
      // 定时器记进工作:reset/导入存档全清时一并撤销,防旧定时器撞新世界同号节点
      job.timer = setTimeout(() => this.resolveWork(node.id), duration)
    },

    /**
     * 工作到点结算:按工作种类分发到对应的即时结算逻辑。
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
      } else {
        if (node.children.length > 0) {
          for (const child of node.children) {
            this.trigger(node.type, child.type, job.silent)
          }
        } else {
          this.trigger("hand", node.type, job.silent)
        }
      }
    },

    /**
     * 驱动一个自触发节点:依次"触发"它的每个子节点
     * (子节点按被点击的语义开始各自的工作,如水车 → 石斧 → 森林)。
     * 既用于到点自动驱动(silent),也用于玩家手动点击。
     */
    driveAutoTrigger(node: GameNode, silent = false) {
      for (const child of node.children) {
        this.triggerNode(child, silent)
      }
    },

    /**
     * 自触发节点的周期驱动(由 onClock 每秒调用):
     * 已就位(直接挂在 poweredBy 指定类型下)的节点到点即驱动一次。
     * 计时表在 store 外(同 gameNow:不落盘);后台节流造成的迟到只补一次,
     * 不做离线补算;拖拽中整体跳过,避免与 Sortable 的落盘序列抢写。
     */
    tickAutoTriggers() {
      if (this.dragging) return
      const now = gameNow.value
      const running = new Set<string>()
      const due: GameNode[] = []
      const walk = (ns: GameNode[], parent: GameNode | null) => {
        for (const node of ns) {
          const b = autoTriggerBehaviorOf(node)
          if (b && autoTriggerReady(b, parent)) {
            running.add(node.id)
            const nextAt = autoTriggerAt.get(node.id)
            if (nextAt == null) {
              // 首次就位:记下第一拍,并告诉玩家它开始运转了
              autoTriggerAt.set(node.id, now + b.intervalMs)
              const source = b.poweredBy ? `被${getDef(b.poweredBy).name}推动` : "开始运转"
              this.pushLog(
                `「${getDef(node.type).name}」${source},每 ${Math.round(b.intervalMs / 1000)} 秒驱动一次。`,
                "info",
              )
            } else if (now >= nextAt) {
              autoTriggerAt.set(node.id, now + b.intervalMs)
              due.push(node)
            }
          }
          walk(node.children, node)
        }
      }
      walk(this.nodes, null)
      walk(this.backpack, null)
      // 已被移走/失去动力的节点丢掉计时,重新就位时从零开始
      for (const id of [...autoTriggerAt.keys()]) {
        if (!running.has(id)) autoTriggerAt.delete(id)
      }
      // 遍历完再统一驱动:驱动会改树(产出入背包等),不边走边改
      for (const node of due) {
        this.driveAutoTrigger(node, true)
      }
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
     * 材料不足在 triggerNode 挂工作时已预检过一次;这里是到点结算时的复核
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
        // 普通物品:子级只能挂同类,且并入后不超过堆上限。
        // 容量以「同类链堆根」的子树总量判定 —— 挂到堆内部任何层级
        // (包括叶子节点、挂在功能节点下的堆)都视为并入整堆,无法绕过 maxStack;
        // 同一堆内部的整理不改变总量,放行。
        if (type && type !== owner.type) return false
        if (dragNode) {
          const fromWorld = !!findNode(this.nodes, dragId)
          const pileRoot = stackRootOf(this.backpack, owner)
          const dragRoot = stackRootOf(fromWorld ? this.nodes : this.backpack, dragNode)
          if (dragRoot.id !== pileRoot.id && !canAbsorb(pileRoot, dragNode)) return false
        }
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
