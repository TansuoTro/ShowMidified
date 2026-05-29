import { createRootRoute, HeadContent, Scripts } from '@tanstack/react-router'
import '../styles.css'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'MIDI Live Previewer — 实时 MIDI 可视化' },
      { name: 'description', content: '实时 MIDI 录制与可视化工具，支持钢琴卷帘、CC 曲线、事件日志' },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <HeadContent />
      </head>
      <body>
        <div id="app">
          {children}
        </div>
        <Scripts />
      </body>
    </html>
  )
}
