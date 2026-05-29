import { useMemo } from 'react'
import { useMidi } from '../store/MidiContext'
import type { MidiEvent } from '../types/midi'

const EVENT_COLORS: Record<string, string> = {
  noteOn: 'var(--accent-cyan)',
  noteOff: 'rgba(255,255,255,0.3)',
  controlChange: 'var(--accent-amber)',
  pitchBend: '#c084fc',
  programChange: '#4ade80',
  aftertouch: '#fb923c',
  channelPressure: '#fb923c',
  unknown: 'rgba(255,255,255,0.2)',
}

const EVENT_LABELS: Record<string, string> = {
  noteOn: 'ON',
  noteOff: 'OFF',
  controlChange: 'CC',
  pitchBend: 'PB',
  programChange: 'PC',
  aftertouch: 'AT',
  channelPressure: 'CP',
  unknown: '??',
}

function formatTime(ms: number): string {
  const s = ms / 1000
  const m = Math.floor(s / 60)
  const sec = (s % 60).toFixed(2)
  return `${m}:${sec.padStart(5, '0')}`
}

function EventRow({ event }: { event: MidiEvent }) {
  const color = EVENT_COLORS[event.type] ?? 'rgba(255,255,255,0.3)'
  const label = EVENT_LABELS[event.type] ?? '??'

  let detail = ''
  if (event.type === 'noteOn' || event.type === 'noteOff') {
    detail = `${event.noteName ?? '-'}  vel:${event.velocity ?? 0}`
    if (event.type === 'noteOff' && event.releaseVelocity !== undefined) {
      detail += `  rel:${event.releaseVelocity}`
    }
  } else if (event.type === 'controlChange') {
    detail = `${event.ccName} = ${event.ccValue}`
  } else if (event.type === 'pitchBend') {
    detail = `${event.pitchBend ?? 0}`
  } else if (event.type === 'programChange') {
    detail = `程序 ${event.program}`
  } else if (event.type === 'aftertouch') {
    detail = `${event.noteName} p:${event.pressure}`
  } else if (event.type === 'channelPressure') {
    detail = `压力 ${event.pressure}`
  }

  return (
    <div className="flex items-center gap-2 px-2 py-0.5 text-[11px] font-mono border-b border-[var(--border)] hover:bg-white/[0.02] transition-colors">
      <span className="text-[var(--text-muted)] w-[54px] shrink-0 tabular-nums">
        {formatTime(event.sessionTime)}
      </span>
      <span
        className="w-[26px] text-center text-[10px] font-bold rounded px-0.5 shrink-0"
        style={{ color, background: `${color}18` }}
      >
        {label}
      </span>
      <span className="text-[var(--text-muted)] w-[18px] shrink-0 tabular-nums text-right">
        {event.channel + 1}
      </span>
      <span className="text-[var(--text-secondary)] truncate">{detail}</span>
    </div>
  )
}

export function EventLog() {
  const { recentEvents, recordingState } = useMidi()

  const sorted = useMemo(() => [...recentEvents].reverse(), [recentEvents])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-[var(--border)]">
        <span className="text-[11px] font-semibold text-[var(--text-secondary)] tracking-wider uppercase">
          事件流
        </span>
        <span className="text-[10px] font-mono text-[var(--text-muted)]">
          {recentEvents.length} 条
        </span>
      </div>

      {sorted.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-[var(--text-muted)] text-xs font-mono">
          {recordingState === 'recording' ? '等待 MIDI 输入…' : '尚无事件'}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin">
          {sorted.map((e) => (
            <EventRow key={e.id} event={e} />
          ))}
        </div>
      )}
    </div>
  )
}
