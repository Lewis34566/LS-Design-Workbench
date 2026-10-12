# LS-DW 项目说明（给 AI 助手）

类 Dreamweaver 网页可视化编辑器，用于上海高校计算机一级 DW 操作练习。
Electron 33 + 原生 HTML/CSS/JS，无框架。见 README.md。

## 关键约定

- 渲染进程脚本按依赖顺序在 index.html 底部加载，全部挂 window 全局（无 ESM），模块间运行时互相引用
- 设计视图是 iframe(srcdoc)；**所有 DOM 操作必须走 DomOps/Editor 层**，改完必须调用 `App.afterMutation({commit})` 同步代码视图与撤销栈（commit:true=立即入栈，false=500ms 防抖合并）
- 导出必须干净：Serialize.cleanClone 剔除 data-dw-*、contenteditable、#dw-editor-style、tbody，还原被抽离的 <script>（设计视图不执行脚本）
- 属性面板字段全部写 HTML 属性（bgcolor/align/size 等），匹配考试答案风格；字体用 <font face size color> 包裹行内内容，块级内容退化为 CSS
- 表格操作基于 buildGrid 网格算法，colspan/rowspan 必须保持网格一致性
- IPC 白名单在 preload.js；fs/path 操作渲染进程一律走 dwAPI（async，注意 await）

## 环境注意（本机）

- 用户系统环境变量残留 `ELECTRON_RUN_AS_NODE=1`（会让 Electron 退化为纯 Node）；start 脚本与测试 helpers 已自动剥离
- main.js 已 `app.disableHardwareAcceleration()`，修复本机 GPU 导致渲染进程间歇崩溃
- 测试用 Playwright 启动真实应用：`npm run test:main` / `npm run test:advanced`
- 依赖走国内镜像（.npmrc 已配置）
