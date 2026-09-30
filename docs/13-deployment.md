# 13 · 部署与 CI

## 1. 总览

- **目标**:GitHub Pages 项目站点 <https://lxc130984.github.io/minode/>
- **方式**:推 `main` → GitHub Actions 自动构建发布(~1 分钟生效)
- **仓库**:`git@github.com:lxc130984/minode.git`(SSH)

## 2. 构成

### 2.1 vite.config.ts

```ts
base: "/minode/"     // Pages 项目站点部署在 /minode/ 子路径,勿删
```
改仓库名或换自定义域名时需同步调整(自定义域名用根路径 `"/"`)。
其余为 Tauri dev 约定(1420 端口、HMR、忽略 src-tauri)。

### 2.2 .github/workflows/deploy.yml

```yaml
on: push(main) + workflow_dispatch
permissions: contents:read, pages:write, id-token:write
concurrency: group=pages, cancel-in-progress   # 排队中的旧部署自动取消
jobs:
  build:   checkout → node20(cache:npm) → npm ci → npm run build
           → actions/configure-pages@v5 (enablement:true)   # 未启用 Pages 时自动启用
           → actions/upload-pages-artifact@v3 (path: dist)
  deploy:  actions/deploy-pages@v4
```

`npm run build` = `vue-tsc --noEmit && vite build`——**CI 即类型检查关卡**,
类型错误会阻断部署。

## 3. 注意事项

1. **首次部署**依赖 `enablement:true` 自动开 Pages;若仓库 Settings→Pages 里
   Source 不是 "GitHub Actions",手动改一下。
2. **线上更新后需强刷**(Ctrl+Shift+R):Pages 的 JS 资源带内容哈希,
   但入口 index.html 可能被浏览器缓存。
3. **存档隔离**:localStorage 按 origin 隔离——线上档与本地 dev 档互不相干;
   线上旧版本产生的超限堆(历史 bug)不会被新代码自动拆分。
4. **Tauri 桌面端**与部署无关(`npm run tauri build` 独立打包),网页代码零依赖 Tauri API。
5. API 限流:未认证的 GitHub API(查 Actions 状态)有严格限流,
   直接轮询 `https://lxc130984.github.io/minode/` 的 HTTP 码更省事。

## 4. 历史提交(部署相关)

- `bbc4497` 初版:base + 工作流 + README
- `97d25a4` CI 增加 enablement(自动启用 Pages)
