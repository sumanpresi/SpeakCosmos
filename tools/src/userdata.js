// The person's own topics, notes, accepted connections and combined views ("collections").
// State is one small JSON document; everything else (nodes, links, positions) is derived from it, so a bug in the
// display can never lose notes. `normalize` repairs anything odd; `buildGraph` is pure and unit-tested.
import { parseNote, plain } from "./wikilinks.js";
import { clip, norm, slug } from "./text.js";

export const SCHEMA = 1;
export const emptyState = () => ({ v: SCHEMA, topics: [], notes: [], bridges: [], dismissed: [], cols: [] });
export const COLORS = ["#2a78d6", "#1baf7a", "#c2417a", "#eb6834", "#6250d6", "#0e8fa3", "#b08400", "#7a3fb0", "#b3541e", "#1f7a5a"];
const str = (v, n) => (typeof v === "string" ? v : v == null ? "" : String(v)).slice(0, n);
const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const newId = uid;

/** make any loaded/imported object safe to use */
export function normalize(raw) {
  const s = emptyState();
  if (!raw || typeof raw !== "object") return s;
  const seenT = new Set();
  for (const t of Array.isArray(raw.topics) ? raw.topics : []) {
    if (!t || typeof t !== "object") continue;
    let id = slug(str(t.id, 40)) || slug(str(t.label, 40));
    if (!id || id === "eng" || id === "phil" || seenT.has(id)) id = slug(id + "-" + (seenT.size + 1));
    if (seenT.has(id)) continue;
    seenT.add(id);
    s.topics.push({ id, label: str(t.label, 40).trim() || id, color: /^#[0-9a-f]{6}$/i.test(t.color) ? t.color : COLORS[s.topics.length % COLORS.length], desc: str(t.desc, 300), created: +t.created || Date.now(), auto: !!t.auto });
  }
  const seenN = new Set();
  for (const n of Array.isArray(raw.notes) ? raw.notes : []) {
    if (!n || typeof n !== "object") continue;
    let id = str(n.id, 60) || uid("n");
    if (seenN.has(id)) id = uid("n");
    seenN.add(id);
    let topic = str(n.topic, 40);
    if (!seenT.has(topic)) {
      if (!seenT.has("inbox")) { seenT.add("inbox"); s.topics.push({ id: "inbox", label: "Inbox", color: COLORS[s.topics.length % COLORS.length], desc: "Notes that had no topic", created: Date.now() }); }
      topic = "inbox";
    }
    const note = { id, topic, title: str(n.title, 120).trim() || "Untitled", text: str(n.text, 20000), created: +n.created || Date.now(), updated: +n.updated || +n.created || Date.now() };
    if (n.spark) note.spark = true;
    if (Array.isArray(n.from)) note.from = n.from.map((x) => str(x, 80)).filter(Boolean).slice(0, 6);
    if (Array.isArray(n.p) && n.p.length === 3 && n.p.every(Number.isFinite)) note.p = n.p;
    s.notes.push(note);
  }
  for (const b of Array.isArray(raw.bridges) ? raw.bridges : []) if (b && typeof b.a === "string" && typeof b.b === "string" && b.a !== b.b) s.bridges.push({ a: str(b.a, 80), b: str(b.b, 80), rel: ["RELATED", "SIMILAR", "CONTRADICTS", "SUPPORTS"].includes(b.rel) ? b.rel : "RELATED", note: str(b.note, 200) });
  s.dismissed = [...new Set((Array.isArray(raw.dismissed) ? raw.dismissed : []).filter((x) => typeof x === "string").map((x) => x.slice(0, 170)))].slice(0, 5000);
  const colIds = new Set();
  for (const c of Array.isArray(raw.cols) ? raw.cols : []) {
    if (!c || typeof c !== "object") continue;
    const id = slug(str(c.id, 40) || str(c.label, 40));
    if (colIds.has(id)) continue; colIds.add(id);
    const topics = [...new Set((Array.isArray(c.topics) ? c.topics : []).map((x) => str(x, 40)).filter(Boolean))].slice(0, 12);
    if (topics.length) s.cols.push({ id, label: str(c.label, 40).trim() || "Combined", topics });
  }
  return s;
}

const hash = (id, salt = 0) => { let h = 2166136261 ^ salt; for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619); return ((h >>> 0) % 100000) / 100000; };
const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** place one new note inside its topic: near what it links to, away from what is already there (best-candidate sampling) */
export function placeNote(anchor, placed, seed) {
  const n = placed.length, R = 55 + 11 * Math.sqrt(n + 1);
  let best = null, bestD = -1;
  const tries = 28;
  for (let k = 0; k < tries; k++) {
    const u = hash(seed, k * 3 + 1) * 2 - 1, th = hash(seed, k * 3 + 2) * Math.PI * 2, r = Math.sqrt(1 - u * u);
    const rad = anchor ? 34 + hash(seed, k * 3 + 3) * 26 : R * (0.55 + 0.45 * hash(seed, k * 3 + 3));
    const c = anchor ? [anchor[0] + rad * r * Math.cos(th), anchor[1] + rad * u * 0.8, anchor[2] + rad * r * Math.sin(th)] : [rad * r * Math.cos(th), rad * u * 0.75, rad * r * Math.sin(th)];
    let m = Infinity;
    for (const p of placed) { const d = d3(c, p); if (d < m) m = d; if (m < bestD) break; }
    if (m > bestD) { bestD = m; best = c; }
  }
  return best.map((v) => Math.round(v * 10) / 10);
}

/**
 * Derive graph pieces from the state.
 * baseIds: Set of ids of built-in nodes (so [[links]] and bridges can point at them); baseByLabel: Map(normLabel → id)
 * ring: {radius, extent} where user topic clusters are placed in the whole-cosmos view
 * returns {nodes, edges, placed: [{id, p}] (notes that got a new position and should be saved), unresolved: Map(noteId → [titles])}
 */
export function buildGraph(state, baseIds, baseByLabel, ring = { radius: 760 }) {
  const nodes = [], edges = [], placed = [], unresolved = new Map(), warn = [];
  const topicById = new Map(state.topics.map((t, i) => [t.id, { ...t, i }]));
  const centers = new Map();
  state.topics.forEach((t, i) => {
    const th = i * 2.399963 + 0.6, r = ring.radius + (i % 3) * 90, y = ((i % 5) - 2) * 70;
    centers.set(t.id, [Math.round(r * Math.cos(th)), y, Math.round(r * Math.sin(th))]);
    nodes.push({ id: "uh:" + t.id, k: "hub", l: t.label, d: t.desc || "Your topic", c: t.color, t: "u:" + t.id, g: "uh:" + t.id, user: true, hubOf: t.id, p: centers.get(t.id), q: [0, 0, 0] });
  });
  const byTitle = new Map();
  for (const n of state.notes) { const k = norm(n.title); if (!byTitle.has(k)) byTitle.set(k, "u:" + n.id); }
  const idOf = (title) => { const k = norm(title); return byTitle.get(k) ?? baseByLabel.get(k) ?? null; };
  const local = new Map(), perTopic = new Map();
  for (const n of state.notes) {
    const id = "u:" + n.id, t = topicById.get(n.topic), info = parseNote(n.text);
    let q = n.p;
    if (!q) {
      const group = perTopic.get(n.topic) ?? perTopic.set(n.topic, []).get(n.topic);
      let anchor = null;
      const linkedLocal = [...info.links, ...(n.from ?? [])].map((x) => local.get(idOf(x) ?? x)).filter(Boolean);
      if (linkedLocal.length) anchor = linkedLocal[0];
      q = placeNote(anchor, group.length ? group : [[0, 0, 0]], id);
      placed.push({ id: n.id, p: q });
    }
    local.set(id, q);
    (perTopic.get(n.topic) ?? perTopic.set(n.topic, []).get(n.topic)).push(q);
    const c = centers.get(n.topic);
    nodes.push({ id, k: n.spark ? "spark" : "note", l: n.title, d: clip(plain(n.text), 260), text: n.text, tags: info.tags, t: "u:" + n.topic, g: "uh:" + n.topic, user: true, nid: n.id, created: n.created, updated: n.updated, p: [c[0] + q[0], c[1] + q[1], c[2] + q[2]], q });
    edges.push([id, "uh:" + n.topic, "BELONGS_TO"]);
  }
  const seen = new Set(), add = (a, b, rel) => { const k = a + "|" + b + "|" + rel; if (a === b || seen.has(k)) return; seen.add(k); edges.push([a, b, rel]); };
  const known = (id) => id && (id.startsWith("u:") || baseIds.has(id));
  const noteById = new Map(state.notes.map((x) => ["u:" + x.id, x]));
  const tagMap = new Map();
  for (const n of nodes) {
    if (!n.user || n.k === "hub") continue;
    const note = noteById.get(n.id) ?? null;
    const un = [];
    if (note?.spark && note.from) for (const f of note.from) { const to = known(f) ? f : idOf(f); if (to) add(n.id, to, "SPARKS"); }
    for (const title of parseNote(n.text).links) { const to = idOf(title); if (!to) un.push(title); else if (!seen.has(n.id + "|" + to + "|SPARKS")) add(n.id, to, "LINKS_TO"); }
    if (un.length) unresolved.set(n.id, un);
    for (const g of n.tags) (tagMap.get(g) ?? tagMap.set(g, []).get(g)).push(n.id);
  }
  for (const [g, ids] of tagMap) if (ids.length > 1 && ids.length <= 12) for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) add(ids[i], ids[j], "SHARES_TAG");
  for (const b of state.bridges) if (known(b.a) && known(b.b)) add(b.a, b.b, b.rel || "RELATED"); else warn.push(b);
  return { nodes, edges, placed, unresolved, warn };
}

/** split pasted/uploaded text into notes: by Markdown headings if present, otherwise by paragraphs (~900 characters each) */
export function textToNotes(name, text, { maxLen = 900 } = {}) {
  const t = String(text ?? "").replace(/\r\n?/g, "\n").trim();
  if (!t) return [];
  const base = String(name ?? "Imported").replace(/\.[a-z0-9]+$/i, "").slice(0, 80) || "Imported";
  const parts = t.split(/\n(?=#{1,3}\s+\S)/);
  if (parts.length > 1 || /^#{1,3}\s+\S/.test(t)) {
    return parts.map((p) => { const m = p.match(/^#{1,3}\s+(.+)\n?([\s\S]*)$/); return m ? { title: m[1].trim().slice(0, 120), text: m[2].trim() } : { title: base, text: p.trim() }; }).filter((n) => n.text || n.title);
  }
  const paras = t.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean), out = [];
  let buf = "";
  const flush = () => { if (buf) { const first = buf.split(/(?<=[.!?।])\s/)[0]; out.push({ title: clip(first.replace(/\s+/g, " "), 60), text: buf }); buf = ""; } };
  for (const p of paras) { if (buf && buf.length + p.length > maxLen) flush(); buf = buf ? buf + "\n\n" + p : p; }
  flush();
  if (out.length === 1) out[0].title = base;
  return out;
}

/** merge another state (backup file) into this one; ids that already exist are skipped, never overwritten */
export function mergeState(cur, incoming) {
  const inc = normalize(incoming), out = normalize(cur);
  const tIds = new Set(out.topics.map((t) => t.id)), nIds = new Set(out.notes.map((n) => n.id));
  let addedT = 0, addedN = 0;
  for (const t of inc.topics) if (!tIds.has(t.id)) { out.topics.push(t); tIds.add(t.id); addedT++; }
  for (const n of inc.notes) if (!nIds.has(n.id)) { out.notes.push(n); nIds.add(n.id); addedN++; }
  const bk = new Set(out.bridges.map((b) => b.a + "|" + b.b + "|" + b.rel));
  for (const b of inc.bridges) if (!bk.has(b.a + "|" + b.b + "|" + b.rel)) out.bridges.push(b);
  out.dismissed = [...new Set([...out.dismissed, ...inc.dismissed])];
  const cIds = new Set(out.cols.map((c) => c.id));
  for (const c of inc.cols) if (!cIds.has(c.id)) out.cols.push(c);
  return { state: normalize(out), addedT, addedN };
}
