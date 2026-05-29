import { useEffect, useRef, useState, useCallback } from 'react'
import { midiEngine } from '../core/midiEngine'
import { getCcName, FEATURED_CC } from '../utils/noteUtils'

const CHANNEL_HUES = [188, 142, 38, 355, 270, 210, 25, 300]

interface TrackedCc {
  ccNumber: number
  label: string
  hue: number
  active: boolean
}

export function CcPanel() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const [trackedCCs, setTrackedCCs] = useState<TrackedCc[]>(
    FEATURED_CC.map((cc, i) => ({ ccNumber: cc, label: getCcName(cc), hue: CHANNEL_HUES[i % 8], active: true }))
  )
  const [timeZoom, setTimeZoom] = useState(1)
  const [valueZoom, setValueZoom] = useState(1)
  const [valueCenter, setValueCenter] = useState(64)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
    if (e.key === '=' || e.key === '+') {
      e.preventDefault()
      if (e.shiftKey) {
        setValueZoom((z) => Math.min(8, z * 1.5))
      } else {
        setTimeZoom((z) => Math.min(16, z * 1.5))
      }
    } else if (e.key === '-') {
      e.preventDefault()
      if (e.shiftKey) {
        setValueZoom((z) => Math.max(1, z / 1.5))
      } else {
        setTimeZoom((z) => Math.max(0.25, z / 1.5))
      }
    } else if (e.key === '0' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      setTimeZoom(1)
      setValueZoom(1)
      setValueCenter(64)
    }
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  useEffect(() => {
    const unsub = midiEngine.subscribe(() => {
      setTrackedCCs((prev) => {
        const existing = new Set(prev.map((t) => t.ccNumber))
        const newCCs: TrackedCc[] = []
        midiEngine.ccSeries.forEach((_, cc) => {
          if (!existing.has(cc)) {
            newCCs.push({
              ccNumber: cc,
              label: getCcName(cc),
              hue: CHANNEL_HUES[newCCs.length % 8],
              active: true,
            })
          }
        })
        return newCCs.length > 0 ? [...prev, ...newCCs] : prev
      })
    })
    return unsub
  }, [])

  const calcZoomFromWheel = useCallback((e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      setValueZoom((z) => {
        const factor = e.deltaY > 0 ? 1 / 1.2 : 1.2
        return Math.max(1, Math.min(8, z * factor))
      })
    } else {
      e.preventDefault()
      setTimeZoom((z) => {
        const factor = e.deltaY > 0 ? 1 / 1.2 : 1.2
        return Math.max(0.25, Math.min(16, z * factor))
      })
    }
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    container.addEventListener('wheel', calcZoomFromWheel, { passive: false })
    return () => container.removeEventListener('wheel', calcZoomFromWheel)
  }, [calcZoomFromWheel])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const draw = () => {
      const W = canvas.width
      const H = canvas.height
      const dpr = window.devicePixelRatio || 1
      const visibleSec = 8 / timeZoom
      const valueMin = Math.max(0, valueCenter - 64 / valueZoom)
      const valueMax = Math.min(127, valueCenter + 64 / valueZoom)
      const valueRange = valueMax - valueMin

      ctx.fillStyle = '#0a0a10'
      ctx.fillRect(0, 0, W, H)

      // Draw subtle horizontal grid lines (FL Studio style)
      const yStep = valueRange > 64 ? 32 : valueRange > 32 ? 16 : 8
      ctx.strokeStyle = 'rgba(255,255,255,0.04)'
      ctx.lineWidth = 1
      for (let v = 0; v <= 127; v += yStep) {
        if (v < valueMin || v > valueMax) continue
        const y = H - ((v - valueMin) / valueRange) * H
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(W, y)
        ctx.stroke()
      }

      // Major grid lines (0, 64, 127) more prominent
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'
      ctx.lineWidth = 1
      for (const v of [0, 64, 127]) {
        if (v < valueMin || v > valueMax) continue
        const y = H - ((v - valueMin) / valueRange) * H
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(W, y)
        ctx.stroke()
        ctx.fillStyle = 'rgba(255,255,255,0.15)'
        ctx.font = '8px IBM Plex Mono, monospace'
        ctx.fillText(String(v), 3, y - 2)
      }

      // Vertical time grid
      const gridSec = visibleSec > 8 ? 2 : visibleSec > 4 ? 1 : visibleSec > 2 ? 0.5 : 0.25
      ctx.strokeStyle = 'rgba(255,255,255,0.05)'
      for (let s = 0; s <= visibleSec; s += gridSec) {
        const x = W - (s / visibleSec) * W
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, H)
        ctx.stroke()
        if (s > 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.1)'
          ctx.font = '7px IBM Plex Mono, monospace'
          ctx.fillText(`-${s.toFixed(s < 1 ? 2 : 0)}s`, x + 2, H - 3)
        }
      }

      const nowMs = midiEngine.getCurrentTime()
      const timeWindow = visibleSec * 1000

      // Draw filled area under curves (FL Studio style)
      trackedCCs.forEach((tracked) => {
        if (!tracked.active) return
        const series = midiEngine.ccSeries.get(tracked.ccNumber)
        if (!series || series.points.length === 0) return

        const pts = series.points.filter((p) => p.sessionTime >= nowMs - timeWindow)
        if (pts.length < 2) return

        const hue = tracked.hue
        const color = `hsl(${hue}, 75%, 55%)`

        // Filled area with gradient under the curve
        const grad = ctx.createLinearGradient(0, 0, 0, H)
        grad.addColorStop(0, `hsla(${hue}, 75%, 55%, 0.12)`)
        grad.addColorStop(1, `hsla(${hue}, 75%, 55%, 0.02)`)
        ctx.fillStyle = grad
        ctx.beginPath()
        pts.forEach((pt, i) => {
          const x = W - ((nowMs - pt.sessionTime) / timeWindow) * W
          const y = H - ((pt.value - valueMin) / valueRange) * H
          if (i === 0) ctx.moveTo(x, H)
          if (i === 0) ctx.lineTo(x, y)
          else ctx.lineTo(x, y)
        })
        const lastPt = pts[pts.length - 1]
        const lastX = W - ((nowMs - lastPt.sessionTime) / timeWindow) * W
        ctx.lineTo(lastX, H)
        ctx.closePath()
        ctx.fill()

        // Curve line with glow
        ctx.strokeStyle = color
        ctx.lineWidth = 2
        ctx.lineJoin = 'round'
        ctx.lineCap = 'round'
        ctx.shadowColor = `hsla(${hue}, 100%, 70%, 0.4)`
        ctx.shadowBlur = 6 * dpr
        ctx.beginPath()
        pts.forEach((pt, i) => {
          const x = W - ((nowMs - pt.sessionTime) / timeWindow) * W
          const y = H - ((pt.value - valueMin) / valueRange) * H
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        })
        ctx.stroke()
        ctx.shadowBlur = 0

        // Data points (small filled circles)
        pts.forEach((pt) => {
          const x = W - ((nowMs - pt.sessionTime) / timeWindow) * W
          const y = H - ((pt.value - valueMin) / valueRange) * H
          ctx.fillStyle = `hsl(${hue}, 80%, 65%)`
          ctx.beginPath()
          ctx.arc(x, y, 2.5 * dpr, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = `hsl(${hue}, 80%, 40%)`
          ctx.lineWidth = 0.5
          ctx.stroke()
        })

        // Current value dot (larger, bright)
        const last = pts[pts.length - 1]
        const dotX = W - ((nowMs - last.sessionTime) / timeWindow) * W
        const dotY = H - ((last.value - valueMin) / valueRange) * H
        ctx.shadowColor = `hsla(${hue}, 100%, 70%, 0.6)`
        ctx.shadowBlur = 8 * dpr
        ctx.fillStyle = `hsl(${hue}, 90%, 75%)`
        ctx.beginPath()
        ctx.arc(dotX, dotY, 4 * dpr, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
      })

      // Pitch bend line (dashed, amber)
      const pb = midiEngine.pitchBend
      if (Math.abs(pb) > 10) {
        const pbY = H - ((pb + 8192 - valueMin * 64.5) / (valueRange * 64.5)) * H
        ctx.strokeStyle = 'rgba(240, 160, 32, 0.5)'
        ctx.lineWidth = 1
        ctx.setLineDash([4, 4])
        ctx.beginPath()
        ctx.moveTo(0, pbY)
        ctx.lineTo(W, pbY)
        ctx.stroke()
        ctx.setLineDash([])
      }

      // FL Studio style playhead line (thin, bright)
      ctx.strokeStyle = 'rgba(200, 220, 255, 0.25)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(W, 0)
      ctx.lineTo(W, H)
      ctx.stroke()

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [trackedCCs, timeZoom, valueZoom, valueCenter])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const setSize = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
    }
    setSize()
    const ro = new ResizeObserver(setSize)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="flex flex-col h-full gap-2" ref={containerRef}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
        {trackedCCs.map((t) => {
          const series = midiEngine.ccSeries.get(t.ccNumber)
          const val = series?.currentValue ?? '-'
          return (
            <button
              key={t.ccNumber}
              onClick={() =>
                setTrackedCCs((prev) =>
                  prev.map((x) => (x.ccNumber === t.ccNumber ? { ...x, active: !x.active } : x))
                )
              }
              className="flex items-center gap-1 text-[10px] font-mono transition-opacity"
              style={{ opacity: t.active ? 1 : 0.35 }}
            >
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ background: `hsl(${t.hue},80%,60%)` }}
              />
              <span style={{ color: `hsl(${t.hue},80%,60%)` }}>{t.label}</span>
              <span className="text-[var(--text-muted)]">{val}</span>
            </button>
          )
        })}
        <div className="ml-auto text-[9px] font-mono text-[var(--text-muted)]">
          X{timeZoom.toFixed(1)}x Y{valueZoom.toFixed(1)}x
        </div>
      </div>
      <div className="flex-1 rounded overflow-hidden border border-[var(--border)]">
        <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
      </div>
    </div>
  )
}
