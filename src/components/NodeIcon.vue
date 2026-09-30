<script setup lang="ts">
import { computed } from "vue"
import { ICONS } from "../game/icons"
import { getDef } from "../game/registry"

const props = defineProps<{ type: string; size?: number }>()
const comp = computed(() => ICONS[getDef(props.type).icon] ?? ICONS.hand)
const def = computed(() => getDef(props.type))
</script>

<template>
  <component
    :is="comp"
    :size="size ?? 15"
    class="nt-icon"
    :class="`cat-${def.category}`"
    :style="def.accent ? { color: def.accent } : undefined"
  />
</template>
