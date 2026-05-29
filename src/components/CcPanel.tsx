import { useEffect, useRef, useState } from 'react'
import { midiEngine } from '../core/midiEngine'
import { getCcName, FEATURED_CC } from '../utils/noteUtils'

const VISIBLE_SECONDS = 8
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

  useEffect(() => {
    const unsub = midiEngine.subscribe((_evt) => {
      // Add new CC series that appear
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

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const draw = () => {
      const W = canvas.width
      const H = canvas.height
      const dpr = window.devicePixelRatio || 1

      ctx.fillStyle = '#0d0d12'
      ctx.fillRect(0, 0, W, H)

      // Grid
      ctx.strokeStyle = 'rgba(255,255,255,0.04)'
      ctx.lineWidth = 1
      for (let v = 0; v <= 128; v += 32) {
        const y = H - (v / 127) * H
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(W, y)
        ctx.stroke()
        if (v > 0 && v < 128) {
          ctx.fillStyle = 'rgba(255,255,255,0.12)'
          ctx.font = '8px IBM Plex Mono, monospace'
          ctx.fillText(String(v), 2, y - 2)
        }
      }

      // Time grid
      for (let s = 1; s < VISIBLE_SECONDS; s++) {
        const x = W - (s / VISIBLE_SECONDS) * W
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, H)
        ctx.stroke()
      }

      const nowMs = midiEngine.getCurrentTime()

      trackedCCs.forEach((tracked) => {
        if (!tracked.active) return
        const series = midiEngine.ccSeries.get(tracked.ccNumber)
        if (!series || series.points.length === 0) return

        const pts = series.points.filter(
          (p) => p.sessionTime >= nowMs - VISIBLE_SECONDS * 1000
        )
        if (pts.length === 0) return

        const color = `hsl(${tracked.hue}, 80%, 60%)`
        ctx.strokeStyle = color
        ctx.lineWidth = 1.5
        ctx.shadowColor = color
        ctx.shadowBlur = 4 * dpr
        ctx.beginPath()

        pts.forEach((pt, i) => {
          const x = W - ((nowMs - pt.sessionTime) / (VISIBLE_SECONDS * 1000)) * W
          const y = H - (pt.value / 127) * H
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        })
        ctx.stroke()
        ctx.shadowBlur = 0

        // Current value dot
        const last = pts[pts.length - 1]
        const dotX = W - ((nowMs - last.sessionTime) / (VISIBLE_SECONDS * 1000)) * W
        const dotY = H - (last.value / 127) * H
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(dotX, dotY, 3 * dpr, 0, Math.PI * 2)
        ctx.fill()
      })

      // Pitch bend line
      const pb = midiEngine.pitchBend
      if (Math.abs(pb) > 10) {
        const pbY = H - ((pb + 8192) / 16384) * H
        ctx.strokeStyle = 'rgba(240, 160, 32, 0.7)'
        ctx.lineWidth = 1
        ctx.setLineDash([4, 4])
        ctx.beginPath()
        ctx.moveTo(0, pbY)
        ctx.lineTo(W, pbY)
        ctx.stroke()
        ctx.setLineDash([])
      }

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [trackedCCs])

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
    <div className="flex flex-col h-full gap-2">
      <div className="flex flex-wrap gap-x-3 gap-y-1 px-1">
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
      </div>
      <div className="flex-1 rounded overflow-hidden border border-[var(--border)]">
        <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
      </div>
    </div>
  )
}
