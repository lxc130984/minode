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
| 放置 | place | 把物品从背包放进世界,**一次只放一个**(placeItem / 守卫② / settleWorldDrop) |
| 收纳 | nodeToItem | 把(世界里的)节点整棵收进背包,同类子随行、异类子释放 |
| 功能节点 | functional / `!!def.behavior` | 带声明式行为的节点(探索/手工合成/背包开关/预留工厂);背包子级不受同类规则限制 |
| 永久节点 | permanent | 不可被"移除"操作删除(探索/背包节点/手工合成) |
| 省略号 / 省略行 | stack-ellipsis | 背包堆子节点 >4 时显示的"⋯ 还有 N 个"行,在子列表外部、pointer-events:none |
| 虚影 | sortable-fallback | 拖拽跟随体,由 SortableJS fallback 机制克隆,CSS 仅微调宽高/观感 |
| 整理 | settle | 拖拽落库后的延迟(setTimeout 0)数据修正:settleWorldDrop / settleBackpackDrop |
| 点击传导 | propagate | 点击父节点 = 以父为来源依次触发子节点(默认点击行为) |
| 点击来源 / 目标 | source / target | 交互二元组;source 可为 "hand"(空手) |
| 探索池 | pool | ExploreBehavior 的产出权重数组,rollPool 按权重随机 |
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
| 检查器 | Inspector | 右抽屉:选中节点的详情与操作(收纳/放置/移除/选择配方) |
