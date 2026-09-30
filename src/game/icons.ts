/**
 * 图标注册中心:键(NodeDef.icon 引用的字符串)→ 图标组件(接受 { size } prop)。
 *
 * 两种来源,汇成一张 ICONS 表:
 *
 * 1. 像素贴图:把图片文件丢进 src/assets/icons/ 即自动注册,
 *    键 = 文件名(去扩展名)。不需要写任何组件或导入代码。
 *    同名贴图覆盖 lucide 图标——逐个换成像素风时,放文件就够了。
 * 2. lucide 线条图标:显式声明(不能 glob 整个包,否则上千个图标全部进产物)。
 *    ⚠️ lucide 图标名随版本变动,引用前 grep d.ts 确认存在(见 docs/14 §2)。
 *
 * 运行时仍可用 api.registerIcon(name, comp) 追加/覆盖(刷新即失)。
 */
import { defineComponent, h, markRaw, shallowReactive, type Component } from "vue"
import {
  TreePine,
  Waves,
  Mountain,
  Wand,
  Axe,
  Hand,
  Compass,
  Soup,
  Backpack,
  FerrisWheel,
} from "lucide-vue-next"

/** lucide 线条图标(显式声明) */
const LUCIDE_ICONS: Record<string, Component> = {
  forest: markRaw(TreePine),
  river: markRaw(Waves),
  stone: markRaw(Mountain),
  stick: markRaw(Wand),
  stoneAxe: markRaw(Axe),
  hand: markRaw(Hand),
  explorer: markRaw(Compass),
  bench: markRaw(Soup),
  backpackNode: markRaw(Backpack),
  waterwheel: markRaw(FerrisWheel),
}

/** 把图片 URL 包成图标组件:<img class="px-icon"> 按 size 缩放,像素风渲染 */
const assetIcon = (url: string): Component =>
  markRaw(
    defineComponent({
      name: "AssetIcon",
      props: { size: { type: Number, default: 15 } },
      setup: (props) => () =>
        h("img", {
          src: url,
          width: props.size,
          height: props.size,
          class: "px-icon",
          draggable: false,
          alt: "",
        }),
    }),
  )

/** assets/icons/ 下的图片文件,构建期收集(键 = 相对路径,值 = 解析后的 URL) */
const ASSET_FILES = import.meta.glob("../assets/icons/*.{png,webp,gif,svg,jpg}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>

const fileName = (path: string): string => path.split("/").pop()!.replace(/\.[^.]+$/, "")

/**
 * 图标总表。贴图优先于 lucide(同名覆盖);shallowReactive 保证
 * 运行时 registerIcon 的赋值立即反映到界面。
 */
export const ICONS: Record<string, Component> = shallowReactive({
  ...LUCIDE_ICONS,
  ...Object.fromEntries(
    Object.entries(ASSET_FILES).map(([path, url]) => [fileName(path), assetIcon(url)]),
  ),
})
