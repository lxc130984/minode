import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

import { CONTENT } from '@/content'
import { buildDemoRoots, buildStressRoots, starterSeeds } from '@/content/demo'
import { evalNode as engineEvalNode, type EvalOutcome, type EvalWorld } from '@/engine/eval'
import { UndoTree, type HistoryStep } from '@/engine/history'
import { bagAdd, bagTake, canAfford, costGap, payCost } from '@/engine/bag'
import { createNode, subtreeContains } from '@/engine/node'
import { normalizeTree, computeRet } from '@/engine/normalize'
import { D, Decimal } from '@/engine/num'
import {
  deserialize,
  SAVE_KEY,
  serialize,
  type SaveV1,
  type SaveV2,
  type SaveV3,
  type SaveV4,
} from '@/engine/save'
import type { GameNode, ItemId, ItemStore, NodeId, NodeTypeId } from '@/engine/types'
import { createFeedback } from '@/stores/feedback'
import { createDisplayHelpers } from '@/stores/display'
import { fmt } from '@/utils/format'
import { pointerOverSidebar, readDrop, treeZoneAt, type DragEndLike } from '@/utils/tree-drop'

export type ChipState = 'ok' | 'idle' | 'unknown'
/** 语法高亮用的一级分类（06 篇 §2.1）：函数 / 符号 / 工具 / 未注册 */
export type ChipKind = 'machine' | 'symbol' | 'tool' | 'unknown'

/** 自动折叠的展示深度：第 1~2 层展开，更深的子树落地时默认折叠（+N 徽标，D-28） */
const FOLD_DEPTH = 2

/**
 * 唯一可变状态持有者（docs/05 §1）。生产线模型（docs/08 D-26/D-30）：
 * 资产只有物品（背包/箱子），节点只存在于树上；建造 = 消耗物品，回收 = 分解返还。
 *
 * 分层（D-32 整理）：
 * - 展示纯函数 → `stores/display.ts`（只读注册表与节点）；
 * - 瞬态反馈（hint/pulse/悬停/配对高亮/入场）→ `stores/feedback.ts`；
 * - 示例局面/起始物资（内容 id）→ `content/demo.ts`；
 * - 本文件：状态定义 + 树结构写入 + 求值路由 + 建造/回收 + 容器转移 + 历史/存档。
 */
export const useGameStore = defineStore('game', () => {
  const registry = CONTENT

  // ---------- 状态 ----------
  const roots = ref<GameNode[]>([])
  /** 背包：物品 → 数量（容量 = 物品总数量 ≤ config.bagCapacity） */
  const bag = ref<ItemStore>({})
  /** 箱子等带内容节点的库存：节点 id → 物品表（存档里挂在节点上，运行时按 id 索引） */
  const chestContents = ref<Record<NodeId, ItemStore>>({})
  /** 浮动窗口（当前只有箱子）：打开哪个节点的面板 */
  const panel = ref<{ kind: 'storage'; nodeId: NodeId } | null>(null)
  /** 手持物（点击检测的隐式实参，docs/10 §4）：选中的背包物品 id */
  const selectedItem = ref<ItemId | null>(null)
  /** 放置模式：光标上挂着的虚影节点类型（null = 未处于放置模式） */
  const placing = ref<NodeTypeId | null>(null)
  /** 指针位置与放置落点（仅放置模式追踪，避免每帧写响应式） */
  const pointer = shallowRef<{ x: number; y: number } | null>(null)
  const placingZone = shallowRef<{ owner: NodeId | null; index: number } | null>(null)
  const dragging = ref(false)
  /** 最近一次点击的结果描述（调试面板展示） */
  const lastEval = ref('')

  const feedback = createFeedback()
  const display = createDisplayHelpers(registry)
  const { setHint } = feedback

  /** 手持物 id：作为隐式实参参与点击检测 */
  const heldItem = computed<ItemId | null>(() => selectedItem.value)
  /** 选择面板条目（按内容顺序） */
  const palette = computed(() => registry.defs.nodes)

  // ---------- 产出入口 ----------
  const warnedOverflow = new Set<string>()

  /**
   * 产出入口：配方产物（全部是物品）进**背包**（容量受限）；
   * 返回未接收的余量（背包满时 > 0，由调用方决定提示）。
   */
  function gain(id: string, count: Decimal): Decimal {
    if (!registry.item(id)) {
      console.warn(`[minode] 产出未注册物品：${id} ×${count.toString()}（已丢弃）`)
      return count
    }
    const added = bagAdd(bag.value, id, count, registry.config.bagCapacity)
    bag.value = added.store
    if (added.rest.gt(0)) {
      if (!warnedOverflow.has(id)) {
        warnedOverflow.add(id)
        console.warn(`[minode] 背包已满，丢弃 ${id} × ${added.rest.toString()}`)
      }
      setHint(`背包已满，${registry.shortOf(id)} × ${added.rest.toString()} 丢弃`)
    }
    return added.rest
  }

  const world: EvalWorld = { registry, gain }

  // ---------- 树索引与结构写入（单写者，docs/05 §2.1） ----------
  // 节点 id 索引在每次结构变更后重建（O(N)，树规模 <1e3 时开销可忽略）
  let index = new Map<NodeId, GameNode>()
  // 父索引：id → 父节点 id（根层 = null）。拖拽摘挂与增量归一化都靠它
  let parentOf = new Map<NodeId, NodeId | null>()

  function reindex(): void {
    const next = new Map<NodeId, GameNode>()
    const parents = new Map<NodeId, NodeId | null>()
    const walk = (node: GameNode, parent: NodeId | null): void => {
      next.set(node.id, node)
      parents.set(node.id, parent)
      for (const child of node.children) walk(child, node.id)
    }
    for (const root of roots.value) walk(root, null)
    index = next
    parentOf = parents
  }

  /**
   * 结构变更收尾：传 `affected` → **增量**归一化（只重算这些节点 + 祖先链）；
   * 不传 → 全量后序（启动 / 读档 / 兜底）。
   */
  function afterStructureChange(affected?: Iterable<NodeId | null>): void {
    feedback.setHoverParent(null) // 结构变了，旧的悬停关系作废
    reindex()
    if (affected) refreshValues(affected)
    else normalizeTree(roots.value, registry)
  }

  /**
   * 从这些节点起沿父链向上重算 `ret`。⚠️ 必须**深者优先**：
   * 父节点要读到子节点的**新** `ret`；若先算父再算子，父会被 `done` 挡掉（历史上踩过）。
   */
  function refreshValues(seed: Iterable<NodeId | null>): void {
    const depthOf = (id: NodeId): number => {
      let depth = 0
      let current: NodeId | null = id
      while (current !== null && depth < 1024) {
        depth += 1
        current = parentOf.get(current) ?? null
      }
      return depth
    }
    const seeds = [...seed].sort(
      (a, b) => (b === null ? 0 : depthOf(b)) - (a === null ? 0 : depthOf(a)),
    )
    const done = new Set<NodeId>()
    const climb = (start: NodeId | null): void => {
      let current = start
      while (current !== null && !done.has(current)) {
        const node = index.get(current)
        if (!node) return
        done.add(current)
        node.ret = computeRet(node, registry)
        current = parentOf.get(current) ?? null
      }
    }
    for (const id of seeds) climb(id)
  }

  /** 兄弟列表：`parentId = null` 为根层；找不到返回 null */
  function listOf(parentId: NodeId | null): GameNode[] | null {
    if (parentId === null) return roots.value
    return index.get(parentId)?.children ?? null
  }

  /** 把节点从原列表摘下（保留子树）；不在树上返回 null */
  function detach(id: NodeId): GameNode | null {
    if (!parentOf.has(id)) return null
    const node = index.get(id)
    const list = listOf(parentOf.get(id) ?? null)
    if (!node || !list) return null
    const at = list.indexOf(node)
    if (at >= 0) list.splice(at, 1)
    return node
  }

  /**
   * 声明式写一个列表——**树结构写入的唯一入口**：
   * 传入的节点先各自从原列表**摘下**（树中永不出现重复引用）、防环、增量归一化。
   */
  function writeList(parentId: NodeId | null, nodes: readonly GameNode[]): boolean {
    const target = listOf(parentId)
    if (!target) return false
    const seen = new Set<NodeId>()
    const next: GameNode[] = []
    for (const node of nodes) {
      if (!node || seen.has(node.id) || !index.has(node.id)) return false
      if (parentId !== null && (node.id === parentId || subtreeContains(node, parentId)))
        return false
      seen.add(node.id)
      next.push(node)
    }
    const affected = new Set<NodeId | null>([parentId])
    for (const node of next) affected.add(parentOf.get(node.id) ?? null)
    for (const node of next) detach(node.id)
    target.splice(0, target.length, ...next)
    afterStructureChange(affected)
    return true
  }

  /** 子列表声明式回写（节点数组 = 该列表的新内容） */
  function setChildren(id: NodeId, incoming: readonly GameNode[]): boolean {
    const ok = writeList(id, incoming)
    if (ok) record('拖拽', true)
    return ok
  }

  /** 根列表声明式回写 */
  function setRoots(incoming: readonly GameNode[]): boolean {
    const ok = writeList(null, incoming)
    if (ok) record('拖拽', true)
    return ok
  }

  /** 树内移动（含源属主自检与防环）；拖拽落位的模型写入入口 */
  function moveTreeNode(
    nodeId: NodeId,
    from: NodeId | null,
    to: NodeId | null,
    at: number,
  ): boolean {
    const node = index.get(nodeId)
    if (!node) return false
    if ((parentOf.get(nodeId) ?? null) !== from) return false // 源属主一致性自检
    const target = listOf(to)
    if (!target) return false
    if (to !== null && (nodeId === to || subtreeContains(node, to))) return false // 防环
    if (!detach(nodeId)) return false
    target.splice(Math.min(Math.max(at, 0), target.length), 0, node)
    afterStructureChange([to, from])
    autoFoldDeep(nodeId) // 深处的大子树默认折叠，保持视图紧凑
    feedback.markAppearing(nodeId)
    record('拖拽', true)
    return true
  }

  // ---------- 折叠 ----------
  /** 折叠（纯视觉，≠ 回收）；点击括号 / …+N 徽标触发（D-30/D-31） */
  function toggleFold(id: NodeId): void {
    const node = index.get(id)
    if (node && node.children.length > 0) node.folded = !node.folded
  }

  /** 节点深度（根 = 1）；查 parentOf 索引，O(深度) */
  function depthOfNode(id: NodeId): number {
    let depth = 1
    let current: NodeId | null = id
    while (current !== null && depth < 1024) {
      current = parentOf.get(current) ?? null
      if (current !== null) depth += 1
    }
    return depth
  }

  /** 深处的子树落地（拖拽/建造）时默认折叠，保持视图紧凑（D-28） */
  function autoFoldDeep(id: NodeId): void {
    const node = index.get(id)
    if (node && node.children.length > 0 && depthOfNode(id) > FOLD_DEPTH) node.folded = true
  }

  /** 全部折叠 / 全部展开（只动有子节点的节点） */
  function setAllFolded(folded: boolean): void {
    const walk = (list: readonly GameNode[]): void => {
      for (const node of list) {
        if (node.children.length > 0) node.folded = folded
        walk(node.children)
      }
    }
    walk(roots.value)
  }

  // ---------- 悬停 ----------
  /** 悬停：只标记被悬停节点的父节点（父链查 parentOf 索引，O(深度)） */
  function setHover(id: NodeId | null): void {
    feedback.setHoverParent(id === null ? null : ((parentOf.get(id) ?? null) as NodeId | null))
  }

  // ---------- undo 树（docs/07 §4.4） ----------
  const COALESCE_MS = 200
  let history: UndoTree | undefined
  const historyVersion = ref(0)

  /** 纯局面快照文本：savedAt 固定为 0 → 同一局面得到同一文本（便于去重/合并） */
  function snapshotText(): string {
    return JSON.stringify(
      serialize({ roots: roots.value, bag: bag.value, chestContents: chestContents.value }, 0),
    )
  }

  /** 记录一次新局面；coalesce = 同一动作的连续回写合并成一步（如转移连点） */
  function record(label: string, coalesce = false): void {
    if (!history) return
    const now = Date.now()
    const entry = history.entry
    if (
      coalesce &&
      entry &&
      entry.parent !== null &&
      entry.label === label &&
      now - entry.at < COALESCE_MS
    ) {
      if (history.amend(snapshotText(), now)) historyVersion.value += 1
      return
    }
    if (history.record(snapshotText(), label, now)) historyVersion.value += 1
  }

  /** 重建历史（读档 / 重置） */
  function resetHistory(label: string): void {
    history = new UndoTree(snapshotText(), label, Date.now())
    historyVersion.value += 1
  }

  /** 应用一份快照（撤销 / 重做 / 穿梭 / 读档共用） */
  function applySnapshot(raw: string): boolean {
    try {
      const save = JSON.parse(raw) as SaveV1 | SaveV2 | SaveV3 | SaveV4
      const snapshot = deserialize(save, registry)
      roots.value = snapshot.roots
      bag.value = snapshot.bag
      chestContents.value = snapshot.chestContents
      cancelPlacing()
      selectedItem.value = null
      panel.value = null
      feedback.clearAll()
      lastEval.value = ''
      afterStructureChange()
      return true
    } catch (error) {
      console.warn('[minode] 快照不可用，已忽略', error)
      return false
    }
  }

  function undo(): boolean {
    const entry = history?.undo()
    if (!entry) return false
    historyVersion.value += 1
    return applySnapshot(entry.snapshot)
  }

  function redo(): boolean {
    const entry = history?.redo()
    if (!entry) return false
    historyVersion.value += 1
    return applySnapshot(entry.snapshot)
  }

  function jumpTo(id: number): boolean {
    const entry = history?.jump(id)
    if (!entry) return false
    historyVersion.value += 1
    return applySnapshot(entry.snapshot)
  }

  const historySteps = computed<{ path: HistoryStep[]; branches: HistoryStep[] }>(() => {
    void historyVersion.value
    return history?.steps() ?? { path: [], branches: [] }
  })
  const canUndo = computed(() => {
    void historyVersion.value
    return history?.canUndo() ?? false
  })
  const canRedo = computed(() => {
    void historyVersion.value
    return history?.canRedo() ?? false
  })

  // ---------- 建造（放置模式，docs/04 §2） ----------
  /** 选择面板：选中类型进入放置模式；再点同款 = 取消 */
  function startPlacing(type: NodeTypeId): void {
    placing.value = placing.value === type ? null : type
    pointer.value = null
    placingZone.value = null
  }

  function cancelPlacing(): void {
    placing.value = null
    pointer.value = null
    placingZone.value = null
  }

  /** 指针追踪（App 挂在 window mousemove 上）：只在放置模式更新，驱动虚影与落点预览 */
  function trackPointer(event: MouseEvent): void {
    if (!placing.value) return
    pointer.value = { x: event.clientX, y: event.clientY }
    placingZone.value = treeZoneAt(pointer.value)
  }

  /** 用当前指针重算落点（树区自动滚动后指针下的内容变了，视觉层每帧调用） */
  function refreshPlacingZone(): void {
    if (!placing.value || !pointer.value) return
    placingZone.value = treeZoneAt(pointer.value)
  }

  /**
   * 建造：消耗 `cost` 在 `owner` 列表的第 `at` 位放置一个该类型节点。
   * 资源不足 → 提示缺口，不建造（保持放置模式）。
   */
  function place(type: NodeTypeId, owner: NodeId | null, at: number): boolean {
    const def = registry.node(type)
    if (!def) return false
    const target = listOf(owner)
    if (!target) return false
    const paid = payCost(bag.value, def.cost)
    if (!paid) {
      const gap = costGap(bag.value, def.cost)
        .map(([item, count]) => `${registry.shortOf(item)}×${count.floor().toString()}`)
        .join(' ')
      setHint(`资源不足：还差 ${gap}`)
      return false
    }
    bag.value = paid
    const node = createNode(type)
    target.splice(Math.min(Math.max(at, 0), target.length), 0, node)
    afterStructureChange([owner, node.id])
    feedback.markAppearing(node.id)
    record(`建造 ${display.nameOf(node)}`)
    setHint(
      `建造 ${display.nameOf(node)} → ${owner === null ? '树根' : display.nameOf(index.get(owner) ?? node)}`,
    )
    return true
  }

  /** 按指针落点建造（放置模式的左键动作） */
  function placeAt(x: number, y: number): boolean {
    if (!placing.value) return false
    const zone = treeZoneAt({ x, y })
    if (!zone) return false // 指针不在树上：不建造（保持放置模式）
    return place(placing.value, zone.owner, zone.index)
  }

  /** 是否付得起某类型（选择面板的可用态） */
  function affordable(type: NodeTypeId): boolean {
    return canAfford(bag.value, registry.node(type)?.cost)
  }

  // ---------- 回收（× / 拖到侧栏）：返还 cost × 返还率（D-35） ----------
  /**
   * 回收：节点从树上移除（子节点上移）；**建造成本 × `config.recycleRate`**
   * （默认 30%，Decimal 精确折算，允许小数）逐项返还；箱子内容原样返还。
   */
  function recycle(id: NodeId): boolean {
    if (!parentOf.has(id)) return false
    const node = index.get(id)
    const owner = parentOf.get(id) ?? null
    const list = listOf(owner)
    if (!node || !list) return false
    const at = list.indexOf(node)
    if (at < 0) return false

    let next = bag.value
    let dropped = D(0)
    const refundText: string[] = []
    const give = (item: ItemId, count: Decimal): void => {
      const added = bagAdd(next, item, count, registry.config.bagCapacity)
      next = added.store
      dropped = dropped.add(added.rest)
    }
    for (const [item, count] of display.recyclePreview(node.type)) {
      give(item, count)
      refundText.push(`${registry.shortOf(item)}×${fmt(count)}`)
    }
    const contents = chestContents.value[id]
    if (contents) {
      for (const [item, count] of Object.entries(contents)) give(item, D(count))
    }

    list.splice(at, 1, ...node.children) // 子节点上移
    node.children = []
    node.folded = false
    bag.value = next
    if (contents) {
      const nextChests = { ...chestContents.value }
      delete nextChests[id]
      chestContents.value = nextChests
    }
    if (panel.value?.nodeId === id) panel.value = null
    afterStructureChange([owner])
    record(`回收 ${display.nameOf(node)}`)
    const rate = Math.round((registry.config.recycleRate ?? 0.3) * 100)
    const got = refundText.length > 0 ? refundText.join(' ') : '无'
    setHint(
      dropped.gt(0)
        ? `回收 ${display.nameOf(node)}（背包满，丢弃 ${dropped.floor().toString()}）`
        : `回收 ${display.nameOf(node)} → ${got}（${rate}% 返还）`,
    )
    return true
  }

  // ---------- 求值（`()` 表示 eval，D-30） ----------
  function evalNode(id: NodeId): EvalOutcome | null {
    const node = index.get(id)
    if (!node) return null
    // 带 panel 的节点（箱子等）：点击 = 打开浮动窗口，不做配方求值
    if (panelOf(node)) {
      openPanel(id)
      lastEval.value = `打开 ${display.nameOf(node)}`
      return null
    }
    // 手持 = 选中背包物品，作为隐式实参参与被点节点的签名检测
    const outcome = engineEvalNode(node, world, { held: heldItem.value })
    lastEval.value = display.describeEval(node, outcome)
    if (outcome.effective) {
      feedback.pulse([node.id])
      record(`eval ${display.nameOf(node)}`)
    }
    return outcome
  }

  /**
   * chip 左键（docs/02 §1，D-30）：放置模式 = 建造；否则**仅当节点构成表达式
   * （有实参/函数/根层，即渲染括号的那些）才 eval**；裸符号实参点击没有效果。
   */
  function chipClick(id: NodeId, event?: MouseEvent): void {
    if (placing.value && event) {
      event.stopPropagation() // 别再冒泡给树区点击（会重复建造）
      placeAt(event.clientX, event.clientY)
      return
    }
    if (headsExpression(id)) evalNode(id)
  }

  /** 节点是否自己构成一个表达式（= 渲染括号 → 可点击 eval）：有实参 / 函数 / 根层 */
  function headsExpression(id: NodeId): boolean {
    const node = index.get(id)
    if (!node) return false
    if (node.children.length > 0) return true
    if (registry.recipesFor(node.type).length > 0) return true // 函数：`( f )`
    return (parentOf.get(id) ?? null) === null // 根层落单节点也包 `()`
  }

  // ---------- 拖拽（树内移动 / 拖到侧栏回收） ----------
  /**
   * 拖拽落位的**唯一入口**：
   * - 指针落在侧栏（选择面板/背包）= 回收；
   * - 落点以 SortableJS plan 为准（真实浏览器里可靠）；仅当 plan 退回源列表
   *   （跨列表 drop 被取消的征兆）而指针在别的列表上时，才用指针落点兜底（D-29）；
   * - 读不出意图 → 请求重建树视图（DOM 回到模型这一侧）。
   */
  function handleDrop(evt: DragEndLike): void {
    dragging.value = false
    const plan = readDrop(evt)
    if (!plan) {
      requestTreeRebuild()
      return
    }
    if (pointerOverSidebar(evt)) {
      recycle(plan.from.node)
      return
    }
    const zone = plan.to.owner === plan.from.owner ? (treeZoneAt(evt) ?? plan.to) : plan.to
    const to = zone.owner !== plan.from.owner ? zone : plan.to
    if (!moveTreeNode(plan.from.node, plan.from.owner, to.owner, to.index)) {
      requestTreeRebuild()
    }
  }

  // ---------- 背包与箱子（物品表，无槽位不拖拽） ----------
  /** 背包行左键：开箱时 = 转 1 个进箱子；否则 = 选中（手持，再点同款取消） */
  function itemRowClick(item: ItemId): void {
    if (panel.value) {
      transferToChest(item)
      return
    }
    selectedItem.value = selectedItem.value === item ? null : item
  }

  /** 背包行双击：开箱时 = 整项转进箱子 */
  function itemRowDouble(item: ItemId): void {
    if (panel.value) transferToChest(item, true)
  }

  /** 箱子行：单击/滚轮 = 转 1 个回背包；双击 = 整项转回 */
  function chestRowClick(item: ItemId): void {
    transferFromChest(item)
  }

  function chestRowDouble(item: ItemId): void {
    transferFromChest(item, true)
  }

  /** 背包 → 箱子：转移 1 个（all = 整项）；容量不够就转能装下的部分 */
  function transferToChest(item: ItemId, all = false): boolean {
    const bound = panel.value
    if (!bound) return false
    const have = bag.value[item]
    if (!have || have.lte(0)) return false
    const move = all ? have : D(1)
    const chest = chestContents.value[bound.nodeId] ?? {}
    const added = bagAdd(chest, item, move, registry.config.chestCapacity)
    if (added.rest.gte(move)) {
      setHint('箱子已满')
      return false
    }
    bag.value = bagTake(bag.value, item, move.sub(added.rest)).store
    chestContents.value = { ...chestContents.value, [bound.nodeId]: added.store }
    record(`存入 ${display.itemName(item)}`, true)
    return true
  }

  /** 箱子 → 背包：转移 1 个（all = 整项）；容量不够就转能装下的部分 */
  function transferFromChest(item: ItemId, all = false): boolean {
    const bound = panel.value
    if (!bound) return false
    const chest = chestContents.value[bound.nodeId]
    const have = chest?.[item]
    if (!have || have.lte(0)) return false
    const move = all ? have : D(1)
    const added = bagAdd(bag.value, item, move, registry.config.bagCapacity)
    if (added.rest.gte(move)) {
      setHint('背包已满')
      return false
    }
    const taken = bagTake(chest, item, move.sub(added.rest))
    bag.value = added.store
    chestContents.value = { ...chestContents.value, [bound.nodeId]: taken.store }
    record(`取出 ${display.itemName(item)}`, true)
    return true
  }

  // ---------- 箱子（带内容的特殊节点） ----------
  /** 该节点是否可点开浮动窗口；返回面板 id 或 null */
  function panelOf(node: GameNode): string | null {
    return registry.node(node.type)?.panel ?? null
  }

  function openPanel(nodeId: NodeId): boolean {
    const node = index.get(nodeId)
    if (!node || !panelOf(node)) return false
    cancelPlacing() // 面板打开时树被锁定，放置模式没有意义
    if (!chestContents.value[nodeId]) {
      chestContents.value = { ...chestContents.value, [nodeId]: {} }
    }
    panel.value = { kind: 'storage', nodeId }
    return true
  }

  function closePanel(): void {
    panel.value = null
  }

  // ---------- 树视图自愈 ----------
  // 拖拽落位被拒 / 落在无法解释的位置时 +1，让 Vue 从模型整体重建树 DOM
  const renderVersion = ref(0)

  function requestTreeRebuild(): void {
    renderVersion.value += 1
  }

  function setDragging(value: boolean): void {
    dragging.value = value
  }

  // ---------- 存档（docs/01 §8 / docs/05 §6） ----------
  function storageArea(): Storage | null {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage
    } catch {
      return null
    }
  }

  /** 当前局面序列化为 JSON 文本（纯函数式：不触碰存储，便于测试/导出） */
  function dump(): string {
    return JSON.stringify(
      serialize(
        { roots: roots.value, bag: bag.value, chestContents: chestContents.value },
        Date.now(),
      ),
    )
  }

  /** 从 JSON 文本读档；成功返回 true；读档会重建历史 */
  function loadFrom(raw: string | null): boolean {
    if (!raw) return false
    if (!applySnapshot(raw)) return false
    resetHistory('读档')
    return true
  }

  function saveGame(): void {
    const area = storageArea()
    if (!area) return
    try {
      area.setItem(SAVE_KEY, dump())
    } catch (error) {
      console.warn('[minode] 存档写入失败', error)
    }
  }

  /** 读档；无档/失败 → 保持现状（启动路径会补起始局面） */
  function loadGame(): boolean {
    return loadFrom(storageArea()?.getItem(SAVE_KEY) ?? null)
  }

  // ---------- 示例局面（调试 / 起始；内容在 content/demo.ts） ----------
  function spawnDemo(): void {
    roots.value.push(...buildDemoRoots())
    afterStructureChange()
    setAllFolded(false)
    // 默认只展开前 2 层：更深的子树以 +N 徽标折叠（D-28）
    const foldDeep = (list: readonly GameNode[], depth: number): void => {
      for (const node of list) {
        if (node.children.length > 0 && depth > FOLD_DEPTH) node.folded = true
        foldDeep(node.children, depth + 1)
      }
    }
    foldDeep(roots.value, 1)
    record('示例树')
  }

  function spawnStress(count: number): void {
    roots.value.push(...buildStressRoots(count))
    afterStructureChange()
    record('压力树')
  }

  function grantStarter(): void {
    for (const [item, count] of starterSeeds()) gain(item, count)
    record('起始物资')
  }

  function reset(): void {
    roots.value = []
    bag.value = {}
    chestContents.value = {}
    panel.value = null
    selectedItem.value = null
    cancelPlacing()
    feedback.clearAll()
    lastEval.value = ''
    spawnDemo()
    grantStarter()
    resetHistory('重置')
  }

  // 启动：优先读档；无档/损坏 → 起始局面，然后建立 undo 树
  if (!loadGame()) {
    spawnDemo()
    grantStarter()
    resetHistory('初始')
  }

  return {
    registry,
    // 状态
    roots,
    bag,
    chestContents,
    panel,
    selectedItem,
    heldItem,
    placing,
    pointer,
    placingZone,
    dragging,
    renderVersion,
    lastEval,
    palette,
    historySteps,
    canUndo,
    canRedo,
    // 求值与点击
    evalNode,
    chipClick,
    headsExpression,
    // 建造（放置模式）
    startPlacing,
    cancelPlacing,
    trackPointer,
    refreshPlacingZone,
    place,
    placeAt,
    affordable,
    // 回收
    recycle,
    // 树结构
    setChildren,
    setRoots,
    toggleFold,
    setAllFolded,
    moveTreeNode,
    handleDrop,
    afterStructureChange,
    requestTreeRebuild,
    setDragging,
    setHover,
    // 背包与箱子
    itemRowClick,
    itemRowDouble,
    chestRowClick,
    chestRowDouble,
    transferToChest,
    transferFromChest,
    // 浮动窗口
    panelOf,
    openPanel,
    closePanel,
    // 历史与存档
    undo,
    redo,
    jumpTo,
    dump,
    loadFrom,
    saveGame,
    loadGame,
    // 调试
    spawnDemo,
    spawnStress,
    grantStarter,
    reset,
    // 展示（stores/display.ts）与瞬态反馈（stores/feedback.ts）
    ...display,
    // retOf/isHeldHint 绑定手持（D-34）：heldItem 变化 → 全树预测产物提示自动刷新
    retOf: (node: GameNode) => display.retOf(node, heldItem.value),
    isHeldHint: (node: GameNode) => display.isHeldHint(node, heldItem.value),
    hint: feedback.hint,
    setHint: feedback.setHint,
    isPulsing: feedback.isPulsing,
    isHoveredParent: feedback.isHoveredParent,
    setParenPair: feedback.setParenPair,
    isParenMatched: feedback.isParenMatched,
    isAppearing: feedback.isAppearing,
  }
})
