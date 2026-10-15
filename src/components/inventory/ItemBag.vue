<script setup lang="ts">
import { computed } from 'vue'

import { useGameStore } from '@/stores/game'
import { fmt } from '@/utils/format'

const store = useGameStore()

/** 有货的物品行（按内容顺序）；背包是物品表，无槽位不拖拽。 */
const rows = computed(() =>
  store.registry.defs.items
    .filter((item) => store.bag[item.id]?.gt(0))
    .map((item) => ({ id: item.id, count: store.bag[item.id] ?? undefined })),
)
</script>

<template>
  <div class="side-block">
    <span class="side-title">
      背包 {{ fmt(store.bagTotal(store.bag)) }}/{{ store.registry.config.bagCapacity }}
    </span>
    <div class="bag-list">
      <div
        v-for="row in rows"
        :key="row.id"
        class="bag-row"
        :class="{ selected: !store.panel && store.heldItem === row.id }"
        :title="
          store.panel
            ? '单击转 1 个进箱子 · 双击整项转入'
            : '单击选中为手持（作为隐式实参参与点击检测）；再点同款取消'
        "
        @click="store.itemRowClick(row.id)"
        @dblclick="store.itemRowDouble(row.id)"
      >
        <span class="bag-name" :class="`k-${store.itemHue(row.id)}`">
          {{ store.itemName(row.id) }}
        </span>
        <span class="bag-count">×{{ fmt(row.count ?? 0) }}</span>
      </div>
      <span v-if="rows.length === 0" class="bag-empty">空</span>
    </div>
  </div>
</template>
