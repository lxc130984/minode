import type { RecipeDef } from '@/engine/types'

/**
 * 配方 = 函数的签名表（静态检测：子节点返回值多重集 → 产物物品）。
 *
 *   矿井(铁矿石|煤炭|氧气)               → 对应原料物品    ← 唯一的无中生有入口
 *   冶炼炉(铁矿石 + 煤炭 + 氧气)         → 铁
 *   锻炉(铁 + 煤炭)                      → 钢
 *   轧机(钢 + 铁)                        → 钢板
 *   装配台(钢板 + 铁)                    → 机械零件
 *   发动机厂(机械零件 + 钢)              → 发动机
 *   森林(斧头)                           → 木材            ← 手持斧头即可命中（隐式实参，docs/10 §4）
 */
export const RECIPES: readonly RecipeDef[] = [
  { at: 'mine', args: [{ item: 'iron_ore' }], out: [{ item: 'iron_ore' }] },
  { at: 'mine', args: [{ item: 'coal' }], out: [{ item: 'coal' }] },
  { at: 'mine', args: [{ item: 'oxygen' }], out: [{ item: 'oxygen' }] },
  {
    at: 'smelter',
    args: [{ item: 'iron_ore' }, { item: 'coal' }, { item: 'oxygen' }],
    out: [{ item: 'iron' }],
  },
  { at: 'forge', args: [{ item: 'iron' }, { item: 'coal' }], out: [{ item: 'steel' }] },
  { at: 'rolling_mill', args: [{ item: 'steel' }, { item: 'iron' }], out: [{ item: 'plate' }] },
  { at: 'assembler', args: [{ item: 'plate' }, { item: 'iron' }], out: [{ item: 'parts' }] },
  { at: 'engine_plant', args: [{ item: 'parts' }, { item: 'steel' }], out: [{ item: 'engine' }] },
  { at: 'forest', args: [{ item: 'axe' }], out: [{ item: 'wood' }] },
]
