import type { EngineConfig } from '@/engine/types'

/** 唯一数值聚集地：逻辑代码里禁止裸数值字面量（docs/03 §3）。 */
export const CONFIG: EngineConfig = {
  bagCapacity: 256,
  chestCapacity: 128,
  recycleRate: 0.3, // 回收返还率：分解成原材料后按此比例向下取整
}
