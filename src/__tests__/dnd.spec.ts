import { describe, expect, it } from 'vite-plus/test'

import { guardCycle } from '@/engine/dnd'

interface StubNode {
  id: string
  children: StubNode[]
  contains(el: unknown): boolean
}

function stubNode(id: string, children: StubNode[] = []): StubNode {
  return {
    id,
    children,
    contains(el: unknown): boolean {
      if (el === this) return true
      return this.children.some((child) => child.contains(el))
    },
  }
}

describe('拖拽守卫', () => {
  it('目标列表在被拖节点子树内 → 拒绝', () => {
    const outer = stubNode('outer')
    const inner = stubNode('inner')
    const target = stubNode('target')
    inner.children.push(target)
    outer.children.push(inner)

    expect(guardCycle({ dragged: outer, to: target })).toBe(false)
    // 拖进祖先的列表是合法移动（守卫只拒绝「目标在自己的后代里」）
    expect(guardCycle({ dragged: inner, to: outer })).toBe(true)
  })

  it('子树外的目标 → 允许', () => {
    const dragged = stubNode('dragged')
    const other = stubNode('other')
    expect(guardCycle({ dragged, to: other })).toBe(true)
  })
})
