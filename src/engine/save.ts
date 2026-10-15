import { createNode } from './node'
import { normalizeTree } from './normalize'
import { D, type Decimal } from './num'
import type { NodeRegistry } from './registry'
import type { GameNode, ItemId, ItemStore, NodeId } from './types'

export const SAVE_VERSION = 4
export const SAVE_KEY = 'minode-beta/save'

/** 物品入档：id → 数量字符串（纯 JSON 可序列化）。 */
export type SaveItems = Record<string, string>

export interface SaveNode {
  type: string
  /** 折叠态；线上字段名沿用 collapsed（docs/10 §5），运行时叫 folded */
  collapsed: boolean
  children: SaveNode[]
  /** 箱子等「带内容的节点」：物品表（v3 及以前是节点堆数组，迁移时转换）；非容器节点省略 */
  chest?: SaveItems
}

export interface SaveV4 {
  v: 4
  savedAt: number
  roots: SaveNode[]
  bag: SaveItems
}

// ---------- 旧版本（仅用于迁移） ----------

/** 旧堆条目（v1-v3 的节点背包/箱子；count 为字符串）。 */
export interface SaveStack {
  type: string
  count: string
}

export interface SaveV3 {
  v: 3
  savedAt: number
  roots: (Omit<SaveNode, 'chest'> & { chest?: (SaveStack | null)[] })[]
  nodeBag: (SaveStack | null)[]
  resources: Record<string, string>
  selected: number
}

/** v2 存档：节点背包是 `LegacySaveNode` 实例列表（无堆、无容器）。 */
export interface SaveV2 {
  v: 2
  savedAt: number
  roots: LegacySaveNode[]
  nodeBag: (LegacySaveNode | null)[]
  resources: Record<string, string>
  selected: number
}

/** v1 槽位条目（旧「物品」概念，仅用于迁移）。 */
export interface StackSave {
  item: string
  count: string
}

/** v1/v2 时代的节点条目（还没有 chest 字段）。 */
export type LegacySaveNode = Omit<SaveNode, 'chest'>

/** v1 存档（旧的 hotbar/inventory 槽位模型）。 */
export interface SaveV1 {
  v: number
  savedAt: number
  roots: LegacySaveNode[]
  inventory: (StackSave | null)[]
  hotbar: (StackSave | null)[]
  selected: number
}

export interface GameSnapshot {
  roots: GameNode[]
  bag: ItemStore
  /** 箱子内容：运行时按节点 id 索引（存档不落 id，加载时重建） */
  chestContents: Record<NodeId, ItemStore>
}

// ---------- 序列化 ----------

function serializeItems(store: ItemStore): SaveItems {
  const out: SaveItems = {}
  for (const [id, count] of Object.entries(store)) out[id] = count.toString()
  return out
}

function serializeNode(node: GameNode, chests: Record<NodeId, ItemStore>): SaveNode {
  const save: SaveNode = {
    type: node.type,
    collapsed: node.folded,
    children: node.children.map((child) => serializeNode(child, chests)),
  }
  const chest = chests[node.id]
  if (chest && Object.keys(chest).length > 0) save.chest = serializeItems(chest)
  return save
}

export function serialize(state: GameSnapshot, savedAt: number): SaveV4 {
  return {
    v: SAVE_VERSION,
    savedAt,
    roots: state.roots.map((node) => serializeNode(node, state.chestContents)),
    bag: serializeItems(state.bag),
  }
}

// ---------- 反序列化与迁移 ----------

/** v3 及以前的节点堆 → 物品表：物品直接进；节点类型按其建造成本折算（保价值）；未知丢弃。 */
function stacksToItems(
  stacks: readonly (SaveStack | null)[] | undefined,
  registry: NodeRegistry,
): SaveItems {
  const out: SaveItems = {}
  const add = (item: string, count: Decimal): void => {
    if (count.lte(0)) return
    out[item] = D(out[item] ?? 0)
      .add(count)
      .toString()
  }
  for (const slot of stacks ?? []) {
    if (!slot) continue
    const count = D(slot.count)
    if (registry.item(slot.type)) {
      add(slot.type, count)
      continue
    }
    const def = registry.node(slot.type)
    if (def) {
      for (const cost of def.cost ?? []) add(cost.item, D(cost.count ?? 1).mul(count))
    }
    // 未知 id：丢弃（内容包已删）
  }
  return out
}

function deserializeNode(
  save: SaveNode,
  chests: Record<NodeId, ItemStore>,
  registry: NodeRegistry,
): GameNode {
  const node = createNode(save.type)
  node.folded = save.collapsed
  node.children = save.children.map((child) => deserializeNode(child, chests, registry))
  if (save.chest) {
    // v4：chest 已经是物品表；v3 及以前是节点堆数组（按成本折算迁移）
    chests[node.id] = Array.isArray(save.chest)
      ? parseItems(stacksToItems(save.chest as unknown as (SaveStack | null)[], registry))
      : parseItems(save.chest)
  }
  return node
}

function parseItems(raw: SaveItems): ItemStore {
  const store: Record<ItemId, Decimal> = {}
  for (const [id, count] of Object.entries(raw)) {
    const value = D(count)
    if (value.gt(0)) store[id] = value
  }
  return store
}

/** v1 → v2：旧 `{item, count}` 槽位按注册表分流（节点类型 → nodeBag，其余 → resources）。 */
function migrateV1(save: SaveV1, registry: NodeRegistry): SaveV2 {
  const nodeBag: (LegacySaveNode | null)[] = []
  const resources: Record<string, string> = {}
  const limit = 27

  const absorb = (slot: StackSave): void => {
    const count = D(slot.count)
    if (count.lte(0)) return
    if (registry.node(slot.item)) {
      let remaining = count.floor()
      while (remaining.gt(0) && nodeBag.length < limit) {
        nodeBag.push({ type: slot.item, collapsed: false, children: [] })
        remaining = remaining.sub(1)
      }
      if (remaining.gt(0)) {
        console.warn(`存档迁移：节点背包已满，丢弃 ${remaining.toString()} 个 ${slot.item}`)
      }
      return
    }
    resources[slot.item] = D(resources[slot.item] ?? 0)
      .add(count)
      .toString()
  }

  for (const slot of [...(save.hotbar ?? []), ...(save.inventory ?? [])]) {
    if (slot) absorb(slot)
  }

  return {
    v: 2,
    savedAt: save.savedAt,
    roots: save.roots,
    nodeBag,
    resources,
    selected: save.selected ?? 0,
  }
}

/** v2 → v3：背包节点实例按 type 合并成堆。 */
function migrateV2(save: SaveV2): SaveV3 {
  const limit = 64
  const totals = new Map<string, Decimal>()
  for (const slot of save.nodeBag) {
    if (!slot) continue
    totals.set(slot.type, (totals.get(slot.type) ?? D(0)).add(1))
  }
  const nodeBag: (SaveStack | null)[] = []
  for (const [type, total] of totals) {
    let rest = total
    while (rest.gt(0)) {
      const take = rest.lt(limit) ? rest : D(limit)
      nodeBag.push({ type, count: take.toString() })
      rest = rest.sub(take)
    }
  }
  return {
    v: 3,
    savedAt: save.savedAt,
    roots: save.roots,
    nodeBag,
    resources: save.resources,
    selected: save.selected ?? 0,
  }
}

/** v3 → v4：节点背包堆 + resources 合并成物品背包（节点堆按建造成本折算）。 */
function migrateV3(save: SaveV3, registry: NodeRegistry): SaveV4 {
  const bag: SaveItems = { ...save.resources }
  for (const [item, count] of Object.entries(stacksToItems(save.nodeBag, registry))) {
    bag[item] = D(bag[item] ?? 0)
      .add(D(count))
      .toString()
  }
  // v3 的 roots 里 chest 还是堆数组；deserializeNode 对新旧两种形状都兼容（按数组判断）
  return { v: 4, savedAt: save.savedAt, roots: save.roots as unknown as SaveNode[], bag }
}

/**
 * 反序列化：节点 id 重建、返回值由 normalizeTree 重算；
 * 未知内容 id 原样保留（渲染为 `?`，见 docs/01 §8）。
 * v1/v2/v3 存档按链式迁移到 v4。
 */
export function deserialize(
  save: SaveV1 | SaveV2 | SaveV3 | SaveV4,
  registry: NodeRegistry,
): GameSnapshot {
  const v4 =
    save.v === 4
      ? (save as SaveV4)
      : save.v === 3
        ? migrateV3(save as SaveV3, registry)
        : save.v === 2
          ? migrateV3(migrateV2(save as SaveV2), registry)
          : migrateV3(migrateV2(migrateV1(save as SaveV1, registry)), registry)

  const chestContents: Record<NodeId, ItemStore> = {}
  const roots = v4.roots.map((node) => deserializeNode(node, chestContents, registry))
  normalizeTree(roots, registry)

  return { roots, bag: parseItems(v4.bag), chestContents }
}
