<script setup lang="ts">
/**
 * NodeBoard:节点面板基本组件。
 * 世界、背包……一切"节点列表 + 可成树"的界面都由它渲染,
 * 差异只在 board 标识(守卫规则/点击行为/提示文案)。
 * 根列表用直接 v-model 绑定 store 数组(库的标准形态,不用中间 computed)。
 */
import { computed } from "vue"
import { VueDraggable } from "vue-draggable-plus"
import { Globe, Backpack } from "lucide-vue-next"
import { DND_COMMON, onTreeAdd, setDragging, treeGroup } from "../game/dnd"
import type { BoardId } from "../stores/game"
import { useGameStore } from "../stores/game"
import NodeItem from "./NodeItem.vue"

const props = defineProps<{ board: BoardId }>()
const game = useGameStore()

const meta = computed(() =>
  props.board === "world"
    ? {
        icon: Globe,
        title: "世界",
        hint: "点击节点触发 · 拖拽组织树",
      }
    : {
        icon: Backpack,
        title: "背包",
        hint: "可嵌套整理 · 拖到世界即可放置",
      },
)
</script>

<template>
  <section class="board panel">
    <div class="panel-title">
      <component :is="meta.icon" :size="13" />
      <span>{{ meta.title }}</span>
      <span class="title-hint">{{ meta.hint }}</span>
    </div>

    <div class="tree-scroll">
      <!-- 两个面板各一条直接绑定,避免任何中间层 -->
      <VueDraggable
        v-if="board === 'world'"
        v-model="game.nodes"
        tag="ol"
        class="root-list"
        :class="{ 'is-empty': !game.nodes.length }"
        data-zone="tree"
        :group="treeGroup(board)"
        handle=".row-main"
        v-bind="DND_COMMON"
        @add="onTreeAdd(board, null, game.nodes, $event)"
        @start="setDragging(true)"
        @end="setDragging(false)"
      >
        <NodeItem
          v-for="root in game.nodes"
          :key="root.id"
          :node="root"
          :board="board"
          :depth="0"
        />
      </VueDraggable>
      <VueDraggable
        v-else
        v-model="game.backpack"
        tag="ol"
        class="root-list"
        :class="{ 'is-empty': !game.backpack.length }"
        data-zone="backpack"
        :group="treeGroup(board)"
        handle=".row-main"
        v-bind="DND_COMMON"
        @add="onTreeAdd(board, null, game.backpack, $event)"
        @start="setDragging(true)"
        @end="setDragging(false)"
      >
        <NodeItem
          v-for="root in game.backpack"
          :key="root.id"
          :node="root"
          :board="board"
          :depth="0"
        />
      </VueDraggable>
      <div v-if="!game.boardRoots(board).length" class="empty-hint">
        {{ board === "world" ? "世界空空如也。" : "背包空空如也,获得的物品会自动堆到这里。" }}
      </div>
    </div>
  </section>
</template>

<style scoped>
.board {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  flex: 1;
}
.tree-scroll {
  flex: 1;
  overflow: auto;
  padding: 8px;
  min-height: 0;
}
.root-list {
  list-style: none;
  margin: 0;
  padding: 0;
  min-height: 80px;
}
.empty-hint {
  color: var(--fg-faint);
  text-align: center;
  padding: 40px 16px;
  font-size: 13px;
  line-height: 1.9;
  pointer-events: none;
}
</style>
