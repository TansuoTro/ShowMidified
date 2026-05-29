import { useMidi } from '../store/MidiContext'

export function TopBar() {
  const {
    recordingState,
    isDemoMode,
    browserSupport,
    permission,
    selectedDeviceId,
    eventCount,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    clearSession,
    startDemo,
    stopDemo,
    exportJson,
    exportCsv,
  } = useMidi()

  const canRecord = (selectedDeviceId !== null || isDemoMode) && permission === 'granted'
  const isRecording = recordingState === 'recording'
  const isPaused = recordingState === 'paused'
  const isStopped = recordingState === 'stopped'
  const isIdle = recordingState === 'idle'

  const statusDot =
    browserSupport === 'unsupported'
      ? { color: 'var(--accent-red)', label: '不支持 Web MIDI' }
      : permission === 'denied'
        ? { color: 'var(--accent-red)', label: '权限已拒绝' }
        : permission === 'requesting'
          ? { color: 'var(--accent-amber)', label: '请求权限中…' }
          : permission === 'granted'
            ? selectedDeviceId || isDemoMode
              ? { color: 'var(--accent-green)', label: '设备已就绪' }
              : { color: 'var(--accent-amber)', label: '未选择设备' }
            : { color: 'var(--text-muted)', label: '检测中…' }

  return (
    <header className="flex items-center gap-3 px-4 py-2.5 border-b border-[var(--border)] bg-[var(--bg-surface)] shrink-0">
      {/* Brand */}
      <div className="flex items-center gap-2 mr-2">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <rect x="1" y="10" width="3" height="11" rx="1" fill="var(--accent-cyan)" opacity="0.9"/>
          <rect x="6" y="6" width="3" height="15" rx="1" fill="var(--accent-cyan)"/>
          <rect x="11" y="1" width="3" height="20" rx="1" fill="var(--accent-cyan)"/>
          <rect x="16" y="7" width="3" height="14" rx="1" fill="var(--accent-cyan)" opacity="0.7"/>
        </svg>
        <span className="font-display text-sm font-bold text-[var(--text-primary)] tracking-tight">
          MIDI Live
        </span>
        <span className="text-[10px] font-mono text-[var(--text-muted)] border border-[var(--border)] px-1 rounded">
          PREVIEWER
        </span>
      </div>

      {/* Status */}
      <div className="flex items-center gap-1.5 text-[11px] font-mono">
        <span
          className="w-1.5 h-1.5 rounded-full inline-block"
          style={{ background: statusDot.color, boxShadow: isRecording ? `0 0 6px ${statusDot.color}` : 'none' }}
        />
        <span style={{ color: statusDot.color }}>{statusDot.label}</span>
      </div>

      <div className="flex-1" />

      {/* Controls */}
      <div className="flex items-center gap-2">
        {/* Record / Pause / Resume / Stop */}
        {(isIdle || isStopped) && (
          <button
            onClick={startRecording}
            disabled={!canRecord && !isDemoMode}
            className="btn-primary flex items-center gap-1.5 text-[12px]"
          >
            <span className="w-2 h-2 rounded-full bg-white inline-block" />
            开始录制
          </button>
        )}
        {isRecording && (
          <>
            <button onClick={pauseRecording} className="btn-secondary text-[12px]">
              暂停
            </button>
            <button onClick={stopRecording} className="btn-ghost text-[12px]">
              停止
            </button>
          </>
        )}
        {isPaused && (
          <>
            <button onClick={resumeRecording} className="btn-primary text-[12px]">
              继续
            </button>
            <button onClick={stopRecording} className="btn-ghost text-[12px]">
              停止
            </button>
          </>
        )}

        <div className="w-px h-5 bg-[var(--border)]" />

        {/* Demo */}
        {!isDemoMode ? (
          <button onClick={startDemo} className="btn-ghost text-[12px]">
            演示模式
          </button>
        ) : (
          <button onClick={stopDemo} className="btn-ghost text-[12px] text-[var(--accent-amber)]">
            退出演示
          </button>
        )}

        {/* Clear */}
        <button
          onClick={clearSession}
          className="btn-ghost text-[12px]"
          disabled={isRecording}
        >
          清空
        </button>

        {/* Export */}
        {eventCount > 0 && (
          <div className="relative group">
            <button className="btn-ghost text-[12px]">导出 ↓</button>
            <div className="absolute right-0 top-full mt-1 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md shadow-xl z-50 hidden group-hover:flex flex-col min-w-[100px]">
              <button
                onClick={exportJson}
                className="px-3 py-2 text-[11px] font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5 text-left rounded-t-md"
              >
                JSON
              </button>
              <button
                onClick={exportCsv}
                className="px-3 py-2 text-[11px] font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5 text-left rounded-b-md"
              >
                CSV
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
