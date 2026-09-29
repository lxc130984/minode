<script setup lang="ts">
import { VIEW_DEFS } from "../ui/views"
import { useUiStore } from "../stores/ui"

const ui = useUiStore()

function isOn(id: (typeof VIEW_DEFS)[number]["id"]): boolean {
  const def = VIEW_DEFS.find((v) => v.id === id)!
  if (def.kind === "page") return ui.active[id]
  return !ui.pageOpen && ui.active[id]
}
</script>

<template>
  <nav class="bottom-nav">
    <button
      v-for="v in VIEW_DEFS"
      :key="v.id"
      class="nav-item"
      :class="{ on: isOn(v.id) }"
      @click="ui.toggleView(v.id)"
    >
      <component :is="v.icon" :size="19" />
      <span>{{ v.title }}</span>
    </button>
  </nav>
</template>
