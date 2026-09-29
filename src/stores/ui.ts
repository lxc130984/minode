/**
 * 界面状态(不持久化):底部导航视图、抽屉与对话框。
 */
import { defineStore } from "pinia"

export const useUiStore = defineStore("ui", {
  state: () => ({
    /** 底部导航:世界 / 背包 可同时选中(分屏) */
    viewWorld: true,
    viewBackpack: false,
    /** 图鉴视图(覆盖式,与上两者互斥显示) */
    viewCodex: false,
    /** 检查器抽屉 */
    inspOpen: false,
    /** 日志抽屉 */
    logOpen: false,
    /** 配方选择对话框 */
    recipeOpen: false,
  }),
  actions: {
    toggleWorld() {
      if (this.viewCodex) {
        this.viewCodex = false
        this.viewWorld = true
        return
      }
      // 至少保留一个主视图
      if (this.viewWorld && !this.viewBackpack) return
      this.viewWorld = !this.viewWorld
    },
    toggleBackpack() {
      if (this.viewCodex) {
        this.viewCodex = false
        this.viewBackpack = true
        return
      }
      if (this.viewBackpack && !this.viewWorld) return
      this.viewBackpack = !this.viewBackpack
    },
    toggleCodex() {
      this.viewCodex = !this.viewCodex
      if (this.viewCodex) {
        // 图鉴打开时保证至少一个主视图,便于返回
        if (!this.viewWorld && !this.viewBackpack) this.viewWorld = true
      }
    },
  },
})
