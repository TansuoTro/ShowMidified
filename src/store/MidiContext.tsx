import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { midiEngine } from '../core/midiEngine'
import type {
  MidiDeviceInfo,
  MidiEvent,
  ActiveNote,
  RecordingState,
  BrowserSupportState,
  PermissionState,
} from '../types/midi'

interface MidiContextValue {
  browserSupport: BrowserSupportState
  permission: PermissionState
  devices: MidiDeviceInfo[]
  selectedDeviceId: string | null
  recordingState: RecordingState
  isDemoMode: boolean
  selectedChannel: number
  // Display state (updated at ~20fps)
  recentEvents: MidiEvent[]
  activeNotes: ActiveNote[]
  eventCount: number
  // Actions
  requestAccess: () => void
  selectDevice: (id: string | null) => void
  startRecording: () => void
  pauseRecording: () => void
  resumeRecording: () => void
  stopRecording: () => void
  clearSession: () => void
  startDemo: () => void
  stopDemo: () => void
  setChannelFilter: (ch: number) => void
  exportJson: () => void
  exportCsv: () => void
}

const MidiContext = createContext<MidiContextValue | null>(null)

export function MidiProvider({ children }: { children: ReactNode }) {
  const [engineState, setEngineState] = useState({
    browserSupport: midiEngine.browserSupport,
    permission: midiEngine.permission,
    devices: midiEngine.devices,
    selectedDeviceId: midiEngine.selectedDeviceId,
    recordingState: midiEngine.recordingState,
    isDemoMode: midiEngine.isDemoMode,
    selectedChannel: midiEngine.selectedChannel,
  })
  const [recentEvents, setRecentEvents] = useState<MidiEvent[]>([])
  const [activeNotes, setActiveNotes] = useState<ActiveNote[]>([])
  const [eventCount, setEventCount] = useState(0)

  useEffect(() => {
    const unsub = midiEngine.subscribe((_evt) => {
      setEngineState({
        browserSupport: midiEngine.browserSupport,
        permission: midiEngine.permission,
        devices: midiEngine.devices,
        selectedDeviceId: midiEngine.selectedDeviceId,
        recordingState: midiEngine.recordingState,
        isDemoMode: midiEngine.isDemoMode,
        selectedChannel: midiEngine.selectedChannel,
      })
    })
    return unsub
  }, [])

  // Update display state at ~20fps
  useEffect(() => {
    let raf: number
    const loop = () => {
      setRecentEvents([...midiEngine.eventBuffer].slice(-80))
      setActiveNotes(Array.from(midiEngine.activeNotes.values()))
      setEventCount(midiEngine.allEvents.length)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Request access on mount
  useEffect(() => {
    midiEngine.requestAccess()
  }, [])

  const exportJson = useCallback(() => {
    import('../utils/exportData').then(({ exportJson: fn }) => {
      fn(midiEngine.allEvents, midiEngine.getCurrentTime())
    })
  }, [])

  const exportCsv = useCallback(() => {
    import('../utils/exportData').then(({ exportCsv: fn }) => {
      fn(midiEngine.allEvents)
    })
  }, [])

  const value: MidiContextValue = {
    ...engineState,
    recentEvents,
    activeNotes,
    eventCount,
    requestAccess: () => midiEngine.requestAccess(),
    selectDevice: (id) => midiEngine.selectDevice(id),
    startRecording: () => midiEngine.startRecording(),
    pauseRecording: () => midiEngine.pauseRecording(),
    resumeRecording: () => midiEngine.resumeRecording(),
    stopRecording: () => midiEngine.stopRecording(),
    clearSession: () => midiEngine.clearSession(),
    startDemo: () => midiEngine.startDemo(),
    stopDemo: () => midiEngine.stopDemo(),
    setChannelFilter: (ch) => midiEngine.setChannelFilter(ch),
    exportJson,
    exportCsv,
  }

  return <MidiContext.Provider value={value}>{children}</MidiContext.Provider>
}

export function useMidi(): MidiContextValue {
  const ctx = useContext(MidiContext)
  if (!ctx) throw new Error('useMidi must be used inside MidiProvider')
  return ctx
}
