import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import { useState, useEffect, useCallback, createContext, useContext, useRef, useMemo } from "react";
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const WHITE_KEY_PATTERN = [true, false, true, false, true, true, false, true, false, true, false, true];
function getNoteName(noteNumber) {
  const octave = Math.floor(noteNumber / 12) - 1;
  return `${NOTE_NAMES[noteNumber % 12]}${octave}`;
}
function isWhiteKey(noteNumber) {
  return WHITE_KEY_PATTERN[noteNumber % 12];
}
const PIANO_MIN = 21;
const PIANO_MAX = 108;
function countWhiteKeys(from, to) {
  let count = 0;
  for (let n = from; n <= to; n++) {
    if (isWhiteKey(n)) count++;
  }
  return count;
}
const TOTAL_WHITE_KEYS = countWhiteKeys(PIANO_MIN, PIANO_MAX);
const CC_NAMES = {
  0: "Bank Select",
  1: "Mod Wheel",
  2: "Breath",
  4: "Foot",
  5: "Portamento Time",
  6: "Data Entry",
  7: "Volume",
  8: "Balance",
  10: "Pan",
  11: "Expression",
  12: "Effect 1",
  13: "Effect 2",
  64: "Sustain",
  65: "Portamento",
  66: "Sostenuto",
  67: "Soft Pedal",
  68: "Legato",
  71: "Resonance",
  72: "Release",
  73: "Attack",
  74: "Brightness",
  91: "Reverb",
  93: "Chorus",
  95: "Phaser"
};
function getCcName(ccNumber) {
  return CC_NAMES[ccNumber] ?? `CC ${ccNumber}`;
}
const FEATURED_CC = [1, 7, 10, 11, 64, 91, 93];
let idCounter = 0;
function parseMidiMessage(data, timestamp, deviceId, deviceName, sessionStartTime) {
  if (!data || data.length === 0) return null;
  const statusByte = data[0];
  if (statusByte >= 248) return null;
  const sessionTime = Math.max(0, timestamp - sessionStartTime);
  const rawBytes = Array.from(data);
  const base = {
    id: `e${++idCounter}`,
    timestamp,
    sessionTime,
    deviceId,
    deviceName,
    rawBytes
  };
  const nibble = statusByte >> 4 & 15;
  const channel = statusByte & 15;
  switch (nibble) {
    case 9: {
      const noteNumber = data[1] ?? 0;
      const velocity = data[2] ?? 0;
      const type = velocity === 0 ? "noteOff" : "noteOn";
      return { ...base, channel, type, noteNumber, noteName: getNoteName(noteNumber), velocity };
    }
    case 8: {
      const noteNumber = data[1] ?? 0;
      const releaseVelocity = data[2] ?? 0;
      return {
        ...base,
        channel,
        type: "noteOff",
        noteNumber,
        noteName: getNoteName(noteNumber),
        velocity: 0,
        releaseVelocity
      };
    }
    case 11: {
      const ccNumber = data[1] ?? 0;
      const ccValue = data[2] ?? 0;
      return {
        ...base,
        channel,
        type: "controlChange",
        ccNumber,
        ccValue,
        ccName: getCcName(ccNumber)
      };
    }
    case 14: {
      const lsb = data[1] ?? 0;
      const msb = data[2] ?? 0;
      const pitchBend = (msb << 7 | lsb) - 8192;
      return { ...base, channel, type: "pitchBend", pitchBend };
    }
    case 12: {
      return { ...base, channel, type: "programChange", program: data[1] ?? 0 };
    }
    case 10: {
      const noteNumber = data[1] ?? 0;
      return {
        ...base,
        channel,
        type: "aftertouch",
        noteNumber,
        noteName: getNoteName(noteNumber),
        pressure: data[2] ?? 0
      };
    }
    case 13: {
      return { ...base, channel, type: "channelPressure", pressure: data[1] ?? 0 };
    }
    default:
      return { ...base, channel: 0, type: "unknown" };
  }
}
const MAX_EVENT_BUFFER = 2e3;
const MAX_CC_POINTS = 600;
class MidiEngine extends EventTarget {
  // --- UI-visible state (triggers listeners) ---
  browserSupport = "checking";
  permission = "unknown";
  devices = [];
  selectedDeviceId = null;
  recordingState = "idle";
  isDemoMode = false;
  // --- High-frequency data (read by rAF, no listeners) ---
  activeNotes = /* @__PURE__ */ new Map();
  eventBuffer = [];
  // rolling recent events for display
  allEvents = [];
  // full session
  ccSeries = /* @__PURE__ */ new Map();
  pitchBend = 0;
  sessionStartTime = 0;
  pauseOffset = 0;
  pauseStart = 0;
  selectedChannel = -1;
  // -1 = all channels
  midiAccess = null;
  activeInput = null;
  demoInterval = null;
  notify() {
    this.dispatchEvent(new Event("change"));
  }
  subscribe(fn) {
    this.addEventListener("change", fn);
    return () => this.removeEventListener("change", fn);
  }
  getCurrentTime() {
    if (this.recordingState === "idle" || this.recordingState === "stopped") return 0;
    if (this.recordingState === "paused") {
      return this.pauseStart - this.sessionStartTime - this.pauseOffset;
    }
    return performance.now() - this.sessionStartTime - this.pauseOffset;
  }
  async requestAccess() {
    if (typeof navigator === "undefined" || !navigator.requestMIDIAccess) {
      this.browserSupport = "unsupported";
      this.notify();
      return;
    }
    this.browserSupport = "supported";
    this.permission = "requesting";
    this.notify();
    try {
      this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
      this.permission = "granted";
      this.refreshDevices();
      this.midiAccess.addEventListener("statechange", () => {
        this.refreshDevices();
        this.notify();
      });
    } catch {
      this.permission = "denied";
    }
    this.notify();
  }
  refreshDevices() {
    if (!this.midiAccess) return;
    const devs = [];
    this.midiAccess.inputs.forEach((input) => {
      devs.push({
        id: input.id,
        name: input.name ?? "Unknown Device",
        manufacturer: input.manufacturer ?? "",
        state: input.state === "connected" ? "connected" : "disconnected"
      });
    });
    this.devices = devs;
    if (this.selectedDeviceId) {
      const found = devs.find((d) => d.id === this.selectedDeviceId);
      if (!found || found.state === "disconnected") {
        this.disconnectInput();
        this.selectedDeviceId = null;
        if (this.recordingState === "recording") {
          this.recordingState = "stopped";
        }
      }
    }
    this.notify();
  }
  selectDevice(id) {
    this.disconnectInput();
    this.selectedDeviceId = id;
    if (id && this.midiAccess) {
      const input = this.midiAccess.inputs.get(id);
      if (input) {
        this.activeInput = input;
        input.addEventListener("midimessage", this.onMidiMessage);
      }
    }
    this.notify();
  }
  disconnectInput() {
    if (this.activeInput) {
      this.activeInput.removeEventListener("midimessage", this.onMidiMessage);
      this.activeInput = null;
    }
  }
  onMidiMessage = (e) => {
    if (this.recordingState !== "recording") return;
    const evt = e;
    if (!evt.data) return;
    const deviceName = this.devices.find((d) => d.id === this.selectedDeviceId)?.name ?? "Unknown";
    const parsed = parseMidiMessage(
      evt.data,
      evt.timeStamp,
      this.selectedDeviceId ?? "unknown",
      deviceName,
      this.sessionStartTime + this.pauseOffset
    );
    if (parsed) this.ingestEvent(parsed);
  };
  ingestEvent(event) {
    if (this.selectedChannel !== -1 && event.channel !== this.selectedChannel) return;
    this.allEvents.push(event);
    this.eventBuffer.push(event);
    if (this.eventBuffer.length > MAX_EVENT_BUFFER) this.eventBuffer.shift();
    if (event.type === "noteOn" && event.noteNumber !== void 0) {
      const key = `${event.channel}-${event.noteNumber}`;
      this.activeNotes.set(key, {
        noteNumber: event.noteNumber,
        noteName: event.noteName ?? "",
        channel: event.channel,
        velocity: event.velocity ?? 64,
        startTime: event.sessionTime,
        deviceId: event.deviceId
      });
    } else if (event.type === "noteOff" && event.noteNumber !== void 0) {
      this.activeNotes.delete(`${event.channel}-${event.noteNumber}`);
    } else if (event.type === "controlChange" && event.ccNumber !== void 0) {
      this.updateCcSeries(event);
    } else if (event.type === "pitchBend" && event.pitchBend !== void 0) {
      this.pitchBend = event.pitchBend;
    }
  }
  updateCcSeries(event) {
    const key = event.ccNumber;
    let series = this.ccSeries.get(key);
    if (!series) {
      series = {
        ccNumber: key,
        ccName: getCcName(key),
        channel: event.channel,
        points: [],
        currentValue: 0
      };
      this.ccSeries.set(key, series);
    }
    series.currentValue = event.ccValue;
    series.points.push({ sessionTime: event.sessionTime, value: event.ccValue });
    if (series.points.length > MAX_CC_POINTS) series.points.shift();
  }
  startRecording() {
    this.clearSession();
    this.sessionStartTime = performance.now();
    this.pauseOffset = 0;
    this.recordingState = "recording";
    this.notify();
  }
  pauseRecording() {
    if (this.recordingState !== "recording") return;
    this.pauseStart = performance.now();
    this.recordingState = "paused";
    this.notify();
  }
  resumeRecording() {
    if (this.recordingState !== "paused") return;
    this.pauseOffset += performance.now() - this.pauseStart;
    this.recordingState = "recording";
    this.notify();
  }
  stopRecording() {
    this.recordingState = "stopped";
    this.activeNotes.clear();
    this.notify();
  }
  clearSession() {
    this.allEvents = [];
    this.eventBuffer = [];
    this.activeNotes.clear();
    this.ccSeries.clear();
    this.pitchBend = 0;
    this.pauseOffset = 0;
    this.notify();
  }
  setChannelFilter(channel) {
    this.selectedChannel = channel;
    this.notify();
  }
  startDemo() {
    this.isDemoMode = true;
    this.startRecording();
    const notes = [60, 62, 64, 65, 67, 69, 71, 72, 60, 64, 67, 72];
    let i = 0;
    let noteOnScheduled = true;
    const deviceName = "演示模式 (虚拟 MIDI)";
    this.demoInterval = setInterval(() => {
      const noteNumber = notes[i % notes.length];
      const velocity = 60 + Math.floor(Math.random() * 50);
      const channel = i % 3;
      const now = performance.now();
      const sessionTime = now - this.sessionStartTime;
      if (noteOnScheduled) {
        this.ingestEvent({
          id: `demo-${i}-on`,
          timestamp: now,
          sessionTime,
          deviceId: "demo",
          deviceName,
          channel,
          type: "noteOn",
          rawBytes: [144 | channel, noteNumber, velocity],
          noteNumber,
          noteName: getNoteName(noteNumber),
          velocity
        });
        if (i % 4 === 0) {
          this.ingestEvent({
            id: `demo-${i}-cc`,
            timestamp: now,
            sessionTime,
            deviceId: "demo",
            deviceName,
            channel: 0,
            type: "controlChange",
            rawBytes: [176, 1, Math.floor(Math.random() * 127)],
            ccNumber: 1,
            ccValue: Math.floor(Math.random() * 127),
            ccName: "Mod Wheel"
          });
        }
        if (i % 8 === 0) {
          this.ingestEvent({
            id: `demo-${i}-sus`,
            timestamp: now,
            sessionTime,
            deviceId: "demo",
            deviceName,
            channel: 0,
            type: "controlChange",
            rawBytes: [176, 64, i % 16 < 8 ? 127 : 0],
            ccNumber: 64,
            ccValue: i % 16 < 8 ? 127 : 0,
            ccName: "Sustain"
          });
        }
      } else {
        this.ingestEvent({
          id: `demo-${i}-off`,
          timestamp: now,
          sessionTime,
          deviceId: "demo",
          deviceName,
          channel,
          type: "noteOff",
          rawBytes: [128 | channel, noteNumber, 0],
          noteNumber,
          noteName: getNoteName(noteNumber),
          velocity: 0,
          releaseVelocity: Math.floor(Math.random() * 40)
        });
        i++;
      }
      noteOnScheduled = !noteOnScheduled;
    }, 280);
    this.notify();
  }
  stopDemo() {
    if (this.demoInterval) {
      clearInterval(this.demoInterval);
      this.demoInterval = null;
    }
    this.isDemoMode = false;
    this.stopRecording();
    this.notify();
  }
}
const midiEngine = new MidiEngine();
const MidiContext = createContext(null);
function MidiProvider({ children }) {
  const [engineState, setEngineState] = useState({
    browserSupport: midiEngine.browserSupport,
    permission: midiEngine.permission,
    devices: midiEngine.devices,
    selectedDeviceId: midiEngine.selectedDeviceId,
    recordingState: midiEngine.recordingState,
    isDemoMode: midiEngine.isDemoMode,
    selectedChannel: midiEngine.selectedChannel
  });
  const [recentEvents, setRecentEvents] = useState([]);
  const [activeNotes, setActiveNotes] = useState([]);
  const [eventCount, setEventCount] = useState(0);
  useEffect(() => {
    const unsub = midiEngine.subscribe((_evt) => {
      setEngineState({
        browserSupport: midiEngine.browserSupport,
        permission: midiEngine.permission,
        devices: midiEngine.devices,
        selectedDeviceId: midiEngine.selectedDeviceId,
        recordingState: midiEngine.recordingState,
        isDemoMode: midiEngine.isDemoMode,
        selectedChannel: midiEngine.selectedChannel
      });
    });
    return unsub;
  }, []);
  useEffect(() => {
    let raf;
    const loop = () => {
      setRecentEvents([...midiEngine.eventBuffer].slice(-80));
      setActiveNotes(Array.from(midiEngine.activeNotes.values()));
      setEventCount(midiEngine.allEvents.length);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  useEffect(() => {
    midiEngine.requestAccess();
  }, []);
  const exportJson = useCallback(() => {
    import("./exportData-D_5OAJ9u.js").then(({ exportJson: fn }) => {
      fn(midiEngine.allEvents, midiEngine.getCurrentTime());
    });
  }, []);
  const exportCsv = useCallback(() => {
    import("./exportData-D_5OAJ9u.js").then(({ exportCsv: fn }) => {
      fn(midiEngine.allEvents);
    });
  }, []);
  const saveMidi = useCallback(() => {
    import("./exportData-D_5OAJ9u.js").then(({ saveMidi: fn }) => {
      fn(midiEngine.allEvents);
    });
  }, []);
  const value = {
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
    saveMidi
  };
  return /* @__PURE__ */ jsx(MidiContext.Provider, { value, children });
}
function useMidi() {
  const ctx = useContext(MidiContext);
  if (!ctx) throw new Error("useMidi must be used inside MidiProvider");
  return ctx;
}
function TopBar() {
  const {
    recordingState,
    isDemoMode,
    browserSupport,
    permission,
    selectedDeviceId,
    eventCount,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    clearSession,
    startDemo,
    stopDemo,
    exportJson,
    exportCsv,
    saveMidi
  } = useMidi();
  const canRecord = (selectedDeviceId !== null || isDemoMode) && permission === "granted";
  const isRecording = recordingState === "recording";
  const isPaused = recordingState === "paused";
  const isStopped = recordingState === "stopped";
  const isIdle = recordingState === "idle";
  const statusDot = browserSupport === "unsupported" ? { color: "var(--accent-red)", label: "不支持 Web MIDI" } : permission === "denied" ? { color: "var(--accent-red)", label: "权限已拒绝" } : permission === "requesting" ? { color: "var(--accent-amber)", label: "请求权限中…" } : permission === "granted" ? selectedDeviceId || isDemoMode ? { color: "var(--accent-green)", label: "设备已就绪" } : { color: "var(--accent-amber)", label: "未选择设备" } : { color: "var(--text-muted)", label: "检测中…" };
  return /* @__PURE__ */ jsxs("header", { className: "flex items-center gap-3 px-4 py-2.5 border-b border-[var(--border)] bg-[var(--bg-surface)] shrink-0", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 mr-2", children: [
      /* @__PURE__ */ jsxs("svg", { width: "22", height: "22", viewBox: "0 0 22 22", fill: "none", children: [
        /* @__PURE__ */ jsx("rect", { x: "1", y: "10", width: "3", height: "11", rx: "1", fill: "var(--accent-cyan)", opacity: "0.9" }),
        /* @__PURE__ */ jsx("rect", { x: "6", y: "6", width: "3", height: "15", rx: "1", fill: "var(--accent-cyan)" }),
        /* @__PURE__ */ jsx("rect", { x: "11", y: "1", width: "3", height: "20", rx: "1", fill: "var(--accent-cyan)" }),
        /* @__PURE__ */ jsx("rect", { x: "16", y: "7", width: "3", height: "14", rx: "1", fill: "var(--accent-cyan)", opacity: "0.7" })
      ] }),
      /* @__PURE__ */ jsx("span", { className: "font-display text-sm font-bold text-[var(--text-primary)] tracking-tight", children: "MIDI Live" }),
      /* @__PURE__ */ jsx("span", { className: "text-[10px] font-mono text-[var(--text-muted)] border border-[var(--border)] px-1 rounded", children: "PREVIEWER" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1.5 text-[11px] font-mono", children: [
      /* @__PURE__ */ jsx(
        "span",
        {
          className: "w-1.5 h-1.5 rounded-full inline-block",
          style: { background: statusDot.color, boxShadow: isRecording ? `0 0 6px ${statusDot.color}` : "none" }
        }
      ),
      /* @__PURE__ */ jsx("span", { style: { color: statusDot.color }, children: statusDot.label })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "flex-1" }),
    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
      (isIdle || isStopped) && /* @__PURE__ */ jsxs(
        "button",
        {
          onClick: startRecording,
          disabled: !canRecord && !isDemoMode,
          className: "btn-primary flex items-center gap-1.5 text-[12px]",
          children: [
            /* @__PURE__ */ jsx("span", { className: "w-2 h-2 rounded-full bg-white inline-block" }),
            "开始录制"
          ]
        }
      ),
      isRecording && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("button", { onClick: pauseRecording, className: "btn-secondary text-[12px]", children: "暂停" }),
        /* @__PURE__ */ jsx("button", { onClick: stopRecording, className: "btn-ghost text-[12px]", children: "停止" })
      ] }),
      isPaused && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("button", { onClick: resumeRecording, className: "btn-primary text-[12px]", children: "继续" }),
        /* @__PURE__ */ jsx("button", { onClick: stopRecording, className: "btn-ghost text-[12px]", children: "停止" })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "w-px h-5 bg-[var(--border)]" }),
      !isDemoMode ? /* @__PURE__ */ jsx("button", { onClick: startDemo, className: "btn-ghost text-[12px]", children: "演示模式" }) : /* @__PURE__ */ jsx("button", { onClick: stopDemo, className: "btn-ghost text-[12px] text-[var(--accent-amber)]", children: "退出演示" }),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: clearSession,
          className: "btn-ghost text-[12px]",
          disabled: isRecording,
          children: "清空"
        }
      ),
      eventCount > 0 && /* @__PURE__ */ jsxs("div", { className: "relative group", children: [
        /* @__PURE__ */ jsx("button", { className: "btn-ghost text-[12px]", children: "导出 ↓" }),
        /* @__PURE__ */ jsxs("div", { className: "absolute right-0 top-full mt-1 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md shadow-xl z-50 hidden group-hover:flex flex-col min-w-[100px]", children: [
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: exportJson,
              className: "px-3 py-2 text-[11px] font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5 text-left rounded-t-md",
              children: "JSON"
            }
          ),
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: exportCsv,
              className: "px-3 py-2 text-[11px] font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5 text-left",
              children: "CSV"
            }
          ),
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: saveMidi,
              className: "px-3 py-2 text-[11px] font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5 text-left rounded-b-md",
              children: "MIDI"
            }
          )
        ] })
      ] })
    ] })
  ] });
}
function DevicePanel() {
  const {
    devices,
    selectedDeviceId,
    permission,
    browserSupport,
    selectedChannel,
    selectDevice,
    requestAccess,
    setChannelFilter,
    isDemoMode
  } = useMidi();
  const connectedDevices = devices.filter((d) => d.state === "connected");
  return /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-3 p-3", children: [
    /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("label", { className: "block text-[10px] font-semibold tracking-wider uppercase text-[var(--text-muted)] mb-1.5", children: "输入设备" }),
      browserSupport === "unsupported" ? /* @__PURE__ */ jsx("p", { className: "text-[11px] text-[var(--accent-red)]", children: "浏览器不支持 Web MIDI" }) : permission === "denied" ? /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("p", { className: "text-[11px] text-[var(--accent-amber)] mb-1", children: "权限已拒绝" }),
        /* @__PURE__ */ jsx("button", { onClick: requestAccess, className: "btn-secondary text-[11px]", children: "重新请求权限" })
      ] }) : permission === "requesting" ? /* @__PURE__ */ jsx("p", { className: "text-[11px] text-[var(--text-muted)] animate-pulse", children: "正在请求权限…" }) : connectedDevices.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-[11px] text-[var(--text-muted)]", children: "未检测到 MIDI 设备" }) : /* @__PURE__ */ jsxs(
        "select",
        {
          value: selectedDeviceId ?? "",
          onChange: (e) => selectDevice(e.target.value || null),
          className: "w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md px-2 py-1.5 text-[12px] font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-cyan)] cursor-pointer",
          disabled: isDemoMode,
          children: [
            /* @__PURE__ */ jsx("option", { value: "", children: "— 选择设备 —" }),
            connectedDevices.map((d) => /* @__PURE__ */ jsx("option", { value: d.id, children: d.name }, d.id))
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("label", { className: "block text-[10px] font-semibold tracking-wider uppercase text-[var(--text-muted)] mb-1.5", children: "通道过滤" }),
      /* @__PURE__ */ jsxs(
        "select",
        {
          value: selectedChannel,
          onChange: (e) => setChannelFilter(Number(e.target.value)),
          className: "w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md px-2 py-1.5 text-[12px] font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-cyan)] cursor-pointer",
          children: [
            /* @__PURE__ */ jsx("option", { value: -1, children: "全部通道" }),
            Array.from({ length: 16 }, (_, i) => /* @__PURE__ */ jsxs("option", { value: i, children: [
              "通道 ",
              i + 1
            ] }, i))
          ]
        }
      )
    ] }),
    selectedDeviceId && !isDemoMode && /* @__PURE__ */ jsxs("div", { className: "text-[10px] font-mono text-[var(--text-muted)] bg-[var(--bg-elevated)] rounded px-2 py-1.5 border border-[var(--border)]", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex justify-between", children: [
        /* @__PURE__ */ jsx("span", { children: "设备" }),
        /* @__PURE__ */ jsx("span", { className: "text-[var(--accent-green)]", children: "已连接" })
      ] }),
      devices.find((d) => d.id === selectedDeviceId)?.manufacturer && /* @__PURE__ */ jsx("div", { className: "text-[9px] text-[var(--text-muted)] truncate mt-0.5", children: devices.find((d) => d.id === selectedDeviceId)?.manufacturer })
    ] }),
    isDemoMode && /* @__PURE__ */ jsx("div", { className: "text-[10px] font-mono bg-[var(--accent-amber)]/10 border border-[var(--accent-amber)]/30 rounded px-2 py-1.5 text-[var(--accent-amber)]", children: "演示模式运行中" })
  ] });
}
const NOTE_RANGE = PIANO_MAX - PIANO_MIN + 1;
const VISIBLE_SECONDS = 8;
const CHANNEL_HUES$3 = [188, 142, 38, 355, 270, 210, 25, 300];
function PianoRoll() {
  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const draw = () => {
      const W = canvas.width;
      const H = canvas.height;
      const dpr = window.devicePixelRatio || 1;
      const rowH = H / NOTE_RANGE;
      const nowMs = midiEngine.getCurrentTime();
      const windowMs = VISIBLE_SECONDS * 1e3;
      ctx.fillStyle = "#09090d";
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.lineWidth = 1;
      for (let note = PIANO_MIN; note <= PIANO_MAX; note++) {
        if (note % 12 === 0) {
          const y = noteToY(note, H);
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(W, y);
          ctx.stroke();
          const octave = Math.floor(note / 12) - 1;
          ctx.fillStyle = "rgba(255,255,255,0.12)";
          ctx.font = "9px IBM Plex Mono, monospace";
          ctx.fillText(`C${octave}`, 3, y - 2);
        }
      }
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      for (let note = PIANO_MIN; note <= PIANO_MAX; note++) {
        const mod = note % 12;
        if ([1, 3, 6, 8, 10].includes(mod)) {
          const y = noteToY(note, H);
          ctx.fillRect(0, y, W, rowH);
        }
      }
      const gridIntervalSec = 1;
      ctx.strokeStyle = "rgba(255,255,255,0.07)";
      ctx.lineWidth = 1;
      for (let s = 0; s <= VISIBLE_SECONDS; s += gridIntervalSec) {
        const x = W - s / VISIBLE_SECONDS * W;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
        if (s > 0) {
          ctx.fillStyle = "rgba(255,255,255,0.15)";
          ctx.font = "9px IBM Plex Mono, monospace";
          ctx.fillText(`-${s}s`, x + 2, H - 4);
        }
      }
      const events = midiEngine.eventBuffer;
      const openNotes = /* @__PURE__ */ new Map();
      for (const event of events) {
        if (event.sessionTime < nowMs - windowMs - 200) continue;
        const x = timeToX(event.sessionTime, nowMs, W);
        const key = `${event.channel}-${event.noteNumber}`;
        if (event.type === "noteOn" && event.noteNumber !== void 0) {
          openNotes.set(key, { event, startX: x });
        } else if (event.type === "noteOff" && event.noteNumber !== void 0) {
          const open = openNotes.get(key);
          if (open && open.event.noteNumber !== void 0) {
            drawNote(ctx, open.startX, x, open.event.noteNumber, open.event.channel, open.event.velocity ?? 64, rowH, H, false, dpr, event.releaseVelocity);
            openNotes.delete(key);
          }
        }
      }
      midiEngine.activeNotes.forEach((note) => {
        const startX = timeToX(note.startTime, nowMs, W);
        const endX = W;
        drawNote(ctx, startX, endX, note.noteNumber, note.channel, note.velocity, rowH, H, true, dpr);
      });
      ctx.strokeStyle = "rgba(0, 200, 232, 0.6)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(W, 0);
      ctx.lineTo(W, H);
      ctx.stroke();
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const setSize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    };
    setSize();
    const ro = new ResizeObserver(setSize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);
  return /* @__PURE__ */ jsx("canvas", { ref: canvasRef, style: { display: "block", width: "100%", height: "100%" } });
}
function noteToY(note, H) {
  return (PIANO_MAX - note) / NOTE_RANGE * H;
}
function timeToX(sessionTime, nowMs, W) {
  const age = nowMs - sessionTime;
  return W - age / (VISIBLE_SECONDS * 1e3) * W;
}
function drawNote(ctx, x1, x2, noteNumber, channel, velocity, rowH, H, isActive = false, dpr = 1, releaseVelocity) {
  const y = (PIANO_MAX - noteNumber) / NOTE_RANGE * H;
  const w = Math.max(2, x2 - x1);
  const h = Math.max(rowH * 0.8, 2);
  const hue = CHANNEL_HUES$3[channel % 8];
  const l = 30 + velocity / 127 * 40;
  const glowIntensity = velocity / 127 * 12 * dpr;
  const grad = ctx.createLinearGradient(x1, y, x1, y + h);
  grad.addColorStop(0, `hsl(${hue}, 85%, ${Math.min(85, l + 15)}%)`);
  grad.addColorStop(1, `hsl(${hue}, 80%, ${l}%)`);
  ctx.fillStyle = grad;
  if (velocity > 30) {
    ctx.shadowColor = `hsl(${hue}, 100%, 70%)`;
    ctx.shadowBlur = glowIntensity;
  }
  ctx.beginPath();
  ctx.roundRect(x1, y + rowH * 0.1, w, h, 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  if (!isActive && releaseVelocity !== void 0 && w > 8) {
    const fadeWidth = Math.min(w * 0.3, Math.max(4, (1 - releaseVelocity / 127) * 20));
    const fadeStart = x2 - fadeWidth;
    if (fadeStart > x1) {
      const fadeGrad = ctx.createLinearGradient(fadeStart, y, x2, y);
      fadeGrad.addColorStop(0, "rgba(0,0,0,0)");
      fadeGrad.addColorStop(1, `rgba(0,0,0,${0.3 + (1 - releaseVelocity / 127) * 0.4})`);
      ctx.fillStyle = fadeGrad;
      ctx.beginPath();
      ctx.roundRect(fadeStart, y + rowH * 0.1, fadeWidth, h, 2);
      ctx.fill();
    }
  }
  if (velocity > 80 && w > 4) {
    ctx.strokeStyle = `hsla(${hue}, 100%, 85%, ${velocity / 127 * 0.4})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x1, y + rowH * 0.1 + 1);
    ctx.lineTo(x2, y + rowH * 0.1 + 1);
    ctx.stroke();
  }
}
const CHANNEL_HUES$2 = [188, 142, 38, 355, 270, 210, 25, 300, 160, 60, 195, 320, 85, 15, 240, 180];
function PianoKeyboard() {
  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const draw = () => {
      const W = canvas.width;
      const H = canvas.height;
      const whiteW = W / TOTAL_WHITE_KEYS;
      const whiteH = H;
      const blackW = whiteW * 0.6;
      const blackH = H * 0.62;
      const dpr = window.devicePixelRatio || 1;
      const activeNotes = midiEngine.activeNotes;
      ctx.fillStyle = "#1a1a24";
      ctx.fillRect(0, 0, W, H);
      const whiteKeyPositions = [];
      let wIndex = 0;
      for (let n = PIANO_MIN; n <= PIANO_MAX; n++) {
        if (isWhiteKey(n)) {
          whiteKeyPositions[n] = wIndex;
          wIndex++;
        }
      }
      let wi = 0;
      for (let note = PIANO_MIN; note <= PIANO_MAX; note++) {
        if (!isWhiteKey(note)) continue;
        const x = wi * whiteW;
        const key = activeNotes.get(`0-${note}`) ?? activeNotes.get(`1-${note}`) ?? activeNotes.get(`2-${note}`) ?? findActiveNote(activeNotes, note);
        if (key) {
          const hue = CHANNEL_HUES$2[key.channel % 16];
          const l = 55 + key.velocity / 127 * 30;
          ctx.fillStyle = `hsl(${hue}, 90%, ${l}%)`;
          ctx.shadowColor = `hsl(${hue}, 100%, 70%)`;
          ctx.shadowBlur = 12 * dpr;
          ctx.fillRect(x + 1, 0, whiteW - 2, whiteH);
          ctx.shadowBlur = 0;
        } else {
          const grad = ctx.createLinearGradient(x, 0, x, whiteH);
          grad.addColorStop(0, "#d8d8e8");
          grad.addColorStop(1, "#b0b0c4");
          ctx.fillStyle = grad;
          ctx.fillRect(x + 1, 0, whiteW - 2, whiteH);
        }
        ctx.strokeStyle = "#2a2a38";
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, 0.5, whiteW - 1, whiteH - 1);
        if (note % 12 === 0) {
          const octave = Math.floor(note / 12) - 1;
          ctx.fillStyle = key ? "rgba(0,0,0,0.6)" : "rgba(80,80,100,0.8)";
          ctx.font = `${Math.max(8, whiteW * 0.45)}px IBM Plex Mono, monospace`;
          ctx.textAlign = "center";
          ctx.fillText(`C${octave}`, x + whiteW / 2, whiteH - 5);
        }
        wi++;
      }
      ctx.textAlign = "left";
      for (let note = PIANO_MIN; note <= PIANO_MAX; note++) {
        if (isWhiteKey(note)) continue;
        const prevWhiteIdx = whiteKeyPositions[note - 1];
        if (prevWhiteIdx === void 0) continue;
        const x = prevWhiteIdx * whiteW + whiteW * 0.65;
        const key = findActiveNote(activeNotes, note);
        if (key) {
          const hue = CHANNEL_HUES$2[key.channel % 16];
          const l = 45 + key.velocity / 127 * 30;
          ctx.fillStyle = `hsl(${hue}, 90%, ${l}%)`;
          ctx.shadowColor = `hsl(${hue}, 100%, 70%)`;
          ctx.shadowBlur = 10 * dpr;
          ctx.fillRect(x, 0, blackW, blackH);
          ctx.shadowBlur = 0;
        } else {
          const grad = ctx.createLinearGradient(x, 0, x, blackH);
          grad.addColorStop(0, "#1c1c28");
          grad.addColorStop(1, "#0a0a12");
          ctx.fillStyle = grad;
          ctx.fillRect(x, 0, blackW, blackH);
        }
        ctx.strokeStyle = "#3a3a50";
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, 0.5, blackW - 1, blackH - 1);
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const setSize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    };
    setSize();
    const ro = new ResizeObserver(setSize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);
  return /* @__PURE__ */ jsx("canvas", { ref: canvasRef, style: { display: "block", width: "100%", height: "100%" } });
}
function findActiveNote(activeNotes, noteNumber) {
  for (const [key, note] of activeNotes) {
    if (key.endsWith(`-${noteNumber}`)) return note;
  }
  return void 0;
}
const EVENT_COLORS = {
  noteOn: "var(--accent-cyan)",
  noteOff: "rgba(255,255,255,0.3)",
  controlChange: "var(--accent-amber)",
  pitchBend: "#c084fc",
  programChange: "#4ade80",
  aftertouch: "#fb923c",
  channelPressure: "#fb923c",
  unknown: "rgba(255,255,255,0.2)"
};
const EVENT_LABELS = {
  noteOn: "ON",
  noteOff: "OFF",
  controlChange: "CC",
  pitchBend: "PB",
  programChange: "PC",
  aftertouch: "AT",
  channelPressure: "CP",
  unknown: "??"
};
function formatTime(ms) {
  const s = ms / 1e3;
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(2);
  return `${m}:${sec.padStart(5, "0")}`;
}
function EventRow({ event }) {
  const color = EVENT_COLORS[event.type] ?? "rgba(255,255,255,0.3)";
  const label = EVENT_LABELS[event.type] ?? "??";
  let detail = "";
  if (event.type === "noteOn" || event.type === "noteOff") {
    detail = `${event.noteName ?? "-"}  vel:${event.velocity ?? 0}`;
    if (event.type === "noteOff" && event.releaseVelocity !== void 0) {
      detail += `  rel:${event.releaseVelocity}`;
    }
  } else if (event.type === "controlChange") {
    detail = `${event.ccName} = ${event.ccValue}`;
  } else if (event.type === "pitchBend") {
    detail = `${event.pitchBend ?? 0}`;
  } else if (event.type === "programChange") {
    detail = `程序 ${event.program}`;
  } else if (event.type === "aftertouch") {
    detail = `${event.noteName} p:${event.pressure}`;
  } else if (event.type === "channelPressure") {
    detail = `压力 ${event.pressure}`;
  }
  return /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 px-2 py-0.5 text-[11px] font-mono border-b border-[var(--border)] hover:bg-white/[0.02] transition-colors", children: [
    /* @__PURE__ */ jsx("span", { className: "text-[var(--text-muted)] w-[54px] shrink-0 tabular-nums", children: formatTime(event.sessionTime) }),
    /* @__PURE__ */ jsx(
      "span",
      {
        className: "w-[26px] text-center text-[10px] font-bold rounded px-0.5 shrink-0",
        style: { color, background: `${color}18` },
        children: label
      }
    ),
    /* @__PURE__ */ jsx("span", { className: "text-[var(--text-muted)] w-[18px] shrink-0 tabular-nums text-right", children: event.channel + 1 }),
    /* @__PURE__ */ jsx("span", { className: "text-[var(--text-secondary)] truncate", children: detail })
  ] });
}
function EventLog() {
  const { recentEvents, recordingState } = useMidi();
  const sorted = useMemo(() => [...recentEvents].reverse(), [recentEvents]);
  return /* @__PURE__ */ jsxs("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between px-2 py-1.5 border-b border-[var(--border)]", children: [
      /* @__PURE__ */ jsx("span", { className: "text-[11px] font-semibold text-[var(--text-secondary)] tracking-wider uppercase", children: "事件流" }),
      /* @__PURE__ */ jsxs("span", { className: "text-[10px] font-mono text-[var(--text-muted)]", children: [
        recentEvents.length,
        " 条"
      ] })
    ] }),
    sorted.length === 0 ? /* @__PURE__ */ jsx("div", { className: "flex-1 flex items-center justify-center text-[var(--text-muted)] text-xs font-mono", children: recordingState === "recording" ? "等待 MIDI 输入…" : "尚无事件" }) : /* @__PURE__ */ jsx("div", { className: "flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin", children: sorted.map((e) => /* @__PURE__ */ jsx(EventRow, { event: e }, e.id)) })
  ] });
}
const CHANNEL_HUES$1 = [188, 142, 38, 355, 270, 210, 25, 300];
function CcPanel() {
  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  const [trackedCCs, setTrackedCCs] = useState(
    FEATURED_CC.map((cc, i) => ({ ccNumber: cc, label: getCcName(cc), hue: CHANNEL_HUES$1[i % 8], active: true }))
  );
  const [timeZoom, setTimeZoom] = useState(1);
  const [valueZoom, setValueZoom] = useState(1);
  const [valueCenter, setValueCenter] = useState(64);
  const containerRef = useRef(null);
  const handleKeyDown = useCallback((e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === "=" || e.key === "+") {
      e.preventDefault();
      if (e.shiftKey) {
        setValueZoom((z) => Math.min(8, z * 1.5));
      } else {
        setTimeZoom((z) => Math.min(16, z * 1.5));
      }
    } else if (e.key === "-") {
      e.preventDefault();
      if (e.shiftKey) {
        setValueZoom((z) => Math.max(1, z / 1.5));
      } else {
        setTimeZoom((z) => Math.max(0.25, z / 1.5));
      }
    } else if (e.key === "0" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      setTimeZoom(1);
      setValueZoom(1);
      setValueCenter(64);
    }
  }, []);
  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
  useEffect(() => {
    const unsub = midiEngine.subscribe(() => {
      setTrackedCCs((prev) => {
        const existing = new Set(prev.map((t) => t.ccNumber));
        const newCCs = [];
        midiEngine.ccSeries.forEach((_, cc) => {
          if (!existing.has(cc)) {
            newCCs.push({
              ccNumber: cc,
              label: getCcName(cc),
              hue: CHANNEL_HUES$1[newCCs.length % 8],
              active: true
            });
          }
        });
        return newCCs.length > 0 ? [...prev, ...newCCs] : prev;
      });
    });
    return unsub;
  }, []);
  const calcZoomFromWheel = useCallback((e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setValueZoom((z) => {
        const factor = e.deltaY > 0 ? 1 / 1.2 : 1.2;
        return Math.max(1, Math.min(8, z * factor));
      });
    } else {
      e.preventDefault();
      setTimeZoom((z) => {
        const factor = e.deltaY > 0 ? 1 / 1.2 : 1.2;
        return Math.max(0.25, Math.min(16, z * factor));
      });
    }
  }, []);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener("wheel", calcZoomFromWheel, { passive: false });
    return () => container.removeEventListener("wheel", calcZoomFromWheel);
  }, [calcZoomFromWheel]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const draw = () => {
      const W = canvas.width;
      const H = canvas.height;
      const dpr = window.devicePixelRatio || 1;
      const visibleSec = 8 / timeZoom;
      const valueMin = Math.max(0, valueCenter - 64 / valueZoom);
      const valueMax = Math.min(127, valueCenter + 64 / valueZoom);
      const valueRange = valueMax - valueMin;
      ctx.fillStyle = "#0a0a10";
      ctx.fillRect(0, 0, W, H);
      const yStep = valueRange > 64 ? 32 : valueRange > 32 ? 16 : 8;
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.lineWidth = 1;
      for (let v = 0; v <= 127; v += yStep) {
        if (v < valueMin || v > valueMax) continue;
        const y = H - (v - valueMin) / valueRange * H;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      for (const v of [0, 64, 127]) {
        if (v < valueMin || v > valueMax) continue;
        const y = H - (v - valueMin) / valueRange * H;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        ctx.font = "8px IBM Plex Mono, monospace";
        ctx.fillText(String(v), 3, y - 2);
      }
      const gridSec = visibleSec > 8 ? 2 : visibleSec > 4 ? 1 : visibleSec > 2 ? 0.5 : 0.25;
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      for (let s = 0; s <= visibleSec; s += gridSec) {
        const x = W - s / visibleSec * W;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
        if (s > 0) {
          ctx.fillStyle = "rgba(255,255,255,0.1)";
          ctx.font = "7px IBM Plex Mono, monospace";
          ctx.fillText(`-${s.toFixed(s < 1 ? 2 : 0)}s`, x + 2, H - 3);
        }
      }
      const nowMs = midiEngine.getCurrentTime();
      const timeWindow = visibleSec * 1e3;
      trackedCCs.forEach((tracked) => {
        if (!tracked.active) return;
        const series = midiEngine.ccSeries.get(tracked.ccNumber);
        if (!series || series.points.length === 0) return;
        const pts = series.points.filter((p) => p.sessionTime >= nowMs - timeWindow);
        if (pts.length < 2) return;
        const hue = tracked.hue;
        const color = `hsl(${hue}, 75%, 55%)`;
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, `hsla(${hue}, 75%, 55%, 0.12)`);
        grad.addColorStop(1, `hsla(${hue}, 75%, 55%, 0.02)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        pts.forEach((pt, i) => {
          const x = W - (nowMs - pt.sessionTime) / timeWindow * W;
          const y = H - (pt.value - valueMin) / valueRange * H;
          if (i === 0) ctx.moveTo(x, H);
          if (i === 0) ctx.lineTo(x, y);
          else ctx.lineTo(x, y);
        });
        const lastPt = pts[pts.length - 1];
        const lastX = W - (nowMs - lastPt.sessionTime) / timeWindow * W;
        ctx.lineTo(lastX, H);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.shadowColor = `hsla(${hue}, 100%, 70%, 0.4)`;
        ctx.shadowBlur = 6 * dpr;
        ctx.beginPath();
        pts.forEach((pt, i) => {
          const x = W - (nowMs - pt.sessionTime) / timeWindow * W;
          const y = H - (pt.value - valueMin) / valueRange * H;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.shadowBlur = 0;
        pts.forEach((pt) => {
          const x = W - (nowMs - pt.sessionTime) / timeWindow * W;
          const y = H - (pt.value - valueMin) / valueRange * H;
          ctx.fillStyle = `hsl(${hue}, 80%, 65%)`;
          ctx.beginPath();
          ctx.arc(x, y, 2.5 * dpr, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = `hsl(${hue}, 80%, 40%)`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        });
        const last = pts[pts.length - 1];
        const dotX = W - (nowMs - last.sessionTime) / timeWindow * W;
        const dotY = H - (last.value - valueMin) / valueRange * H;
        ctx.shadowColor = `hsla(${hue}, 100%, 70%, 0.6)`;
        ctx.shadowBlur = 8 * dpr;
        ctx.fillStyle = `hsl(${hue}, 90%, 75%)`;
        ctx.beginPath();
        ctx.arc(dotX, dotY, 4 * dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      });
      const pb = midiEngine.pitchBend;
      if (Math.abs(pb) > 10) {
        const pbY = H - (pb + 8192 - valueMin * 64.5) / (valueRange * 64.5) * H;
        ctx.strokeStyle = "rgba(240, 160, 32, 0.5)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(0, pbY);
        ctx.lineTo(W, pbY);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.strokeStyle = "rgba(200, 220, 255, 0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(W, 0);
      ctx.lineTo(W, H);
      ctx.stroke();
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [trackedCCs, timeZoom, valueZoom, valueCenter]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const setSize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    };
    setSize();
    const ro = new ResizeObserver(setSize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);
  return /* @__PURE__ */ jsxs("div", { className: "flex flex-col h-full gap-2", ref: containerRef, children: [
    /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-x-3 gap-y-1 px-1", children: [
      trackedCCs.map((t) => {
        const series = midiEngine.ccSeries.get(t.ccNumber);
        const val = series?.currentValue ?? "-";
        return /* @__PURE__ */ jsxs(
          "button",
          {
            onClick: () => setTrackedCCs(
              (prev) => prev.map((x) => x.ccNumber === t.ccNumber ? { ...x, active: !x.active } : x)
            ),
            className: "flex items-center gap-1 text-[10px] font-mono transition-opacity",
            style: { opacity: t.active ? 1 : 0.35 },
            children: [
              /* @__PURE__ */ jsx(
                "span",
                {
                  className: "inline-block w-2 h-2 rounded-full",
                  style: { background: `hsl(${t.hue},80%,60%)` }
                }
              ),
              /* @__PURE__ */ jsx("span", { style: { color: `hsl(${t.hue},80%,60%)` }, children: t.label }),
              /* @__PURE__ */ jsx("span", { className: "text-[var(--text-muted)]", children: val })
            ]
          },
          t.ccNumber
        );
      }),
      /* @__PURE__ */ jsxs("div", { className: "ml-auto text-[9px] font-mono text-[var(--text-muted)]", children: [
        "X",
        timeZoom.toFixed(1),
        "x Y",
        valueZoom.toFixed(1),
        "x"
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "flex-1 rounded overflow-hidden border border-[var(--border)]", children: /* @__PURE__ */ jsx("canvas", { ref: canvasRef, style: { display: "block", width: "100%", height: "100%" } }) })
  ] });
}
const CHANNEL_HUES = [188, 142, 38, 355, 270, 210, 25, 300, 160, 60, 195, 320, 85, 15, 240, 180];
function ActiveNotes() {
  const { activeNotes } = useMidi();
  return /* @__PURE__ */ jsxs("div", { className: "h-full flex flex-col", children: [
    /* @__PURE__ */ jsxs("div", { className: "px-2 py-1.5 border-b border-[var(--border)]", children: [
      /* @__PURE__ */ jsx("span", { className: "text-[11px] font-semibold text-[var(--text-secondary)] tracking-wider uppercase", children: "当前按下" }),
      /* @__PURE__ */ jsxs("span", { className: "ml-2 text-[10px] font-mono text-[var(--text-muted)]", children: [
        activeNotes.length,
        " 键"
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "flex-1 overflow-y-auto p-2", children: activeNotes.length === 0 ? /* @__PURE__ */ jsx("div", { className: "h-full flex items-center justify-center text-[var(--text-muted)] text-xs font-mono", children: "无" }) : /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-1.5", children: activeNotes.map((note) => {
      const hue = CHANNEL_HUES[note.channel % 16];
      const l = 45 + note.velocity / 127 * 30;
      return /* @__PURE__ */ jsxs(
        "div",
        {
          className: "flex flex-col items-center px-2 py-1.5 rounded-md text-center min-w-[52px]",
          style: {
            background: `hsl(${hue}, 60%, 15%)`,
            border: `1px solid hsl(${hue}, 70%, ${l}%)`,
            boxShadow: `0 0 8px hsl(${hue},80%,${l}%,0.3)`
          },
          children: [
            /* @__PURE__ */ jsx(
              "span",
              {
                className: "text-base font-bold font-mono leading-none",
                style: { color: `hsl(${hue}, 85%, ${l + 10}%)` },
                children: note.noteName
              }
            ),
            /* @__PURE__ */ jsxs("span", { className: "text-[9px] font-mono mt-0.5", style: { color: `hsl(${hue},60%,50%)` }, children: [
              "#",
              note.noteNumber
            ] }),
            /* @__PURE__ */ jsx(
              "div",
              {
                className: "w-full h-0.5 rounded-full mt-1",
                style: {
                  background: `hsl(${hue}, 80%, ${l}%)`,
                  width: `${note.velocity / 127 * 100}%`
                }
              }
            ),
            /* @__PURE__ */ jsxs("span", { className: "text-[9px] font-mono text-[var(--text-muted)]", children: [
              "v",
              note.velocity
            ] })
          ]
        },
        `${note.channel}-${note.noteNumber}`
      );
    }) }) })
  ] });
}
function useTimer() {
  const [t, setT] = useState("0:00.00");
  useEffect(() => {
    let raf;
    const update = () => {
      const ms = midiEngine.getCurrentTime();
      if (ms > 0) {
        const s = ms / 1e3;
        const m = Math.floor(s / 60);
        const sec = (s % 60).toFixed(2);
        setT(`${m}:${sec.padStart(5, "0")}`);
      }
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, []);
  return t;
}
function useFps() {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    let last = performance.now();
    let frames = 0;
    let raf;
    const update = () => {
      frames++;
      const now = performance.now();
      if (now - last >= 1e3) {
        setFps(frames);
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, []);
  return fps;
}
function StatsBar() {
  const { eventCount, activeNotes, recordingState } = useMidi();
  const timer = useTimer();
  const fps = useFps();
  const stateLabel = {
    idle: "待机",
    recording: "录制中",
    paused: "已暂停",
    stopped: "已停止"
  };
  const stateColor = {
    idle: "var(--text-muted)",
    recording: "var(--accent-green)",
    paused: "var(--accent-amber)",
    stopped: "var(--text-secondary)"
  };
  return /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-4 px-3 py-1 text-[10px] font-mono text-[var(--text-muted)] border-t border-[var(--border)] bg-[var(--bg-base)]", children: [
    /* @__PURE__ */ jsxs("span", { style: { color: stateColor[recordingState] }, children: [
      "● ",
      stateLabel[recordingState] ?? recordingState
    ] }),
    /* @__PURE__ */ jsx("span", { className: "tabular-nums", children: timer }),
    /* @__PURE__ */ jsxs("span", { children: [
      eventCount.toLocaleString(),
      " 事件"
    ] }),
    /* @__PURE__ */ jsxs("span", { children: [
      activeNotes.length,
      " 活跃音符"
    ] }),
    /* @__PURE__ */ jsxs("span", { className: "ml-auto", children: [
      fps,
      " fps"
    ] })
  ] });
}
function StatusOverlay() {
  const { browserSupport, permission, requestAccess, startDemo } = useMidi();
  if (browserSupport === "checking") {
    return /* @__PURE__ */ jsx("div", { className: "overlay-screen", children: /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center gap-4", children: [
      /* @__PURE__ */ jsx("div", { className: "w-10 h-10 border-2 border-[var(--accent-cyan)] border-t-transparent rounded-full animate-spin" }),
      /* @__PURE__ */ jsx("p", { className: "text-[var(--text-secondary)] text-sm font-mono", children: "检测 MIDI 支持中…" })
    ] }) });
  }
  if (browserSupport === "unsupported") {
    return /* @__PURE__ */ jsx("div", { className: "overlay-screen", children: /* @__PURE__ */ jsxs("div", { className: "max-w-md text-center flex flex-col items-center gap-5", children: [
      /* @__PURE__ */ jsx("div", { className: "w-14 h-14 rounded-full bg-[var(--accent-red)]/10 flex items-center justify-center border border-[var(--accent-red)]/30", children: /* @__PURE__ */ jsxs("svg", { width: "28", height: "28", viewBox: "0 0 24 24", fill: "none", stroke: "var(--accent-red)", strokeWidth: "2", children: [
        /* @__PURE__ */ jsx("circle", { cx: "12", cy: "12", r: "10" }),
        /* @__PURE__ */ jsx("line", { x1: "12", y1: "8", x2: "12", y2: "12" }),
        /* @__PURE__ */ jsx("line", { x1: "12", y1: "16", x2: "12.01", y2: "16" })
      ] }) }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h2", { className: "text-[var(--text-primary)] font-display text-xl font-bold mb-2", children: "浏览器不支持 Web MIDI" }),
        /* @__PURE__ */ jsx("p", { className: "text-[var(--text-secondary)] text-sm leading-relaxed", children: "当前浏览器不支持 Web MIDI API。请使用 Chrome / Edge（版本 43+）或其他 Chromium 内核浏览器。" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg p-4 text-left text-sm w-full", children: [
        /* @__PURE__ */ jsx("p", { className: "text-[var(--text-secondary)] font-semibold mb-2", children: "推荐替代方案" }),
        /* @__PURE__ */ jsxs("ul", { className: "text-[var(--text-muted)] text-[12px] font-mono space-y-1", children: [
          /* @__PURE__ */ jsx("li", { children: "• Chrome 43+ （桌面端）" }),
          /* @__PURE__ */ jsx("li", { children: "• Microsoft Edge 79+" }),
          /* @__PURE__ */ jsx("li", { children: "• Opera 30+" })
        ] })
      ] }),
      /* @__PURE__ */ jsx("button", { onClick: startDemo, className: "btn-primary", children: "使用演示模式（无需设备）" })
    ] }) });
  }
  if (permission === "requesting") {
    return /* @__PURE__ */ jsx("div", { className: "overlay-screen", children: /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center gap-4 max-w-sm text-center", children: [
      /* @__PURE__ */ jsx("div", { className: "w-12 h-12 rounded-full bg-[var(--accent-cyan)]/10 flex items-center justify-center border border-[var(--accent-cyan)]/30 animate-pulse", children: /* @__PURE__ */ jsxs("svg", { width: "24", height: "24", viewBox: "0 0 24 24", fill: "none", stroke: "var(--accent-cyan)", strokeWidth: "2", children: [
        /* @__PURE__ */ jsx("path", { d: "M9 18V5l12-2v13" }),
        /* @__PURE__ */ jsx("circle", { cx: "6", cy: "18", r: "3" }),
        /* @__PURE__ */ jsx("circle", { cx: "18", cy: "16", r: "3" })
      ] }) }),
      /* @__PURE__ */ jsx("h2", { className: "text-[var(--text-primary)] font-display text-lg font-bold", children: "请求 MIDI 权限" }),
      /* @__PURE__ */ jsx("p", { className: "text-[var(--text-secondary)] text-sm leading-relaxed", children: "浏览器正在请求 MIDI 访问权限。请在弹出的权限对话框中点击「允许」。" })
    ] }) });
  }
  if (permission === "denied") {
    return /* @__PURE__ */ jsx("div", { className: "overlay-screen", children: /* @__PURE__ */ jsxs("div", { className: "max-w-md text-center flex flex-col items-center gap-5", children: [
      /* @__PURE__ */ jsx("div", { className: "w-14 h-14 rounded-full bg-[var(--accent-amber)]/10 flex items-center justify-center border border-[var(--accent-amber)]/30", children: /* @__PURE__ */ jsxs("svg", { width: "28", height: "28", viewBox: "0 0 24 24", fill: "none", stroke: "var(--accent-amber)", strokeWidth: "2", children: [
        /* @__PURE__ */ jsx("path", { d: "M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" }),
        /* @__PURE__ */ jsx("line", { x1: "12", y1: "9", x2: "12", y2: "13" }),
        /* @__PURE__ */ jsx("line", { x1: "12", y1: "17", x2: "12.01", y2: "17" })
      ] }) }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h2", { className: "text-[var(--text-primary)] font-display text-xl font-bold mb-2", children: "MIDI 权限已拒绝" }),
        /* @__PURE__ */ jsx("p", { className: "text-[var(--text-secondary)] text-sm leading-relaxed", children: "请在浏览器地址栏点击锁形图标，将 MIDI 权限设置为「允许」，然后刷新页面。" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex gap-3", children: [
        /* @__PURE__ */ jsx("button", { onClick: requestAccess, className: "btn-primary", children: "重新请求" }),
        /* @__PURE__ */ jsx("button", { onClick: startDemo, className: "btn-secondary", children: "演示模式" })
      ] })
    ] }) });
  }
  return null;
}
function App() {
  const {
    permission,
    browserSupport,
    isDemoMode
  } = useMidi();
  const showOverlay = !isDemoMode && (browserSupport === "checking" || browserSupport === "unsupported" || permission === "requesting" || permission === "denied");
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    showOverlay && /* @__PURE__ */ jsx(StatusOverlay, {}),
    /* @__PURE__ */ jsx(TopBar, {}),
    /* @__PURE__ */ jsxs("div", { className: "flex flex-1 min-h-0 overflow-hidden", children: [
      /* @__PURE__ */ jsxs("aside", { className: "w-[200px] shrink-0 border-r border-[var(--border)] bg-[var(--bg-surface)] flex flex-col overflow-y-auto", children: [
        /* @__PURE__ */ jsx(DevicePanel, {}),
        /* @__PURE__ */ jsx("div", { className: "flex-1 border-t border-[var(--border)] min-h-0", children: /* @__PURE__ */ jsx(ActiveNotes, {}) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex flex-col flex-1 min-w-0", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex-1 min-h-0 flex flex-col", style: {
          minHeight: "160px"
        }, children: [
          /* @__PURE__ */ jsxs("div", { className: "panel-header shrink-0", children: [
            /* @__PURE__ */ jsx("span", { children: "Piano Roll" }),
            /* @__PURE__ */ jsx("span", { className: "text-[var(--text-muted)] normal-case font-mono text-[9px]", children: "← 8 秒时间窗口" })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "flex-1 min-h-0", children: /* @__PURE__ */ jsx(PianoRoll, {}) })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "shrink-0 border-t border-[var(--border)]", style: {
          height: "72px"
        }, children: /* @__PURE__ */ jsx(PianoKeyboard, {}) }),
        /* @__PURE__ */ jsxs("div", { className: "h-[200px] shrink-0 flex border-t border-[var(--border)]", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex-1 flex flex-col border-r border-[var(--border)] min-w-0", children: [
            /* @__PURE__ */ jsxs("div", { className: "panel-header shrink-0", children: [
              /* @__PURE__ */ jsx("span", { children: "CC 控制器曲线" }),
              /* @__PURE__ */ jsx("span", { className: "text-[var(--text-muted)] normal-case font-mono text-[9px]", children: "+/- 时间轴  Shift+/- 数值轴" })
            ] }),
            /* @__PURE__ */ jsx("div", { className: "flex-1 min-h-0 p-2", children: /* @__PURE__ */ jsx(CcPanel, {}) })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "w-[280px] shrink-0 flex flex-col", children: /* @__PURE__ */ jsx(EventLog, {}) })
        ] }),
        /* @__PURE__ */ jsx(StatsBar, {})
      ] })
    ] })
  ] });
}
const SplitComponent = () => /* @__PURE__ */ jsx(MidiProvider, { children: /* @__PURE__ */ jsx(App, {}) });
export {
  SplitComponent as component
};
