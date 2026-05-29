# MIDI Live Previewer

实时 MIDI 录制与可视化工具 — 在现代浏览器中接收 MIDI 输入并以专业、低延迟的方式可视化演奏内容。

## 技术栈

- **React 19 + TypeScript** — UI 框架
- **TanStack Start** — 静态站点构建（SSR disabled for static deploy）
- **Tailwind CSS v4** — 样式
- **Web MIDI API** — 原生 MIDI 输入（无第三方 MIDI 库）
- **Canvas API** — 高性能 Piano Roll / 键盘 / CC 曲线绘制
- **Vite** — 构建工具
- **Netlify** — 部署平台

## 功能特性

- 实时 Piano Roll（8 秒滚动时间窗）
- 88 键钢琴键盘高亮（含黑键、力度亮度映射）
- CC 控制器曲线图（Mod Wheel、Sustain、Expression 等）
- 事件流日志（Note On/Off、CC、Pitch Bend、Program Change）
- 当前按下音符卡片（含音名、编号、力度条）
- 录制 / 暂停 / 继续 / 停止 / 清空
- 导出为 JSON 或 CSV
- 16 通道颜色区分
- 演示模式（无需 MIDI 设备即可调试 UI）
- 设备热插拔检测

## 本地运行

```bash
npm install
npm run dev
```

然后访问 http://localhost:3000

## 权限说明

Web MIDI API 需要用户手势触发权限请求（Chrome 43+ / Edge 79+）。
打开页面后浏览器会弹出权限确认对话框，点击「允许」即可。

Firefox 原生不支持 Web MIDI，建议使用 Chromium 内核浏览器。

## Netlify 部署

```bash
npm run build
# 或直接推送到连接 Netlify 的 Git 仓库
```

构建产物在 `dist/client/`，已在 `netlify.toml` 中配置。

## 浏览器支持

| 浏览器 | 支持情况 |
|--------|---------|
| Chrome 43+ | ✅ 完全支持 |
| Edge 79+ | ✅ 完全支持 |
| Opera 30+ | ✅ 完全支持 |
| Firefox | ❌ 不支持 Web MIDI（可用演示模式）|
| Safari | ❌ 不支持 Web MIDI（可用演示模式）|
