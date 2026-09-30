/**
 * 触发特效事件总线(视觉层的架构预留)。
 *
 * store 在每个触发结算点广播事件(哪个节点被触发、成功还是无效),
 * NodeItem 订阅自己 id 的条目播放行动画。未来更复杂的表现
 * (粒子、错峰瀑布、音效……)订阅同一个事件源即可,不必再动引擎。
 *
 * 为什么是 store 外的模块级 reactive Map(同 gameNow / autoTriggerAt):
 * 瞬态视觉状态不该进 store state——既不该持久化,也不该让每次触发
 * 都引发一次存档全量序列化写盘;Vue 的 reactive Map 按键追踪,
 * 写入只触达订阅了对应节点的那一行,不会惊动整棵树的组件。
 */
import { reactive } from "vue"

/**
 * 触发结果:
 * - ok   成功——交互表有条目(有产出 / 有风味回应 / 掷骰未中只是运气),
 *         或行为节点完成了自己的事(开始探索、合成成功、被驱动);
 * - fail 无效——查不到交互条目(这个挂法产生不了任何效果),或行为落空
 *         (探索冷却中、材料不足),提醒玩家这次操作没有意义。
 */
export type TriggerOutcome = "ok" | "fail"

export interface TriggerFxEvent {
  outcome: TriggerOutcome
}

const events = reactive(new Map<string, TriggerFxEvent>())

/**
 * 广播一次触发结果。不受 silent 影响:静默驱动只压日志,不压视觉——
 * 水车自动驱动的瀑布流正是要看见的反馈。
 */
export function emitTriggerFx(nodeId: string, outcome: TriggerOutcome): void {
  events.set(nodeId, { outcome })
}

/** 订阅:NodeItem 里 computed(() => triggerFxOf(node.id)) */
export function triggerFxOf(nodeId: string): TriggerFxEvent | undefined {
  return events.get(nodeId)
}

/** 行卸载时清掉自己的条目,别让 Map 随历史节点 id 无限增长 */
export function clearTriggerFx(nodeId: string): void {
  events.delete(nodeId)
}

/** 换世界(reset/导入存档)时全清:旧 id 的行已不存在,条目无人再消费 */
export function clearAllTriggerFx(): void {
  events.clear()
}
