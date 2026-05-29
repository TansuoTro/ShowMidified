export type MidiEventType =
  | 'noteOn'
  | 'noteOff'
  | 'controlChange'
  | 'pitchBend'
  | 'programChange'
  | 'aftertouch'
  | 'channelPressure'
  | 'unknown'

export interface MidiDeviceInfo {
  id: string
  name: string
  manufacturer: string
  state: 'connected' | 'disconnected'
}

export interface MidiEvent {
  id: string
  timestamp: number
  sessionTime: number
  deviceId: string
  deviceName: string
  channel: number
  type: MidiEventType
  rawBytes: number[]
  noteNumber?: number
  noteName?: string
  velocity?: number
  releaseVelocity?: number
  ccNumber?: number
  ccValue?: number
  ccName?: string
  pitchBend?: number
  program?: number
  pressure?: number
}

export interface ActiveNote {
  noteNumber: number
  noteName: string
  channel: number
  velocity: number
  startTime: number
  deviceId: string
}

export interface CcPoint {
  sessionTime: number
  value: number
}

export interface CcSeries {
  ccNumber: number
  ccName: string
  channel: number
  points: CcPoint[]
  currentValue: number
}

export interface PitchBendPoint {
  sessionTime: number
  value: number
}

export type RecordingState = 'idle' | 'recording' | 'paused' | 'stopped'

export type BrowserSupportState = 'checking' | 'supported' | 'unsupported'
export type PermissionState = 'unknown' | 'granted' | 'denied' | 'requesting'

export interface SessionStats {
  eventCount: number
  noteOnCount: number
  fps: number
  inputLatency: number
  sessionDuration: number
}
