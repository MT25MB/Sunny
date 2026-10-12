// Sunny Helper — demo behavior (it does not really hear you or control the computer yet).
const svg = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const ICONS = {
  mic: svg('<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>'),
  micOff: svg('<line x1="2" x2="22" y1="2" y2="22"/><path d="M18.89 13.23A7 7 0 0 0 19 12v-2"/><path d="M5 10v2a7 7 0 0 0 12 5"/><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12"/><line x1="12" x2="12" y1="19" y2="22"/>'),
  check: svg('<path d="M20 6 9 17l-5-5"/>'),
  phone: svg('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>'),
  chef: svg('<path d="M17 21a1 1 0 0 0 1-1v-5.35c0-.46.31-.86.7-1.1a4 4 0 0 0-2.3-7.38 5 5 0 0 0-8.8 0 4 4 0 0 0-2.3 7.38c.39.24.7.64.7 1.1V20a1 1 0 0 0 1 1Z"/><path d="M6 17h12"/>'),
  mail: svg('<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>'),
  cloud: svg('<path d="M12 2v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="M20 12h2"/><path d="m19.07 4.93-1.41 1.41"/><path d="M15.95 12.48a4 4 0 0 0-6.38-3.98"/><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"/>'),
};

const STATUS = { idle: "Hello! I'm ready to help.", listening: "I'm listening...", thinking: "Let me think...", working: "I'm doing it now.", done: "All done!" };
const QUICK = [["Call family", "phone"], ["Find a recipe", "chef"], ["Read my email", "mail"], ["Today's weather", "cloud"]];

function stepsFor(q) {
  const t = q.toLowerCase();
  if (t.includes("recipe") || t.includes("cook")) return ["Opening Browser...", "Searching for recipes...", "Picking easy ones for you...", "Showing results"];
  if (t.includes("email") || t.includes("mail")) return ["Opening your Email...", "Finding new messages...", "Making the text bigger...", "Ready to read"];
  if (t.includes("weather")) return ["Opening Browser...", "Checking today's weather...", "Showing the forecast"];
  if (t.includes("call") || t.includes("family") || t.includes("video")) return ["Opening Video Call app...", "Finding your contacts...", "Starting the call..."];
  return ["Understanding your request...", "Opening the right app...", "Doing it for you...", "All finished"];
}

const $ = (id) => document.getElementById(id);
const state = { mode: "idle", steps: [], current: 0 };
let timers = [];
const clear = () => { timers.forEach(clearTimeout); timers = []; };
const later = (ms, fn) => timers.push(setTimeout(fn, ms));
const set = (patch) => { Object.assign(state, patch); render(); };

function render() {
  const { mode, steps, current } = state;
  const busy = mode === "thinking" || mode === "working";
  const listening = mode === "listening";
  $("status").textContent = STATUS[mode];
  $("bubble").classList.toggle("hidden", mode !== "thinking");
  $("mascot").classList.toggle("listening", listening);
  const mic = $("mic");
  mic.disabled = busy;
  mic.classList.toggle("mic-active", listening);
  mic.setAttribute("aria-pressed", listening);
  mic.innerHTML = (listening ? ICONS.micOff : ICONS.mic) + `<span>${listening ? "Listening — tap to stop" : "Push to Talk"}</span>`;
  $("askBtn").disabled = busy || !$("ask").value.trim();
  document.querySelectorAll("#quick button").forEach((b) => (b.disabled = busy));
  $("quick").classList.toggle("hidden", steps.length > 0);
  $("stepsBox").classList.toggle("hidden", steps.length === 0);
  $("again").classList.toggle("hidden", mode !== "done");
  $("steps").innerHTML = steps.map((s, i) => {
    const done = i < current, active = i === current && mode === "working";
    const cls = done ? "step-done" : active ? "step-active" : "step-todo";
    const icon = done ? ICONS.check : active ? '<span class="spinner"></span>' : i + 1;
    return `<li class="step ${cls}"><span class="step-icon">${icon}</span><span>${s}</span></li>`;
  }).join("");
}

function run(q) {
  clear();
  const s = stepsFor(q);
  set({ steps: s, current: 0, mode: "thinking" });
  later(1200, () => set({ mode: "working" }));
  s.forEach((_, i) => later(1200 + (i + 1) * 1600, () => set({ current: i + 1 })));
  later(1200 + s.length * 1600 + 200, () => set({ mode: "done" }));
}

$("quick").innerHTML = QUICK.map(([label, icon]) => `<button class="chip" data-q="${label}">${ICONS[icon]} ${label}</button>`).join("");
$("quick").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  $("ask").value = b.dataset.q; run(b.dataset.q);
});
$("mic").addEventListener("click", () => {
  if (state.mode === "listening") return run($("ask").value || "find a recipe");
  clear(); set({ steps: [], mode: "listening" });
});
$("form").addEventListener("submit", (e) => { e.preventDefault(); const q = $("ask").value; if (q.trim()) run(q); });
$("ask").addEventListener("input", render);
$("again").addEventListener("click", () => { $("ask").value = ""; set({ steps: [], mode: "idle" }); });
render();
