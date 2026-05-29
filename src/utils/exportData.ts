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

function downloadBlob(content: string, filename: string, type: string): void {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
