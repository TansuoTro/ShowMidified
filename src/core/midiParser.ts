import type { MidiEvent, MidiEventType } from '../types/midi'
import { getNoteName, getCcName } from '../utils/noteUtils'

let idCounter = 0

export function parseMidiMessage(
  data: Uint8Array,
  timestamp: number,
  deviceId: string,
  deviceName: string,
  sessionStartTime: number
): MidiEvent | null {
  if (!data || data.length === 0) return null

  const statusByte = data[0]
  // Ignore system real-time (0xF8+)
  if (statusByte >= 0xf8) return null

  const sessionTime = Math.max(0, timestamp - sessionStartTime)
  const rawBytes = Array.from(data)

  const base = {
    id: `e${++idCounter}`,
    timestamp,
    sessionTime,
    deviceId,
    deviceName,
    rawBytes,
  }

  const nibble = (statusByte >> 4) & 0x0f
  const channel = statusByte & 0x0f

  switch (nibble) {
    case 0x9: {
      const noteNumber = data[1] ?? 0
      const velocity = data[2] ?? 0
      const type: MidiEventType = velocity === 0 ? 'noteOff' : 'noteOn'
      return { ...base, channel, type, noteNumber, noteName: getNoteName(noteNumber), velocity }
    }
    case 0x8: {
      const noteNumber = data[1] ?? 0
      const releaseVelocity = data[2] ?? 0
      return {
        ...base,
        channel,
        type: 'noteOff',
        noteNumber,
        noteName: getNoteName(noteNumber),
        velocity: 0,
        releaseVelocity,
      }
    }
    case 0xb: {
      const ccNumber = data[1] ?? 0
      const ccValue = data[2] ?? 0
      return {
        ...base,
        channel,
        type: 'controlChange',
        ccNumber,
        ccValue,
        ccName: getCcName(ccNumber),
      }
    }
    case 0xe: {
      const lsb = data[1] ?? 0
      const msb = data[2] ?? 0
      const pitchBend = ((msb << 7) | lsb) - 8192
      return { ...base, channel, type: 'pitchBend', pitchBend }
    }
    case 0xc: {
      return { ...base, channel, type: 'programChange', program: data[1] ?? 0 }
    }
    case 0xa: {
      const noteNumber = data[1] ?? 0
      return {
        ...base,
        channel,
        type: 'aftertouch',
        noteNumber,
        noteName: getNoteName(noteNumber),
        pressure: data[2] ?? 0,
      }
    }
    case 0xd: {
      return { ...base, channel, type: 'channelPressure', pressure: data[1] ?? 0 }
    }
    default:
      return { ...base, channel: 0, type: 'unknown' }
  }
}
