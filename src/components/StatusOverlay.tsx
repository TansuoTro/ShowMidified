import { useMidi } from '../store/MidiContext'

export function StatusOverlay() {
  const { browserSupport, permission, requestAccess, startDemo } = useMidi()

  if (browserSupport === 'checking') {
    return (
      <div className="overlay-screen">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-[var(--accent-cyan)] border-t-transparent rounded-full animate-spin" />
          <p className="text-[var(--text-secondary)] text-sm font-mono">检测 MIDI 支持中…</p>
        </div>
      </div>
    )
  }

  if (browserSupport === 'unsupported') {
    return (
      <div className="overlay-screen">
        <div className="max-w-md text-center flex flex-col items-center gap-5">
          <div className="w-14 h-14 rounded-full bg-[var(--accent-red)]/10 flex items-center justify-center border border-[var(--accent-red)]/30">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent-red)" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <div>
            <h2 className="text-[var(--text-primary)] font-display text-xl font-bold mb-2">
              浏览器不支持 Web MIDI
            </h2>
            <p className="text-[var(--text-secondary)] text-sm leading-relaxed">
              当前浏览器不支持 Web MIDI API。请使用 Chrome / Edge（版本 43+）或其他 Chromium 内核浏览器。
            </p>
          </div>
          <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg p-4 text-left text-sm w-full">
            <p className="text-[var(--text-secondary)] font-semibold mb-2">推荐替代方案</p>
            <ul className="text-[var(--text-muted)] text-[12px] font-mono space-y-1">
              <li>• Chrome 43+ （桌面端）</li>
              <li>• Microsoft Edge 79+</li>
              <li>• Opera 30+</li>
            </ul>
          </div>
          <button onClick={startDemo} className="btn-primary">
            使用演示模式（无需设备）
          </button>
        </div>
      </div>
    )
  }

  if (permission === 'requesting') {
    return (
      <div className="overlay-screen">
        <div className="flex flex-col items-center gap-4 max-w-sm text-center">
          <div className="w-12 h-12 rounded-full bg-[var(--accent-cyan)]/10 flex items-center justify-center border border-[var(--accent-cyan)]/30 animate-pulse">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-cyan)" strokeWidth="2">
              <path d="M9 18V5l12-2v13"/>
              <circle cx="6" cy="18" r="3"/>
              <circle cx="18" cy="16" r="3"/>
            </svg>
          </div>
          <h2 className="text-[var(--text-primary)] font-display text-lg font-bold">请求 MIDI 权限</h2>
          <p className="text-[var(--text-secondary)] text-sm leading-relaxed">
            浏览器正在请求 MIDI 访问权限。请在弹出的权限对话框中点击「允许」。
          </p>
        </div>
      </div>
    )
  }

  if (permission === 'denied') {
    return (
      <div className="overlay-screen">
        <div className="max-w-md text-center flex flex-col items-center gap-5">
          <div className="w-14 h-14 rounded-full bg-[var(--accent-amber)]/10 flex items-center justify-center border border-[var(--accent-amber)]/30">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent-amber)" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <div>
            <h2 className="text-[var(--text-primary)] font-display text-xl font-bold mb-2">
              MIDI 权限已拒绝
            </h2>
            <p className="text-[var(--text-secondary)] text-sm leading-relaxed">
              请在浏览器地址栏点击锁形图标，将 MIDI 权限设置为「允许」，然后刷新页面。
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={requestAccess} className="btn-primary">重新请求</button>
            <button onClick={startDemo} className="btn-secondary">演示模式</button>
          </div>
        </div>
      </div>
    )
  }

  return null
}
