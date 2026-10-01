/**
 * 工作系统:节点做事需要时间(点击 ≠ 立刻结算)。
 *
 * click 链式传导模型:一次点击是一个带来源(source,"hand" 或节点 type)的
 * click 事件。传导节点(relay,工具)瞬间转发;工作节点收到它接受的 click
 * 后在自己身上挂一条工作(进度条在它身上),到点结算产出并把 click
 * (来源改写为自己)继续传给子节点;自触发节点(水车)就位后运行可见的
 * 计时循环(kind="cycle"),每圈向子节点发一轮 click。
 *
 * 为什么是 store 外的模块级 reactive Map(同 gameNow):
 * endAt 每拍都在逼近,放进 store state 既不该持久化(刷新后重头来,
 * 不把挂机折算成产出),也不该让进度触发存档全量写盘;
 * Vue 的 Map 按键追踪,写入只触达对应行的进度条。
 */
import { reactive } from "vue"

/** 工作种类:决定到点时套哪段结算逻辑 */
export type WorkKind = "click" | "explore" | "craft" | "cycle"

export interface WorkJob {
  kind: WorkKind
  /** 到点时刻(时间戳 ms);onClock 据此对账,后台节流迟到不丢 */
  endAt: number
  /** 总时长(供进度条换算) */
  durationMs: number
  /** 静默结算(自动链路):只记产出日志,不刷风味 */
  silent: boolean
  /** click 工作的来源("hand" 或来源节点 type):结算查交互表 + 行内「⟵来源」标注 */
  source?: string
  /** craft 工作快照的配方 id:结算按开工时的配方,不受期间切换配方影响 */
  recipeId?: string
  /** 准点结算的定时器(挂工作方写入);清除工作时必须撤销——
   *  否则换世界(reset/导入)后旧定时器残留,撞上同号节点的新工作会提前结算 */
  timer?: ReturnType<typeof setTimeout>
}

const jobs = reactive(new Map<string, WorkJob>())

/** 挂一条工作(同节点已有工作 = 调用方应先判忙碌) */
export function startWork(
  nodeId: string,
  kind: WorkKind,
  durationMs: number,
  silent: boolean,
  source?: string,
): WorkJob {
  const job: WorkJob = { kind, endAt: Date.now() + durationMs, durationMs, silent, source }
  jobs.set(nodeId, job)
  return job
}

/** 节点当前的工作(忙碌判定 + 进度条数据源) */
export function workOf(nodeId: string): WorkJob | undefined {
  return jobs.get(nodeId)
}

/** 全部工作(onClock 对账用) */
export function allWork(): Map<string, WorkJob> {
  return jobs
}

/** 结算前摘除工作记录(连带撤销它的定时器) */
export function clearWork(nodeId: string): void {
  const job = jobs.get(nodeId)
  if (job?.timer) clearTimeout(job.timer)
  jobs.delete(nodeId)
}

/** 换世界(reset/导入存档)时全清:旧节点的工作不再有意义,
 *  定时器一并撤销(见 WorkJob.timer 注释) */
export function clearAllWork(): void {
  for (const job of jobs.values()) {
    if (job.timer) clearTimeout(job.timer)
  }
  jobs.clear()
  rejects.clear()
}

// ── 断链/拒绝反馈:click 传到这里断了(接收不了/忙碌/被占用) ──
// 行元素抖一下,告诉玩家链条在哪里断的。与工作表同款生命周期。

const rejects = reactive(new Set<string>())

/** 广播一次"click 被拒"(行抖动反馈) */
export function emitReject(nodeId: string): void {
  rejects.add(nodeId)
}

/** 订阅(一次性):NodeItem watch 后立即 clearReject 消费掉 */
export function rejectQueued(nodeId: string): boolean {
  return rejects.has(nodeId)
}

export function clearReject(nodeId: string): void {
  rejects.delete(nodeId)
}
