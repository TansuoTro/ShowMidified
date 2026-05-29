import type { MidiEvent } from '../types/midi'

export function exportJson(events: MidiEvent[], sessionDuration: number): void {
  const data = {
    exportedAt: new Date().toISOString(),
    sessionDuration,
    eventCount: events.length,
    events: events.map((e) => ({
      id: e.id,
      sessionTime: Math.round(e.sessionTime),
      channel: e.channel,
      type: e.type,
      rawBytes: e.rawBytes,
      noteNumber: e.noteNumber,
      noteName: e.noteName,
      velocity: e.velocity,
      releaseVelocity: e.releaseVelocity,
      ccNumber: e.ccNumber,
      ccValue: e.ccValue,
      ccName: e.ccName,
      pitchBend: e.pitchBend,
      program: e.program,
      pressure: e.pressure,
      deviceName: e.deviceName,
    })),
  }
  downloadBlob(
    JSON.stringify(data, null, 2),
    `midi-session-${Date.now()}.json`,
    'application/json'
  )
}

export function exportCsv(events: MidiEvent[]): void {
  const headers = [
    'sessionTime',
    'channel',
    'type',
    'noteNumber',
    'noteName',
    'velocity',
    'releaseVelocity',
    'ccNumber',
    'ccValue',
    'ccName',
    'pitchBend',
    'program',
    'pressure',
    'deviceName',
    'rawBytes',
  ]
  const rows = events.map((e) =>
    [
      Math.round(e.sessionTime),
      e.channel,
      e.type,
      e.noteNumber ?? '',
      e.noteName ?? '',
      e.velocity ?? '',
      e.releaseVelocity ?? '',
      e.ccNumber ?? '',
      e.ccValue ?? '',
      e.ccName ?? '',
      e.pitchBend ?? '',
      e.program ?? '',
      e.pressure ?? '',
      `"${e.deviceName}"`,
      `"${e.rawBytes.join(' ')}"`,
    ].join(',')
  )
  downloadBlob(
    [headers.join(','), ...rows].join('\n'),
    `midi-session-${Date.now()}.csv`,
    'text/csv'
  )
}

function downloadBlob(content: BlobPart, filename: string, type: string): void {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function encodeVLQ(value: number): number[] {
  const bytes: number[] = []
  bytes.push(value & 0x7F)
  value >>= 7
  while (value > 0) {
    bytes.push(0x80 | (value & 0x7F))
    value >>= 7
  }
  bytes.reverse()
  return bytes
}

export function saveMidi(events: MidiEvent[]): void {
  const BPM = 120
  const TICKS_PER_QUARTER = 480
  const sorted = [...events].filter((e) => e.type !== 'unknown').sort((a, b) => a.sessionTime - b.sessionTime)
  if (sorted.length === 0) return

  const trackData: number[] = []

  const tempo = Math.round(60000000 / BPM)
  trackData.push(0x00, 0xFF, 0x51, 0x03, (tempo >> 16) & 0xFF, (tempo >> 8) & 0xFF, tempo & 0xFF)

  let lastTime = 0
  for (const event of sorted) {
    const deltaMs = event.sessionTime - lastTime
    lastTime = event.sessionTime
    const deltaTicks = Math.round(deltaMs * BPM * TICKS_PER_QUARTER / 60000)
    const deltaVLQ = encodeVLQ(deltaTicks)

    let message: number[]
    switch (event.type) {
      case 'noteOn':
        message = [0x90 | event.channel, event.noteNumber ?? 0, event.velocity ?? 64]
        break
      case 'noteOff':
        message = [0x80 | event.channel, event.noteNumber ?? 0, event.releaseVelocity ?? 0]
        break
      case 'controlChange':
        message = [0xB0 | event.channel, event.ccNumber ?? 0, event.ccValue ?? 0]
        break
      case 'pitchBend': {
        const pb = (event.pitchBend ?? 0) + 8192
        message = [0xE0 | event.channel, pb & 0x7F, (pb >> 7) & 0x7F]
        break
      }
      case 'programChange':
        message = [0xC0 | event.channel, event.program ?? 0]
        break
      case 'aftertouch':
        message = [0xA0 | event.channel, event.noteNumber ?? 0, event.pressure ?? 0]
        break
      case 'channelPressure':
        message = [0xD0 | event.channel, event.pressure ?? 0]
        break
      default:
        continue
    }
    trackData.push(...deltaVLQ, ...message)
  }

  trackData.push(0x00, 0xFF, 0x2F, 0x00)

  const trackLen = trackData.length
  const midiBytes = new Uint8Array([
    0x4D, 0x54, 0x68, 0x64,
    0x00, 0x00, 0x00, 0x06,
    0x00, 0x00,
    0x00, 0x01,
    (TICKS_PER_QUARTER >> 8) & 0xFF, TICKS_PER_QUARTER & 0xFF,
    0x4D, 0x54, 0x72, 0x6B,
    (trackLen >> 24) & 0xFF, (trackLen >> 16) & 0xFF, (trackLen >> 8) & 0xFF, trackLen & 0xFF,
    ...trackData,
  ])

  downloadBlob(midiBytes, `midi-session-${Date.now()}.mid`, 'audio/midi')
}
