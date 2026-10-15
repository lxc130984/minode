import { buildRegistry } from '@/engine/registry'
import { CONFIG } from './config'
import { ITEMS } from './items'
import { NODES } from './nodes'
import { RECIPES } from './recipes'

/** 引擎唯一入口：整个应用只认这一个注册表实例（docs/03 §2）。 */
export const CONTENT = buildRegistry({
  items: ITEMS,
  nodes: NODES,
  recipes: RECIPES,
  config: CONFIG,
})
