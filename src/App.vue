<script setup lang="ts">
import { onMounted, ref, watch } from "vue"
import { useIntervalFn } from "@vueuse/core"
import { X } from "lucide-vue-next"
import TopBar from "./components/TopBar.vue"
import NodeBoard from "./components/NodeBoard.vue"
import CodexView from "./components/CodexView.vue"
import Inspector from "./components/Inspector.vue"
import LogConsole from "./components/LogConsole.vue"
import StatusBar from "./components/StatusBar.vue"
import RecipeDialog from "./components/RecipeDialog.vue"
import { gameNow, useGameStore } from "./stores/game"
import { useUiStore } from "./stores/ui"

const game = useGameStore()
const ui = useUiStore()

// 游戏心跳:时钟在 store 之外,避免每秒触发存档写盘;到点结算探索
useIntervalFn(() => {
  gameNow.value = Date.now()
  game.onClock()
}, 1000, { immediateCallback: true })

onMounted(() => {
  if (!game.log.length) {
    game.pushLog("欢迎来到 minode。一切皆节点。", "info")
    game.pushLog("点击「探索」节点左侧的按钮(图标+名字)寻找地形;点击节点行可以折叠/展开子树。", "info")
  }
})

// 检查器/配方浮层关闭即取消选中——点击行本身不选中(节点即按钮),
// selected 高亮只在浮层开着、用于指示联动对象时才有意义,别留死高亮
watch(
  () => [ui.inspOpen, ui.recipeOpen] as const,
  ([insp, recipe]) => {
    if (!insp && !recipe) game.select(null)
  },
)

// ── 移动端边缘滑动:左缘右滑开图鉴浮窗,右缘左滑开检查器 ────
// 起点落在可拖拽表面上时不视为边缘手势,避免与节点拖拽冲突
const touch = ref<{ x: number; y: number; edge: "l" | "r" | null } | null>(null)

function onTouchStart(e: TouchEvent) {
  if (e.touches.length !== 1) {
    touch.value = null
    return
  }
  const t = e.touches[0]
  const onDragSurface = !!(t.target as HTMLElement | null)?.closest?.("[data-node-id]")
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
  if (st.edge === "l" && dx > 0) ui.toggleCodex()
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
      <!-- 世界常驻;背包分屏由「背包」节点开关 -->
      <NodeBoard board="world" class="view" />
      <NodeBoard v-if="ui.backpackOpen" board="backpack" class="view" />
    </main>

    <StatusBar />

    <!-- 图鉴浮窗(右上角) -->
    <Transition name="float">
      <div v-if="ui.codexOpen" class="codex-float">
        <button class="float-close icon-btn" title="关闭" @click="ui.codexOpen = false">
          <X :size="15" />
        </button>
        <CodexView />
      </div>
    </Transition>

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
/* 图鉴浮窗:右上角悬浮卡片 */
.codex-float {
  position: fixed;
  top: calc(var(--topbar-h) + 14px);
  right: 12px;
  width: min(440px, 94vw);
  max-height: min(76vh, 720px);
  overflow: hidden auto;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 12px 36px rgba(40, 70, 40, 0.18);
  z-index: 60;
  padding: 6px;
}
.codex-float > .codex {
  height: auto;
}
.float-close {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
  background: var(--bg-panel);
}
.float-enter-active,
.float-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}
.float-enter-from,
.float-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
/* 抽屉内衬对齐主题 */
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
