<script setup lang="ts">
import { VueDraggable } from "vue-draggable-plus"
import { DND_COMMON, onHotbarAdd, setDragging, storageGroup } from "../game/dnd"
import { getDef } from "../game/registry"
import { nodeCount } from "../game/types"
import { HOTBAR_SLOTS, useGameStore } from "../stores/game"
import { useUiStore } from "../stores/ui"
import NodeIcon from "./NodeIcon.vue"

const game = useGameStore()
const ui = useUiStore()

function openInspector(id: string) {
  game.select(id)
  ui.inspOpen = true
}
</script>

<template>
  <section class="hotbar panel">
    <div class="hb-label">
      <span>物品栏</span>
    </div>
    <div class="hb-strip">
      <VueDraggable
        v-model="game.hotbar"
        tag="ul"
        class="slots"
        data-zone="hotbar"
        :group="storageGroup()"
        v-bind="DND_COMMON"
        @add="onHotbarAdd($event)"
        @start="setDragging(true)"
        @end="setDragging(false)"
      >
        <li
          v-for="n in game.hotbar"
          :key="n.id"
          class="slot filled"
          :data-node-id="n.id"
          :data-ntype="n.type"
          :title="`${getDef(n.type).name}(双击放置到世界)`"
          @click="openInspector(n.id)"
          @dblclick="game.placeItem(n.id)"
        >
          <NodeIcon :type="n.type" :size="20" />
          <span v-if="nodeCount(n) > 1" class="count mono">{{ nodeCount(n) }}</span>
        </li>
      </VueDraggable>
      <div
        class="placeholder"
        v-for="n in Math.max(0, HOTBAR_SLOTS - game.hotbar.length)"
        :key="'ph' + n"
      />
    </div>
    <div class="hb-tip">获得物品时优先堆叠到这里,放不下进背包</div>
  </section>
</template>

<style scoped>
.hotbar {
  flex: none;
  height: var(--hotbar-h);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
}
.hb-label {
  display: flex;
  align-items: center;
  color: var(--fg-faint);
  font-size: 10px;
  font-family: var(--mono);
  flex: none;
  letter-spacing: 0.1em;
  writing-mode: vertical-rl;
  text-orientation: upright;
}
.hb-strip {
  display: flex;
  gap: 6px;
  align-items: center;
  overflow-x: auto;
  padding: 2px;
  flex: 1;
  min-width: 0;
}
.slots {
  display: flex;
  gap: 6px;
  list-style: none;
  margin: 0;
  padding: 0;
}
.slot,
.placeholder {
  width: 44px;
  height: 44px;
  flex: none;
  border-radius: 9px;
  border: 1px solid var(--border);
  background: var(--bg-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}
.slot.filled {
  cursor: grab;
  background: var(--bg-panel);
  border-color: var(--guide);
}
.slot.filled:hover {
  border-color: var(--accent);
  background: var(--hover);
}
.placeholder {
  border-style: dashed;
  border-color: var(--guide);
  background: transparent;
  pointer-events: none;
}
.count {
  position: absolute;
  right: 3px;
  bottom: 1px;
  font-size: 11px;
  color: var(--fg);
  text-shadow: 0 1px 2px #fff;
}
.hb-tip {
  flex: none;
  font-size: 11px;
  color: var(--fg-faint);
  max-width: 130px;
  line-height: 1.5;
}

@media (max-width: 900px) {
  .hb-tip,
  .hb-label {
    display: none;
  }
}
</style>
