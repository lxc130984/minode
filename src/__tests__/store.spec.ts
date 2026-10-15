import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vite-plus/test'

import { D } from '@/engine/num'
import type { GameNode } from '@/engine/types'
import { useGameStore } from '@/stores/game'

function freshStore() {
  setActivePinia(createPinia())
  const store = useGameStore()
  store.reset()
  return store
}

type Store = ReturnType<typeof freshStore>

/** 背包里某物品的数量 */
function held(store: Store, id: string): number {
  return store.bag[id]?.toNumber() ?? 0
}

/** 先序找第一个该类型的节点（测试用，避免写死路径） */
function findFirst(store: Store, type: string) {
  const stack = [...store.roots]
  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) continue
    if (current.type === type) return current
    stack.push(...current.children)
  }
  return undefined
}

describe('store 集成：点击求值（产出物品进背包）', () => {
  it('点击矿井：产出物品进背包；符号无响应', () => {
    const store = freshStore()
    const mine = store.roots[0]
    if (!mine) throw new Error('起始局面缺失')

    const before = held(store, 'iron_ore')
    expect(store.evalNode(mine.id)?.effective).toBe(true)
    expect(held(store, 'iron_ore')).toBe(before + 1)
    expect(store.lastEval).toBe('矿井 → 铁矿×1')

    const symbol = mine.children[0]
    if (!symbol) throw new Error('结构缺失')
    expect(store.evalNode(symbol.id)?.recipe).toBeUndefined()
    expect(held(store, 'iron_ore')).toBe(before + 1)
  })

  it('点击冶炼炉：产出铁进背包', () => {
    const store = freshStore()
    const smelter = findFirst(store, 'smelter')
    if (!smelter) throw new Error('工厂结构缺失')
    const before = held(store, 'iron')
    store.evalNode(smelter.id)
    expect(held(store, 'iron')).toBe(before + 1)
    expect(store.lastEval).toContain('铁×1')
  })

  it('函数实参不符：[?] 且点击无产出', () => {
    const store = freshStore()
    const smelter = findFirst(store, 'smelter')
    if (!smelter) throw new Error('结构缺失')
    store.setChildren(smelter.id, [])
    expect(smelter.ret.kind).toBe('unresolved')
    expect(store.retOf(smelter)).toBe('?')
    const before = held(store, 'iron')
    expect(store.evalNode(smelter.id)?.effective).toBe(false)
    expect(held(store, 'iron')).toBe(before)
  })

  it('手持 = 选中背包物品：手持斧头点森林 → 木材（隐式实参）', () => {
    const store = freshStore()
    const forest = findFirst(store, 'forest')
    if (!forest) throw new Error('森林缺失')
    expect(store.retOf(forest)).toBe('?') // 静态值不含手持

    expect(held(store, 'axe')).toBeGreaterThanOrEqual(1)
    store.itemRowClick('axe') // 选中为手持
    expect(store.heldItem).toBe('axe')

    const before = held(store, 'wood')
    expect(store.evalNode(forest.id)?.effective).toBe(true)
    expect(held(store, 'wood')).toBe(before + 1)
    expect(store.lastEval).toContain('木×1')

    store.itemRowClick('axe') // 再点同款 = 取消手持
    expect(store.heldItem).toBeNull()
  })
})

describe('store 集成：建造（放置模式，消耗物品）', () => {
  it('place：扣成本、按位置插入；成本不够 → 拒绝并提示缺口', () => {
    const store = freshStore()
    store.bag = { ...store.bag, iron_ore: D(4), coal: D(2) }
    const rootsBefore = store.roots.length

    expect(store.place('smelter', null, store.roots.length)).toBe(true)
    expect(store.roots).toHaveLength(rootsBefore + 1)
    expect(store.roots.at(-1)?.type).toBe('smelter')
    expect(held(store, 'iron_ore')).toBe(0)
    expect(held(store, 'coal')).toBe(0)
    expect(store.hint).toContain('建造')

    // 没钱再建
    expect(store.place('smelter', null, 0)).toBe(false)
    expect(store.roots).toHaveLength(rootsBefore + 1)
    expect(store.hint).toContain('资源不足')
  })

  it('放置模式：startPlacing 切换与取消；affordable 随背包变化', () => {
    const store = freshStore()
    store.bag = { ...store.bag, iron_ore: D(4), coal: D(2) }
    expect(store.placing).toBeNull()

    store.startPlacing('smelter')
    expect(store.placing).toBe('smelter')
    expect(store.affordable('smelter')).toBe(true)

    store.startPlacing('smelter') // 再点同款 = 取消
    expect(store.placing).toBeNull()

    store.startPlacing('engine_plant')
    expect(store.placing).toBe('engine_plant')
    expect(store.affordable('engine_plant')).toBe(false)
    store.cancelPlacing()
    expect(store.placing).toBeNull()
  })

  it('建造插入指定位置：作为某节点的实参插入并刷新签名', () => {
    const store = freshStore()
    store.bag = { ...store.bag, oxygen: D(1) }
    const smelter = findFirst(store, 'smelter')
    if (!smelter) throw new Error('结构缺失')
    // 摘走氧气让链上变 [?]
    store.moveTreeNode(smelter.children[2]!.id, smelter.id, null, 0)
    expect(smelter.ret.kind).toBe('unresolved')

    expect(store.place('oxygen', smelter.id, 2)).toBe(true) // 放回实参位
    expect(smelter.children.map((child) => child.type)).toEqual(['iron_ore', 'coal', 'oxygen'])
    expect(smelter.ret.kind).toBe('value')
    expect(held(store, 'oxygen')).toBe(0)
  })

  it('回收：分解成原材料按 30% 返还，子节点上移', () => {
    const store = freshStore()
    // 4 矿 + 2 煤建炉，再 1 矿 + 1 煤 + 1 氧放三个实参
    store.bag = { ...store.bag, iron_ore: D(5), coal: D(3), oxygen: D(1) }
    store.place('smelter', null, store.roots.length)
    const smelter = store.roots.at(-1)
    if (!smelter) throw new Error('建造失败')
    store.place('iron_ore', smelter.id, 0)
    store.place('coal', smelter.id, 1)
    store.place('oxygen', smelter.id, 2)
    expect(smelter.ret.kind).toBe('value')
    expect(held(store, 'iron_ore')).toBe(0)

    expect(store.recycle(smelter.id)).toBe(true)
    expect(store.roots.some((root) => root.id === smelter.id)).toBe(false)
    // 成本（铁矿×4 煤×2，都是原材料）× 30% 向下取整：铁矿×1、煤×0；实参节点上移留在树上
    expect(held(store, 'iron_ore')).toBe(1)
    expect(held(store, 'coal')).toBe(0)
    expect(held(store, 'oxygen')).toBe(0)
    // 子节点（实参）上移到根层
    const kidTypes = store.roots.map((root) => root.type)
    expect(kidTypes).toContain('iron_ore')
    expect(kidTypes).toContain('coal')
    expect(kidTypes).toContain('oxygen')
    expect(store.hint).toContain('回收')
    expect(store.hint).toContain('30%')
  })

  it('回收箱子：成本沿配方分解成原材料（30%），内容原样返还', () => {
    const store = freshStore()
    store.bag = { ...store.bag, iron: D(4), coal: D(1) }
    store.place('chest', null, store.roots.length)
    const chest = store.roots.at(-1)
    if (!chest) throw new Error('建造失败')
    store.openPanel(chest.id)
    store.transferToChest('coal') // 1 个煤进箱子
    expect(held(store, 'coal')).toBe(0)

    store.closePanel()
    store.bag = { ...store.bag, iron: D(0) }
    expect(store.recycle(chest.id)).toBe(true)
    // 成本 iron×4 → 分解：iron ← 冶炼炉(铁矿+煤+氧)×4 = 铁矿4 煤4 氧4 → ×30% → 各×1；
    // 箱子内容（煤×1）是玩家存货，原样返还
    expect(held(store, 'iron')).toBe(0)
    expect(held(store, 'iron_ore')).toBe(12 + 1)
    expect(held(store, 'coal')).toBe(1 + 1)
    expect(held(store, 'oxygen')).toBe(6 + 1)
    expect(store.chestContents[chest.id]).toBeUndefined()
  })
})

describe('store 集成：折叠（纵向大纲，D-28）', () => {
  it('示例树默认只展开前 2 层；setAllFolded 全收/全开', () => {
    const store = freshStore()
    // 发动机厂(1) → 装配台(2) 展开；轧机(3) 起折叠
    const plant = findFirst(store, 'engine_plant')
    const assembler = findFirst(store, 'assembler')
    const mill = findFirst(store, 'rolling_mill')
    if (!plant || !assembler || !mill) throw new Error('结构缺失')
    expect(plant.folded).toBe(false)
    expect(assembler.folded).toBe(false)
    expect(mill.folded).toBe(true)

    store.setAllFolded(false)
    expect(mill.folded).toBe(false)
    store.setAllFolded(true)
    expect(plant.folded).toBe(true)
    expect(mill.folded).toBe(true)
  })

  it('拖拽把大子树落到深处时自动折叠', () => {
    const store = freshStore()
    store.setAllFolded(false)
    const plant = findFirst(store, 'engine_plant')
    const assembler = findFirst(store, 'assembler')
    if (!plant || !assembler) throw new Error('结构缺失')
    expect(assembler.children.length).toBeGreaterThan(0)

    // 把装配台（带整棵子树）拖到根层之下第 3 层：根(1) 装配台(2) …拖进装配台自己下面不行（环），
    // 改为拖到「矿井」的实参下面不现实 —— 用 place 建一个 3 层位置：矿井(1) → 铁矿石(2) 不行。
    // 直接验证 moveTreeNode 到深度 3：把装配台拖进发动机厂下面的锻炉(2)的子列表 → 深度 3
    const forge = findFirst(store, 'forge')
    if (!forge) throw new Error('结构缺失')
    expect(store.moveTreeNode(assembler.id, plant.id, forge.id, 0)).toBe(true)
    expect(assembler.folded).toBe(true) // 落到第 3 层 → 自动折叠
  })
})

describe('store 集成：背包与箱子（物品表）', () => {
  it('背包容量：超出部分丢弃且提示', () => {
    const store = freshStore()
    store.bag = { iron_ore: D(256) } // 已满（容量 256）
    const mine = store.roots[0]
    if (!mine) throw new Error('结构缺失')
    store.evalNode(mine.id) // +1 → 装不下
    expect(held(store, 'iron_ore')).toBe(256)
    expect(store.hint).toContain('背包已满')
  })

  it('箱子：背包转入/取出 1 个与整项', () => {
    const store = freshStore()
    store.bag = { ...store.bag, iron: D(9), coal: D(3) }
    store.place('chest', null, store.roots.length)
    const chest = store.roots.at(-1)
    if (!chest) throw new Error('建造失败')
    store.openPanel(chest.id)
    expect(store.panel?.nodeId).toBe(chest.id)
    expect(store.placing).toBeNull() // 开窗取消放置模式

    // 单击转 1 个
    store.itemRowClick('coal')
    expect(held(store, 'coal')).toBe(2)
    expect(store.chestContents[chest.id]?.coal?.toNumber()).toBe(1)

    // 双击整项
    store.itemRowDouble('coal')
    expect(held(store, 'coal')).toBe(0)
    expect(store.chestContents[chest.id]?.coal?.toNumber()).toBe(3)

    // 箱子取回：单击 1 个 / 双击整项
    store.chestRowClick('coal')
    expect(held(store, 'coal')).toBe(1)
    expect(store.chestContents[chest.id]?.coal?.toNumber()).toBe(2)
    store.chestRowDouble('coal')
    expect(held(store, 'coal')).toBe(3)
    expect(store.chestContents[chest.id]?.coal).toBeUndefined()

    store.closePanel()
    expect(store.panel).toBeNull()
  })
})

describe('store 集成：树结构（拖拽/声明式回写）', () => {
  it('moveTreeNode：搬迁、源属主自检、防环', () => {
    const store = freshStore()
    const smelter = findFirst(store, 'smelter')
    const enginePlant = findFirst(store, 'engine_plant')
    if (!smelter || !enginePlant) throw new Error('工厂结构缺失')
    const oxygen = smelter.children[2]
    if (!oxygen) throw new Error('结构缺失')

    // 摘走氧气 → 链上 [?]
    expect(store.moveTreeNode(oxygen.id, smelter.id, null, 0)).toBe(true)
    expect(smelter.ret.kind).toBe('unresolved')
    expect(enginePlant.ret.kind).toBe('unresolved') // 祖先链跟着刷新

    // 放回第 3 位 → 链上恢复
    expect(store.moveTreeNode(oxygen.id, null, smelter.id, 2)).toBe(true)
    expect(smelter.children.map((child) => child.type)).toEqual(['iron_ore', 'coal', 'oxygen'])
    expect(smelter.ret.kind).toBe('value')
    expect(enginePlant.ret.kind).toBe('value')

    // 不变量：同一节点只出现一次
    let occurrences = 0
    const walk = (list: readonly GameNode[]): void => {
      for (const node of list) {
        if (node.id === oxygen.id) occurrences += 1
        walk(node.children)
      }
    }
    walk(store.roots)
    expect(occurrences).toBe(1)

    // 源属主自检：事件给的属主与模型不符 → 拒绝
    expect(store.moveTreeNode(oxygen.id, null, null, 0)).toBe(false)
    // 防环：拖进自己的子树 → 拒绝
    expect(store.moveTreeNode(smelter.id, enginePlant.id, smelter.id, 0)).toBe(false)
  })

  it('声明式回写：防环 / 未知节点都被拒，树不变', () => {
    const store = freshStore()
    const mine = store.roots[0]
    const ore = mine?.children[0]
    if (!mine || !ore) throw new Error('结构缺失')
    expect(store.setChildren(ore.id, [mine])).toBe(false)
    expect(mine.children.map((child) => child.id)).toEqual([ore.id])
    const ghost = { ...ore, id: 'ghost' } as GameNode
    expect(store.setRoots([...store.roots, ghost])).toBe(false)
    expect(store.roots.filter((root) => root.id === 'ghost')).toHaveLength(0)
  })
})

describe('store 集成：历史与存档', () => {
  it('悬停标记 / undo（建造与 eval 都可撤销）/ 存档 round-trip（含箱子内容）', () => {
    const store = freshStore()
    const mine = store.roots[0]
    const smelter = findFirst(store, 'smelter')
    if (!mine || !smelter) throw new Error('结构缺失')

    // 悬停：只标父节点
    const child = smelter.children[1]
    if (!child) throw new Error('结构缺失')
    store.setHover(child.id)
    expect(store.isHoveredParent(smelter)).toBe(true)
    store.setHover(null)
    expect(store.isHoveredParent(smelter)).toBe(false)

    // 建一棵带箱子的树
    store.bag = { ...store.bag, iron: D(8), coal: D(3) }
    store.place('chest', null, store.roots.length)
    const chest = store.roots.at(-1)
    if (!chest) throw new Error('建造失败')
    store.openPanel(chest.id)
    store.transferToChest('coal')
    const inChest = store.chestContents[chest.id]?.coal?.toNumber() ?? 0
    expect(inChest).toBeGreaterThan(0)
    const dump = store.dump()

    // undo：eval 产出可撤销/重做
    const oreBefore = held(store, 'iron_ore')
    store.evalNode(mine.id)
    const afterEval = held(store, 'iron_ore')
    expect(afterEval).toBeGreaterThan(oreBefore)
    expect(store.undo()).toBe(true)
    expect(held(store, 'iron_ore')).toBe(oreBefore)
    expect(store.redo()).toBe(true)
    expect(held(store, 'iron_ore')).toBe(afterEval)

    // 存档 round-trip：树 + 背包 + 箱子内容都还原
    expect(store.loadFrom(dump)).toBe(true)
    const restored = findFirst(store, 'chest')
    expect(restored).toBeDefined()
    expect(store.chestContents[restored?.id ?? '']?.coal?.toNumber()).toBe(inChest)
  })

  it('损坏或空存档：loadFrom 返回 false 且不改变现状', () => {
    const store = freshStore()
    const before = store.roots.length
    expect(store.loadFrom('{oops')).toBe(false)
    expect(store.loadFrom(null)).toBe(false)
    expect(store.roots).toHaveLength(before)
  })
})
