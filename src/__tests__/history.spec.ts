import { describe, expect, it } from 'vite-plus/test'

import { UndoTree } from '@/engine/history'

describe('undo 树', () => {
  it('线性历史：record / undo / redo', () => {
    const tree = new UndoTree('A', '初始', 1)
    expect(tree.canUndo()).toBe(false)
    expect(tree.canRedo()).toBe(false)
    expect(tree.entry?.snapshot).toBe('A')

    expect(tree.record('B', '第一步', 2)).toBe(true)
    expect(tree.record('C', '第二步', 3)).toBe(true)
    expect(tree.entry?.snapshot).toBe('C')
    expect(tree.canUndo()).toBe(true)
    expect(tree.canRedo()).toBe(false)

    expect(tree.undo()?.snapshot).toBe('B')
    expect(tree.undo()?.snapshot).toBe('A')
    expect(tree.undo()).toBeUndefined() // 已到根
    expect(tree.canUndo()).toBe(false)

    expect(tree.redo()?.snapshot).toBe('B') // 默认走最近记录的子节点
    expect(tree.redo()?.snapshot).toBe('C')
    expect(tree.redo()).toBeUndefined()
  })

  it('去重：局面没变就不记录', () => {
    const tree = new UndoTree('A', '初始', 1)
    expect(tree.record('A', '无变化', 2)).toBe(false)
    expect(tree.size).toBe(1)
  })

  it('分叉：撤销后再操作形成分支，可自由穿梭', () => {
    const tree = new UndoTree('A', '初始', 1)
    tree.record('B', '第一条', 2)
    tree.record('C', '第二条', 3)

    tree.undo() // 回到 B
    tree.record('D', '分叉', 4)
    tree.undo() // 回到分叉点 B：此时 B 有两个未来
    expect(tree.branches().map((entry) => entry.snapshot)).toEqual(['C', 'D'])

    const first = tree.branches()[0]
    if (!first) throw new Error('分支缺失')
    tree.jump(first.id)
    expect(tree.entry?.snapshot).toBe('C')
    expect(tree.path().map((entry) => entry.snapshot)).toEqual(['A', 'B', 'C'])
    expect(tree.steps().branches).toHaveLength(0) // C 没有更远的未来
  })

  it('amend：合并连续记录（一次拖拽的多次回写 → 一步）', () => {
    const tree = new UndoTree('A', '初始', 1)
    tree.record('B', '拖拽', 2)
    expect(tree.amend('B2', 3)).toBe(true)
    expect(tree.entry?.snapshot).toBe('B2')
    expect(tree.size).toBe(2)
    expect(tree.undo()?.snapshot).toBe('A') // 仍只占一步
    expect(tree.amend('X', 4)).toBe(false) // 根节点不可改写
  })

  it('容量上限：丢弃「不在当前路径上」的最旧叶子', () => {
    const tree = new UndoTree('root', '初始', 0)
    for (let index = 0; index < 320; index += 1) {
      tree.undo() // 回到根，制造分叉
      tree.record(`s${index}`, `分支${index}`, index + 1)
    }
    expect(tree.size).toBeLessThanOrEqual(300)
    tree.undo()
    const labels = tree.branches().map((entry) => entry.label)
    expect(labels.length).toBeLessThanOrEqual(299)
    expect(labels).not.toContain('分支0') // 最旧的叶子被丢弃
    expect(labels).toContain('分支319') // 最新的还在
    expect(tree.path().map((entry) => entry.snapshot)).toEqual(['root'])
  })
})
