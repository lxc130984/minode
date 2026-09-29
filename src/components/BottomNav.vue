<script setup lang="ts">
import { Globe, Backpack, BookOpen } from "lucide-vue-next"
import { useUiStore } from "../stores/ui"

const ui = useUiStore()
</script>

<template>
  <nav class="bottom-nav">
    <button class="nav-item" :class="{ on: !ui.viewCodex && ui.viewWorld }" @click="ui.toggleWorld()">
      <Globe :size="19" />
      <span>世界</span>
    </button>
    <button class="nav-item" :class="{ on: !ui.viewCodex && ui.viewBackpack }" @click="ui.toggleBackpack()">
      <Backpack :size="19" />
      <span>背包</span>
    </button>
    <button class="nav-item" :class="{ on: ui.viewCodex }" @click="ui.toggleCodex()">
      <BookOpen :size="19" />
      <span>图鉴</span>
    </button>
  </nav>
</template>
