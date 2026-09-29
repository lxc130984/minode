/**
 * 界面注册表:底部导航与主视图都由这里驱动。
 * 新增界面 = 在这里加一条 ViewDef:
 *   - kind "board":节点面板(世界/背包这类,可与物品栏/其他面板拖拽交互、节点树挂载),
 *     声明 board 数据源;同类面板可多选分屏。
 *   - kind "page":普通页面(图鉴、设置这类按钮界面),独占显示。
 */
import { markRaw, type Component } from "vue"
import { Globe, Backpack, BookOpen } from "lucide-vue-next"
import CodexView from "../components/CodexView.vue"
import type { BoardId } from "../stores/game"

export type ViewId = "world" | "backpack" | "codex"
export type ViewKind = "board" | "page"

export interface ViewDef {
  id: ViewId
  title: string
  icon: Component
  kind: ViewKind
  /** board 类视图的数据面板 */
  board?: BoardId
  /** board 类视图是否可与其他 board 并排分屏 */
  splittable?: boolean
  /** page 类视图渲染的组件 */
  component?: Component
}

export const VIEW_DEFS: ViewDef[] = [
  { id: "world", title: "世界", icon: markRaw(Globe), kind: "board", board: "world", splittable: true },
  {
    id: "backpack",
    title: "背包",
    icon: markRaw(Backpack),
    kind: "board",
    board: "backpack",
    splittable: true,
  },
  { id: "codex", title: "图鉴", icon: markRaw(BookOpen), kind: "page", component: markRaw(CodexView) },
]

export const getViewDef = (id: ViewId): ViewDef =>
  VIEW_DEFS.find((v) => v.id === id) ?? VIEW_DEFS[0]
