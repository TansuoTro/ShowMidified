import { createFileRoute } from '@tanstack/react-router'
import { MidiProvider } from '../store/MidiContext'
import { TopBar } from '../components/TopBar'
import { DevicePanel } from '../components/DevicePanel'
import { PianoRoll } from '../components/PianoRoll'
import { PianoKeyboard } from '../components/PianoKeyboard'
import { EventLog } from '../components/EventLog'
import { CcPanel } from '../components/CcPanel'
import { ActiveNotes } from '../components/ActiveNotes'
import { StatsBar } from '../components/StatsBar'
import { StatusOverlay } from '../components/StatusOverlay'
import { useMidi } from '../store/MidiContext'

export const Route = createFileRoute('/')({
  component: () => (
    <MidiProvider>
      <App />
    </MidiProvider>
  ),
})

function App() {
  const { permission, browserSupport, isDemoMode } = useMidi()
  const showOverlay =
    !isDemoMode && (
      browserSupport === 'checking' ||
      browserSupport === 'unsupported' ||
      permission === 'requesting' ||
      permission === 'denied'
    )

  return (
    <>
      {showOverlay && <StatusOverlay />}

      {/* Top bar */}
      <TopBar />

      {/* Main layout */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left sidebar */}
        <aside className="w-[200px] shrink-0 border-r border-[var(--border)] bg-[var(--bg-surface)] flex flex-col overflow-y-auto">
          <DevicePanel />

          {/* Active notes — fills remaining space */}
          <div className="flex-1 border-t border-[var(--border)] min-h-0">
            <ActiveNotes />
          </div>
        </aside>

        {/* Center + right */}
        <div className="flex flex-col flex-1 min-w-0">
          {/* Piano Roll — main visual (takes most height) */}
          <div className="flex-1 min-h-0 flex flex-col" style={{ minHeight: '160px' }}>
            <div className="panel-header shrink-0">
              <span>Piano Roll</span>
              <span className="text-[var(--text-muted)] normal-case font-mono text-[9px]">← 8 秒时间窗口</span>
            </div>
            <div className="flex-1 min-h-0">
              <PianoRoll />
            </div>
          </div>

          {/* Piano keyboard */}
          <div
            className="shrink-0 border-t border-[var(--border)]"
            style={{ height: '72px' }}
          >
            <PianoKeyboard />
          </div>

          {/* Bottom panels */}
          <div className="h-[200px] shrink-0 flex border-t border-[var(--border)]">
            {/* CC curves */}
            <div className="flex-1 flex flex-col border-r border-[var(--border)] min-w-0">
              <div className="panel-header shrink-0">
                <span>CC 控制器曲线</span>
                <span className="text-[var(--text-muted)] normal-case font-mono text-[9px]">+/- 时间轴  Shift+/- 数值轴</span>
              </div>
              <div className="flex-1 min-h-0 p-2">
                <CcPanel />
              </div>
            </div>

            {/* Event log */}
            <div className="w-[280px] shrink-0 flex flex-col">
              <EventLog />
            </div>
          </div>

          {/* Stats bar */}
          <StatsBar />
        </div>
      </div>
    </>
  )
}
