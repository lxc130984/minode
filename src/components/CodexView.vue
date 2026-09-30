<script setup lang="ts">
import { computed } from "vue"
import { BookOpen, Info, CircleCheck, Circle } from "lucide-vue-next"
import { NODE_DEFS } from "../game/registry"
import { CATEGORY_LABELS, type NodeDef } from "../game/types"
import { zonesOf } from "../game/registry"
import { hasType } from "../game/tree"
import { useGameStore } from "../stores/game"
import NodeIcon from "./NodeIcon.vue"

const game = useGameStore()

/** 图鉴按分类分组展示 */
const groups = computed(() => {
  const map = new Map<NodeDef["category"], NodeDef[]>()
  for (const def of NODE_DEFS) {
    const list = map.get(def.category) ?? []
    list.push(def)
    map.set(def.category, list)
  }
  return Array.from(map.entries())
})

function seen(def: NodeDef): boolean {
  if (def.permanent) return true // 世界自带的常驻节点天然存在
  if (def.category === "terrain") return game.discovered.includes(def.id)
  return (game.ownedMap[def.id] ?? 0) > 0 || hasType(game.nodes, def.id)
}

function ownedOf(type: string): number | null {
  const n = game.ownedMap[type]
  return n != null ? n : null
}

function zoneLabel(def: NodeDef): string {
  const zones = zonesOf(def.id)
  // 全区域(world+backpack)不标;受限的标"仅…"
  if (zones.length >= 2) return ""
  return ` · 仅${zones.map((z) => ({ world: "世界", backpack: "背包" })[z] ?? z).join("/")}`
}
</script>

<template>
  <nav class="codex">
    <section class="panel">
      <div class="panel-title"><BookOpen :size="13" /> 图鉴</div>
      <div class="codex-scroll">
        <template v-for="[cat, defs] in groups" :key="cat">
          <div class="group-label">{{ CATEGORY_LABELS[cat] }}</div>
          <div v-for="def in defs" :key="def.id" class="codex-item" :class="{ unseen: !seen(def) }">
            <NodeIcon :type="def.id" :size="17" />
            <div class="ci-main">
              <div class="ci-head">
                <span class="ci-name">{{ def.name }}</span>
                <CircleCheck v-if="seen(def)" :size="13" class="ci-seen" />
                <Circle v-else :size="13" class="ci-unseen" />
                <span v-if="ownedOf(def.id) != null" class="ci-own mono">×{{ ownedOf(def.id) }}</span>
              </div>
              <p class="ci-desc">
                {{ seen(def) ? def.desc + zoneLabel(def) : "尚未见过。" }}
              </p>
            </div>
          </div>
        </template>
      </div>
    </section>

    <section class="panel">
      <div class="panel-title"><Info :size="13" /> 上手指南</div>
      <ol class="guide">
        <li>点击「探索」节点,几秒后有几率在它下面发现森林或河流。</li>
        <li>空手点击<b>森林</b>:有概率捡到木棍和石子,自动堆进背包。</li>
        <li>点击世界里的<b>背包</b>节点,右侧展开背包分屏;「手工合成」就在背包里。</li>
        <li>把 <b>石子堆</b> 和 <b>木棍堆</b> 整堆拖到「手工合成」下面,点击它合成<b>石斧</b>(3 石子 + 2 木棍)。</li>
        <li>把石斧拖到<b>世界</b>(一次只放置一个),再把森林拖到石斧<b>下方</b>。</li>
        <li>点击<b>石斧</b>:点击会传导到森林,产出木头!</li>
        <li>用木头合成<b>水车</b>(4 木头 + 2 木棍),把它拖到<b>河流</b>下面,再把石斧挂到水车下面——水流每 3 秒推动水车一次,木头自动进背包。</li>
        <li>背包里同类物品自动堆成一棵小树;把一堆拖到另一堆下面即可合并,拖到世界一次放一个。</li>
        <li>右上角菜单可<b>导出/导入</b>世界存档。</li>
      </ol>
      <p class="guide-tip">
        一切皆节点:世界与背包是两棵同构的树,拖拽即交互。
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
.group-label {
  font-size: 10px;
  color: var(--fg-faint);
  letter-spacing: 0.15em;
  padding: 8px 8px 2px;
  font-family: var(--mono);
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
