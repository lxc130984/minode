import type { GameNode, NodeTypeId } from './types'

let counter = 0

/** 运行时节点 id；不入存档（加载时重建）。 */
export function newNodeId(): string {
  counter += 1
  return `n${counter.toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

export function createNode(type: NodeTypeId, children: GameNode[] = []): GameNode {
  return {
    id: newNodeId(),
    type,
    children,
    folded: false,
    ret: { kind: 'none' },
  }
}

/** 先序查找（含自身）。 */
export function findNode(roots: readonly GameNode[], id: string): GameNode | undefined {
  const stack: GameNode[] = [...roots]
  while (stack.length > 0) {
    const node = stack.pop()
    if (!node) continue
    if (node.id === id) return node
    stack.push(...node.children)
  }
  return undefined
}

export function subtreeSize(node: GameNode): number {
  let size = 0
  const stack: GameNode[] = [...node.children]
  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) continue
    size += 1
    stack.push(...current.children)
  }
  return size
}

/** 子树是否包含目标 id（用于防环校验）。 */
export function subtreeContains(node: GameNode, id: string): boolean {
  if (node.id === id) return true
  return node.children.some((child) => subtreeContains(child, id))
}
