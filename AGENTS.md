# AGENTS.md — MIDI Live Previewer

## 项目架构

纯前端静态站点，使用 TanStack Start（React + TypeScript + Vite + Tailwind CSS v4）。

## 目录结构

```
src/
  types/
    midi.ts           # 所有 MIDI 相关类型定义
  utils/
    noteUtils.ts      # 音符名称、CC 名称、钢琴键位计算工具
    colorMap.ts       # 通道颜色、力度颜色映射
    exportData.ts     # JSON / CSV 导出
  core/
    midiParser.ts     # 原始 MIDI 字节解析器（无框架依赖）
    midiEngine.ts     # Web MIDI API 封装，单例，管理设备/事件/录制状态
  store/
    MidiContext.tsx   # React Context + 20fps 显示状态更新
  components/
    TopBar.tsx        # 顶部控制栏（录制/暂停/停止/导出）
    DevicePanel.tsx   # 设备选择、通道过滤
    PianoRoll.tsx     # Canvas：滚动 Piano Roll（8 秒时间窗）
    PianoKeyboard.tsx # Canvas：88 键钢琴键盘高亮
    CcPanel.tsx       # Canvas：CC 控制器曲线 + 图例
    EventLog.tsx      # 事件流列表（最近 80 条，倒序）
    ActiveNotes.tsx   # 当前按下音符卡片
    StatsBar.tsx      # 底部状态栏（时间/事件数/FPS）
    StatusOverlay.tsx # 权限/不支持状态全屏遮罩
  routes/
    __root.tsx        # TanStack 根布局（HTML shell）
    index.tsx         # 主页面（/），包含完整布局
  styles.css          # Tailwind + CSS 变量 + 按钮/卡片基础类
```

## 核心设计决策

### 性能分离架构

- `midiEngine`（单例）持有所有高频可变数据（`activeNotes`、`eventBuffer`、`ccSeries`）在普通 JS 对象/Map 中，**不触发 React 重渲染**
- Canvas 组件（PianoRoll、PianoKeyboard、CcPanel）直接通过 `requestAnimationFrame` 读取 `midiEngine` 的 refs 并绘制，完全绕过 React
- `MidiContext` 仅在低频（~20fps rAF 批处理）更新 React state，用于事件日志、活跃音符卡片、状态栏等文本 UI

### Web MIDI API 处理

- 所有 MIDI 字节解析在 `midiParser.ts` 中独立实现（无第三方 MIDI 库）
- Note On velocity=0 被统一处理为 Note Off
- Release velocity（Note Off 的 data[2]）被保留并显示
- 系统实时消息（0xF8+）被优雅忽略

### CSS 架构

- CSS 变量在 `:root` 中定义（`--bg-base`、`--accent-cyan` 等）
- Tailwind v4 使用 `@import "tailwindcss"` 语法
- 按钮样式（`.btn-primary`、`.btn-secondary`、`.btn-ghost`）在 `styles.css` 中定义为全局类
- 深色模式优先

### 通道颜色

16 个通道各有固定 HSL 色相（`CHANNEL_HUES` 数组），力度映射到亮度（低力度→暗，高力度→亮）。

## 命名规范

- 组件：PascalCase
- 工具/Hooks：camelCase
- 路由文件：kebab-case

## 开发命令

```bash
npm run dev    # 本地开发服务器 (http://localhost:3000)
npm run build  # 生产构建 (输出到 dist/client/)
```

## 扩展指引

- **MIDI 文件回放**：在 `midiEngine.ts` 添加 `loadMidiFile()` 方法，用 `setTimeout` 调度到 `ingestEvent()`
- **MPE 支持**：`activeNotes` 已按 `${channel}-${noteNumber}` 分通道存储，MPE 无需大改
- **更多 CC 曲线**：修改 `CcPanel.tsx` 中 `trackedCCs` 初始状态
- **节拍器同步**：在 `midiEngine.ts` 监听 0xF8（MIDI Clock）消息
