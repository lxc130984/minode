import type { NodeDef } from '@/engine/types'

/**
 * 节点类型（选择面板的数据源，docs/04 §2）：
 * - **符号**：没有配方 → 点击无响应，返回值就是自身，只作为实参被检测；
 * - **函数**：有配方（见 recipes.ts）→ 点击 eval，产出物品进背包；
 * - `cost` = 在选择面板放置时的建造成本（从背包扣除；`×` 回收时全额返还）。
 * 与物品同名的 id（iron_ore/coal/oxygen）= 同一个东西的两面：
 * 背包里的物品 ↔ 树上的实参节点。
 */
export const NODES: readonly NodeDef[] = [
  // ---- 符号（实参节点，成本 = 1 个同名物品） ----
  { id: 'iron_ore', name: '铁矿石', short: '铁矿', cost: [{ item: 'iron_ore' }] },
  { id: 'coal', name: '煤炭', short: '煤', cost: [{ item: 'coal' }] },
  { id: 'oxygen', name: '氧气', short: '氧', cost: [{ item: 'oxygen' }] },
  // ---- 函数（点击 → eval → 产出物品） ----
  { id: 'mine', name: '矿井', short: '井', cost: [{ item: 'iron_ore', count: 4 }] },
  {
    id: 'smelter',
    name: '冶炼炉',
    short: '炉',
    cost: [
      { item: 'iron_ore', count: 4 },
      { item: 'coal', count: 2 },
    ],
  },
  {
    id: 'forge',
    name: '锻炉',
    short: '锻',
    cost: [
      { item: 'iron', count: 3 },
      { item: 'coal', count: 2 },
    ],
  },
  { id: 'rolling_mill', name: '轧机', short: '轧', cost: [{ item: 'steel', count: 3 }] },
  {
    id: 'assembler',
    name: '装配台',
    short: '装',
    cost: [
      { item: 'plate', count: 3 },
      { item: 'iron', count: 2 },
    ],
  },
  { id: 'engine_plant', name: '发动机厂', short: '厂', cost: [{ item: 'parts', count: 3 }] },
  { id: 'forest', name: '森林', short: '林', cost: [{ item: 'wood', count: 4 }] },
  // ---- 特殊节点（点击打开浮动窗口；无配方） ----
  { id: 'chest', name: '箱子', short: '箱', panel: 'storage', cost: [{ item: 'iron', count: 4 }] },
]
