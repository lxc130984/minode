<script setup lang="ts">
import { computed } from "vue"
import { ArrowRight, Check } from "lucide-vue-next"
import { RECIPES, getDef } from "../game/registry"
import { useGameStore } from "../stores/game"
import NodeIcon from "./NodeIcon.vue"

const game = useGameStore()

const list = computed(() =>
  RECIPES.map((recipe) => {
    const inputs = recipe.inputs.map((inp) => ({
      stack: inp,
      have: game.benchPiles[inp.type] ?? 0,
      ok: (game.benchPiles[inp.type] ?? 0) >= inp.count,
    }))
    return { recipe, inputs, craftable: inputs.every((i) => i.ok) }
  }),
)

/** 配方按分类分组(无分类的归入"基础") */
const groups = computed(() => {
  const map = new Map<string, typeof list.value>()
  for (const item of list.value) {
    const key = item.recipe.category ?? "基础"
    const arr = map.get(key) ?? []
    arr.push(item)
    map.set(key, arr)
  }
  return Array.from(map.entries())
})
</script>

<template>
  <div class="recipe-list">
    <p class="hint">选择「手工合成」节点使用的配方。点击合成节点时,会检测它下方挂载的材料。</p>
    <template v-for="[group, items] in groups" :key="group">
      <div v-if="groups.length > 1" class="group-label">{{ group }}</div>
      <button
        v-for="item in items"
        :key="item.recipe.id"
        class="recipe-card"
        :class="{ active: game.selectedRecipeId === item.recipe.id }"
        @click="game.selectRecipe(item.recipe.id)"
      >
      <div class="io-row">
        <div class="io-group">
          <span v-for="inp in item.inputs" :key="inp.stack.type" class="io-item">
            <NodeIcon :type="inp.stack.type" :size="16" />
            <span class="io-name">{{ getDef(inp.stack.type).name }}</span>
            <span class="io-num mono">{{ inp.have }}/{{ inp.stack.count }}</span>
          </span>
        </div>
        <ArrowRight :size="15" class="arrow" />
        <span class="io-item output">
          <NodeIcon :type="item.recipe.output.type" :size="16" />
          <span class="io-name">{{ getDef(item.recipe.output.type).name }}</span>
          <span class="io-num mono">×{{ item.recipe.output.count }}</span>
        </span>
      </div>
      <p class="recipe-desc">{{ getDef(item.recipe.output.type).desc }}</p>
      <span v-if="game.selectedRecipeId === item.recipe.id" class="picked">
        <Check :size="13" /> 当前配方
      </span>
      </button>
    </template>
  </div>
</template>

<style scoped>
.recipe-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.group-label {
  font-size: 10px;
  color: var(--fg-faint);
  letter-spacing: 0.15em;
  padding: 6px 2px 0;
  font-family: var(--mono);
}
.hint {
  margin: 0 0 4px;
  font-size: 12px;
  color: var(--fg-faint);
  line-height: 1.6;
}
.recipe-card {
  position: relative;
  text-align: left;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px 14px;
  background: var(--bg-soft);
  display: flex;
  flex-direction: column;
  gap: 7px;
  cursor: pointer;
  font: inherit;
  color: inherit;
  transition: border-color 0.12s, background 0.12s;
}
.recipe-card:hover {
  border-color: var(--accent);
}
.recipe-card.active {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.io-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.io-group {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.io-item {
  display: flex;
  align-items: center;
  gap: 4px;
}
.io-item .io-name {
  color: var(--fg);
  font-size: 13px;
}
.io-item .io-num {
  font-size: 11px;
  color: var(--fg-dim);
}
.io-item.output {
  padding: 3px 8px;
  border: 1px solid var(--guide);
  border-radius: 7px;
  background: var(--bg-panel);
}
.arrow {
  color: var(--fg-faint);
}
.recipe-desc {
  margin: 0;
  font-size: 11.5px;
  color: var(--fg-faint);
  line-height: 1.6;
}
.picked {
  position: absolute;
  top: 10px;
  right: 12px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: var(--accent);
  font-weight: 600;
}
</style>
