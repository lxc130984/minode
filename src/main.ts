import { createApp } from "vue"
import { createPinia } from "pinia"
import piniaPluginPersistedstate from "pinia-plugin-persistedstate"
import ElementPlus from "element-plus"
import zhCn from "element-plus/es/locale/lang/zh-cn"
import "element-plus/dist/index.css"
import "./styles/main.css"
// 内容注册必须先于存档校验与 store 水合:
// 内容缺席时 zonesOf 对未知类型 fail-open,存档虽不会被清,
// 但节点会全部兜底成"未知的节点";若日后收紧 zonesOf,顺序就是硬约束
import "./content"
import App from "./App.vue"
import { ensureSaveIntegrity } from "./stores/game"

// 在任何 store 水合之前校验存档完整性,不合规直接清档
ensureSaveIntegrity()

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

createApp(App).use(pinia).use(ElementPlus, { locale: zhCn }).mount("#app")

// 开发期调试钩子:浏览器控制台可直接操作游戏状态与注册自定义内容
if (import.meta.env.DEV) {
  import("./stores/game").then(({ useGameStore }) => {
    ;(window as unknown as Record<string, unknown>).__game = useGameStore()
  })
  import("./game/api").then(({ minodeApi }) => {
    ;(window as unknown as Record<string, unknown>).minode = minodeApi
  })
}
