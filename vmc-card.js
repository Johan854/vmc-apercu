{ // bloc isolé
/*
 * VMC Card (FR)
 * VMC deux vitesses pour Home Assistant : vitesse en cours, raison (bouton / humidité),
 * compte à rebours, bouton vitesse 2 pendant 30 min, suivi de l'humidité des pièces
 * (valeur, moyenne 24 h, seuil de déclenchement) et réglage des seuils.
 * Style verre, thème clair/sombre automatique, éditeur visuel, textes en français.
 */
const CARD_VERSION = "1.1.0";

/* === NUANCE COMMUNE v2 (cartes Johan854) === */
const GV_NUANCES = [["braise", "Braise (rouge)", "#e0524f"], ["ocean", "Océan (bleu)", "#2f8fd8"], ["lagon", "Lagon (turquoise)", "#1fb5a8"], ["foret", "Forêt (vert)", "#3fae5a"], ["lavande", "Lavande (violet)", "#8a63d8"], ["framboise", "Framboise (rose)", "#e05597"], ["ambre", "Ambre (orange)", "#e8902c"], ["ardoise", "Ardoise (neutre)", "#7d8595"]];
const GV_DEFAULTS = { nuance: "theme", intensite: 1 };
const gvAccent = (c) => {
  const p = c && c.nuance_perso;
  if (c && c.nuance === "perso") {
    if (Array.isArray(p) && p.length === 3) return "#" + p.map((v) => Math.max(0, Math.min(255, Math.round(+v || 0))).toString(16).padStart(2, "0")).join("");
    if (typeof p === "string" && /^#?[0-9a-f]{6}$/i.test(p.trim())) return "#" + p.trim().replace("#", "");
  }
  const n = GV_NUANCES.find((x) => x[0] === (c && c.nuance));
  return n ? n[2] : "var(--carte-nuance)";
};
const gvStyle = (c, dark) => {
  const i = Number(c && c.intensite), ai = Number.isFinite(i) ? Math.max(0, Math.min(2, i)) : 1;
  const m = (pct, base) => `color-mix(in srgb,var(--acc-ui) ${+(pct * ai).toFixed(1)}%,${base})`;
  const bg = dark ? `linear-gradient(160deg,${m(5, "#1b1e32")} 0%,${m(11, "#1f1b2c")} 55%,${m(22, "#1c1620")} 100%)`
    : `linear-gradient(160deg,${m(2, "#f8f9fd")} 0%,${m(5, "#eef1f8")} 55%,${m(11, "#f8f8fa")} 100%)`;
  return `--acc-ui:${gvAccent(c)};--g-bg-x:${bg};--acc-ui-x:color-mix(in srgb,var(--acc-ui) ${dark ? "80%,#fff" : "82%,#000"})`;
};
const GV_FIELDS = [
  { name: "nuance", selector: { select: { mode: "dropdown", options: [{ value: "theme", label: "Selon le thème (couleurs d'origine)" }, ...GV_NUANCES.map((n) => ({ value: n[0], label: n[1] })), { value: "perso", label: "Personnalisée" }] } } },
  { name: "nuance_perso", selector: { color_rgb: {} } },
  { name: "intensite", selector: { number: { min: 0, max: 2, step: 0.1, mode: "slider" } } }];
const GV_LABELS = { nuance: "Nuance de couleur", nuance_perso: "Couleur personnalisée (nuance « Personnalisée »)", intensite: "Intensité de la nuance" };
/* === FIN NUANCE COMMUNE === */

const DEFAULTS = {
  name: "VMC", theme: "auto", ...GV_DEFAULTS,
  relay_entity: "switch.dingtian_relay57239_switch7", // collé = vitesse 2
  timer_entity: "timer.vmc_grande_vitesse",
  humidity_entity: "binary_sensor.vmc_humidite_elevee",
  trigger_entity: "binary_sensor.vmc_humidite_au_dessus_du_seuil", // même condition, sans temporisation
  delay_off: 10, // minutes de maintien en vitesse 2 après la baisse d'humidité
  max_hours: 3, // durée maximale de la vitesse 2 sur humidité
  power_entity: "sensor.esp_tableau_divers_puissance",
  gap_entity: "input_number.vmc_ecart_humidite",
  max_entity: "input_number.vmc_seuil_humidite_max",
  rooms: [
    { name: "Salle de bain", humidity: "sensor.sonde_salle_de_bain_humidity", mean: "sensor.humidite_salle_de_bain_moyenne_24_h" },
    { name: "Cuisine", humidity: "sensor.sonde_cuisine_humidity", mean: "sensor.humidite_cuisine_moyenne_24_h" },
    { name: "Suite", humidity: "sensor.sonde_suite_humidity", mean: "sensor.humidite_suite_moyenne_24_h" },
  ],
  show_settings: true,
  image: "", // photo de la VMC (fond transparent), ex. /local/image/vmc-aldes.png
};
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (st) => (st && !["unavailable", "unknown"].includes(st.state) && !isNaN(Number(st.state)) ? Number(st.state) : null);
const hms = (s) => { s = Math.max(0, Math.round(s)); const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, "0")}`; };
const lng = (s) => { s = Math.max(0, Math.round(s / 60)); if (s < 1) return "moins d'1 min"; if (s < 60) return `${s} min`; return `${Math.floor(s / 60)} h ${String(s % 60).padStart(2, "0")}`; };
const dur = (str) => { if (!str) return 0; const p = String(str).split(":").map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : 0; };

class VmcCard extends HTMLElement {
  static getConfigElement() { return document.createElement("vmc-card-editor"); }
  static getStubConfig() { return { ...DEFAULTS }; }
  constructor() { super(); this.attachShadow({ mode: "open" }); }
  setConfig(c) { this._config = { ...DEFAULTS, ...(c || {}) }; if (!Array.isArray(this._config.rooms)) this._config.rooms = []; this._sig = ""; this._render(); }
  set hass(h) {
    this._hass = h; const c = this._config;
    const ids = [c.relay_entity, c.timer_entity, c.humidity_entity, c.power_entity, c.gap_entity, c.max_entity, ...c.rooms.flatMap((r) => [r.humidity, r.mean])];
    const sig = ids.map((e) => { const s = e && h.states[e]; return s ? s.state + JSON.stringify(s.attributes.finishes_at || s.attributes.remaining || s.attributes.pieces || "") : ""; }).join("|") + (h.themes && h.themes.darkMode);
    if (sig !== this._sig) { this._sig = sig; this._render(); }
  }
  getCardSize() { return 5; }
  connectedCallback() { this._t = setInterval(() => { const s = this._hass && this._hass.states[this._config.timer_entity]; const r = this._hass && this._hass.states[this._config.relay_entity]; if ((s && s.state === "active") || (r && r.state === "on")) this._render(); }, 1000); }
  disconnectedCallback() { clearInterval(this._t); }
  _isDark() {
    const t = this._config.theme; if (t === "dark") return true; if (t === "light") return false;
    const dm = this._hass && this._hass.themes && this._hass.themes.darkMode;
    return typeof dm === "boolean" ? dm : !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  }
  _remaining(t) {
    if (!t || t.state !== "active") return null;
    if (t.attributes.finishes_at) return (new Date(t.attributes.finishes_at).getTime() - Date.now()) / 1000;
    return dur(t.attributes.remaining);
  }
  _render() {
    const c = this._config, h = this._hass; if (!c) return;
    const S = (e) => h && e && h.states[e];
    const relay = S(c.relay_entity), timer = S(c.timer_entity), hum = S(c.humidity_entity), pw = num(S(c.power_entity));
    const v2 = relay && relay.state === "on", unk = !relay || relay.state === "unavailable";
    const left = this._remaining(timer), hOn = hum && hum.state === "on";
    const gap = num(S(c.gap_entity)), mx = num(S(c.max_entity));
    /* durées : depuis quand la vitesse 2 tourne, et quand elle s'arrêtera */
    const now = Date.now(), ago = (st) => (st ? (now - new Date(st.last_changed).getTime()) / 1000 : 0);
    const since = v2 ? ago(relay) : null;
    let back = null, backTxt = "";
    if (v2) {
      const trg = S(c.trigger_entity), maxS = Number(c.max_hours || 3) * 3600, hLeftMax = hOn ? maxS - ago(hum) : null;
      const hDown = hOn && trg && trg.state === "off" ? Number(c.delay_off || 10) * 60 - ago(trg) : null;
      if (hOn && hDown == null) {
        backTxt = left != null ? `Bouton ${hms(left)} · puis selon l'humidité (${lng(hLeftMax)} max)` : `Humidité encore élevée · ${lng(hLeftMax)} max`;
      } else {
        back = Math.max(left != null ? left : 0, hDown != null ? Math.min(hDown, hLeftMax) : 0);
        backTxt = hDown != null && (left == null || hDown >= left) ? `Humidité redescendue · retour en vitesse 1 dans ${hms(back)}` : left != null ? `Retour en vitesse 1 dans ${hms(back)}` : "Retour en vitesse 1 imminent";
      }
    }
    const reason = unk ? "Relais indisponible" : !v2 ? "Vitesse normale" : left != null ? "Bouton de relance" : hOn ? `Humidité : ${esc(hum.attributes.pieces || "en hausse")}` : "Vitesse 2";
    const dark = this._isDark();
    const rooms = c.rooms.map((r) => {
      const v = num(S(r.humidity)), m = num(S(r.mean));
      const trig = m != null && gap != null ? Math.min(mx != null ? mx : 100, m + gap) : mx;
      const hot = v != null && trig != null && v >= trig;
      const pct = (x) => Math.max(0, Math.min(100, x == null ? 0 : x));
      return `<div class="room ${hot ? "hot" : ""}"><div class="rn"><b>${esc(r.name)}</b><small>${m != null ? `moyenne 24 h ${m.toFixed(0)} %` : "moyenne en cours de calcul"}${trig != null ? `<br>vitesse 2 à ${trig.toFixed(0)} %` : ""}</small></div>
        <div class="bar"><i style="width:${pct(v)}%"></i>${m != null ? `<em class="mean" style="left:${pct(m)}%" title="Moyenne 24 h"></em>` : ""}${trig != null ? `<em class="trig" style="left:${pct(trig)}%" title="Seuil de déclenchement"></em>` : ""}</div>
        <div class="rv">${v != null ? `${v.toFixed(0)} %` : "—"}</div></div>`;
    }).join("");
    const setRow = (label, ent, val, unit, step) => ent && S(ent) ? `<div class="set"><span>${label}</span><button data-n="${esc(ent)}" data-d="${-step}" aria-label="Diminuer">−</button><b>${val != null ? val : "—"} ${unit}</b><button data-n="${esc(ent)}" data-d="${step}" aria-label="Augmenter">+</button></div>` : "";
    this.shadowRoot.innerHTML = `<style>
      * { box-sizing:border-box; }
      ha-card.dark { --tx:#f4f6fb; --mu:#a9afc0; --bg:var(--g-bg-x,linear-gradient(160deg,#1b1e32 0%,#1f1b2c 55%,#1c1620 100%)); --bd:rgba(255,255,255,.14); --sh:0 .6em 2em rgba(0,0,0,.35); --gl:rgba(255,255,255,.07); --glb:rgba(255,255,255,.13); --fi:rgba(255,255,255,.1); --fib:rgba(255,255,255,.18); }
      ha-card.light { --tx:#1c2030; --mu:#5d6477; --bg:var(--g-bg-x,linear-gradient(160deg,#f8f9fd 0%,#eef1f8 55%,#f8f8fa 100%)); --bd:rgba(20,24,40,.12); --sh:0 .4em 1.4em rgba(20,24,40,.12); --gl:rgba(255,255,255,.7); --glb:rgba(20,24,40,.1); --fi:rgba(20,24,40,.06); --fib:rgba(20,24,40,.14); }
      ha-card { --ac:var(--acc-ui-x,#1fb5a8); display:flex; flex-direction:column; gap:12px; padding:16px; color:var(--tx); border-radius:24px; border:1px solid var(--bd); background:var(--bg); box-shadow:var(--sh); }
      .top { display:grid; grid-template-columns:auto minmax(0,1fr); gap:14px; align-items:center; }
      .fan { width:86px; height:86px; border-radius:50%; background:var(--gl); border:1px solid var(--glb); display:grid; place-items:center; }
      .fan svg { width:64px; height:64px; color:${v2 ? "var(--ac)" : "var(--mu)"}; animation:spin ${v2 ? "0.7s" : "2.4s"} linear infinite; }
      ${unk ? ".fan svg { animation:none; opacity:.4; }" : ""}
      .pic { position:relative; width:120px; } .pic img { width:120px; height:auto; display:block; filter:drop-shadow(0 6px 10px rgba(0,0,0,.25)); }
      .fan.mini { position:absolute; right:-6px; bottom:-6px; width:40px; height:40px; background:var(--bg); } .fan.mini svg { width:28px; height:28px; }
      @keyframes spin { to { transform:rotate(360deg); } }
      @media (prefers-reduced-motion:reduce) { .fan svg { animation:none; } }
      .ttl b { font-size:1.1em; font-weight:650; } .ttl .sp { display:inline-block; margin-left:.4em; font-size:.78em; font-weight:700; padding:.15em .6em; border-radius:1em; background:${v2 ? "var(--ac)" : "var(--fi)"}; color:${v2 ? "#fff" : "var(--tx)"}; border:1px solid ${v2 ? "var(--ac)" : "var(--fib)"}; vertical-align:middle; }
      .ttl small { display:block; color:var(--mu); font-size:.85em; margin-top:.25em; }
      .ttl .pw { font-size:.8em; color:var(--mu); margin-top:.15em; }
      .tm { display:flex; flex-wrap:wrap; gap:6px; } .tm span { display:inline-flex; align-items:center; gap:.4em; font-size:.8em; padding:.35em .8em; border-radius:2em; background:var(--gl); border:1px solid var(--glb); font-variant-numeric:tabular-nums; } .tm span.bk { border-color:color-mix(in srgb,var(--ac) 55%,transparent); } .tm ha-icon { --mdc-icon-size:1.15em; color:var(--ac); }
      .act { display:flex; gap:8px; flex-wrap:wrap; }
      .btn { font:inherit; font-size:.9em; font-weight:650; display:inline-flex; align-items:center; gap:.45em; padding:.6em 1.1em; min-height:44px; border-radius:2em; border:1px solid var(--fib); background:var(--fi); color:var(--tx); cursor:pointer; }
      .btn.main { background:var(--ac); border-color:var(--ac); color:#fff; } .btn ha-icon { --mdc-icon-size:1.2em; }
      .rooms { display:flex; flex-direction:column; gap:8px; padding:10px 12px; border-radius:16px; background:var(--gl); border:1px solid var(--glb); }
      .room { display:grid; grid-template-columns:minmax(0,10.5em) minmax(0,1fr) 3.2em; gap:10px; align-items:center; }
      .rn b { font-size:.9em; font-weight:650; } .rn small { display:block; font-size:.7em; color:var(--mu); line-height:1.3; }
      .bar { position:relative; height:8px; border-radius:4px; background:var(--fi); }
      .bar i { position:absolute; left:0; top:0; bottom:0; border-radius:4px; background:color-mix(in srgb,var(--ac) 70%,transparent); }
      .room.hot .bar i { background:#e8902c; }
      .bar em { position:absolute; top:-3px; width:2px; height:14px; border-radius:1px; }
      .bar .mean { background:var(--mu); opacity:.7; } .bar .trig { background:#e0524f; }
      .rv { text-align:right; font-weight:650; font-variant-numeric:tabular-nums; } .room.hot .rv { color:#e8902c; }
      .leg { font-size:.72em; color:var(--mu); display:flex; gap:1em; flex-wrap:wrap; } .leg span { display:inline-flex; align-items:center; gap:.35em; } .leg i { width:2px; height:10px; display:inline-block; }
      .sets { display:flex; gap:8px; flex-wrap:wrap; }
      .set { display:flex; align-items:center; gap:6px; padding:4px 6px 4px 12px; border-radius:2em; background:var(--gl); border:1px solid var(--glb); font-size:.8em; color:var(--mu); }
      .set b { color:var(--tx); min-width:3.2em; text-align:center; }
      .set button { width:32px; height:32px; border-radius:50%; border:1px solid var(--fib); background:var(--fi); color:var(--tx); font:inherit; font-weight:700; cursor:pointer; }
      button:focus-visible { outline:2px solid var(--ac); outline-offset:2px; }
      @media (max-width:420px) { .room { grid-template-columns:minmax(0,1fr) 3.2em; } .room .bar { grid-column:1 / -1; grid-row:2; } }
    </style>
    <ha-card class="${dark ? "dark" : "light"}" style="${gvStyle(c, dark)}">
      <div class="top">${c.image ? `<div class="pic"><img src="${esc(c.image)}" alt=""><div class="fan mini" aria-hidden="true"><svg viewBox="0 0 64 64"><g fill="currentColor">${[0, 90, 180, 270].map((a) => `<path transform="rotate(${a} 32 32)" d="M32 30c-2-9 1-20 9-22 6-1 9 5 6 10-3 6-9 9-15 12z"/>`).join("")}<circle cx="32" cy="32" r="5"/></g></svg></div></div>` : `<div class="fan" aria-hidden="true"><svg viewBox="0 0 64 64"><g fill="currentColor">${[0, 90, 180, 270].map((a) => `<path transform="rotate(${a} 32 32)" d="M32 30c-2-9 1-20 9-22 6-1 9 5 6 10-3 6-9 9-15 12z"/>`).join("")}<circle cx="32" cy="32" r="5"/></g></svg></div>`}
        <div class="ttl"><b>${esc(c.name)}</b><span class="sp">${unk ? "?" : v2 ? "Vitesse 2" : "Vitesse 1"}</span><small>${reason}</small>${pw != null ? `<div class="pw">Consommation du circuit : ${pw.toFixed(0)} W</div>` : ""}</div></div>
      ${v2 ? `<div class="tm"><span><ha-icon icon="mdi:timer-outline"></ha-icon>Vitesse 2 depuis ${lng(since)}</span><span class="bk"><ha-icon icon="mdi:fan-speed-1"></ha-icon>${backTxt}</span></div>` : ""}
      <div class="act">${left != null ? `<button class="btn" data-a="stop"><ha-icon icon="mdi:fan-speed-1"></ha-icon>Revenir en vitesse 1</button><button class="btn main" data-a="boost"><ha-icon icon="mdi:timer-refresh-outline"></ha-icon>Relancer 30 min</button>`
        : `<button class="btn main" data-a="boost" ${timer ? "" : "disabled"}><ha-icon icon="mdi:fan-speed-2"></ha-icon>Vitesse 2 · 30 min</button>`}</div>
      ${rooms ? `<div class="rooms">${rooms}<div class="leg"><span><i style="background:var(--mu)"></i>moyenne 24 h</span><span><i style="background:#e0524f"></i>seuil de vitesse 2</span></div></div>` : ""}
      ${c.show_settings ? `<div class="sets">${setRow("Écart", c.gap_entity, gap, "pts", 1)}${setRow("Seuil absolu", c.max_entity, mx, "%", 1)}</div>` : ""}
    </ha-card>`;
    const r = this.shadowRoot;
    r.querySelectorAll("[data-a]").forEach((b) => b.addEventListener("click", () => {
      if (b.dataset.a === "boost") h.callService("timer", "start", { entity_id: c.timer_entity });
      else h.callService("timer", "cancel", { entity_id: c.timer_entity });
    }));
    r.querySelectorAll(".set button").forEach((b) => b.addEventListener("click", () => {
      const e = b.dataset.n, st = S(e), v = num(st); if (v == null) return;
      const a = st.attributes, nv = Math.max(a.min != null ? a.min : -Infinity, Math.min(a.max != null ? a.max : Infinity, v + Number(b.dataset.d)));
      h.callService(e.split(".")[0], "set_value", { entity_id: e, value: nv });
    }));
  }
}

const LABELS = { ...GV_LABELS, name: "Titre", relay_entity: "Relais de la vitesse 2 (allumé = vitesse 2)", timer_entity: "Minuteur du bouton (timer)", humidity_entity: "Capteur « humidité élevée » (facultatif)", trigger_entity: "Humidité au-dessus du seuil, sans temporisation (compte à rebours)", delay_off: "Maintien après la baisse d'humidité (min)", max_hours: "Durée maximale sur humidité (h)", power_entity: "Puissance du circuit (facultatif)", gap_entity: "Écart d'humidité (input_number)", max_entity: "Seuil absolu (input_number)", rooms: "Pièces surveillées", show_settings: "Afficher les réglages", image: "Photo de la VMC (URL, facultatif)", theme: "Thème" };
class VmcCardEditor extends HTMLElement {
  setConfig(c) { this._config = { ...DEFAULTS, ...c }; if (!this._form) this._build(); else this._form.data = this._config; }
  set hass(h) { this._hass = h; if (this._form) this._form.hass = h; }
  _build() {
    const el = document.createElement("ha-form");
    el.hass = this._hass; el.data = this._config; el.computeLabel = (s) => LABELS[s.name] || s.name;
    el.schema = [
      { name: "name", selector: { text: {} } },
      { name: "relay_entity", selector: { entity: { domain: ["switch", "input_boolean", "light"] } } },
      { name: "timer_entity", selector: { entity: { domain: "timer" } } },
      { type: "grid", name: "", schema: [
        { name: "humidity_entity", selector: { entity: { domain: "binary_sensor" } } },
        { name: "power_entity", selector: { entity: { domain: "sensor" } } }] },
      { type: "grid", name: "", schema: [
        { name: "trigger_entity", selector: { entity: { domain: "binary_sensor" } } },
        { name: "delay_off", selector: { number: { min: 0, max: 60, mode: "box" } } },
        { name: "max_hours", selector: { number: { min: 1, max: 12, mode: "box" } } }] },
      { type: "grid", name: "", schema: [
        { name: "gap_entity", selector: { entity: { domain: ["input_number", "number"] } } },
        { name: "max_entity", selector: { entity: { domain: ["input_number", "number"] } } }] },
      { name: "image", selector: { text: {} } },
      { name: "rooms", selector: { object: {} } },
      { type: "grid", name: "", schema: [
        { name: "show_settings", selector: { boolean: {} } },
        { name: "theme", selector: { select: { mode: "dropdown", options: [{ value: "auto", label: "Automatique" }, { value: "light", label: "Clair" }, { value: "dark", label: "Sombre" }] } } }] },
      { type: "expandable", name: "", title: "Nuance de couleur", schema: GV_FIELDS },
    ];
    el.addEventListener("value-changed", (ev) => { ev.stopPropagation(); this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: ev.detail.value }, bubbles: true, composed: true })); });
    this._form = el; this.appendChild(el);
  }
}

if (!customElements.get("vmc-card")) {
  customElements.define("vmc-card", VmcCard);
  customElements.define("vmc-card-editor", VmcCardEditor);
  window.customCards = window.customCards || [];
  window.customCards.push({ type: "vmc-card", name: "VMC (FR)", description: "VMC deux vitesses : vitesse 2 au bouton ou sur hausse d'humidité, avec suivi des pièces.", preview: false });
}
console.info(`%c VMC-CARD %c v${CARD_VERSION} `, "color:#fff;background:#1fb5a8;font-weight:700;border-radius:3px 0 0 3px;padding:2px 4px", "color:#1fb5a8;background:#fff;font-weight:700;border-radius:0 3px 3px 0;padding:2px 4px");
}
