export interface HistoryEntry {
  id: number
  parent: number | null
  children: number[]
  /** 这次变更的简短标签（UI 展示） */
  label: string
  at: number
  /** 该节点的局面快照（`serialize` 后的 JSON 文本） */
  snapshot: string
}

export interface HistoryStep {
  id: number
  label: string
  at: number
  current: boolean
}

const MAX_ENTRIES = 300

/**
 * undo 树（docs/07 §4.4）：每个节点是一次**完整局面快照**，`current` 指向当前局面。
 *
 * - `record`：从 current 长出一个新节点（同一局面不重复记录）——
 *   在历史中间做新操作不会抹掉原有分支，而是**分叉**，这就是 undo 树；
 * - `undo` = 回父节点；`redo` = 走回某个子节点（默认最近的一个）；
 * - `jump` = 自由穿梭到任意节点；
 * - 容量上限：超出时丢弃「不在当前路径上」的最旧叶子，保证可达骨架不被破坏。
 *
 * 纯逻辑、零框架依赖：局面用 `engine/save.ts` 的 `serialize`/`deserialize` 往返。
 */
export class UndoTree {
  private entries = new Map<number, HistoryEntry>()
  private nextId = 0
  current: number

  constructor(initialSnapshot: string, label = '初始', at = 0) {
    this.current = this.append(null, initialSnapshot, label, at)
  }

  private append(parent: number | null, snapshot: string, label: string, at: number): number {
    const id = this.nextId
    this.nextId += 1
    this.entries.set(id, { id, parent, children: [], label, at, snapshot })
    if (parent !== null) this.entries.get(parent)?.children.push(id)
    this.prune()
    return id
  }

  /** 记录一次新局面；与当前快照相同则忽略并返回 false */
  record(snapshot: string, label: string, at: number): boolean {
    const currentEntry = this.entry
    if (currentEntry && currentEntry.snapshot === snapshot) return false
    this.current = this.append(this.current, snapshot, label, at)
    return true
  }

  get entry(): HistoryEntry | undefined {
    return this.entries.get(this.current)
  }

  get size(): number {
    return this.entries.size
  }

  /** 根 → 当前的完整路径（含当前） */
  path(): HistoryEntry[] {
    const path: HistoryEntry[] = []
    let cursor: number | null = this.current
    while (cursor !== null) {
      const entry: HistoryEntry | undefined = this.entries.get(cursor)
      if (!entry) break
      path.push(entry)
      cursor = entry.parent
    }
    return path.reverse()
  }

  /** 当前节点的小孩（可重做的分支），按记录顺序 */
  branches(): HistoryEntry[] {
    const currentEntry = this.entry
    if (!currentEntry) return []
    return currentEntry.children
      .map((id) => this.entries.get(id))
      .filter((entry): entry is HistoryEntry => entry !== undefined)
  }

  canUndo(): boolean {
    return this.entry?.parent != null
  }

  canRedo(): boolean {
    return this.branches().length > 0
  }

  /** 回到父节点（撤销） */
  undo(): HistoryEntry | undefined {
    const currentEntry = this.entry
    if (!currentEntry || currentEntry.parent === null) return undefined
    this.current = currentEntry.parent
    return this.entry
  }

  /** 走回最近记录的子节点（重做）；可用 `jump` 选择其它分支 */
  redo(): HistoryEntry | undefined {
    const branch = this.branches().at(-1)
    if (!branch) return undefined
    this.current = branch.id
    return branch
  }

  /** 自由穿梭到任意节点 */
  jump(id: number): HistoryEntry | undefined {
    const entry = this.entries.get(id)
    if (!entry) return undefined
    this.current = id
    return entry
  }

  /**
   * 把当前节点改写成新局面（合并「同一次拖拽的多次回写」这类连续记录）。
   * 初始节点（没有父节点）不参与改写。
   */
  amend(snapshot: string, at: number): boolean {
    const entry = this.entry
    if (!entry || entry.parent === null) return false
    entry.snapshot = snapshot
    entry.at = at
    return true
  }

  /** 把当前路径与各分支整理成 UI 可直接渲染的形状 */
  steps(): { path: HistoryStep[]; branches: HistoryStep[] } {
    const toStep = (entry: HistoryEntry): HistoryStep => ({
      id: entry.id,
      label: entry.label,
      at: entry.at,
      current: entry.id === this.current,
    })
    return { path: this.path().map(toStep), branches: this.branches().map(toStep) }
  }

  /** 丢弃「不在当前路径上」的最旧叶子，直到回到容量内 */
  private prune(): void {
    while (this.entries.size > MAX_ENTRIES) {
      const onPath = new Set(this.path().map((entry) => entry.id))
      let victim: HistoryEntry | undefined
      for (const entry of this.entries.values()) {
        if (onPath.has(entry.id) || entry.children.length > 0) continue
        if (!victim || entry.at < victim.at || (entry.at === victim.at && entry.id < victim.id)) {
          victim = entry
        }
      }
      if (!victim) break
      this.entries.delete(victim.id)
      const parent = victim.parent === null ? undefined : this.entries.get(victim.parent)
      if (parent) parent.children = parent.children.filter((childId) => childId !== victim.id)
    }
  }
}
