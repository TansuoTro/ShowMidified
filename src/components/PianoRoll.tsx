import { useEffect, useRef } from 'react'
import { midiEngine } from '../core/midiEngine'
import { PIANO_MIN, PIANO_MAX } from '../utils/noteUtils'

const NOTE_RANGE = PIANO_MAX - PIANO_MIN + 1  // 88
const VISIBLE_SECONDS = 8

export function PianoRoll() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const draw = () => {
      const W = canvas.width
      const H = canvas.height
      const dpr = window.devicePixelRatio || 1
      const rowH = H / NOTE_RANGE
      const nowMs = midiEngine.getCurrentTime()
      const windowMs = VISIBLE_SECONDS * 1000

      // Background
      ctx.fillStyle = '#09090d'
      ctx.fillRect(0, 0, W, H)

      // Horizontal grid lines (octave boundaries)
      ctx.strokeStyle = 'rgba(255,255,255,0.04)'
      ctx.lineWidth = 1
      for (let note = PIANO_MIN; note <= PIANO_MAX; note++) {
        if (note % 12 === 0) {
          const y = noteToY(note, H)
          ctx.beginPath()
          ctx.moveTo(0, y)
          ctx.lineTo(W, y)
          ctx.stroke()
          // Octave label
          const octave = Math.floor(note / 12) - 1
          ctx.fillStyle = 'rgba(255,255,255,0.12)'
          ctx.font = '9px IBM Plex Mono, monospace'
          ctx.fillText(`C${octave}`, 3, y - 2)
        }
      }

      // Black key rows — subtle tint
      ctx.fillStyle = 'rgba(0,0,0,0.25)'
      for (let note = PIANO_MIN; note <= PIANO_MAX; note++) {
        const mod = note % 12
        if ([1, 3, 6, 8, 10].includes(mod)) {
          const y = noteToY(note, H)
          ctx.fillRect(0, y, W, rowH)
        }
      }

      // Vertical time grid
      const gridIntervalSec = 1
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'
      ctx.lineWidth = 1
      for (let s = 0; s <= VISIBLE_SECONDS; s += gridIntervalSec) {
        const x = W - (s / VISIBLE_SECONDS) * W
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, H)
        ctx.stroke()
        if (s > 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.15)'
          ctx.font = '9px IBM Plex Mono, monospace'
          ctx.fillText(`-${s}s`, x + 2, H - 4)
        }
      }

      // Draw completed notes from eventBuffer
      const events = midiEngine.eventBuffer
      // Build note segments: pair noteOn with noteOff
      const openNotes = new Map<string, { event: typeof events[0]; startX: number }>()

      for (const event of events) {
        if (event.sessionTime < nowMs - windowMs - 200) continue

        const x = timeToX(event.sessionTime, nowMs, W)
        const key = `${event.channel}-${event.noteNumber}`

        if (event.type === 'noteOn' && event.noteNumber !== undefined) {
          openNotes.set(key, { event, startX: x })
        } else if (event.type === 'noteOff' && event.noteNumber !== undefined) {
          const open = openNotes.get(key)
          if (open && open.event.noteNumber !== undefined) {
            drawNote(ctx, open.startX, x, open.event.noteNumber, open.event.channel, open.event.velocity ?? 64, rowH, H, false, dpr)
            openNotes.delete(key)
          }
        }
      }

      // Draw active (still held) notes from activeNotes map
      midiEngine.activeNotes.forEach((note) => {
        const startX = timeToX(note.startTime, nowMs, W)
        const endX = W  // extends to now (right edge)
        drawNote(ctx, startX, endX, note.noteNumber, note.channel, note.velocity, rowH, H, true, dpr)
      })

      // "Now" line
      ctx.strokeStyle = 'rgba(0, 200, 232, 0.6)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(W, 0)
      ctx.lineTo(W, H)
      ctx.stroke()

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

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

  return <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
}

function noteToY(note: number, H: number): number {
  return ((PIANO_MAX - note) / NOTE_RANGE) * H
}

function timeToX(sessionTime: number, nowMs: number, W: number): number {
  const age = nowMs - sessionTime
  return W - (age / (VISIBLE_SECONDS * 1000)) * W
}

function drawNote(
  ctx: CanvasRenderingContext2D,
  x1: number,
  x2: number,
  noteNumber: number,
  channel: number,
  velocity: number,
  rowH: number,
  H: number,
  isActive = false,
  dpr = 1
): void {
  const y = ((PIANO_MAX - noteNumber) / NOTE_RANGE) * H
  const w = Math.max(2, x2 - x1)
  const l = 30 + (velocity / 127) * 40
  const color = `hsl(${[188, 142, 38, 355, 270, 210, 25, 300][channel % 8]}, 80%, ${l}%)`
  const h = Math.max(rowH * 0.8, 2)

  if (isActive) {
    ctx.shadowColor = color
    ctx.shadowBlur = 10 * dpr
  }

  ctx.fillStyle = color
  ctx.beginPath()
  ctx.roundRect(x1, y + rowH * 0.1, w, h, 2)
  ctx.fill()

  if (isActive) {
    ctx.shadowBlur = 0
  }
}
