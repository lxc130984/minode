/**
 * 工作系统:节点做事需要时间(点击 ≠ 立刻结算)。
 *
 * 一次"工作" = { 哪个节点、做什么、何时完成 }:点击可交互节点不再瞬时结算,
 * 而是挂一条工作记录,到点由 resolveWork 结算(交互掷骰/合成/探索产出)。
 * 工作中的节点处于忙碌态:再次点击无效(现实里不可能一瞬间砍一棵树)。
 * 视觉:行底的进度条(game/work.ts 的 reactive Map 就是进度条的数据源)。
 *
 * 为什么是 store 外的模块级 reactive Map(同 gameNow / autoTriggerAt):
 * endAt 每拍都在逼近,放进 store state 既不该持久化(刷新后重头来,
 * 不把挂机折算成产出——与自触发计时同一取向),也不该让进度触发存档
 * 全量写盘;Vue 的 Map 按键追踪,写入只触达对应行的进度条。
 */
import { reactive } from "vue"

/** 工作种类:决定到点时套哪段结算逻辑 */
export type WorkKind = "interact" | "explore" | "craft"

export interface WorkJob {
  kind: WorkKind
  /** 到点时刻(时间戳 ms);onClock 据此对账,后台节流迟到不丢 */
  endAt: number
  /** 总时长(供进度条换算) */
  durationMs: number
  /** 静默结算(被水车自动驱动的工作):只记产出日志,不刷风味 */
  silent: boolean
  /** craft 工作快照的配方 id:结算按开工时的配方,不受期间切换配方影响 */
  recipeId?: string
  /** 准点结算的定时器(挂工作方写入);清除工作时必须撤销——
   *  否则换世界(reset/导入)后旧定时器残留,撞上同号节点的新工作会提前结算 */
  timer?: ReturnType<typeof setTimeout>
}

const jobs = reactive(new Map<string, WorkJob>())

/** 挂一条工作(同节点已有工作 = 调用方应先判忙碌) */
export function startWork(nodeId: string, kind: WorkKind, durationMs: number, silent: boolean): WorkJob {
  const job: WorkJob = { kind, endAt: Date.now() + durationMs, durationMs, silent }
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
}
