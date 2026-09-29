<script setup lang="ts">
import { BookOpen, Info, CircleCheck, Circle } from "lucide-vue-next"
import { NODE_DEFS } from "../game/registry"
import { hasType } from "../game/tree"
import { useGameStore } from "../stores/game"
import NodeIcon from "./NodeIcon.vue"

const game = useGameStore()

function seen(def: (typeof NODE_DEFS)[number]): boolean {
  if (def.special) return true
  if (def.terrain) return game.discovered.includes(def.id)
  return (game.ownedMap[def.id] ?? 0) > 0 || hasType(game.nodes, def.id)
}

function ownedOf(type: string): number | null {
  const n = game.ownedMap[type]
  return n != null ? n : null
}
</script>

<template>
  <nav class="codex">
    <section class="panel">
      <div class="panel-title"><BookOpen :size="13" /> 图鉴</div>
      <div class="codex-scroll">
        <div v-for="def in NODE_DEFS" :key="def.id" class="codex-item" :class="{ unseen: !seen(def) }">
          <NodeIcon :type="def.id" :size="17" />
          <div class="ci-main">
            <div class="ci-head">
              <span class="ci-name">{{ def.name }}</span>
              <span v-if="def.terrain" class="ci-tag terrain">地形</span>
              <span v-else-if="def.special" class="ci-tag special">特殊</span>
              <CircleCheck v-if="seen(def)" :size="13" class="ci-seen" />
              <Circle v-else :size="13" class="ci-unseen" />
              <span v-if="ownedOf(def.id) != null" class="ci-own mono">×{{ ownedOf(def.id) }}</span>
            </div>
            <p class="ci-desc">{{ seen(def) ? def.desc : "尚未见过。" }}</p>
          </div>
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-title"><Info :size="13" /> 上手指南</div>
      <ol class="guide">
        <li>点击「探索」节点,5 秒后有几率在它下面发现森林或河流。</li>
        <li>空手点击<b>森林</b>:有概率捡到木棍和石子(物品先进物品栏,堆满进背包)。</li>
        <li>从背包/物品栏把 <b>石子×3</b> 和 <b>木棍×2</b> 拖到「手工合成」下面,点击它做出<b>石斧</b>。</li>
        <li>把石斧和森林都放进世界:森林拖到石斧<b>下方</b>成为子节点。</li>
        <li>点击<b>石斧</b>:点击会传导到森林,产出木头!</li>
        <li>底部导航同时选中<b>世界 + 背包</b>可分屏,直接在两边拖拽节点;背包里也能像世界一样把节点组织成树。</li>
        <li>右上角菜单可<b>导出/导入</b>世界存档。</li>
      </ol>
      <p class="guide-tip">
        一切皆节点:世界树内可自由拖拽重组;地形与特殊节点离不开世界;物品拖进世界就成为节点。
      </p>
    </section>
  </nav>
</template>

<style scoped>
.codex {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  overflow: hidden;
}
.codex-scroll {
  overflow-y: auto;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 46vh;
}
.codex-item {
  display: flex;
  gap: 9px;
  padding: 7px 8px;
  border-radius: 8px;
}
.codex-item:hover {
  background: var(--hover);
}
.codex-item.unseen .ci-name {
  color: var(--fg-faint);
}
.ci-main {
  min-width: 0;
  flex: 1;
}
.ci-head {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ci-name {
  font-size: 13px;
  color: var(--fg);
}
.ci-tag.terrain {
  font-size: 10px;
  color: var(--green);
}
.ci-tag.special {
  font-size: 10px;
  color: var(--purple);
}
.ci-seen {
  color: var(--accent);
  margin-left: auto;
}
.ci-unseen {
  color: var(--guide);
  margin-left: auto;
}
.ci-own {
  font-size: 11px;
  color: var(--fg-dim);
}
.ci-desc {
  margin: 2px 0 0;
  font-size: 11px;
  color: var(--fg-faint);
  line-height: 1.55;
}
.guide {
  margin: 0;
  padding: 10px 14px 6px 28px;
  font-size: 12.5px;
  color: var(--fg-dim);
  line-height: 1.9;
}
.guide b {
  color: var(--fg);
  font-weight: 600;
}
.guide-tip {
  margin: 0;
  padding: 0 14px 10px;
  font-size: 11px;
  color: var(--fg-faint);
  line-height: 1.6;
}
</style>
