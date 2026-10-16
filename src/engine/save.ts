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

/** 旧堆条目（v3 的节点背包/箱子；count 为字符串）。 */
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
 * v3 存档迁移到 v4；更早的 v1/v2 时代格式已随 D-36 移除（读档失败 → 保持现状）。
 */
export function deserialize(save: SaveV3 | SaveV4, registry: NodeRegistry): GameSnapshot {
  if (save.v !== 3 && save.v !== 4) {
    throw new Error(`未知存档版本: ${String((save as { v?: number }).v)}`)
  }
  const v4 = save.v === 4 ? (save as SaveV4) : migrateV3(save as SaveV3, registry)

  const chestContents: Record<NodeId, ItemStore> = {}
  const roots = v4.roots.map((node) => deserializeNode(node, chestContents, registry))
  normalizeTree(roots, registry)

  return { roots, bag: parseItems(v4.bag), chestContents }
}
