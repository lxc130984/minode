# 12 · 词汇表

项目自造/约定术语,按拼音与字母序。文档与代码注释统一使用这些词。

| 术语 | 英文/代码 | 含义 |
|---|---|---|
| 板 / 面板 | board | 一个节点树视图。`BoardId = "world" \| "backpack"`;由 NodeBoard 渲染 |
| 背包节点 | backpackNode | 世界里点击开合背包分屏的功能节点(noChildren、permanent、worldOnly) |
| 咬合区 | — | 拖拽中空子列表向上延伸出的投放区(CSS margin-top:-14px),悬停父行下半部 = 挂为子节点 |
| 堆 / 物品堆 | stack | 同类父子链。见"堆根/堆大小" |
| 堆根 | stackRoot | 沿同类祖先上行到的最顶节点(不越过功能节点);容量判定的基准 |
| 堆大小 | nodeCount | 子树总件数(每个节点计 1) |
| 放置 | place | 把物品从背包放进世界,**一次只放一个**(placeItem;拖拽整堆进世界被守卫②拒绝) |
| 回收 / 收纳 | nodeToItem | 把(世界里的)节点收进背包——**一条一条来**:还挂着子节点会被拒绝,先移走它们(守卫②b 对拖拽同理) |
| 处理上限 | maxProcess | 世界区一个节点最多同时挂几个【直接】子节点(流程语义:斧子只面对它的树)。石斧 1 / 水车 2 / 河流 2,缺省不限 |
| 堆叠上限 | maxStack | 背包区一堆同类物品的最大件数(**子树总量**;与处理上限相对) |
| 功能节点 | functional / `!!def.behavior` | 带声明式行为的节点(探索/手工合成/背包开关/自触发/预留工厂);背包子级不受同类规则限制 |
| 永久节点 | permanent | 不可被"移除"操作删除(探索/背包节点/手工合成) |
| 省略号 / 省略行 | stack-ellipsis | 背包堆子节点 >4 时显示的"⋯ 还有 N 个"行,在子列表外部、pointer-events:none |
| 虚影 | sortable-fallback | 拖拽跟随体,由 SortableJS fallback 机制克隆,CSS 仅微调宽高/观感 |
| 整理 | settle | (历史)拖拽落库后的延迟数据修正;跨区整树守卫收紧后已删除,见 05 §4 |
| 点击传导 | propagate | 点击父节点 = 以父为来源依次触发子节点(默认点击行为) |
| 点击来源 / 目标 | source / target | 交互二元组;source 可为 "hand"(空手) |
| 探索池 | pool | ExploreBehavior 的产出权重数组,rollPool 按权重随机;探索本身是一项 5s 的工作 |
| 按组堆叠 | — | addItem 的分堆策略:找还有容量的同类堆并入,满了开新堆(maxStack 为组容量) |
| 叶优先 | takeNodes | 消耗顺序:先子后父(DFS 序从尾移除);移除父时异类剩余子回填上层 |
| 区域 | zone | NodeZone = world \| backpack;权限经 zonesOf/canPlaceInZone 统一判定 |
| 瞬态帧 | — | 拖拽中数据短暂非稳(如 children 非数组)的渲染帧;渲染层有 Array.isArray 兜底 |
| 占位隐藏 | — | 用 CSS display:none 隐藏堆的第 5+ 个子节点而非切片渲染,保证 Sortable 索引对齐 |
| 咬合 / 挂为子节点 | — | 同"咬合区" |
| 水合 | hydrate | pinia-persistedstate 从 localStorage 恢复 state 的过程;存档校验必须在其之前 |
| 发号器 | uid | 节点 id 自增计数(newNodeId),校验要求 uid ≥ 已有 n<数字> 最大后缀 |
| 新的世界 | reset | 重置存档(freshState);菜单入口 |
| 图鉴 | Codex | 右上角浮窗:节点图鉴(按 category 分组、seen 点亮)+ 上手指南 |
| 像素贴图 | asset icon | `src/assets/icons/` 下的图片文件,构建期经 import.meta.glob 自动注册为图标,键 = 文件名(去扩展名);同名覆盖 lucide 图标 |
| 工作 | work | 一次"做事":触发可交互节点后挂上的一条记录 `{kind, endAt, durationMs, silent}`(game/work.ts,store 外不落盘);到点由 resolveWork 结算 |
| 工作时长 | workMs | NodeDef 字段:做这件事要多久(缺省 1500ms;探索以 behavior.durationMs 为准) |
| 忙碌 | busy | 节点有工作中的记录(workOf 命中):再次触发无效,提示"还在忙碌中" |
| 占用 | occupied | 祖先有正在进行的工作(interact/craft),本节点是流程参与物(如石斧正在砍的森林):行半透明置灰、点击被拦"正被占用";判定与触发前置检查共用 occupierOfWorkingAncestor |
| 进度条 | work-track | 行底 2px 细线,accent 色从左向右匀速填满 = 工作剩余时间;到点结算后消失 |
| 检查器 | Inspector | 右抽屉:「详情」按钮选中节点的详情与操作(收纳/放置/移除/选择配方);点击行本身不选中 |
| 自触发 | auto-trigger | 功能节点行为:就位后被周期驱动,每次驱动依次触发自身每个子节点(水车) |
| 驱动 | drive | 触发一个自触发节点的动作(手动点击或到点自动);被驱动的子节点按"被点击"的语义结算 |
| 就位 | ready / poweredBy | 自触发节点**直接**挂在 poweredBy 指定的类型下(水车在河流下)的状态;失去就位即停转,重新就位从零计时 |
