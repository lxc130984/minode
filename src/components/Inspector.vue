<script setup lang="ts">
import { computed } from "vue"
import { ElMessageBox, ElMessage } from "element-plus"
import {
  MousePointerClick,
  PackageMinus,
  Trash2,
  GitBranch,
  Settings2,
} from "lucide-vue-next"
import { findInteraction, getDef, getRecipe, canPlaceInZone, isPermanent } from "../game/registry"
import { CATEGORY_LABELS, nodeCount } from "../game/types"
import { findNode } from "../game/tree"
import { autoTriggerBehaviorOf, autoTriggerReady, useGameStore } from "../stores/game"
import { useUiStore } from "../stores/ui"
import NodeIcon from "./NodeIcon.vue"

const game = useGameStore()
const ui = useUiStore()

const node = computed(() => game.selectedNode)
const def = computed(() => (node.value ? getDef(node.value.type) : null))

/** 瞬态帧防御:children 可能短暂非数组 */
const children = computed(() =>
  Array.isArray(node.value?.children) ? node.value!.children : [],
)

/** 节点当前所在区域 */
const zone = computed<"world" | "backpack" | null>(() => {
  if (!node.value) return null
  if (findNode(game.nodes, node.value.id)) return "world"
  if (findNode(game.backpack, node.value.id)) return "backpack"
  return null
})

const inWorld = computed(() => zone.value === "world")
const isPile = computed(
  () => !!node.value && nodeCount(node.value) > 1,
)

const benchRecipe = computed(() => getRecipe(game.selectedRecipeId))

/** 自触发节点(水车等)的驱动状态 */
const autoTrigger = computed(() => (node.value ? autoTriggerBehaviorOf(node.value) : null))
const autoReady = computed(() => {
  const b = autoTrigger.value
  if (!b || !node.value) return false
  const roots = inWorld.value ? game.nodes : game.backpack
  return autoTriggerReady(b, findNode(roots, node.value.id)?.parent ?? null)
})

const handHint = computed(() =>
  def.value ? findInteraction("hand", def.value.id)?.note : null,
)

async function removeSelected() {
  if (!node.value || !def.value) return
  const isTerrain = def.value.category === "terrain"
  try {
    await ElMessageBox.confirm(
      isTerrain
        ? `把「${def.value.name}」从世界移除?之后仍可能通过「探索」重新找到。`
        : `把「${def.value.name}」移除?它下面的子节点会被释放回根层级。`,
      "移除节点",
      { type: "warning", confirmButtonText: "移除", cancelButtonText: "取消" },
    )
    game.removeNodeById(node.value.id)
    ui.inspOpen = false
    ElMessage.success("已移除")
  } catch {
    /* 取消 */
  }
}
</script>

<template>
  <div class="insp">
    <div v-if="!node" class="no-sel">
      <p>点击行尾的 ⋯ 查看节点详情</p>
    </div>

    <div v-else-if="def" class="insp-body">
      <div class="head">
        <NodeIcon :type="def.id" :size="26" />
        <div>
          <div class="name-row">
            <span class="name">{{ def.name }}</span>
            <span v-if="isPile" class="pile mono">×{{ nodeCount(node) }}</span>
          </div>
          <div class="meta">
            <span class="cat" :class="`cat-${def.category}`">
              {{ CATEGORY_LABELS[def.category] }}
            </span>
            <span class="zone-tag">{{ { world: '世界中', backpack: '背包' }[zone ?? 'world'] }}</span>
            <span class="id mono">#{{ node.id }}</span>
          </div>
        </div>
      </div>

      <p class="desc">{{ def.desc }}</p>

      <!-- 特殊节点面板 -->
      <div v-if="node.type === 'explorer'" class="stat-box">
        <div class="stat-row">
          <span class="k">状态</span>
          <span class="v">{{ game.exploring ? `探索中……约 ${game.exploreCdLeft}s` : "待命" }}</span>
        </div>
        <div class="stat-row">
          <span class="k">已发现地形</span>
          <span class="v">{{ game.discovered.length ? game.discovered.map((t) => getDef(t).name).join("、") : "尚无" }}</span>
        </div>
      </div>
      <div v-else-if="node.type === 'bench'" class="stat-box">
        <div class="stat-row">
          <span class="k">当前配方</span>
          <span class="v">{{ benchRecipe ? getDef(benchRecipe.output.type).name : "未选择" }}</span>
        </div>
        <el-button size="small" class="recipe-btn" @click="ui.recipeOpen = true">
          <Settings2 :size="13" style="margin-right: 4px" />
          选择配方
        </el-button>
      </div>
      <div v-else-if="autoTrigger" class="stat-box">
        <div class="stat-row">
          <span class="k">驱动条件</span>
          <span class="v">
            {{ autoTrigger.poweredBy ? `挂在${getDef(autoTrigger.poweredBy).name}下面` : "无需条件" }}
          </span>
        </div>
        <div class="stat-row">
          <span class="k">驱动间隔</span>
          <span class="v">每 {{ Math.round(autoTrigger.intervalMs / 1000) }} 秒一次</span>
        </div>
        <div class="stat-row">
          <span class="k">状态</span>
          <span class="v">{{ autoReady ? "驱动中" : "待就位(不在河流下面)" }}</span>
        </div>
        <div class="stat-row">
          <span class="k">驱动对象</span>
          <span class="v">
            {{ children.length ? children.map((c) => getDef(c.type).name).join("、") : "还没有子节点" }}
          </span>
        </div>
      </div>

      <!-- 普通节点 -->
      <template v-else>
        <div v-if="inWorld" class="stat-box">
          <div class="stat-row">
            <span class="k">子节点</span>
            <span class="v mono">{{ children.length }}</span>
          </div>
          <div class="stat-row">
            <span class="k">空手点击</span>
            <span class="v">{{ handHint ?? "没有任何效果" }}</span>
          </div>
        </div>
        <div v-if="def.noChildren" class="children-box empty">
          <span>这是一个开关节点,不能挂载子节点。</span>
        </div>
        <div v-else-if="inWorld && children.length" class="children-box">
          <div class="cb-title">点击它 = 依次触发:</div>
          <div v-for="c in children" :key="c.id" class="cb-item">
            <NodeIcon :type="c.type" :size="14" />
            <span>{{ getDef(c.type).name }}</span>
            <span v-if="nodeCount(c) > 1" class="mono cb-count">×{{ nodeCount(c) }}</span>
          </div>
        </div>
        <div v-else-if="inWorld" class="children-box empty">
          <MousePointerClick :size="14" />
          <span>还没有子节点。把其他节点拖到它下面试试。</span>
        </div>
      </template>

      <div class="btn-row">
        <el-button
          v-if="inWorld && canPlaceInZone(def.id, 'backpack')"
          size="small"
          @click="game.nodeToItem(node.id)"
        >
          <PackageMinus :size="13" style="margin-right: 4px" />
          收进背包
        </el-button>
        <el-button
          v-if="!inWorld && canPlaceInZone(def.id, 'world')"
          size="small"
          @click="game.placeItem(node.id)"
        >
          <PackageMinus :size="13" style="margin-right: 4px" />
          放置到世界
        </el-button>
        <el-button
          v-if="!isPermanent(def.id)"
          size="small"
          type="danger"
          plain
          @click="removeSelected"
        >
          <Trash2 :size="13" style="margin-right: 4px" />
          移除
        </el-button>
      </div>
    </div>

    <div class="insp-foot mono">
      <GitBranch :size="11" />
      minode inspector
    </div>
  </div>
</template>

<style scoped>
.insp {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.no-sel {
  color: var(--fg-faint);
  text-align: center;
  padding: 60px 12px;
  font-size: 12px;
  line-height: 2;
}
.no-sel p {
  margin: 0;
}
.insp-body {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 11px;
  overflow-y: auto;
  flex: 1;
}
.head {
  display: flex;
  gap: 10px;
  align-items: center;
}
.name-row {
  display: flex;
  align-items: baseline;
  gap: 7px;
}
.name {
  font-size: 16px;
  font-weight: 700;
  color: var(--fg);
}
.pile {
  font-size: 13px;
  color: var(--fg-dim);
}
.meta {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 2px;
  flex-wrap: wrap;
}
.cat {
  font-size: 10px;
  padding: 0 6px;
  line-height: 17px;
  border-radius: 4px;
  background: var(--bg-soft);
  border: 1px solid var(--border);
}
.cat.cat-terrain {
  color: var(--green);
}
.cat.cat-tool {
  color: var(--purple);
}
.cat.cat-special {
  color: var(--purple);
}
.zone-tag {
  font-size: 10px;
  color: var(--fg-faint);
}
.id {
  font-size: 10px;
  color: var(--fg-faint);
}
.mono {
  font-family: var(--mono);
}
.desc {
  margin: 0;
  font-size: 12.5px;
  color: var(--fg-dim);
  line-height: 1.7;
}
.stat-box {
  border: 1px solid var(--border);
  border-radius: 9px;
  padding: 8px 11px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--bg-soft);
}
.stat-row {
  display: flex;
  gap: 8px;
  font-size: 12px;
  line-height: 1.6;
  align-items: baseline;
}
.stat-row .k {
  color: var(--fg-faint);
  flex: none;
  width: 64px;
}
.stat-row .v {
  color: var(--fg);
}
.recipe-btn {
  margin-top: 6px;
  align-self: flex-start;
}
.children-box {
  border: 1px solid var(--border);
  border-radius: 9px;
  padding: 8px 11px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.children-box.empty {
  color: var(--fg-faint);
  font-size: 12px;
  flex-direction: row;
  align-items: center;
  gap: 8px;
}
.cb-title {
  font-size: 11px;
  color: var(--fg-faint);
}
.cb-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--fg);
}
.cb-count {
  font-size: 11px;
  color: var(--fg-dim);
}
.btn-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.insp-foot {
  flex: none;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 14px;
  border-top: 1px solid var(--border);
  font-size: 10px;
  color: var(--fg-faint);
  letter-spacing: 0.08em;
}
</style>
