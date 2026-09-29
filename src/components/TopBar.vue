<script setup lang="ts">
import { ref } from "vue"
import { Boxes, EllipsisVertical } from "lucide-vue-next"
import { ElMessage, ElMessageBox } from "element-plus"
import { useGameStore } from "../stores/game"

const game = useGameStore()
const fileInput = ref<HTMLInputElement | null>(null)

async function resetSave() {
  try {
    await ElMessageBox.confirm(
      "这将丢弃当前世界、背包与日志,生成一个崭新的世界。确定吗?",
      "新的世界",
      { type: "warning", confirmButtonText: "重新开始", cancelButtonText: "取消" },
    )
    game.reset()
    ElMessage.success("新世界已生成")
  } catch {
    /* 用户取消 */
  }
}

function exportSave() {
  const json = game.exportSaveData()
  // 优先走文件下载;Tauri webview 若拦截下载,还有剪贴板兜底
  try {
    const blob = new Blob([json], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    const d = new Date()
    const p = (n: number) => String(n).padStart(2, "0")
    a.href = url
    a.download = `minode-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  } catch {
    /* 下载失败时还有剪贴板 */
  }
  navigator.clipboard
    ?.writeText(json)
    .then(() => ElMessage.success("存档已导出(文件下载,并复制到剪贴板备用)"))
    .catch(() => ElMessage.success("存档已导出为文件"))
}

function pickImport() {
  fileInput.value?.click()
}

async function onImportFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = "" // 允许重复选择同一文件
  if (!file) return
  try {
    const text = await file.text()
    if (game.applySaveData(text)) {
      ElMessage.success("世界已恢复")
    } else {
      ElMessage.error("存档文件无效或版本不兼容")
    }
  } catch {
    ElMessage.error("读取文件失败")
  }
}
</script>

<template>
  <header class="topbar">
    <div class="brand">
      <div class="logo-box">
        <Boxes :size="16" />
      </div>
      <span class="name">minode</span>
      <span class="sub">一切皆节点</span>
    </div>

    <el-dropdown trigger="click">
      <button class="icon-btn" title="菜单">
        <EllipsisVertical :size="17" />
      </button>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item @click="exportSave">导出存档</el-dropdown-item>
          <el-dropdown-item @click="pickImport">导入存档</el-dropdown-item>
          <el-dropdown-item divided @click="resetSave">新的世界(重置)</el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>

    <input
      ref="fileInput"
      type="file"
      accept="application/json,.json"
      style="display: none"
      @change="onImportFile"
    />
  </header>
</template>

<style scoped>
.topbar {
  flex: none;
  height: var(--topbar-h);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px 0 14px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 9px;
}
.logo-box {
  width: 28px;
  height: 28px;
  border-radius: 9px;
  background: var(--accent-soft);
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.name {
  font-family: var(--mono);
  font-size: 16px;
  font-weight: 700;
  color: var(--fg);
  letter-spacing: -0.02em;
}
.sub {
  font-size: 11px;
  color: var(--fg-faint);
  letter-spacing: 0.2em;
  margin-left: 2px;
}
@media (max-width: 900px) {
  .sub {
    display: none;
  }
}
</style>
