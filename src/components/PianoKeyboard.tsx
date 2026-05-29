import { useEffect, useRef } from 'react'
import type { ActiveNote } from '../types/midi'
import { midiEngine } from '../core/midiEngine'
import { PIANO_MIN, PIANO_MAX, isWhiteKey, TOTAL_WHITE_KEYS } from '../utils/noteUtils'

const CHANNEL_HUES = [188, 142, 38, 355, 270, 210, 25, 300, 160, 60, 195, 320, 85, 15, 240, 180]

export function PianoKeyboard() {
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
      const whiteW = W / TOTAL_WHITE_KEYS
      const whiteH = H
      const blackW = whiteW * 0.6
      const blackH = H * 0.62
      const dpr = window.devicePixelRatio || 1

      const activeNotes = midiEngine.activeNotes

      // White keys background
      ctx.fillStyle = '#1a1a24'
      ctx.fillRect(0, 0, W, H)

      // Build white key positions
      const whiteKeyPositions: number[] = []
      let wIndex = 0
      for (let n = PIANO_MIN; n <= PIANO_MAX; n++) {
        if (isWhiteKey(n)) {
          whiteKeyPositions[n] = wIndex
          wIndex++
        }
      }

      // Draw white keys
      let wi = 0
      for (let note = PIANO_MIN; note <= PIANO_MAX; note++) {
        if (!isWhiteKey(note)) continue
        const x = wi * whiteW
        const key = activeNotes.get(`0-${note}`) ?? activeNotes.get(`1-${note}`) ??
          activeNotes.get(`2-${note}`) ?? findActiveNote(activeNotes, note)

        if (key) {
          const hue = CHANNEL_HUES[key.channel % 16]
          const l = 55 + (key.velocity / 127) * 30
          ctx.fillStyle = `hsl(${hue}, 90%, ${l}%)`
          ctx.shadowColor = `hsl(${hue}, 100%, 70%)`
          ctx.shadowBlur = 12 * dpr
          ctx.fillRect(x + 1, 0, whiteW - 2, whiteH)
          ctx.shadowBlur = 0
        } else {
          // Gradient white key
          const grad = ctx.createLinearGradient(x, 0, x, whiteH)
          grad.addColorStop(0, '#d8d8e8')
          grad.addColorStop(1, '#b0b0c4')
          ctx.fillStyle = grad
          ctx.fillRect(x + 1, 0, whiteW - 2, whiteH)
        }

        // Key border
        ctx.strokeStyle = '#2a2a38'
        ctx.lineWidth = 1
        ctx.strokeRect(x + 0.5, 0.5, whiteW - 1, whiteH - 1)

        // Note label on C keys
        if (note % 12 === 0) {
          const octave = Math.floor(note / 12) - 1
          ctx.fillStyle = key ? 'rgba(0,0,0,0.6)' : 'rgba(80,80,100,0.8)'
          ctx.font = `${Math.max(8, whiteW * 0.45)}px IBM Plex Mono, monospace`
          ctx.textAlign = 'center'
          ctx.fillText(`C${octave}`, x + whiteW / 2, whiteH - 5)
        }
        wi++
      }
      ctx.textAlign = 'left'

      // Draw black keys
      for (let note = PIANO_MIN; note <= PIANO_MAX; note++) {
        if (isWhiteKey(note)) continue
        // Find position between adjacent white keys
        const prevWhiteIdx = whiteKeyPositions[note - 1]
        if (prevWhiteIdx === undefined) continue
        const x = prevWhiteIdx * whiteW + whiteW * 0.65

        const key = findActiveNote(activeNotes, note)
        if (key) {
          const hue = CHANNEL_HUES[key.channel % 16]
          const l = 45 + (key.velocity / 127) * 30
          ctx.fillStyle = `hsl(${hue}, 90%, ${l}%)`
          ctx.shadowColor = `hsl(${hue}, 100%, 70%)`
          ctx.shadowBlur = 10 * dpr
          ctx.fillRect(x, 0, blackW, blackH)
          ctx.shadowBlur = 0
        } else {
          const grad = ctx.createLinearGradient(x, 0, x, blackH)
          grad.addColorStop(0, '#1c1c28')
          grad.addColorStop(1, '#0a0a12')
          ctx.fillStyle = grad
          ctx.fillRect(x, 0, blackW, blackH)
        }

        ctx.strokeStyle = '#3a3a50'
        ctx.lineWidth = 1
        ctx.strokeRect(x + 0.5, 0.5, blackW - 1, blackH - 1)
      }

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

function findActiveNote(
  activeNotes: Map<string, ActiveNote>,
  noteNumber: number
): ActiveNote | undefined {
  for (const [key, note] of activeNotes) {
    if (key.endsWith(`-${noteNumber}`)) return note
  }
  return undefined
}
