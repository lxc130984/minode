<script setup lang="ts">
import { computed } from 'vue'

import { useGameStore } from '@/stores/game'

const store = useGameStore()

/** 手持 = 选中的背包物品（点击检测的隐式实参，docs/10 §4） */
const heldName = computed(() => {
  const item = store.heldItem
  return item ? store.itemName(item) : '空手'
})
</script>

<template>
  <header class="hud">
    <span class="hud-title">minode</span>
    <span class="hud-held">手持：{{ heldName }}</span>
    <span v-if="store.hint" class="hud-msg">{{ store.hint }}</span>
    <span v-else class="hud-hint">
      点击函数节点 eval · 手持物参与点击检测 · 面板选节点左键建造（右键取消）
    </span>
  </header>
</template>
