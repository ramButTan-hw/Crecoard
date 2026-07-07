let enabled = (() => {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("plancraft-sound") !== "off";
})();

export function getSoundEnabled() { return enabled; }

export function setSoundEnabled(v: boolean) {
  enabled = v;
  if (typeof window !== "undefined")
    localStorage.setItem("plancraft-sound", v ? "on" : "off");
}

export function playPing(type: "message" | "mention") {
  if (!enabled || typeof window === "undefined") return;
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    if (type === "mention") {
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
    } else {
      osc.frequency.setValueAtTime(660, ctx.currentTime);
    }
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);
    void ctx.close();
  } catch { /* AudioContext blocked (no user gesture yet) — silently skip */ }
}
