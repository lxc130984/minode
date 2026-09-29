<script setup lang="ts">
import { onMounted, ref } from "vue"
import { useIntervalFn, useMediaQuery } from "@vueuse/core"
import TopBar from "./components/TopBar.vue"
import BottomNav from "./components/BottomNav.vue"
import NodeBoard from "./components/NodeBoard.vue"
import CodexView from "./components/CodexView.vue"
import Inspector from "./components/Inspector.vue"
import LogConsole from "./components/LogConsole.vue"
import Hotbar from "./components/Hotbar.vue"
import StatusBar from "./components/StatusBar.vue"
import RecipeDialog from "./components/RecipeDialog.vue"
import { gameNow, useGameStore } from "./stores/game"
import { useUiStore } from "./stores/ui"

const game = useGameStore()
const ui = useUiStore()
const isMobile = useMediaQuery("(max-width: 900px)")

// 桌面端默认 世界+背包 分屏,移动端默认只有世界
if (isMobile.value) ui.viewBackpack = false
else ui.viewBackpack = true

// 游戏心跳:时钟在 store 之外,避免每秒触发存档写盘;到点结算探索
useIntervalFn(() => {
  gameNow.value = Date.now()
  game.onClock()
}, 1000, { immediateCallback: true })

onMounted(() => {
  if (!game.log.length) {
    game.pushLog("欢迎来到 minode。一切皆节点。", "info")
    game.pushLog("点击「探索」节点,5 秒后有几率在它下面发现新的地形。", "info")
  }
})

// ── 移动端边缘滑动:左缘右滑开图鉴,右缘左滑开检查器 ────
// 起点落在可拖拽表面上时不视为边缘手势,避免与节点拖拽冲突
const touch = ref<{ x: number; y: number; edge: "l" | "r" | null } | null>(null)

function onTouchStart(e: TouchEvent) {
  if (e.touches.length !== 1) {
    touch.value = null
    return
  }
  const t = e.touches[0]
  const onDragSurface = !!(t.target as HTMLElement | null)?.closest?.(
    "[data-node-id], .slot",
  )
  touch.value = {
    x: t.clientX,
    y: t.clientY,
    edge: onDragSurface
      ? null
      : t.clientX < 32
        ? "l"
        : t.clientX > window.innerWidth - 32
          ? "r"
          : null,
  }
}
function onTouchEnd(e: TouchEvent) {
  const st = touch.value
  touch.value = null
  if (!st || !st.edge || !e.changedTouches.length) return
  const dx = e.changedTouches[0].clientX - st.x
  const dy = e.changedTouches[0].clientY - st.y
  if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.5) return
  if (st.edge === "l" && dx > 0) {
    ui.viewCodex = true
    if (!ui.viewWorld && !ui.viewBackpack) ui.viewWorld = true
  }
  if (st.edge === "r" && dx < 0) ui.inspOpen = true
}
</script>

<template>
  <div
    class="app"
    :class="{ dragging: game.dragging }"
    @touchstart.passive="onTouchStart"
    @touchend.passive="onTouchEnd"
  >
    <TopBar />

    <main class="views">
      <CodexView v-if="ui.viewCodex" class="view" />
      <template v-else>
        <NodeBoard v-if="ui.viewWorld" board="world" class="view" />
        <NodeBoard v-if="ui.viewBackpack" board="backpack" class="view" />
      </template>
    </main>

    <Hotbar />
    <BottomNav />
    <StatusBar />

    <!-- 抽屉与对话框 -->
    <el-drawer
      v-model="ui.inspOpen"
      direction="rtl"
      size="min(320px, 86vw)"
      :with-header="false"
      class="drawer-insp"
    >
      <Inspector />
    </el-drawer>
    <el-drawer
      v-model="ui.logOpen"
      direction="btt"
      size="46%"
      :with-header="false"
      class="drawer-log"
    >
      <div class="log-drawer-inner">
        <LogConsole />
      </div>
    </el-drawer>
    <el-dialog
      v-model="ui.recipeOpen"
      title="选择配方"
      width="min(480px, 94vw)"
      :close-on-click-modal="true"
    >
      <RecipeDialog />
    </el-dialog>
  </div>
</template>

<style scoped>
.app {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px;
  padding-bottom: 0;
}
.views {
  flex: 1;
  display: flex;
  gap: 6px;
  min-height: 0;
}
.view {
  flex: 1;
  min-width: 0;
  min-height: 0;
}

@media (max-width: 900px) {
  .app {
    padding: 4px;
    padding-bottom: 0;
    gap: 4px;
  }
  .views {
    gap: 4px;
  }
}
</style>

<style>
/* 抽屉暗色内衬对齐主题 */
.drawer-insp .el-drawer__body {
  padding: 0;
  background: var(--bg-panel);
}
.drawer-log .el-drawer__body {
  padding: 10px;
  background: var(--bg);
}
.log-drawer-inner {
  height: 100%;
  display: flex;
}
.log-drawer-inner > .log-panel {
  flex: 1;
}
</style>
