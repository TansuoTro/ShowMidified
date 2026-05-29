import { useEffect, useState } from 'react'
import { useMidi } from '../store/MidiContext'
import { midiEngine } from '../core/midiEngine'

function useTimer() {
  const [t, setT] = useState('0:00.00')
  useEffect(() => {
    let raf: number
    const update = () => {
      const ms = midiEngine.getCurrentTime()
      if (ms > 0) {
        const s = ms / 1000
        const m = Math.floor(s / 60)
        const sec = (s % 60).toFixed(2)
        setT(`${m}:${sec.padStart(5, '0')}`)
      }
      raf = requestAnimationFrame(update)
    }
    raf = requestAnimationFrame(update)
    return () => cancelAnimationFrame(raf)
  }, [])
  return t
}

function useFps() {
  const [fps, setFps] = useState(0)
  useEffect(() => {
    let last = performance.now()
    let frames = 0
    let raf: number
    const update = () => {
      frames++
      const now = performance.now()
      if (now - last >= 1000) {
        setFps(frames)
        frames = 0
        last = now
      }
      raf = requestAnimationFrame(update)
    }
    raf = requestAnimationFrame(update)
    return () => cancelAnimationFrame(raf)
  }, [])
  return fps
}

export function StatsBar() {
  const { eventCount, activeNotes, recordingState } = useMidi()
  const timer = useTimer()
  const fps = useFps()

  const stateLabel: Record<string, string> = {
    idle: '待机',
    recording: '录制中',
    paused: '已暂停',
    stopped: '已停止',
  }
  const stateColor: Record<string, string> = {
    idle: 'var(--text-muted)',
    recording: 'var(--accent-green)',
    paused: 'var(--accent-amber)',
    stopped: 'var(--text-secondary)',
  }

  return (
    <div className="flex items-center gap-4 px-3 py-1 text-[10px] font-mono text-[var(--text-muted)] border-t border-[var(--border)] bg-[var(--bg-base)]">
      <span style={{ color: stateColor[recordingState] }}>● {stateLabel[recordingState] ?? recordingState}</span>
      <span className="tabular-nums">{timer}</span>
      <span>{eventCount.toLocaleString()} 事件</span>
      <span>{activeNotes.length} 活跃音符</span>
      <span className="ml-auto">{fps} fps</span>
    </div>
  )
}
