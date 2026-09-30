# 07 · 存档系统

> 存档 = game store 的 pick 白名单字段子集,JSON 序列化进 localStorage。
> 版本迁移策略:**结构不兼容 → 直接重置**(开发期项目,不做数据迁移)。

## 1. 存档结构(SAVE_VERSION = 5)

```jsonc
{
  "version": 5,
  "nodes":    [ /* 世界树根 */ ],
  "backpack": [ /* 背包树根 */ ],
  "selectedRecipeId": "stone-axe",
  "exploring": false,
  "exploringNodeId": null,
  "exploreEndAt": 0,
  "startedAt": 1760000000000,
  "discovered": ["forest"],
  "log": [ { "seq": 1, "time": 0, "text": "…", "kind": "info" } ],
  "logSeq": 1,
  "selectedId": null,
  "uid": 3
}
```

- key = `"game"`(SAVE_KEY);由 pinia-plugin-persistedstate 自动写入
  (每次 store mutation 全量序列化——所以游戏时钟在 store 外,见 04 §1.4)。
- `dragging` **不持久化**。
- 节点内不再有 `count` 字段(v4 及以前有,数量语义已改为子树大小)。

**字段三处同步**:persist.pick、`exportSaveData()`、`applySaveData()` 的 $patch
——加状态字段时三处都要改,漏一处 = 导出丢数据/导入丢字段。

## 2. isSaveValid(saved) —— 深度校验(全规则)

按序短路,任何一条不满足 → false:

1. 是对象;
2. `version === SAVE_VERSION`;(**任何存档结构变更都必须 bump SAVE_VERSION**)
3. `typeof uid === "number" && uid >= 2`;
4. `selectedRecipeId` string;`exploring` boolean;`exploreEndAt`/`startedAt` number;
5. `discovered` 是 string[];`logSeq` number;
   `selectedId` null|string;`exploringNodeId` null|undefined|string;
6. `log` 是数组且每条 `{seq:number, time:number, text:string}`;
7. `nodes`/`backpack` 是数组,递归 nodeOk:
   - `id` string 且**全局唯一**(Set 去重,两棵树共用一个 Set);
   - `type` string;`children` 是数组;
8. **结构不变量**:
   - `zoneOk(backpack,"backpack")`:背包树里每个节点 `canPlaceInZone(type,"backpack")`
     (递归)——地形/世界限定类型不得残留在背包;
   - 世界树必须含 `explorer` 与 `backpackNode`;
   - 背包树必须含 `bench`(手工合成只能在背包);
9. **uid 防撞**:扫描两棵树的 `/^n(\d+)$/` id,`uid ≥ 最大后缀`
   (否则 newNodeId 会发出与已有节点相同的 id,findNode/removeNode/Vue key 全乱)。

> 教训:校验必须是**全函数**(对任意输入返回布尔而不抛异常)——历史上
> `collect(backpack)` 在数组校验之前执行,backpack 为非数组时直接 TypeError。
> 现在数组检查全部前置。

## 3. 校验时机(关键!)

```
main.ts:
  ensureSaveIntegrity()        ← ① 任何 store 水合之前:isSaveValid 失败 → localStorage.removeItem
  createPinia() + persist 插件 ← ② 此时读到的必是合规存档
  mount(App)                   ← ③ 首帧渲染的数据一定是好的
```

为什么必须在 hydrate 前:坏数据若被 patch 进 store,首帧渲染就会崩
(如 children 非数组),onMounted 里的清理代码永远执行不到 → 每次刷新同样崩。
错误收集器(index.html 的 `window.__bootErrs` + 红条)用于发现这类早期崩溃。

## 4. 导入 / 导出

- **导出**(TopBar 菜单):`game.exportSaveData()`(与 pick 完全一致的字段)→
  Blob 下载 `minode-YYYYMMDD-HHmmss.json`;同时写剪贴板兜底(Tauri webview
  可能拦截 `<a download>`)。
- **导入**:`<input type="file">` → text → `game.applySaveData(raw)`:
  JSON.parse 失败或 isSaveValid 失败 → 返回 false(界面报"存档文件无效或版本不兼容");
  通过 → `$patch` 全字段 + "存档导入成功"日志。**就地生效,不刷新页面**。

## 5. 版本迁移策略

`SAVE_VERSION` 历史:1→2(引入特殊节点)→3(默认折叠)→4(区域权限)→**5(去 count,背包树)**。

规则:**改任何已持久化字段的形状/语义 → bump SAVE_VERSION**。
旧档在 ensureSaveIntegrity 处被直接清除,玩家从 freshState 重新开始
(开发期有意如此;正式运营期需要写真正的迁移函数时,在 isSaveValid 之前插入
"旧版本 → 新版本"的升级逻辑链)。

## 6. 已知行为

- 探索进行中(exploring=true)导入/刷新:时间戳驱动,回前台或下一拍心跳即结算,不丢。
- 超过 maxStack 的历史遗留堆(容量守卫加严之前产生)**不会被自动拆分**——
  守卫只拦新增;玩家可手动拖出(拖出方向不受容量限制)。
- localStorage 按 origin 隔离;线上(https://lxc130984.github.io)与本地 dev 的档互不相干。
