import type {
  MidiDeviceInfo,
  MidiEvent,
  ActiveNote,
  CcSeries,
  RecordingState,
  BrowserSupportState,
  PermissionState,
} from '../types/midi'
import { parseMidiMessage } from './midiParser'
import { getCcName, getNoteName } from '../utils/noteUtils'

export type MidiEngineListener = (evt: Event) => void

const MAX_EVENT_BUFFER = 2000
const MAX_CC_POINTS = 600

class MidiEngine extends EventTarget {
  // --- UI-visible state (triggers listeners) ---
  browserSupport: BrowserSupportState = 'checking'
  permission: PermissionState = 'unknown'
  devices: MidiDeviceInfo[] = []
  selectedDeviceId: string | null = null
  recordingState: RecordingState = 'idle'
  isDemoMode = false

  // --- High-frequency data (read by rAF, no listeners) ---
  activeNotes: Map<string, ActiveNote> = new Map()
  eventBuffer: MidiEvent[] = []          // rolling recent events for display
  allEvents: MidiEvent[] = []            // full session
  ccSeries: Map<number, CcSeries> = new Map()
  pitchBend: number = 0
  sessionStartTime: number = 0
  pauseOffset: number = 0
  pauseStart: number = 0
  selectedChannel: number = -1           // -1 = all channels

  private midiAccess: MIDIAccess | null = null
  private activeInput: MIDIInput | null = null
  private demoInterval: ReturnType<typeof setInterval> | null = null

  private notify() {
    this.dispatchEvent(new Event('change'))
  }

  subscribe(fn: MidiEngineListener): () => void {
    this.addEventListener('change', fn)
    return () => this.removeEventListener('change', fn)
  }

  getCurrentTime(): number {
    if (this.recordingState === 'idle' || this.recordingState === 'stopped') return 0
    if (this.recordingState === 'paused') {
      return this.pauseStart - this.sessionStartTime - this.pauseOffset
    }
    return performance.now() - this.sessionStartTime - this.pauseOffset
  }

  async requestAccess(): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.requestMIDIAccess) {
      this.browserSupport = 'unsupported'
      this.notify()
      return
    }
    this.browserSupport = 'supported'
    this.permission = 'requesting'
    this.notify()
    try {
      this.midiAccess = await navigator.requestMIDIAccess({ sysex: false })
      this.permission = 'granted'
      this.refreshDevices()
      this.midiAccess.addEventListener('statechange', () => {
        this.refreshDevices()
        this.notify()
      })
    } catch {
      this.permission = 'denied'
    }
    this.notify()
  }

  private refreshDevices(): void {
    if (!this.midiAccess) return
    const devs: MidiDeviceInfo[] = []
    this.midiAccess.inputs.forEach((input) => {
      devs.push({
        id: input.id,
        name: input.name ?? 'Unknown Device',
        manufacturer: input.manufacturer ?? '',
        state: input.state === 'connected' ? 'connected' : 'disconnected',
      })
    })
    this.devices = devs

    // Auto-reselect if selected device disconnected
    if (this.selectedDeviceId) {
      const found = devs.find((d) => d.id === this.selectedDeviceId)
      if (!found || found.state === 'disconnected') {
        this.disconnectInput()
        this.selectedDeviceId = null
        if (this.recordingState === 'recording') {
          this.recordingState = 'stopped'
        }
      }
    }
    this.notify()
  }

  selectDevice(id: string | null): void {
    this.disconnectInput()
    this.selectedDeviceId = id
    if (id && this.midiAccess) {
      const input = this.midiAccess.inputs.get(id)
      if (input) {
        this.activeInput = input
        input.addEventListener('midimessage', this.onMidiMessage)
      }
    }
    this.notify()
  }

  private disconnectInput(): void {
    if (this.activeInput) {
      this.activeInput.removeEventListener('midimessage', this.onMidiMessage)
      this.activeInput = null
    }
  }

  private onMidiMessage = (e: Event): void => {
    if (this.recordingState !== 'recording') return
    const evt = e as MIDIMessageEvent
    if (!evt.data) return
    const deviceName =
      this.devices.find((d) => d.id === this.selectedDeviceId)?.name ?? 'Unknown'
    const parsed = parseMidiMessage(
      evt.data,
      evt.timeStamp,
      this.selectedDeviceId ?? 'unknown',
      deviceName,
      this.sessionStartTime + this.pauseOffset
    )
    if (parsed) this.ingestEvent(parsed)
  }

  ingestEvent(event: MidiEvent): void {
    if (this.selectedChannel !== -1 && event.channel !== this.selectedChannel) return

    this.allEvents.push(event)
    this.eventBuffer.push(event)
    if (this.eventBuffer.length > MAX_EVENT_BUFFER) this.eventBuffer.shift()

    if (event.type === 'noteOn' && event.noteNumber !== undefined) {
      const key = `${event.channel}-${event.noteNumber}`
      this.activeNotes.set(key, {
        noteNumber: event.noteNumber,
        noteName: event.noteName ?? '',
        channel: event.channel,
        velocity: event.velocity ?? 64,
        startTime: event.sessionTime,
        deviceId: event.deviceId,
      })
    } else if (event.type === 'noteOff' && event.noteNumber !== undefined) {
      this.activeNotes.delete(`${event.channel}-${event.noteNumber}`)
    } else if (event.type === 'controlChange' && event.ccNumber !== undefined) {
      this.updateCcSeries(event)
    } else if (event.type === 'pitchBend' && event.pitchBend !== undefined) {
      this.pitchBend = event.pitchBend
    }
  }

  private updateCcSeries(event: MidiEvent): void {
    const key = event.ccNumber!
    let series = this.ccSeries.get(key)
    if (!series) {
      series = {
        ccNumber: key,
        ccName: getCcName(key),
        channel: event.channel,
        points: [],
        currentValue: 0,
      }
      this.ccSeries.set(key, series)
    }
    series.currentValue = event.ccValue!
    series.points.push({ sessionTime: event.sessionTime, value: event.ccValue! })
    if (series.points.length > MAX_CC_POINTS) series.points.shift()
  }

  startRecording(): void {
    this.clearSession()
    this.sessionStartTime = performance.now()
    this.pauseOffset = 0
    this.recordingState = 'recording'
    this.notify()
  }

  pauseRecording(): void {
    if (this.recordingState !== 'recording') return
    this.pauseStart = performance.now()
    this.recordingState = 'paused'
    this.notify()
  }

  resumeRecording(): void {
    if (this.recordingState !== 'paused') return
    this.pauseOffset += performance.now() - this.pauseStart
    this.recordingState = 'recording'
    this.notify()
  }

  stopRecording(): void {
    this.recordingState = 'stopped'
    this.activeNotes.clear()
    this.notify()
  }

  clearSession(): void {
    this.allEvents = []
    this.eventBuffer = []
    this.activeNotes.clear()
    this.ccSeries.clear()
    this.pitchBend = 0
    this.pauseOffset = 0
    this.notify()
  }

  setChannelFilter(channel: number): void {
    this.selectedChannel = channel
    this.notify()
  }

  startDemo(): void {
    this.isDemoMode = true
    this.startRecording()
    const notes = [60, 62, 64, 65, 67, 69, 71, 72, 60, 64, 67, 72]
    let i = 0
    let noteOnScheduled = true
    const deviceName = '演示模式 (虚拟 MIDI)'
    this.demoInterval = setInterval(() => {
      const noteNumber = notes[i % notes.length]
      const velocity = 60 + Math.floor(Math.random() * 50)
      const channel = i % 3
      const now = performance.now()
      const sessionTime = now - this.sessionStartTime

      if (noteOnScheduled) {
        this.ingestEvent({
          id: `demo-${i}-on`,
          timestamp: now,
          sessionTime,
          deviceId: 'demo',
          deviceName,
          channel,
          type: 'noteOn',
          rawBytes: [0x90 | channel, noteNumber, velocity],
          noteNumber,
          noteName: getNoteName(noteNumber),
          velocity,
        })
        // CC mod wheel variation
        if (i % 4 === 0) {
          this.ingestEvent({
            id: `demo-${i}-cc`,
            timestamp: now,
            sessionTime,
            deviceId: 'demo',
            deviceName,
            channel: 0,
            type: 'controlChange',
            rawBytes: [0xb0, 1, Math.floor(Math.random() * 127)],
            ccNumber: 1,
            ccValue: Math.floor(Math.random() * 127),
            ccName: 'Mod Wheel',
          })
        }
        // sustain occasionally
        if (i % 8 === 0) {
          this.ingestEvent({
            id: `demo-${i}-sus`,
            timestamp: now,
            sessionTime,
            deviceId: 'demo',
            deviceName,
            channel: 0,
            type: 'controlChange',
            rawBytes: [0xb0, 64, i % 16 < 8 ? 127 : 0],
            ccNumber: 64,
            ccValue: i % 16 < 8 ? 127 : 0,
            ccName: 'Sustain',
          })
        }
      } else {
        this.ingestEvent({
          id: `demo-${i}-off`,
          timestamp: now,
          sessionTime,
          deviceId: 'demo',
          deviceName,
          channel,
          type: 'noteOff',
          rawBytes: [0x80 | channel, noteNumber, 0],
          noteNumber,
          noteName: getNoteName(noteNumber),
          velocity: 0,
          releaseVelocity: Math.floor(Math.random() * 40),
        })
        i++
      }
      noteOnScheduled = !noteOnScheduled
    }, 280)
    this.notify()
  }

  stopDemo(): void {
    if (this.demoInterval) {
      clearInterval(this.demoInterval)
      this.demoInterval = null
    }
    this.isDemoMode = false
    this.stopRecording()
    this.notify()
  }
}

// Singleton
export const midiEngine = new MidiEngine()
