/**
 * 节点树的纯函数工具:查找、删除、遍历、祖先判定。
 */
import type { GameNode } from "./types"

export interface NodeHit {
  node: GameNode
  parent: GameNode | null
  index: number
}

/** 深度优先查找节点 */
export function findNode(nodes: GameNode[], id: string): NodeHit | null {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    if (node.id === id) return { node, parent: null, index: i }
    const hit = findNode(node.children, id)
    if (hit) {
      if (hit.parent === null && hit.node.id === id) {
        return { node: hit.node, parent: node, index: hit.index }
      }
      return hit
    }
  }
  return null
}

/** 从树中移除节点(连同其子树),返回被移除的节点 */
export function removeNode(nodes: GameNode[], id: string): GameNode | null {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) return nodes.splice(i, 1)[0] ?? null
    const removed = removeNode(nodes[i].children, id)
    if (removed) return removed
  }
  return null
}

/** ancestorId 是否是 maybeDescendantId 的祖先(或自身) */
export function isAncestorOf(nodes: GameNode[], ancestorId: string, maybeDescendantId: string): boolean {
  if (ancestorId === maybeDescendantId) return true
  const hit = findNode(nodes, ancestorId)
  if (!hit) return false
  return !!findNode(hit.node.children, maybeDescendantId)
}

/** 遍历所有节点 */
export function walkNodes(nodes: GameNode[], fn: (node: GameNode, parent: GameNode | null) => void) {
  for (const node of nodes) {
    fn(node, null)
    walkNodes(node.children, fn)
  }
}

/** 统计节点总数 */
export function countNodes(nodes: GameNode[]): number {
  let n = 0
  walkNodes(nodes, () => n++)
  return n
}

/** 树中是否存在某类型(含子树) */
export function hasType(nodes: GameNode[], type: string): boolean {
  return nodes.some((n) => n.type === type || hasType(n.children, type))
}
