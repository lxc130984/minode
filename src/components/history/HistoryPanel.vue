<script setup lang="ts">
import { useGameStore } from '@/stores/game'

const store = useGameStore()
</script>

<template>
  <details class="history">
    <summary>历史</summary>
    <div class="history-line">
      <button
        v-for="step in store.historySteps.path"
        :key="step.id"
        class="text-btn history-step"
        :class="{ 'is-current': step.current }"
        :title="step.current ? '当前局面' : '穿梭到这里'"
        @click="store.jumpTo(step.id)"
      >
        {{ step.label }}
      </button>
    </div>
    <div v-if="store.historySteps.branches.length > 0" class="history-line">
      <span class="history-label">分支</span>
      <button
        v-for="branch in store.historySteps.branches"
        :key="branch.id"
        class="text-btn history-step"
        title="穿梭到这条分支"
        @click="store.jumpTo(branch.id)"
      >
        {{ branch.label }}
      </button>
    </div>
    <div class="history-line">
      <button class="text-btn" :disabled="!store.canUndo" @click="store.undo()">[撤销]</button>
      <button class="text-btn" :disabled="!store.canRedo" @click="store.redo()">[重做]</button>
      <span class="history-hint">Ctrl+Z / Ctrl+Shift+Z</span>
    </div>
  </details>
</template>
