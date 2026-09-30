/**
 * 界面状态(不持久化):背包分屏、图鉴浮窗、抽屉与对话框。
 * 背包分屏由世界里的「背包」节点开关,图鉴浮窗由右上角按钮开关。
 */
import { defineStore } from "pinia"

export const useUiStore = defineStore("ui", {
  state: () => ({
    /** 背包分屏(点击世界里的「背包」节点开合) */
    backpackOpen: false,
    /** 图鉴浮窗(右上角按钮开合) */
    codexOpen: false,
    /** 检查器抽屉 */
    inspOpen: false,
    /** 日志抽屉 */
    logOpen: false,
    /** 配方选择对话框 */
    recipeOpen: false,
  }),
  actions: {
    toggleBackpack() {
      this.backpackOpen = !this.backpackOpen
    },
    toggleCodex() {
      this.codexOpen = !this.codexOpen
    },
  },
})
