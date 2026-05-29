function exportJson(events, sessionDuration) {
  const data = {
    exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
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
      deviceName: e.deviceName
    }))
  };
  downloadBlob(
    JSON.stringify(data, null, 2),
    `midi-session-${Date.now()}.json`,
    "application/json"
  );
}
function exportCsv(events) {
  const headers = [
    "sessionTime",
    "channel",
    "type",
    "noteNumber",
    "noteName",
    "velocity",
    "releaseVelocity",
    "ccNumber",
    "ccValue",
    "ccName",
    "pitchBend",
    "program",
    "pressure",
    "deviceName",
    "rawBytes"
  ];
  const rows = events.map(
    (e) => [
      Math.round(e.sessionTime),
      e.channel,
      e.type,
      e.noteNumber ?? "",
      e.noteName ?? "",
      e.velocity ?? "",
      e.releaseVelocity ?? "",
      e.ccNumber ?? "",
      e.ccValue ?? "",
      e.ccName ?? "",
      e.pitchBend ?? "",
      e.program ?? "",
      e.pressure ?? "",
      `"${e.deviceName}"`,
      `"${e.rawBytes.join(" ")}"`
    ].join(",")
  );
  downloadBlob(
    [headers.join(","), ...rows].join("\n"),
    `midi-session-${Date.now()}.csv`,
    "text/csv"
  );
}
function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
function encodeVLQ(value) {
  const bytes = [];
  bytes.push(value & 127);
  value >>= 7;
  while (value > 0) {
    bytes.push(128 | value & 127);
    value >>= 7;
  }
  bytes.reverse();
  return bytes;
}
function saveMidi(events) {
  const BPM = 120;
  const TICKS_PER_QUARTER = 480;
  const sorted = [...events].filter((e) => e.type !== "unknown").sort((a, b) => a.sessionTime - b.sessionTime);
  if (sorted.length === 0) return;
  const trackData = [];
  const tempo = Math.round(6e7 / BPM);
  trackData.push(0, 255, 81, 3, tempo >> 16 & 255, tempo >> 8 & 255, tempo & 255);
  let lastTime = 0;
  for (const event of sorted) {
    const deltaMs = event.sessionTime - lastTime;
    lastTime = event.sessionTime;
    const deltaTicks = Math.round(deltaMs * BPM * TICKS_PER_QUARTER / 6e4);
    const deltaVLQ = encodeVLQ(deltaTicks);
    let message;
    switch (event.type) {
      case "noteOn":
        message = [144 | event.channel, event.noteNumber ?? 0, event.velocity ?? 64];
        break;
      case "noteOff":
        message = [128 | event.channel, event.noteNumber ?? 0, event.releaseVelocity ?? 0];
        break;
      case "controlChange":
        message = [176 | event.channel, event.ccNumber ?? 0, event.ccValue ?? 0];
        break;
      case "pitchBend": {
        const pb = (event.pitchBend ?? 0) + 8192;
        message = [224 | event.channel, pb & 127, pb >> 7 & 127];
        break;
      }
      case "programChange":
        message = [192 | event.channel, event.program ?? 0];
        break;
      case "aftertouch":
        message = [160 | event.channel, event.noteNumber ?? 0, event.pressure ?? 0];
        break;
      case "channelPressure":
        message = [208 | event.channel, event.pressure ?? 0];
        break;
      default:
        continue;
    }
    trackData.push(...deltaVLQ, ...message);
  }
  trackData.push(0, 255, 47, 0);
  const trackLen = trackData.length;
  const midiBytes = new Uint8Array([
    77,
    84,
    104,
    100,
    0,
    0,
    0,
    6,
    0,
    0,
    0,
    1,
    TICKS_PER_QUARTER >> 8 & 255,
    TICKS_PER_QUARTER & 255,
    77,
    84,
    114,
    107,
    trackLen >> 24 & 255,
    trackLen >> 16 & 255,
    trackLen >> 8 & 255,
    trackLen & 255,
    ...trackData
  ]);
  downloadBlob(midiBytes, `midi-session-${Date.now()}.mid`, "audio/midi");
}
export {
  exportCsv,
  exportJson,
  saveMidi
};
