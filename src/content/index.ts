/**
 * 内容目录:每个内容包在这里挂上即随构建生效(注册有校验,看控制台警告)。
 * 加一批新内容 = 新建 content/xxx.ts 导出 ContentPack 并 import 到这里;
 * 美术资源走 src/assets/icons/(丢文件即注册),不需要动这里。
 */
import "./builtin"
// import "./more-terrain"   // ← 未来的内容包按此挂载
