<script setup lang="ts">
import { useGameStore } from '@/stores/game'

const store = useGameStore()
</script>

<template>
  <details class="debug">
    <summary>debug</summary>
    <div class="debug-row">
      <button class="text-btn" @click="store.spawnDemo()">示例树</button>
      <button class="text-btn" @click="store.spawnStress(100)">压力树</button>
      <button class="text-btn" @click="store.grantStarter()">补货</button>
      <button class="text-btn" @click="store.saveGame()">存档</button>
      <button class="text-btn" @click="store.loadGame()">读档</button>
      <button class="text-btn" @click="store.reset()">重置</button>
    </div>
    <div class="debug-row">
      <button class="text-btn" @click="store.setAllFolded(true)">全部折叠</button>
      <button class="text-btn" @click="store.setAllFolded(false)">展开全部</button>
    </div>
    <div v-if="store.lastEval" class="debug-eval">最近点击：{{ store.lastEval }}</div>
  </details>
</template>
