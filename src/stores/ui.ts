/**
 * 界面状态(不持久化):底部导航视图开关、抽屉与对话框。
 * 视图清单与分类由 src/ui/views.ts 注册表驱动。
 */
import { defineStore } from "pinia"
import { VIEW_DEFS, getViewDef, type ViewId } from "../ui/views"

export const useUiStore = defineStore("ui", {
  state: () => ({
    /** 各视图是否激活(board 类可多选分屏,page 类独占覆盖) */
    active: {
      world: true,
      backpack: false,
      codex: false,
    } as Record<ViewId, boolean>,
    /** 检查器抽屉 */
    inspOpen: false,
    /** 日志抽屉 */
    logOpen: false,
    /** 配方选择对话框 */
    recipeOpen: false,
  }),
  getters: {
    /** 当前激活的 board 视图(用于分屏渲染) */
    activeBoardViews: (s) =>
      VIEW_DEFS.filter((v) => v.kind === "board" && s.active[v.id]),
    pageOpen: (s) => VIEW_DEFS.some((v) => v.kind === "page" && s.active[v.id]),
  },
  actions: {
    toggleView(id: ViewId) {
      const def = getViewDef(id)
      if (def.kind === "page") {
        this.active[id] = !this.active[id]
        // 打开 page 时保证至少一个 board 视图,便于返回
        if (this.active[id] && this.activeBoardViews.length === 0) {
          this.active.world = true
        }
        return
      }
      // board 视图:关掉覆盖的 page,再切换;至少保留一个
      VIEW_DEFS.filter((v) => v.kind === "page").forEach((v) => (this.active[v.id] = false))
      if (this.active[id] && this.activeBoardViews.length === 1) return
      this.active[id] = !this.active[id]
    },
  },
})
