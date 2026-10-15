<script setup lang="ts">
import { useGameStore } from '@/stores/game'

const store = useGameStore()
</script>

<template>
  <div class="side-block">
    <span class="side-title">节点</span>
    <div class="palette">
      <button
        v-for="def in store.palette"
        :key="def.id"
        class="palette-btn"
        :class="{
          selected: store.placing === def.id,
          'is-unaffordable': !store.affordable(def.id),
        }"
        :title="`建造 ${def.name}：${store.costTextOf(def.id) || '免费'} · 回收分解为原材料（按比例返还）`"
        @click="store.startPlacing(def.id)"
      >
        <span class="p-name">{{ def.name }}</span>
        <span class="p-cost">{{ store.costTextOf(def.id) || '免费' }}</span>
      </button>
    </div>
    <div v-if="store.placing" class="palette-hint">放置中：左键放置 · 右键 / Esc 取消</div>
  </div>
</template>
