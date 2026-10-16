import type { ItemDef } from '@/engine/types'

/**
 * 物品（item）= 背包里可数的东西，也是建造节点的货币（docs/10 §2）。
 */
export const ITEMS: readonly ItemDef[] = [
  { id: 'iron_ore', name: '铁矿石', short: '铁矿' },
  { id: 'coal', name: '煤炭', short: '煤' },
  { id: 'oxygen', name: '氧气', short: '氧' },
  { id: 'iron', name: '铁', short: '铁' },
  { id: 'steel', name: '钢', short: '钢' },
  { id: 'plate', name: '钢板', short: '板' },
  { id: 'parts', name: '机械零件', short: '零件' },
  { id: 'engine', name: '发动机', short: '引擎' },
  { id: 'wood', name: '木材', short: '木' },
  { id: 'axe', name: '斧头', short: '斧', toolClass: 'axe' },
]
