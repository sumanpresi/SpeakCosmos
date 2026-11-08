// SpeakCosmos 3D — a vanilla port of the GitaViśva cosmos (react-force-graph-3d + three.js):
//  · layout is PRECOMPUTED (assets/cosmos-graph.json), every node is fixed, no simulation runs in the browser
//  · real lit spheres with depth fog; small points drawn as ONE instanced mesh; all links batched into a few LineSegments
//  · labels are lazy text sprites with distance fade; hubs are always labelled
//  · hover/selection dims everything except the neighbourhood; Focus view lays one node's connections on a sphere
//  · Find-a-path (Dijkstra over typed relations), legend-as-filter, Display options, Ctrl K search, light/dark
import ForceGraph3D from "3d-force-graph";
import * as THREE from "three";
import SpriteText from "three-spritetext";
import { tokens, clip as tclip, norm, slug } from "./text.js";
import { parseNote } from "./wikilinks.js";
import { suggest, contradictions, ideaDraft } from "./relations.js";
import { SCHEMA, emptyState, normalize, buildGraph, textToNotes, mergeState, sameState, newId, COLORS } from "./userdata.js";
import { createStore } from "./store.js";

const RING_R = 380;
const KIND = {
  hub: { label: "Constellations", shape: "hub", hint: "The groups every skill, lesson, phrase and philosophy idea belongs to" },
  skill: { label: "Skills", shape: "sphere", hint: "The speaking and grammar skills you practise" },
  lesson: { label: "Lessons", shape: "sphere", hint: "Grammar and writing lessons, with rules and examples" },
  scen: { label: "Scenarios", shape: "ring", hint: "Real situations: meetings, interviews, calls" },
  fw: { label: "Frameworks", shape: "sphere", hint: "Structures for organising what you say" },
  word: { label: "Word pairs", shape: "sphere", hint: "Confusable words, each with a sentence" },
  day: { label: "Course days", shape: "sphere", hint: "The 100-day course: one point per day, in order" },
  drill: { label: "Drills", shape: "sphere", hint: "Fluency and word-retrieval exercises" },
  point: { label: "Phrases & examples", shape: "point", hint: "Rules, example sentences, phrases and steps" },
  thinker: { label: "Thinkers", shape: "sphere", hint: "Philosophers, teachers and founders" },
  school: { label: "Schools", shape: "ring", hint: "Schools, traditions and movements" },
  idea: { label: "Ideas", shape: "sphere", hint: "Concepts, texts and arguments" },
  era: { label: "Eras & events", shape: "ring", hint: "Periods and turning points in time" },
  note: { label: "My writing", shape: "halo", hint: "Your own notes, stored only in this browser" },
  spark: { label: "New ideas", shape: "ring", hint: "Ideas you created by joining two topics" },
};
const ORDER = ["hub", "skill", "lesson", "scen", "fw", "word", "drill", "day", "thinker", "school", "idea", "era", "point", "note", "spark"];
const HEX = {
  light: { hub: "#9a5a0c", skill: "#2a78d6", lesson: "#0e8fa3", scen: "#6250d6", fw: "#eb6834", word: "#1baf7a", day: "#c2417a", thinker: "#b3541e", school: "#7a3fb0", idea: "#1f7a5a", era: "#b08400", drill: "#4a453e", point: "#8f887d", note: "#1b1a17", spark: "#d4380d", core: "#1b1a17" },
  dark: { hub: "#e3a44b", skill: "#3987e5", lesson: "#2bb3c8", scen: "#9085e9", fw: "#d95926", word: "#199e70", day: "#e0709f", thinker: "#f08a4b", school: "#b794f0", idea: "#4fd1a1", era: "#f0c34b", drill: "#ddd6ca", point: "#9c9488", note: "#f4f1eb", spark: "#ff7a45", core: "#f4f1eb" },
};
const REL = {
  BELONGS_TO: { verb: "belongs to", inverse: "includes", group: "structure", cost: 3 },
  PART_OF: { verb: "is part of", inverse: "contains", group: "structure", cost: 1 },
  ON_CORE: { verb: "orbits", inverse: "anchors", group: "structure", cost: 6 },
  NEXT_LESSON: { verb: "leads to", inverse: "follows", group: "structure", cost: 2 },
  NEXT_SKILL: { verb: "leads to", inverse: "follows", group: "structure", cost: 2 },
  USES: { verb: "uses", inverse: "is used in", group: "curated", cost: 1.2 },
  COVERS: { verb: "builds", inverse: "is built by", group: "curated", cost: 1.2 },
  PRACTISES: { verb: "is practised in", inverse: "practises", group: "curated", cost: 1.2 },
  TEACHES: { verb: "teaches", inverse: "is taught on", group: "curated", cost: 1.3 },
  PREPARES: { verb: "prepares you for", inverse: "is prepared by", group: "curated", cost: 1.3 },
  NEXT_DAY: { verb: "leads to", inverse: "follows", group: "structure", cost: 1.5 },
  TRAINS: { verb: "trains", inverse: "is trained by", group: "curated", cost: 1.5 },
  FOUNDED: { verb: "founded", inverse: "was founded by", group: "curated", cost: 1.1 },
  CRITIQUES: { verb: "challenges", inverse: "is challenged by", group: "curated", cost: 1.2 },
  INFLUENCES: { verb: "influenced", inverse: "was influenced by", group: "curated", cost: 1.2 },
  HOLDS: { verb: "holds", inverse: "is held by", group: "curated", cost: 1.1 },
  REJECTS: { verb: "rejects", inverse: "is rejected by", group: "curated", cost: 1.3 },
  EXPLAINS: { verb: "explains", inverse: "is explained by", group: "curated", cost: 1.1 },
  CONTRASTS: { verb: "contrasts with", inverse: "contrasts with", group: "curated", cost: 1.4 },
  NEXT_ERA: { verb: "leads to", inverse: "follows", group: "structure", cost: 1.5 },
  MENTIONS_WORD: { verb: "mentions", inverse: "appears in", group: "lexical", cost: 2 },
  LINKS_TO: { verb: "links to", inverse: "is linked from", group: "curated", cost: 1 },
  RELATED: { verb: "is related to", inverse: "is related to", group: "curated", cost: 1.2 },
  SPARKS: { verb: "builds on", inverse: "inspired", group: "curated", cost: 1.1 },
  SIMILAR: { verb: "is similar to", inverse: "is similar to", group: "curated", cost: 1.1 },
  CONTRADICTS: { verb: "contradicts", inverse: "contradicts", group: "curated", cost: 1.3 },
  SUPPORTS: { verb: "supports", inverse: "is supported by", group: "curated", cost: 1.1 },
  SHARES_TAG: { verb: "shares a tag with", inverse: "shares a tag with", group: "lexical", cost: 2 },
};
const GROUP_RANK = { curated: 0, lexical: 1, structure: 2 };
const EDGE_GROUPS = { structure: "Structure", curated: "Meaning", lexical: "Word mentions" };
const PRESETS = [
  { label: "Opening a talk → Handling hard questions", from: "sc:open-talk", to: "t:handle-question" },
  { label: "Point → Reason → Next → a job interview", from: "t:point-reason-next", to: "sc:interview" },
  { label: "Verb tenses → Talking about plans", from: "ls:verb-tenses", to: "t:tense-future" },
  { label: "Nervous → Confident disagreement", from: "t:manage-nerves", to: "sc:disagree" },
  { label: "affect / effect → a status update", from: "cw:0", to: "t:present-update" },
  { label: "Philosophy: Vedas → Ambedkar's Navayana", from: "pn:vedas", to: "pn:navayana" },
  { label: "Philosophy: Buddha → Shankara", from: "pn:buddha", to: "pn:shankara" },
  { label: "Philosophy: Iron and surplus → Right livelihood", from: "pn:urban", to: "pn:rightlivelihood" },
  { label: "Philosophy: Four sights vs the Rohini dispute", from: "pn:foursights", to: "pn:rohini" },
  { label: "Philosophy: Karma → Atonement (merit and sin transfer)", from: "pn:karma", to: "pn:atonement" },
  { label: "Philosophy: King Milinda → Momentariness", from: "pn:milinda", to: "pn:kshanika" },
  { label: "Philosophy: Right view → Nirvana", from: "pn:ef_view", to: "pn:nirvana" },
  { label: "Philosophy: Bentham → Ajita (pleasure as the goal)", from: "pn:bentham", to: "pn:ajita" },
  { label: "Philosophy: Empedocles → Atomism", from: "pn:empedocles", to: "pn:atomism" },
  { label: "Philosophy: Sarvadarshana → Hard problem", from: "pn:src_sarvadarshana", to: "pn:hardproblem" },
  { label: "Philosophy: Detachment by degree → Roasted seed", from: "pn:continuum", to: "pn:roastedseed" },
  { label: "Philosophy: Open-Varna argument → Buddhism", from: "pn:openvarna", to: "pn:buddhism" },
];

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hashUnit = (id, salt = 0) => { let h = 2166136261 ^ salt; for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619); return ((h >>> 0) % 10000) / 10000; };

// ── Focus view: a fair selection of one node's connections, laid out on a flattened sphere ─────────────────────
function pickEgo(cands, max) {
  const best = new Map();
  for (const c of cands) { const cur = best.get(c.id); if (!cur || GROUP_RANK[c.group] < GROUP_RANK[cur.group]) best.set(c.id, c); }
  const byKind = new Map();
  for (const c of best.values()) { const k = `${c.type}|${c.outgoing ? 1 : 0}`; byKind.set(k, [...(byKind.get(k) ?? []), c]); }
  const kinds = [...byKind.values()]
    .map((l) => l.sort((a, b) => b.degree - a.degree || a.id.localeCompare(b.id)))
    .sort((a, b) => GROUP_RANK[a[0].group] - GROUP_RANK[b[0].group] || b.length - a.length || a[0].type.localeCompare(b[0].type));
  const taken = kinds.map(() => 0);
  let left = Math.min(max, best.size);
  while (left > 0) {
    let moved = false;
    for (let i = 0; i < kinds.length && left > 0; i++) if (taken[i] < kinds[i].length) { taken[i]++; left--; moved = true; }
    if (!moved) break;
  }
  return {
    members: kinds.flatMap((l, i) => l.slice(0, taken[i])), total: best.size,
    kinds: kinds.map((l, i) => ({ type: l[0].type, outgoing: l[0].outgoing, total: l.length, shown: taken[i] })),
  };
}
function egoPositions(c, n, scale = 1) {
  const radius = (70 + 7 * Math.sqrt(n)) * scale, golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: n }, (_, i) => {
    const y = n === 1 ? 0 : 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(Math.max(0, 1 - y * y)), t = i * golden;
    return [c[0] + radius * r * Math.cos(t), c[1] + radius * y * 0.72, c[2] + radius * r * Math.sin(t)];
  });
}

// ── shared GPU resources ───────────────────────────────────────────────────────────────────────────────────────
const geoCache = new Map();
const sphere = (detail, low) => {
  const key = detail + (low ? "-l" : "");
  let g = geoCache.get(key);
  if (!g) { const [w, h] = { lo: low ? [8, 6] : [10, 8], mid: low ? [14, 10] : [22, 16], hi: low ? [24, 16] : [36, 26] }[detail]; g = new THREE.SphereGeometry(1, w, h); geoCache.set(key, g); }
  return g;
};
const ringTex = new Map();
function ring(weight) {
  let t = ringTex.get(weight);
  if (t) return t;
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d"), lw = Math.max(2, 128 * weight);
  g.strokeStyle = "#fff"; g.lineWidth = lw; g.beginPath(); g.arc(128, 128, 128 - lw / 2 - 2, 0, Math.PI * 2); g.stroke();
  t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; ringTex.set(weight, t);
  return t;
}
function makeLabel(spec, font, scale = 1) {
  const l = new SpriteText(spec.text, spec.size * scale, spec.color);
  l.fontFace = font; l.fontWeight = spec.weight; l.strokeWidth = 0.9; l.strokeColor = spec.stroke;
  l.material.depthWrite = false; l.material.opacity = 0; l.visible = false; l.position.y = spec.y;
  return l;
}

export function mount(root, opts) {
  const { data, cb } = opts;
  const store = (k, v) => { try { v === undefined ? localStorage.getItem(k) : localStorage.setItem(k, v); } catch (e) {} };
  const read = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };

  // ── model ──────────────────────────────────────────────────────────────────────────────────────────────────
  const raw = new Map(data.nodes.map((n) => [n.id, n]));
  const edges = data.edges.map(([s, t, rel], i) => ({ key: "e" + i, s, t, rel, group: REL[rel].group }));
  const baseEdgeCount = edges.length, baseNodeCount = data.nodes.length;
  const adj = new Map();
  for (const n of data.nodes) adj.set(n.id, []);
  for (const e of edges) { adj.get(e.s)?.push({ other: e.t, e, out: true }); adj.get(e.t)?.push({ other: e.s, e, out: false }); }
  const deg = (id) => adj.get(id)?.length ?? 0;
  let maxDeg = 1;
  for (const n of data.nodes) if (n.k !== "point" && n.k !== "hub" && n.k !== "core") maxDeg = Math.max(maxDeg, deg(n.id));
  const hubOf = (n) => (n.k === "hub" ? n : raw.get(n.g));
  const kindOf = (n) => (n.k === "core" ? "drill" : n.k);

  // personal notes: anything the person keeps in this browser sits just above the centre
  const notes = [];
  try { (JSON.parse(read("sc_notes") || "[]") || []).forEach((n, i) => { if (n?.title) { const id = "n:" + i, a = hashUnit(id) * Math.PI * 2; notes.push({ id, k: "note", l: String(n.title).slice(0, 60), d: String(n.text || "").slice(0, 240), p: [Math.cos(a) * 150, 150 + hashUnit(id, 5) * 30, Math.sin(a) * 150] }); } }); } catch (e) {}
  notes.forEach((n) => { raw.set(n.id, n); adj.set(n.id, []); });

  const nodeCache = new Map();
  const gnode = (n) => {
    let g = nodeCache.get(n.id);
    if (!g) { g = { id: n.id, k: n.k, raw: n }; nodeCache.set(n.id, g); }
    const P = posOf(n); g.fx = g.x = P[0]; g.fy = g.y = P[1]; g.fz = g.z = P[2];
    return g;
  };
  const allNodes = [...data.nodes, ...notes];
  const baseAll = allNodes.length;

  // ── topics: every node belongs to one topic. Built in: English + Philosophy. The person adds more. ─────────
  const BUILTIN = [{ id: "eng", label: "English", builtin: true }, { id: "phil", label: "Philosophy", builtin: true }];
  const topicOf = (n) => n.t || (n.phil ? "phil" : "eng");
  const userStore = createStore();
  let U = emptyState(), userIds = new Set(), unresolved = new Map(), userReady = false, userRev = 0;
  const baseIds = new Set(data.nodes.map((n) => n.id));
  const baseByLabel = new Map();
  for (const n of data.nodes) if (n.k !== "point" && n.k !== "hub" && n.k !== "core") { const k = norm(n.l); if (k && !baseByLabel.has(k)) baseByLabel.set(k, n.id); }
  let baseExtent = 400;
  for (const n of data.nodes) baseExtent = Math.max(baseExtent, Math.hypot(n.p[0], n.p[1], n.p[2]));
  const labelIndex = new Map();
  const scopeLabel = () => (!S.scope ? "All topics" : colOf(S.scope) ? colOf(S.scope).label + " · combined" : (topicInfo(S.scope)?.label ?? "Topic") + " map");
  const scopeCount = () => { let c = 0; for (const n of allNodes) if (inScope(n)) c++; return c; };
  const topicsAll = () => [...BUILTIN, ...U.topics.map((t) => ({ id: "u:" + t.id, label: t.label, color: t.color, user: true, key: t.id, auto: t.auto }))];
  const topicInfo = (id) => topicsAll().find((t) => t.id === id);
  const colOf = (sc) => (sc && String(sc).startsWith("c:") ? U.cols.find((c) => "c:" + c.id === sc) : null);
  let SS = null; // topics shown in the current tab (null = everything)
  const inScope = (n) => !SS || SS.has(topicOf(n));
  const islandOf = new Map();
  const posOf = (n) => { if (!S.scope) return n.p; const q = n.q || n.p, o = islandOf.get(topicOf(n)); return o ? [q[0] + o[0], q[1] + o[1], q[2] + o[2]] : q; };
  function scopeChanged() {
    const c = colOf(S.scope);
    SS = S.scope == null ? null : c ? new Set(c.topics) : new Set([S.scope]);
    islandOf.clear();
    if (c) {
      const rad = new Map(c.topics.map((t) => [t, 40]));
      for (const n of allNodes) { const t = topicOf(n); if (rad.has(t) && n.k !== "core") { const q = n.q || n.p; rad.set(t, Math.max(rad.get(t), Math.hypot(q[0], q[1], q[2]))); } }
      const m = c.topics.length, rs = c.topics.map((t) => rad.get(t));
      let R = 0; if (m > 1) for (let i = 0; i < m; i++) R = Math.max(R, (rs[i] + rs[(i + 1) % m] + 170) / (2 * Math.sin(Math.PI / m)));
      c.topics.forEach((t, i) => { const th = (i / m) * Math.PI * 2; islandOf.set(t, [Math.round(R * Math.cos(th)), 0, Math.round(R * Math.sin(th))]); });
    }
    if (circle) circle.visible = !S.scope || S.scope === "eng" || S.scope === "phil";
  }
  const resolveTitle = (t) => labelIndex.get(norm(t)) ?? null;
  const tm = (name, f) => { const t0 = performance.now(), r = f(); (window.__scTimings ??= []).push([name, Math.round(performance.now() - t0)]); return r; };
  function syncUser({ persist = false } = {}) {
    for (const id of userIds) { raw.delete(id); adj.delete(id); nodeCache.delete(id); visuals.delete(id); }
    userIds = new Set(); allNodes.length = baseAll; edges.length = baseEdgeCount;
    for (const [id, l] of adj) if (l.length && l.some((a) => a.e.user)) adj.set(id, l.filter((a) => !a.e.user));
    const g = tm("buildGraph", () => buildGraph(U, baseIds, baseByLabel, { radius: Math.round(baseExtent * 1.7) }));
    for (const n of g.nodes) { if (n.k !== "hub") n.sub = (U.topics.find((t) => "u:" + t.id === n.t)?.label ?? "") + (n.k === "spark" ? " · new idea" : ""); raw.set(n.id, n); adj.set(n.id, []); allNodes.push(n); userIds.add(n.id); }
    g.edges.forEach(([s, t, rel], i) => {
      if (!raw.has(s) || !raw.has(t)) return;
      const e = { key: "u" + i, s, t, rel, group: REL[rel].group, user: true };
      edges.push(e); adj.get(s).push({ other: t, e, out: true }); adj.get(t).push({ other: s, e, out: false });
    });
    unresolved = g.unresolved;
    labelIndex.clear();
    for (const [k, id] of baseByLabel) labelIndex.set(k, id);
    for (const n of U.notes) labelIndex.set(norm(n.title), "u:" + n.id);
    if (g.placed.length) { const m = new Map(g.placed.map((x) => [x.id, x.p])); for (const nt of U.notes) if (m.has(nt.id)) nt.p = m.get(nt.id); persist = true; }
    userRev++;
    if (persist) saveUser();
  }
  let saveTimer = 0, saveState = "idle";
  // ── Google Drive: the same data, kept in the person's own private app folder and merged safely ──────────────
  const CL = { state: cb.cloud ? "off" : "none", at: 0, err: "", timer: 0, busy: false };
  const cloudOn = () => !!(cb.cloud && cb.cloud.connected());
  function scheduleCloud() { if (!cb.cloud || !cloudOn()) return; clearTimeout(CL.timer); CL.timer = setTimeout(() => cloudSync(false, true), 4000); }
  async function cloudSync(interactive = false, uploadOnly = false) {
    if (!cb.cloud || CL.busy) return;
    CL.busy = true;
    try {
      if (!cloudOn()) { if (!interactive) { CL.state = "off"; return; } await cb.cloud.connect(); }
      CL.state = "syncing"; chromeSave(); if (modalIsLibrary()) libraryModal();
      let changed = false;
      if (!uploadOnly) {
        const remote = (await cb.cloud.load())?.state;
        if (remote) { const m = mergeState(U, remote); if (!sameState(m.state, U)) { U = m.state; changed = true; } }
      }
      if (changed) { CL.busy = false; afterDataChange(); CL.busy = true; }
      await cb.cloud.save(U);
      CL.state = "synced"; CL.at = Date.now(); CL.err = "";
      if (interactive) toast(changed ? "Google Drive synced. Changes from Drive were merged in." : "Google Drive is up to date.");
    } catch (e) { CL.state = "error"; CL.err = String(e?.message || e).slice(0, 140); if (interactive) toast(CL.err); }
    finally { CL.busy = false; chromeSave(); if (modalIsLibrary()) libraryModal(); }
  }
  const modalIsLibrary = () => !modal.hidden && !!modal.querySelector(".lib-st");
  function saveUser() {
    scheduleCloud();
    saveState = "saving"; chromeSave();
    userStore.save(U).then(() => { saveState = userStore.kind === "memory" ? "unsafe" : "saved"; chromeSave(); }).catch(() => { saveState = "unsafe"; chromeSave(); });
  }

  // ── state ──────────────────────────────────────────────────────────────────────────────────────────────────
  const prefersDark = read("sc_theme") ? read("sc_theme") === "dark" : false;
  const S = {
    dark: prefersDark, colorBy: "kind", hidden: new Set(), edgeGroups: { structure: true, curated: true, lexical: true },
    mode: "focus", depth: 1, selected: null, hover: null, highlight: null, autoRotate: !matchMedia("(prefers-reduced-motion: reduce)").matches,
    tool: null, legend: root.clientWidth >= 720, query: "", lens: "explore", scope: null, bridgeOnly: false, pr: 2,
  };
  const coarse = matchMedia("(pointer: coarse)").matches;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const low = coarse || (navigator.hardwareConcurrency ?? 8) <= 4 || (navigator.deviceMemory ?? 8) <= 4;
  const mobile = () => root.clientWidth < 720;
  const font = "Inter, system-ui, sans-serif";

  // ── DOM ────────────────────────────────────────────────────────────────────────────────────────────────────
  root.className = "gc";
  root.innerHTML = `
  <header class="gc-top">
    <button class="gc-brand" data-nav="cosmos" aria-label="SpeakCosmos"><span class="gc-mark"></span><b>SpeakCosmos</b><small lang="bn">বাংলা → English</small></button>
    <nav class="gc-nav" aria-label="Views">
      <button class="on" data-nav="cosmos" data-tab="explore"><i class="ic ic-explore"></i><span>Explore</span></button>
      <button data-lens="lineage" data-tab="lineage"><i class="ic ic-lineage"></i><span>Lineage</span></button>
      <button data-lens="course" data-tab="course"><i class="ic ic-course"></i><span>Course</span></button>
      <button data-nav="paths"><i class="ic ic-paths"></i><span>Paths</span></button>
      <button data-nav="practice"><i class="ic ic-speak"></i><span>Speak</span></button>
      <button data-nav="review"><i class="ic ic-review"></i><span>Review</span></button>
    </nav>
    <div class="gc-right">
      <div class="gc-search"><i class="ic ic-search"></i><input id="gcQ" placeholder="Search" autocomplete="off" spellcheck="false" aria-label="Search the cosmos"><kbd>Ctrl K</kbd><div class="gc-results" id="gcRes" hidden></div></div>
      <button class="gc-btn" id="gcAskBtn" aria-pressed="false" title="Ask a question. Answers come from the graph and light up on the canvas."><i class="ic ic-ask"></i><span>Ask</span></button>
      <span class="gc-sep"></span>
      <button class="gc-icon" id="gcInstall" data-action="install-app" title="Install SpeakCosmos on this device" aria-label="Install app" hidden><i class="ic ic-download"></i></button>
      <button class="gc-icon" data-nav="progress" title="My progress" aria-label="My progress"><i class="ic ic-progress"></i></button>
      <button class="gc-icon" id="gcTheme" title="Light / dark" aria-label="Toggle theme"><i class="ic ic-theme"></i></button>
      <button class="gc-icon" id="gcHelp" title="Guide: what everything does" aria-label="Open the guide"><i class="ic ic-help"></i></button>
      <button class="gc-ai" id="gcAI" data-nav="settings" title="AI settings"><span class="gc-gear"><i class="ic ic-gear"></i><b class="gcd"></b></span><span class="lbl">AI not connected</span></button>
    </div>
  </header>
  <div class="gc-topics" id="gcTopics" role="tablist" aria-label="Topics"></div>
  <div class="gc-stage" id="gcStage"></div>
  <div class="gc-empty" id="gcEmpty" hidden></div>
  <section class="gc-lin" id="gcLin" hidden aria-label="Lineage"></section>
  <section class="gc-lin gc-crs" id="gcCourse" hidden aria-label="100-day course"></section>
  <div class="gc-tools">
    <button id="gcDisplay" aria-expanded="false"><i class="ic ic-sliders"></i>Display</button>
    <button id="gcPath" aria-expanded="false"><i class="ic ic-route"></i>Find a path</button>
  </div>
  <div class="gc-pop" id="gcPop" hidden></div>
  <section class="gc-legend card" id="gcLegend"></section>
  <div class="gc-zoom card"><button data-cam="in" title="Zoom in">+</button><button data-cam="out" title="Zoom out">−</button><button data-cam="fit" title="Fit all"><i class="ic ic-fit"></i></button><button id="gcSpin" data-cam="spin" title="Rotate slowly"><i class="ic ic-rotate"></i></button></div>
  <div class="gc-focusbar card" id="gcFocus" hidden></div>
  <aside class="gc-inspect card" id="gcInspect" hidden></aside>
  <aside class="gc-ask card" id="gcAsk" hidden aria-label="Ask the cosmos"></aside>
  <div class="gc-modal" id="gcHelpM" hidden></div>
  <div class="gc-modal" id="gcModal" hidden></div>
  <div class="gc-toast" id="gcToast" hidden role="status"></div>
  <div class="gc-hint" id="gcHint">Drag to rotate · scroll to zoom · click a point to focus on its connections</div>`;
  const $ = (s) => root.querySelector(s);
  const stage = $("#gcStage");
  const applyTheme = () => { root.dataset.theme = S.dark ? "dark" : "light"; };
  applyTheme();

  // ── graph ──────────────────────────────────────────────────────────────────────────────────────────────────
  const live = { emphasis: null, selected: null, hover: null, dark: S.dark, dirty: true, ego: null, material: null };
  const visuals = new Map();
  const materials = new Map();
  const marks = { sel: null, pointLabels: new Map() };
  let cur = { nodes: [], links: [], ego: null };
  let awakeUntil = 0, sleeping = false, raf = 0, destroyed = false, startLoop = null;
  const labelScale = () => (mobile() ? 1.6 : 1.3) * (cur.ego && cur.ego.count > 14 ? 0.62 : 1);

  const fg = new ForceGraph3D(stage, { controlType: "orbit", rendererConfig: { antialias: !low, powerPreference: "default", alpha: false } })
    .showNavInfo(false).enableNodeDrag(false).warmupTicks(0).cooldownTicks(0).linkOpacity(1).linkResolution(4)
    .linkDirectionalParticleWidth(1.6).linkDirectionalParticleSpeed(0.005);
  fg.d3Force("link", null); fg.d3Force("charge", null); fg.d3Force("center", null);

  const baseHex = () => HEX[S.dark ? "dark" : "light"];
  const colorOf = (g) => {
    const n = g.raw;
    if (n.user && g.k !== "spark") { const h = hubOf(n); if (h?.c) return h.c; }
    if (S.colorBy === "group" && g.k !== "core") { const h = hubOf(n); if (h?.c) return h.c; }
    return baseHex()[g.k] ?? baseHex().core;
  };
  const radiusOf = (g) => {
    const lift = 0.82 + 0.5 * Math.sqrt(Math.min(1, deg(g.id) / maxDeg));
    switch (g.k) { case "hub": return g.raw.user ? 7.5 : 6.4; case "core": return 7.5; case "point": return 1.5; case "scen": return 4.2 * lift; case "word": return 2.9 * lift; case "note": return g.raw.user ? 4.6 : 3.6; case "spark": return 5.8; case "skill": return 4.4 * lift; default: return 3.7 * lift; }
  };
  const material = (color, state) => {
    const key = `${color}|${state}|${S.dark}`;
    let m = materials.get(key);
    if (!m) {
      const c = new THREE.Color(color), dk = S.dark;
      m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.05, emissive: c.clone().multiplyScalar(dk ? (state === "focus" ? 0.34 : 0.14) : state === "focus" ? 0.12 : 0.02), transparent: state === "dim", opacity: state === "dim" ? (dk ? 0.12 : 0.16) : 1, depthWrite: state !== "dim" });
      materials.set(key, m);
    }
    return m;
  };
  live.material = material;

  const nodeObject = (g) => {
    const k = g.k, color = colorOf(g), r = radiusOf(g), group = new THREE.Group();
    const shape = k === "core" ? "sphere" : KIND[k].shape;
    let mesh = null;
    if (shape !== "ring") {
      mesh = new THREE.Mesh(sphere(k === "point" ? "lo" : k === "hub" || k === "core" || r > 5 ? "hi" : "mid", low), material(color, "base"));
      mesh.scale.setScalar(r);
      if (k === "point") mesh.visible = false; // drawn by the instanced batch; stays only so hover and clicks still hit it
      group.add(mesh);
    }
    let ringSprite = null;
    if (shape === "hub" || shape === "ring" || shape === "halo") {
      ringSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: ring(shape === "ring" ? 0.2 : 0.07), color, transparent: true, depthWrite: false, opacity: shape === "ring" ? 0.95 : 0.55 }));
      const s = shape === "ring" ? r * 2.4 : r * 3.6;
      ringSprite.scale.set(s, s, 1); group.add(ringSprite);
    }
    let label = null, labelSpec = null;
    if (k !== "point") {
      const hubby = k === "hub";
      labelSpec = {
        text: g.raw.l, size: hubby ? 8.2 : k === "core" ? 6.4 : 5, weight: hubby ? "600" : "500",
        color: S.dark ? (hubby ? "#edeae4" : "#cfc9bf") : hubby ? "#1b1a17" : "#3a3732", stroke: S.dark ? "rgba(13,12,11,0.85)" : "rgba(245,244,241,0.9)", y: r + (hubby ? 10.5 : 6.5),
      };
      if (hubby || k === "core") { label = makeLabel(labelSpec, font); label.material.opacity = 0.92; label.visible = true; group.add(label); }
    }
    visuals.set(g.id, { group, mesh, ringSprite, label, labelSpec, k, color, r, labelOpacity: label?.material.opacity ?? 0 });
    live.dirty = true;
    return group;
  };

  // tooltip
  const tipFor = (g) => {
    if (coarse) return "";
    const n = g.raw, k = g.k === "core" ? "drill" : g.k;
    const head = `<div class="t"><span class="glyph" data-shape="${KIND[k].shape}" style="color:${baseHex()[g.k]}"></span>${esc(n.sub || (g.k === "core" ? "The centre" : KIND[k].label.replace(/s$/, "").replace("Constellation", "Constellation")))}</div>`;
    const body = n.k === "point" ? `<div class="s">${esc(n.d)}</div>` : `<div class="h">${esc(n.l)}</div><div class="s">${esc((n.d || "").slice(0, 150))}${(n.d || "").length > 150 ? "…" : ""}</div>`;
    return `<div class="gc-tip">${head}${body}<div class="gchint">Click to focus</div></div>`;
  };

  // ── data for the current view (filters, focus) ────────────────────────────────────────────────────────────
  const visibleKinds = () => new Set(ORDER.filter((k) => !S.hidden.has(k)));
  function linksAmong(ids) {
    const out = [];
    for (const e of edges) if (S.edgeGroups[e.group] && ids.has(e.s) && ids.has(e.t)) out.push(e);
    return out;
  }
  const budget = () => (low ? 650 : 1500);
  function compute() {
    const vk = visibleKinds();
    const nodes = [];
    for (const n of allNodes) { if (n.k === "core" ? (!SS || SS.has("eng")) : vk.has(n.k) && inScope(n)) nodes.push(gnode(n)); }
    const shown = new Set(nodes.map((n) => n.id));
    const egoId = S.mode === "focus" && S.selected && !S.highlight && shown.has(S.selected) ? S.selected : null;
    if (egoId) {
      const center = nodeCache.get(egoId);
      const cands = [];
      for (const a of adj.get(egoId) ?? []) { const t = a.e.rel; if (shown.has(a.other) && S.edgeGroups[a.e.group]) cands.push({ id: a.other, type: t, group: a.e.group, outgoing: a.out, degree: deg(a.other) }); }
      const pick = pickEgo(cands, mobile() ? 26 : 38);
      const c = [center.fx, center.fy, center.fz];
      const hop1 = pick.members.map((m) => nodeCache.get(m.id)).filter(Boolean);
      egoPositions(c, hop1.length).forEach((p, i) => { const n = hop1[i]; n.fx = n.x = p[0]; n.fy = n.y = p[1]; n.fz = n.z = p[2]; });
      let hop2 = [];
      if (S.depth > 1) {
        const have = new Set([egoId, ...hop1.map((n) => n.id)]);
        const score = new Map();
        for (const n of hop1) for (const a of adj.get(n.id) ?? []) if (!have.has(a.other) && shown.has(a.other) && S.edgeGroups[a.e.group] && raw.get(a.other).k !== "hub") score.set(a.other, (score.get(a.other) ?? 0) + 1);
        hop2 = [...score.entries()].sort((a, b) => b[1] - a[1] || deg(b[0]) - deg(a[0])).slice(0, mobile() ? 14 : 24).map(([id]) => nodeCache.get(id)).filter(Boolean);
        egoPositions(c, hop2.length, 1.85).forEach((p, i) => { const n = hop2[i]; n.fx = n.x = p[0]; n.fy = n.y = p[1]; n.fz = n.z = p[2]; });
      }
      const egoNodes = [center, ...hop1, ...hop2];
      return { nodes: egoNodes, links: linksAmong(new Set(egoNodes.map((n) => n.id))), ego: { id: egoId, pick, hop1: new Set(hop1.map((n) => n.id)), count: hop1.length + hop2.length } };
    }
    // overview: when a view holds more than the budget, draw the best-connected points and say so. Focus, paths and
    // answers always get every point they need, so nothing is lost, only deferred.
    let list = nodes, trimmed = null;
    if (colOf(S.scope) && S.bridgeOnly) {
      const keep = new Set();
      for (const e of edges) { if (!S.edgeGroups[e.group] || e.rel === "BELONGS_TO" || !shown.has(e.s) || !shown.has(e.t)) continue; if (topicOf(raw.get(e.s)) !== topicOf(raw.get(e.t))) { keep.add(e.s); keep.add(e.t); } }
      for (const n of nodes) if (n.k === "hub" || n.k === "spark" || n.k === "core") keep.add(n.id);
      list = nodes.filter((n) => keep.has(n.id));
    }
    const heavy = list.filter((n) => n.k !== "point" && n.k !== "hub" && n.k !== "core"), pts = list.filter((n) => n.k === "point");
    if (heavy.length > budget() || pts.length > 6000) {
      const must = new Set([S.selected, ...(S.highlight?.nodes ?? [])]);
      if (S.selected) for (const a of adj.get(S.selected) ?? []) must.add(a.other);
      // fair share: every topic keeps its best-connected points, so a big topic can never crowd out a small one
      const lists = new Map();
      for (const n of heavy.slice().sort((x, y) => deg(y.id) - deg(x.id))) { const t = topicOf(n); (lists.get(t) ?? lists.set(t, []).get(t)).push(n); }
      const rank = [], qs = [...lists.values()]; let at = 0;
      while (rank.length < budget() && qs.some((l) => at < l.length)) { for (const l of qs) if (at < l.length && rank.length < budget()) rank.push(l[at]); at++; }
      const keepH = new Set(rank.map((n) => n.id)), keepP = new Set(pts.slice(0, 6000).map((n) => n.id));
      for (const id of must) { if (id && shown.has(id)) { keepH.add(id); keepP.add(id); } }
      list = list.filter((n) => (n.k === "point" ? keepP.has(n.id) : n.k === "hub" || n.k === "core" || keepH.has(n.id)));
      trimmed = { shown: list.length, total: nodes.length };
    }
    const ids = new Set(list.map((n) => n.id));
    let extent = 0; for (const n of list) extent = Math.max(extent, Math.hypot(n.fx, n.fy, n.fz));
    return { nodes: list, links: linksAmong(ids), ego: null, trimmed, extent };
  }

  // emphasis: path highlight > hover neighbourhood > selection neighbourhood
  function emphasis() {
    if (S.highlight) return { nodes: S.highlight.nodes, edges: S.highlight.edges, kind: "highlight", path: true };
    const f = S.hover ?? S.selected;
    if (f && adj.has(f)) {
      const nodes = new Set([f]), es = new Set();
      for (const a of adj.get(f)) { nodes.add(a.other); es.add(a.e.key); }
      return { nodes, edges: es, kind: "focus", path: false };
    }
    return null;
  }

  // ── reconcile node visuals (materials, selection ring, point labels) ──────────────────────────────────────
  function reconcile() {
    const e = live.emphasis, sel = live.selected, hov = live.hover, dk = live.dark;
    for (const [id, v] of visuals) {
      const on = !e || e.nodes.has(id), focus = !!e && on && (id === sel || id === hov || e.kind === "highlight");
      if (v.mesh) v.mesh.material = material(v.color, on ? (focus ? "focus" : "base") : "dim");
      if (v.ringSprite) v.ringSprite.material.opacity = on ? (v.k === "scen" ? 0.95 : 0.55) : 0.08;
    }
    let s = marks.sel;
    const v = sel ? visuals.get(sel) : undefined;
    if (!s) s = marks.sel = new THREE.Sprite(new THREE.SpriteMaterial({ map: ring(0.13), transparent: true, depthWrite: false, depthTest: false }));
    if (s.parent !== v?.group) s.parent?.remove(s);
    if (v) { s.material.color.set(dk ? "#e3a44b" : "#9a5a0c"); s.material.opacity = 1; const sz = Math.max(16, v.r * 4.2); s.scale.set(sz, sz, 1); s.renderOrder = 10; if (s.parent !== v.group) v.group.add(s); }
    // points carry no permanent labels; focused ones (and every point in the focus view) get their text
    const want = new Set([sel, hov].filter((x) => x && raw.get(x)?.k === "point"));
    if (live.ego) for (const id of live.ego) if (raw.get(id)?.k === "point") want.add(id);
    if (e?.kind === "highlight" && e.nodes.size <= 40) for (const id of e.nodes) if (raw.get(id)?.k === "point") want.add(id);
    for (const [id, l] of marks.pointLabels) { if (want.has(id) && l.parent === visuals.get(id)?.group) continue; l.parent?.remove(l); marks.pointLabels.delete(id); }
    for (const id of want) {
      const pv = visuals.get(id);
      if (!pv || marks.pointLabels.has(id)) continue;
      const txt = raw.get(id).l.replace(/…$/, "");
      const l = new SpriteText(txt.length > 30 ? txt.slice(0, 29) + "…" : txt, 4.6 * (live.ego ? labelScale() : 1), dk ? "#edeae4" : "#1b1a17");
      l.fontFace = font; l.fontWeight = "600"; l.strokeWidth = 0.9; l.strokeColor = dk ? "rgba(13,12,11,0.85)" : "rgba(245,244,241,0.9)";
      l.material.depthWrite = false; l.material.depthTest = false; l.renderOrder = 11; l.position.y = pv.r + 5;
      pv.group.add(l); marks.pointLabels.set(id, l);
    }
  }

  // ── batched links: one LineSegments per visual class ──────────────────────────────────────────────────────
  let linkGroup = null, pointMeshes = null, egoTags = null, circle = null;
  const ink = () => (S.dark ? "237,234,228" : "27,26,23");
  const accent = () => (S.dark ? "227,164,75" : "154,90,12");
  function rebuildLinks() {
    const scene = fg.scene();
    if (linkGroup) { scene.remove(linkGroup); linkGroup.children.forEach((o) => { o.geometry.dispose(); o.material.dispose(); }); linkGroup = null; }
    if (!cur.links.length) return;
    const e = live.emphasis, dk = S.dark;
    const positions = new Float32Array(cur.links.length * 6), classes = new Map();
    const cls = (l) => (e ? (e.edges.has(l.key) ? (e.kind === "highlight" ? "hi" : "focus") : "dim") : l.rel === "CONTRADICTS" ? "contra" : l.group);
    cur.links.forEach((l, i) => {
      const a = nodeCache.get(l.s), b = nodeCache.get(l.t);
      if (!a || !b) return;
      positions.set([a.fx, a.fy, a.fz, b.fx, b.fy, b.fz], i * 6);
      const c = cls(l), list = classes.get(c) ?? []; list.push(i * 2, i * 2 + 1); classes.set(c, list);
    });
    const style = { structure: [ink(), dk ? 0.034 : 0.038], lexical: [ink(), dk ? 0.05 : 0.055], curated: [ink(), dk ? 0.1 : 0.1], contra: ["214,69,40", dk ? 0.7 : 0.6], hi: [accent(), 0.85], focus: [ink(), dk ? 0.38 : 0.46], dim: [ink(), dk ? 0.014 : 0.02] };
    const attr = new THREE.BufferAttribute(positions, 3);
    linkGroup = new THREE.Group();
    for (const [c, idx] of classes) {
      const geo = new THREE.BufferGeometry(); geo.setAttribute("position", attr); geo.setIndex(idx);
      const [rgb, opacity] = style[c];
      const line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: new THREE.Color(`rgb(${rgb})`), transparent: true, opacity, depthWrite: false }));
      line.frustumCulled = false; line.raycast = () => {}; line.renderOrder = c === "hi" || c === "focus" ? 2 : 0;
      linkGroup.add(line);
    }
    scene.add(linkGroup);
  }
  function rebuildPoints() {
    const scene = fg.scene();
    if (pointMeshes) { scene.remove(pointMeshes); pointMeshes.children.forEach((o) => { o.dispose?.(); o.material.dispose(); }); pointMeshes = null; }
    const pts = cur.nodes.filter((n) => n.k === "point");
    if (!pts.length) return;
    const e = live.emphasis, dk = S.dark;
    const solid = [], dim = [];
    for (const n of pts) (!e || e.nodes.has(n.id) ? solid : dim).push(n);
    const glow = new THREE.Color(baseHex().point).multiplyScalar(dk ? 0.14 : 0.02);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
    const batch = (list, dimmed) => {
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.05, emissive: dimmed ? 0x000000 : glow, transparent: dimmed, opacity: dimmed ? (dk ? 0.12 : 0.16) : 1, depthWrite: !dimmed });
      const im = new THREE.InstancedMesh(sphere("lo", low), mat, list.length);
      list.forEach((n, i) => {
        im.setMatrixAt(i, m4.compose(p.set(n.fx, n.fy, n.fz), q, s.setScalar(radiusOf(n))));
        c.set(colorOf(n));
        if (!dimmed && e && (n.id === live.selected || n.id === live.hover || e.kind === "highlight")) c.multiplyScalar(dk ? 1.35 : 0.85);
        im.setColorAt(i, c);
      });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.frustumCulled = false; im.raycast = () => {};
      return im;
    };
    pointMeshes = new THREE.Group();
    if (solid.length) pointMeshes.add(batch(solid, false));
    if (dim.length) pointMeshes.add(batch(dim, true));
    scene.add(pointMeshes);
  }
  function rebuildEgoTags() {
    const scene = fg.scene();
    if (egoTags) { scene.remove(egoTags); egoTags.children.forEach((o) => { o.material.map?.dispose(); o.material.dispose(); }); egoTags = null; }
    const ego = cur.ego;
    if (!ego) return;
    const center = nodeCache.get(ego.id);
    egoTags = new THREE.Group();
    const done = new Set();
    for (const m of ego.pick.members) {
      const k = `${m.type}|${m.outgoing}`, n = nodeCache.get(m.id);
      if (done.has(k) || !n) continue;
      done.add(k);
      const meta = REL[m.type], kind = ego.pick.kinds.find((x) => x.type === m.type && x.outgoing === m.outgoing);
      const text = `${m.outgoing ? meta.verb : meta.inverse}${kind && kind.total > kind.shown ? ` · ${kind.total}` : ""}`;
      const tag = new SpriteText(text, mobile() ? 4.8 : 4.2, S.dark ? "#e8c58a" : "#7a4708");
      tag.fontFace = font; tag.fontWeight = "500";
      tag.backgroundColor = S.dark ? "rgba(21,20,19,0.9)" : "rgba(255,255,255,0.92)";
      tag.borderColor = S.dark ? "rgba(227,164,75,0.45)" : "rgba(154,90,12,0.4)";
      tag.borderWidth = 0.3; tag.borderRadius = 1.4; tag.padding = [1.6, 0.9];
      tag.material.depthTest = false; tag.material.depthWrite = false; tag.renderOrder = 12;
      const t = 0.55;
      tag.position.set(center.fx + (n.fx - center.fx) * t, center.fy + (n.fy - center.fy) * t, center.fz + (n.fz - center.fz) * t);
      egoTags.add(tag);
    }
    scene.add(egoTags);
  }

  // ── scene: lights, fog, reference ring ────────────────────────────────────────────────────────────────────
  function buildScene() {
    const dk = S.dark, scene = fg.scene();
    fg.backgroundColor(dk ? "#0d0c0b" : "#f5f4f1");
    scene.fog = new THREE.Fog(new THREE.Color(dk ? "#0d0c0b" : "#f5f4f1"), 620, 2100);
    const key = new THREE.DirectionalLight(0xfff6ea, dk ? 2.2 : 2.0); key.position.set(320, 720, 460);
    const rim = new THREE.DirectionalLight(dk ? 0x9fb4ff : 0xffffff, dk ? 0.55 : 0.4); rim.position.set(-520, -160, -620);
    fg.lights([new THREE.HemisphereLight(dk ? 0xf2ece2 : 0xffffff, dk ? 0x221e19 : 0xd9d4cc, dk ? 1.35 : 2.2), key, rim]);
    if (circle) { scene.remove(circle); circle.geometry.dispose(); circle.material.dispose(); }
    const pts = [];
    for (let i = 0; i <= 256; i++) { const th = (i / 256) * Math.PI * 2; pts.push(new THREE.Vector3(RING_R * Math.cos(th), 26 * Math.sin(th * 3), RING_R * Math.sin(th))); }
    circle = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: dk ? 0xe3a44b : 0x9a5a0c, transparent: true, opacity: dk ? 0.16 : 0.2 }));
    scene.add(circle); circle.visible = !S.scope || S.scope === "eng" || S.scope === "phil";
    const r = fg.renderer();
    S.pr = Math.min(S.pr, low ? 1.5 : 2, window.devicePixelRatio || 1); r.setPixelRatio(S.pr); r.toneMapping = THREE.NoToneMapping;
  }

  // ── apply: recompute data and rebuild what depends on it ──────────────────────────────────────────────────
  let egoKey = null;
  function apply({ frame = false } = {}) {
    live.emphasis = emphasis(); live.selected = S.selected; live.hover = S.hover; live.dark = S.dark;
    cur = tm("compute", compute);
    live.ego = cur.ego ? new Set(cur.nodes.map((n) => n.id)) : null;
    const pathLinks = live.emphasis?.path ? cur.links.filter((l) => live.emphasis.edges.has(l.key)).map((l) => ({ key: l.key, source: nodeCache.get(l.s), target: nodeCache.get(l.t) })) : [];
    tm("graphData", () => fg.graphData({ nodes: cur.nodes, links: pathLinks }));
    tm("links+points", () => { rebuildLinks(); rebuildPoints(); rebuildEgoTags(); });
    live.dirty = true; wake(900);
    const k = cur.ego ? cur.ego.id + ":" + S.depth : null;
    if (frame || k !== egoKey) { egoKey = k; if (cur.ego) setTimeout(fitEgo, 90); }
    renderFocusBar(); renderLegend();
  }
  fg.nodeThreeObject(nodeObject).nodeLabel(tipFor)
    .linkColor(() => `rgba(${accent()},0.85)`).linkWidth(() => (live.emphasis?.path ? 0.9 : 0)).linkDirectionalParticles(() => (live.emphasis?.path && !reduceMotion ? 2 : 0))
    .linkDirectionalParticleColor(() => (S.dark ? "#f0c27a" : "#9a5a0c"));

  // ── render loop: reconcile, fog, label level-of-detail, sleep when idle ───────────────────────────────────
  function wake(ms) {
    awakeUntil = Math.max(awakeUntil, performance.now() + ms);
    if (sleeping) { sleeping = false; fg.resumeAnimation(); startLoop?.(); }
  }
  {
    let running = false;
    const p = new THREE.Vector3();
    let lastT = 0, ema = 16, slow = 0;
    const tick = () => {
      if (destroyed) return;
      let fading = false;
      { // adaptive resolution: a slow device quietly renders fewer pixels instead of stuttering
        const now = performance.now(), dt = now - lastT; lastT = now;
        if (dt > 0 && dt < 250) { ema = ema * 0.9 + dt * 0.1; slow = ema > 38 ? slow + 1 : Math.max(0, slow - 1); }
        if (slow > 40 && S.pr > 1) { S.pr = Math.max(1, S.pr - 0.25); slow = 0; ema = 20; fg.renderer().setPixelRatio(S.pr); fg.width(stage.clientWidth).height(stage.clientHeight); }
      }
      if (live.dirty) { live.dirty = false; reconcile(); }
      const cam = fg.camera(), fog = fg.scene().fog, target = fg.controls().target;
      if (fog) { const d = target ? cam.position.distanceTo(target) : 900; fog.near = d * 0.7; fog.far = d + 1350 + (cur.extent || 0); }
      const e = live.emphasis, sel = live.selected, hov = live.hover, forceAll = !!live.ego || (!!e && e.nodes.size <= 60);
      for (const [id, v] of visuals) {
        if (!v.label && !v.labelSpec) continue;
        const on = !e || e.nodes.has(id);
        let t;
        if (id === sel || id === hov) t = 1;
        else if (!on) t = v.k === "hub" ? 0.18 : 0;
        else if (v.k === "hub" || v.k === "core") t = 0.92;
        else if (e && forceAll) t = 0.9;
        else { v.group.getWorldPosition(p); t = 0.9 * (1 - smooth(320, 600, p.distanceTo(cam.position))); }
        if (v.labelOpacity === t) continue;
        if (!v.label) { if (t <= 0.02 || !v.labelSpec) continue; v.label = makeLabel(v.labelSpec, font, live.ego?.has(id) ? labelScale() : 1); v.group.add(v.label); }
        fading = true;
        v.labelOpacity += (t - v.labelOpacity) * 0.2;
        if (Math.abs(v.labelOpacity - t) < 0.004) v.labelOpacity = t;
        v.label.material.opacity = v.labelOpacity; v.label.visible = v.labelOpacity > 0.02;
      }
      if (!fg.controls().autoRotate && !fading && !live.emphasis?.path && performance.now() > awakeUntil) { running = false; sleeping = true; lastT = 0; fg.pauseAnimation(); return; }
      raf = requestAnimationFrame(tick);
    };
    startLoop = () => { if (running) return; running = true; raf = requestAnimationFrame(tick); };
  }

  // ── camera ────────────────────────────────────────────────────────────────────────────────────────────────
  const home = () => { const w = stage.clientWidth || 800, h = stage.clientHeight || 600, a = w / h, k = Math.max(1, 1 / a) * Math.min(20, Math.max(0.3, (cur.extent || 440) / 440)), b = a < 0.9 ? { x: 0, y: 700, z: 640 } : { x: 0, y: 520, z: 820 }; return { x: b.x * k, y: b.y * k, z: b.z * k }; };
  const controlsInit = () => {
    const c = fg.controls();
    fg.cameraPosition(home(), { x: 0, y: 0, z: 0 }, 0);
    c.enableDamping = true; c.dampingFactor = 0.08; c.minDistance = 40; c.maxDistance = 9000; c.screenSpacePanning = true; c.rotateSpeed = 0.7;
    c.addEventListener("start", () => { if (S.autoRotate) setSpin(false); });
    c.addEventListener("change", () => wake(700));
    c.autoRotateSpeed = 0.32; c.autoRotate = S.autoRotate;
  };
  function setSpin(on) { S.autoRotate = on; fg.controls().autoRotate = on && !reduceMotion; $("#gcSpin").classList.toggle("on", on); wake(500); }
  function fitEgo() {
    if (!cur.ego) return;
    const center = nodeCache.get(cur.ego.id), cam = fg.camera();
    if (!center) return;
    const c = new THREE.Vector3(center.fx, center.fy, center.fz);
    let r = 92;
    for (const n of cur.nodes) r = Math.max(r, Math.hypot(n.fx - c.x, n.fy - c.y, n.fz - c.z));
    r += mobile() ? 14 : 18;
    const w = stage.clientWidth, h = stage.clientHeight, sheet = mobile() ? Math.min(300, h * 0.42) : 0;
    const visH = Math.max(140, h - (mobile() ? sheet + 56 : 110)), visW = Math.max(160, w - (mobile() ? 16 : 420));
    const tan = Math.tan((cam.fov * Math.PI) / 360);
    const d = Math.max(r / (tan * (visH / h)), r / (tan * cam.aspect * (visW / w)));
    const target = fg.controls().target ?? new THREE.Vector3();
    const dir = cam.position.clone().sub(target);
    // coming from the whole-graph view (far away), look from slightly above and to the side so no neighbour hides behind the centre
    if (dir.lengthSq() < 1 || dir.length() > 700) dir.set(0.35, 0.55, 1);
    dir.normalize();
    const pos = c.clone().add(dir.multiplyScalar(d));
    wake(1800);
    fg.cameraPosition({ x: pos.x, y: pos.y, z: pos.z }, { x: c.x, y: c.y, z: c.z }, reduceMotion ? 0 : 800);
  }
  function flyTo(id) {
    const n = nodeCache.get(id);
    if (!n) return;
    if (cur.ego?.id === id) return;
    setSpin(false); wake(reduceMotion ? 400 : 1600);
    const { fx: x, fy: y, fz: z } = n, dist = n.k === "hub" ? 230 : n.k === "point" ? 170 : 200, len = Math.hypot(x, y, z);
    const pos = len < 1 ? { x: 0, y: dist * 0.45, z: dist } : { x: x * (1 + dist / len), y: y * (1 + dist / len) + dist * 0.4, z: z * (1 + dist / len) };
    fg.cameraPosition(pos, { x, y, z }, reduceMotion ? 0 : 1100);
  }
  function camCmd(kind) {
    const ms = reduceMotion ? 0 : 600; wake(ms + 500);
    const target = fg.controls().target ?? new THREE.Vector3(), cam = fg.camera().position;
    if (kind === "fit") { if (cur.ego) fitEgo(); else fg.cameraPosition(home(), { x: 0, y: 0, z: 0 }, ms); }
    else if (kind === "spin") { setSpin(!S.autoRotate); if (S.autoRotate && !cur.ego) fg.cameraPosition(home(), { x: 0, y: 0, z: 0 }, ms); }
    else { const f = kind === "in" ? 0.7 : 1.4, nx = target.clone().add(cam.clone().sub(target).multiplyScalar(f)); fg.cameraPosition({ x: nx.x, y: nx.y, z: nx.z }, { x: target.x, y: target.y, z: target.z }, ms * 0.6); }
  }

  // ── selection ─────────────────────────────────────────────────────────────────────────────────────────────
  function select(id, { fly = true } = {}) {
    if (id && !raw.has(id)) id = null;
    S.selected = id; S.hover = null;
    if (id && S.highlight && !S.highlight.nodes.has(id)) S.highlight = null;
    try { history.replaceState(null, "", `${location.pathname}?view=cosmos${S.scope ? "&scope=" + encodeURIComponent(S.scope) : ""}${id ? "&node=" + encodeURIComponent(id) : ""}`); } catch (e) {}
    apply();
    renderInspector();
    if (id && fly && !(S.mode === "focus" && !S.highlight)) flyTo(id);
    if (id) setSpin(false);
    $("#gcHint").hidden = !!id;
    applyViewOffset();
  }
  function applyViewOffset() {
    const cam = fg.camera(), w = stage.clientWidth, h = stage.clientHeight;
    if (!cam.setViewOffset) return;
    if (askSt.open && mobile()) cam.setViewOffset(w, h, 0, h * 0.29 - 10, w, h); else if (S.selected && mobile()) cam.setViewOffset(w, h, 0, Math.min(300, h * 0.42) / 2 - 28, w, h); else cam.clearViewOffset();
    cam.updateProjectionMatrix(); wake(600);
  }
  let hoverTimer = 0;
  fg.onNodeHover((n) => {
    if (coarse) return;
    stage.style.cursor = n ? "pointer" : "";
    clearTimeout(hoverTimer);
    const id = n ? n.id : null;
    hoverTimer = setTimeout(() => { if (S.hover === id || destroyed) return; S.hover = id; live.hover = id; live.emphasis = emphasis(); rebuildLinks(); rebuildPoints(); live.dirty = true; wake(500); }, id ? 70 : 140);
  });
  fg.onNodeClick((n) => select(n.id));
  fg.onBackgroundClick(() => { if (S.selected) select(null); });

  // ── inspector ─────────────────────────────────────────────────────────────────────────────────────────────
  const dot = (k, extra = "") => { const sh = KIND[k === "core" ? "drill" : k].shape; return `<span class="dot" data-shape="${sh}" style="--c:${baseHex()[k] ?? baseHex().core}" ${extra}></span>`; };
  const act = (a, id, label, cls = "") => `<button class="gcbtn ${cls}" data-action="${a}" data-id="${esc(id)}">${label}</button>`;
  const say = (text, lang = "en-IN", label = "Listen") => `<button class="gcbtn ghost" data-action="speak" data-text="${esc(text)}" data-lang="${lang}">♫ ${label}</button>`;
  // ── AI guide for philosophy nodes: every answer is grounded in the node and its neighbours ──────────────
  const aiOut = new Map();
  // turn [1], [2][7] or [1, 7] in an AI answer into buttons that jump to the note they cite
  const cite = (text, notes) => esc(text).replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, (m, list) => list.split(/\s*,\s*/).map((k) => { const n = notes[+k - 1]; return n ? `<button class="cite" data-go="${esc(n.id)}" title="${esc(n.l)}">[${k}]</button>` : `[${k}]`; }).join(""));
  const AI_TASKS = {
    simple: ["Explain simply", (n) => `Explain “${n.l}” in simple English in 3 short sentences, as for a curious beginner.`],
    bn: ["বাংলায়", (n) => `Explain “${n.l}” clearly in 3 short sentences. Put the complete Bengali explanation in the bn field.`],
    why: ["Why it matters", (n) => `Why does “${n.l}” matter in the story of Indian philosophy? Say what led to it and what it led to.`],
    quiz: ["Quiz me", (n) => `Write 3 short multiple-choice questions on “${n.l}” (options A to C), then the correct answers on a last line.`],
    compare: ["Compare", (n, m) => `Compare “${n.l}” with “${m?.l}”: one similarity and one difference, in 3 short sentences.`],
  };
  function ctxFor(n) {
    const out = [{ id: n.id, l: n.l, k: KIND[n.k]?.label || n.k, d: n.d }];
    for (const a of (adj.get(n.id) ?? [])) {
      const m = raw.get(a.other); if (!m || m.k === "hub" || m.k === "core") continue;
      out.push({ id: m.id, l: m.l, k: KIND[m.k]?.label || m.k, d: `${a.out ? n.l + " " + REL[a.e.rel].verb + " this" : "This " + REL[a.e.rel].verb + " " + n.l}. ${m.d}` });
      if (out.length >= 11) break;
    }
    return out;
  }
  const compareWith = (n) => {
    const nb = (adj.get(n.id) ?? []).filter((a) => { const m = raw.get(a.other); return m && topicOf(m) === topicOf(n) && m.k !== "hub"; });
    const pick = nb.find((a) => ["CONTRASTS", "CRITIQUES"].includes(a.e.rel)) || nb.sort((x, y) => deg(y.other) - deg(x.other))[0];
    return pick ? raw.get(pick.other) : null;
  };
  function localAi(n, task, m) {
    const rel = [];
    for (const a of (adj.get(n.id) ?? [])) { const o = raw.get(a.other); if (o && o.k !== "hub" && o.k !== "core") rel.push(`${a.out ? n.l + " " + REL[a.e.rel].verb : n.l + " " + REL[a.e.rel].inverse} ${o.l}.`); }
    if (task === "quiz") { const q = (adj.get(n.id) ?? []).map((a) => raw.get(a.other)).filter((o) => o && topicOf(o) === topicOf(n) && o.k !== "hub"); return `<p>Without AI, test yourself from the graph: name two things connected to “${esc(n.l)}”, then open each to check. Start with ${q.slice(0, 2).map((o) => `<b>${esc(o.l)}</b>`).join(" and ") || "its constellation"}.</p>`; }
    if (task === "compare") return m ? `<p><b>${esc(n.l)}</b>: ${esc(n.d)}</p><p><b>${esc(m.l)}</b>: ${esc(m.d)}</p>` : `<p>${esc(n.d)}</p>`;
    return `<p>${esc(n.d)}</p>${task === "why" && rel.length ? `<ul>${rel.slice(0, 5).map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}`;
  }
  const aiBlock = (n) => {
    const st = (cb.aiState && cb.aiState()) || { ok: false }, cur = aiOut.get(n.id);
    return `<div class="gcai" data-ai-node="${esc(n.id)}"><span class="lab">AI guide ${st.ok ? "" : `<em>· not connected, showing graph notes</em>`}</span>
      <div class="aibtns">${Object.entries(AI_TASKS).map(([t, v]) => `<button class="gcbtn" data-ai="${t}" ${t === "bn" ? 'lang="bn"' : ""}>${v[0]}</button>`).join("")}</div>
      <form class="aiform" data-ai-form="${esc(n.id)}"><input name="q" maxlength="300" placeholder="Ask about ${esc(n.l.slice(0, 28))}…" autocomplete="off" aria-label="Ask about this"><button class="gcbtn primary" type="submit">Ask</button></form>
      <div class="aiout" aria-live="polite">${cur || ""}</div>${st.ok ? "" : `<button class="lnk" data-nav="settings">Connect AI for fuller answers</button>`}</div>`;
  };
  async function runAi(n, task, custom) {
    const out = root.querySelector(`.gcai[data-ai-node="${CSS.escape(n.id)}"] .aiout`); if (!out) return;
    const m = task === "compare" ? compareWith(n) : null;
    const q = custom || AI_TASKS[task][1](n, m);
    const st = (cb.aiState && cb.aiState()) || { ok: false };
    out.innerHTML = `<p class="aithink">Thinking…</p>`;
    let html, why = "";
    if (st.ok && cb.ask) {
      try {
        const ctx = ctxFor(n); if (m) ctx.push({ id: m.id, l: m.l, k: KIND[m.k]?.label || m.k, d: m.d });
        const notes = ctx.map((c) => raw.get(c.id));
        const r = await cb.ask(q, ctx, { topic: "philosophy" });
        if (r && r.answer) {
          const body = task === "bn" && r.bn ? "" : String(r.answer).split(/\n+/).map((p) => `<p>${cite(p, notes)}</p>`).join("");
          html = `${body}${r.bn ? `<p class="aibn" lang="bn">${cite(r.bn, notes)}</p>` : ""}<span class="aitag">AI · from the graph notes</span>`;
        }
      } catch (e) { why = String(e?.message || "").slice(0, 120); }
    }
    if (!html) html = localAi(n, task, m) + (st.ok ? `<span class="aitag">AI did not respond${why ? ": " + esc(why) : ""}. Showing graph notes.</span>` : "");
    aiOut.set(n.id, html);
    const live = root.querySelector(`.gcai[data-ai-node="${CSS.escape(n.id)}"] .aiout`); if (live) live.innerHTML = html;
  }
  root.addEventListener("click", (e) => {
    const b = e.target.closest(".gcai [data-ai]"); if (!b) return;
    const n = raw.get(b.closest(".gcai").dataset.aiNode); if (n) runAi(n, b.dataset.ai);
  });
  root.addEventListener("submit", (e) => {
    const f = e.target.closest(".aiform"); if (!f) return; e.preventDefault();
    const n = raw.get(f.dataset.aiForm), v = f.q.value.trim(); if (n && v) { f.q.value = ""; runAi(n, "simple", v); }
  });
  function inspectorBody(n) {
    const out = [];
    const hub = hubOf(n);
    if (n.k === "skill") {
      out.push(`<div class="chips"><span class="chip" style="--c:${hub?.c}">${esc(hub?.icon || "")} ${esc(hub?.l)}</span><span class="chip">${esc(n.lvl)}</span></div>`);
      out.push(`<h2>${esc(n.l)}</h2><div class="bn-row"><span class="gcbn" lang="bn">${esc(n.bn)}</span>${say(n.bn, "bn-IN", "বাংলা")}</div><p class="gclead">${esc(n.d)}</p>`);
      out.push(`<div class="gcdemo"><span class="lab">Natural expression</span><p>${esc(n.ex)}</p></div>`);
      out.push(`<div class="gcdemo"><span class="lab">Common mistake → Better way</span><p class="bad">${esc(n.bad)}</p><p class="good">${esc(n.good)}</p></div>`);
      if (n.tips?.length) out.push(`<div class="gcdemo"><span class="lab">Remember the pattern</span><ul>${n.tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>`);
      const dn = cb.isDone?.(n.tid), bm = cb.isBookmarked?.(n.tid);
      out.push(`<div class="actions">${act("practice-topic", n.tid, "◉ Practise speaking", "primary")}${say(n.ex)}${act("complete", n.tid, dn ? "✓ Learned" : "Mark learned", dn ? "done" : "")}${act("bookmark", n.tid, bm ? "★ Saved" : "☆ Save", bm ? "done" : "")}</div>`);
    } else if (n.k === "point") {
      out.push(`<div class="chips"><span class="chip">${esc(n.sub)}</span>${hub ? `<span class="chip" style="--c:${hub.c}">${esc(hub.l)}</span>` : ""}</div>`);
      if (n.bad) out.push(`<div class="gcdemo"><span class="lab">Common mistake → Better way</span><p class="bad">${esc(n.bad)}</p><p class="good">${esc(n.good)}</p></div>`);
      else out.push(`<p class="gclead big">${esc(n.d)}</p>`);
      out.push(`<div class="actions">${say(n.good || n.d)}</div>`);
    } else if (n.k === "word") {
      const [a, b] = [n.a, n.b], m = n.d.split(/\s{2}/);
      out.push(`<h2>${esc(n.l)}</h2>${m.map((x) => `<div class="gcdemo"><p>${esc(x)}</p>${say(x.replace(/^[^:]*:\s*/, ""))}</div>`).join("")}`);
    } else if (n.k === "fw") {
      out.push(`<h2>${esc(n.l)}</h2><p class="gclead">${esc(n.d)}</p>${n.sample ? `<div class="gcdemo"><span class="lab">Example</span><p>${esc(n.sample)}</p>${say(n.sample)}</div>` : ""}`);
    } else if (n.k === "scen") {
      out.push(`<h2>${esc(n.l)}</h2><p class="gclead">${esc(n.d)}</p>${n.tips?.length ? `<div class="gcdemo"><span class="lab">Tips</span><ul>${n.tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>` : ""}<div class="actions"><button class="gcbtn primary" data-nav="practice">◉ Open Voice Studio</button></div>`);
    } else if (n.k === "hub") {
      out.push(`<h2>${esc(n.l)}</h2>${n.bn ? `<div class="bn-row"><span class="gcbn" lang="bn">${esc(n.bn)}</span></div>` : ""}<p class="gclead">${esc(n.d)}</p>`);
    } else if (n.k === "day") {
      const dn = days.has(n.n);
      out.push(`<div class="chips"><span class="chip">Day ${n.n} of 100</span><span class="chip">${esc(PHASES[n.ph].name)}</span></div><h2>${esc(n.l.replace(/^Day \d+ · /, ""))}</h2><p class="gclead">${esc(PHASES[n.ph].tip)}</p>
        <div class="actions"><a class="gcbtn primary" href="${esc(n.notes)}" target="_blank" rel="noopener noreferrer">Read the notes ↗</a><a class="gcbtn" href="${esc(n.quiz)}" target="_blank" rel="noopener noreferrer">Take the quiz ↗</a>${n.mega ? `<a class="gcbtn" href="${esc(n.mega)}" target="_blank" rel="noopener noreferrer">Milestone quiz ↗</a>` : ""}</div>
        <div class="actions"><button class="gcbtn ${dn ? "done" : ""}" data-cdone="${n.n}">${dn ? "✓ Day done" : "Mark day done"}</button><button class="gcbtn ghost" data-cday="${n.n}">Open in Course</button></div>
        <p class="gcsrc">Notes and quizzes are from the Learn-English-In-100-days course on GitHub.</p>`);
    } else if (["thinker", "school", "idea", "era"].includes(n.k) && n.phil) {
      out.push(`<div class="chips">${n.sub ? `<span class="chip">${esc(n.sub)}</span>` : ""}${hub ? `<span class="chip" style="--c:${hub.c}">${esc(hub.l)}</span>` : ""}</div><h2>${esc(n.l)}</h2><p class="gclead">${esc(n.d)}</p><p class="gcsrc">From Dr. Vikas Divyakirti's philosophy lecture series, paraphrased. Follow the links below to see who influenced or challenged whom.</p><div class="actions"><button class="gcbtn" data-lens-go="lineage" data-id="${esc(n.id)}">See lineage</button></div>${aiBlock(n)}`);
    } else if (n.user && (n.k === "note" || n.k === "spark")) {
      const miss = unresolved.get(n.id) ?? [];
      out.push(`<div class="chips"><span class="chip" style="--c:${hub?.c}">${esc(hub?.l ?? "")}</span>${n.k === "spark" ? '<span class="chip">New idea</span>' : ""}</div><h2>${esc(n.l)}</h2><div class="notebody">${noteHtml(n.text || "")}</div>${miss.length ? `<div class="mnote"><b>Not written yet</b> ${miss.slice(0, 8).map((t) => `<button class="cb" data-act="create-note" data-title="${esc(t)}" data-topic="${esc(n.t.slice(2))}">+ ${esc(clip(t, 26))}</button>`).join("")}</div>` : ""}<div class="actions"><button class="gcbtn primary" data-act="edit-note" data-id="${esc(n.id)}">Edit</button></div>`);
    } else if (n.k === "note") {
      out.push(`<h2>${esc(n.l)}</h2><p class="gclead">${esc(n.d)}</p>`);
    } else {
      out.push(`<h2>${esc(n.l)}</h2><p class="gclead">${esc(n.d)}</p>`);
    }
    out.push(platformActions(n));
    // connections, grouped by relation
    const groups = new Map();
    for (const a of adj.get(n.id) ?? []) { if (raw.get(a.other)?.k === "core") continue; const key = `${a.e.rel}|${a.out ? 1 : 0}`; groups.set(key, [...(groups.get(key) ?? []), a.other]); }
    const rows = [...groups.entries()].sort((x, y) => GROUP_RANK[REL[x[0].split("|")[0]].group] - GROUP_RANK[REL[y[0].split("|")[0]].group] || y[1].length - x[1].length);
    if (rows.length) {
      out.push(`<div class="conn"><span class="lab">Connected to</span>${rows.map(([key, ids]) => {
        const [rel, o] = key.split("|"), meta = REL[rel];
        const sorted = ids.sort((a, b) => deg(b) - deg(a));
        return `<div class="crow"><em>${meta[o === "1" ? "verb" : "inverse"]} · ${ids.length}</em><div class="cl">${sorted.slice(0, 7).map((id) => `<button class="cb" data-go="${esc(id)}">${dot(raw.get(id).k)}${esc(raw.get(id).l.length > 34 ? raw.get(id).l.slice(0, 33) + "…" : raw.get(id).l)}</button>`).join("")}${ids.length > 7 ? `<span class="more">+${ids.length - 7}</span>` : ""}</div></div>`;
      }).join("")}</div>`);
    }
    return out.join("");
  }
  function renderInspector() {
    const el = $("#gcInspect"), n = S.selected ? raw.get(S.selected) : null;
    if (!n) { el.hidden = true; root.classList.remove("has-ins"); return; }
    const k = n.k;
    el.innerHTML = `<div class="ins-head"><span class="kind">${dot(k)}${esc(n.sub || KIND[k]?.label.replace(/s$/, "") || "")}</span><button class="x" id="gcClose" aria-label="Close">×</button></div><div class="ins-body">${inspectorBody(n)}</div>`;
    el.hidden = false; el.scrollTop = 0; root.classList.add("has-ins");
    el.querySelector("#gcClose").onclick = () => select(null);
  }

  // ── focus bar ─────────────────────────────────────────────────────────────────────────────────────────────
  function renderFocusBar() {
    const el = $("#gcFocus"); el.hidden = false; el.dataset.state = S.highlight ? "hl" : S.selected ? "sel" : "none";
    const seg = (on) => `<div class="seg"><button data-mode="focus" class="${on === "focus" ? "on" : ""}">Focus</button><button data-mode="whole" class="${on === "whole" ? "on" : ""}">Whole graph</button></div>`;
    if (S.highlight) {
      const n = S.highlight.nodes.size, isAsk = !!S.highlight.ask;
      el.innerHTML = `<span class="gcbar-lab"><b>${isAsk ? "Answer" : "Path"}</b><span class="count">${n} ${isAsk ? "points lit" : "points on the route"}</span></span><button class="gcbtn" data-hl-clear>Clear</button>`;
      return;
    }
    if (!S.selected) {
      el.innerHTML = `<span class="gcbar-lab"><b>${esc(scopeLabel())}</b><span class="count">${scopeCount().toLocaleString()} points${cur.trimmed ? ` · showing the ${cur.trimmed.shown.toLocaleString()} best connected` : ""} · click one to focus</span></span>${colOf(S.scope) ? `<div class="seg"><button data-bridge="0" class="${S.bridgeOnly ? "" : "on"}">All points</button><button data-bridge="1" class="${S.bridgeOnly ? "on" : ""}">Bridges only</button></div>` : ""}${seg("whole")}`;
      return;
    }
    const n = raw.get(S.selected), ego = cur.ego, c = deg(S.selected);
    el.innerHTML = `<span class="gcbar-lab">${dot(n.k)}<b title="${esc(n.l)}">${esc(n.l)}</b><span class="count">${c} connection${c === 1 ? "" : "s"}</span></span>${seg(S.mode)}
      ${S.mode === "focus" ? `<div class="seg"><button data-depth="1" class="${S.depth === 1 ? "on" : ""}">1 hop</button><button data-depth="2" class="${S.depth === 2 ? "on" : ""}">2 hops</button></div>` : ""}
      ${ego && S.mode === "focus" ? `<span class="count">${ego.count} of ${ego.pick.total}${S.depth > 1 ? "+" : ""} shown</span>` : ""}`;
  }

  // ── legend (also the filter) ──────────────────────────────────────────────────────────────────────────────
  function renderLegend() {
    const counts = {};
    for (const n of allNodes) if (inScope(n)) counts[n.k] = (counts[n.k] ?? 0) + 1;
    const el = $("#gcLegend");
    el.innerHTML = `<button class="lg-head" id="gcLg" aria-expanded="${S.legend}">Legend<i class="ic ic-chev ${S.legend ? "" : "up"}"></i></button>${S.legend ? `<div class="lg-body">${ORDER.filter((k) => !SS || counts[k]).map((k) => `<div class="lg-row ${S.hidden.has(k) ? "off" : ""}" data-kind="${k}" title="${esc(KIND[k].hint)}">${dot(k)}<span class="nm">${KIND[k].label}</span><b>${counts[k] ?? 0}</b><i class="ic ${S.hidden.has(k) ? "ic-eyeoff" : "ic-eye"}"></i></div>`).join("")}<p>${S.colorBy === "kind" ? "Larger points are more connected." : "Colours show constellations. Shapes still mark each kind."}</p></div>` : ""}`;
  }

  // ── Display + path popovers ───────────────────────────────────────────────────────────────────────────────
  const pop = $("#gcPop");
  function showPop(tool) {
    S.tool = S.tool === tool ? null : tool;
    $("#gcDisplay").setAttribute("aria-expanded", S.tool === "display"); $("#gcPath").setAttribute("aria-expanded", S.tool === "path");
    $("#gcDisplay").classList.toggle("on", S.tool === "display"); $("#gcPath").classList.toggle("on", S.tool === "path");
    pop.hidden = !S.tool; pop.classList.toggle("wide", S.tool === "conn"); $("#gcConn")?.classList.toggle("on", S.tool === "conn");
    if (S.tool === "display") renderDisplay(); else if (S.tool === "path") renderPath(); else if (S.tool === "conn") { renderConn(); if (!CN.res && !CN.busy && CN.mode !== "link") runConn(); }
  }
  function renderDisplay() {
    pop.innerHTML = `<h3>Display</h3>
      <div class="field"><span class="lab">Colour by</span><div class="seg wide"><button data-color="kind" class="${S.colorBy === "kind" ? "on" : ""}">Kind</button><button data-color="group" class="${S.colorBy === "group" ? "on" : ""}">Constellation</button></div></div>
      <div class="field"><span class="lab">Connections</span>${Object.entries(EDGE_GROUPS).map(([g, l]) => `<label class="chk"><input type="checkbox" data-edge="${g}" ${S.edgeGroups[g] ? "checked" : ""}><span>${l}</span></label>`).join("")}</div>
      <div class="field"><span class="lab">Motion</span><label class="chk"><input type="checkbox" id="gcSpinChk" ${S.autoRotate ? "checked" : ""}><span>Rotate slowly</span></label></div>`;
  }
  const presetList = () => {
    const ok = (id) => raw.has(id) && inScope(raw.get(id)) && !S.hidden.has(raw.get(id).k);
    const out = PRESETS.filter((p) => ok(p.from) && ok(p.to));
    for (const b of U.bridges) if (ok(b.a) && ok(b.b)) out.push({ label: `Your connection: ${clip(raw.get(b.a).l, 28)} → ${clip(raw.get(b.b).l, 28)}`, from: b.a, to: b.b });
    return out;
  };
  let pathState = { from: "", to: "", result: null, msg: "" };
  function renderPath() {
    const opts = allNodes.filter((n) => n.k !== "point" && inScope(n)).slice(0, 2500).map((n) => `<option value="${esc(n.l)}">${esc(KIND[kindOf(n)].label)}</option>`).join("");
    const r = pathState.result;
    pop.innerHTML = `<h3>Find a path</h3><p class="sub">How does one idea lead to another? Pick two nodes.</p>
      <div class="field"><input list="gcNodes" id="gcFrom" placeholder="From…" value="${esc(pathState.from)}"><input list="gcNodes" id="gcTo" placeholder="To…" value="${esc(pathState.to)}"><datalist id="gcNodes">${opts}</datalist></div>
      <div class="gcrow"><button class="gcbtn primary" id="gcFind">Find path</button><button class="gcbtn ghost" id="gcClear">Clear</button></div>
      <div class="presets">${presetList().map((p, i) => `<button class="preset" data-preset="${i}">${esc(p.label)}</button>`).join("")}</div>
      ${pathState.msg ? `<p class="msg">${esc(pathState.msg)}</p>` : ""}
      ${r ? `<ol class="steps">${r.narration.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>` : ""}`;
  }
  const findNode = (label) => { const q = label.trim().toLowerCase(); return allNodes.find((n) => n.l.toLowerCase() === q) ?? allNodes.find((n) => n.k !== "point" && n.l.toLowerCase().includes(q)); };
  function dijkstra(a, b) {
    const dist = new Map([[a, 0]]), prev = new Map(), done = new Set(), heap = [[0, a]];
    const push = (x) => { heap.push(x); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    while (heap.length) {
      const [d, u] = pop();
      if (done.has(u)) continue;
      done.add(u);
      if (u === b) break;
      for (const x of adj.get(u) ?? []) { const nd = d + REL[x.e.rel].cost; if (nd < (dist.get(x.other) ?? Infinity)) { dist.set(x.other, nd); prev.set(x.other, { from: u, a: x }); push([nd, x.other]); } }
    }
    if (!prev.has(b) && a !== b) return null;
    const ids = [b], steps = [];
    for (let c = b; c !== a;) { const p = prev.get(c); steps.unshift({ from: p.from, to: c, e: p.a.e, forward: !p.a.out }); ids.unshift(p.from); c = p.from; }
    return { ids, steps };
  }
  function runPath(a, b) {
    const A = typeof a === "string" ? findNode(a) : a, B = typeof b === "string" ? findNode(b) : b;
    if (!A || !B) { pathState.msg = "Pick two nodes from the lists."; pathState.result = null; renderPath(); return; }
    const p = dijkstra(A.id, B.id);
    if (!p) { pathState.msg = "No connection found."; pathState.result = null; renderPath(); return; }
    pathState.from = A.l; pathState.to = B.l; pathState.msg = "";
    const lab = (id) => raw.get(id).l;
    pathState.result = { narration: p.steps.map((s) => `${lab(s.from)} ${s.forward ? REL[s.e.rel].verb : REL[s.e.rel].inverse} ${lab(s.to)}`) };
    S.highlight = { nodes: new Set(p.ids), edges: new Set(p.steps.map((s) => s.e.key)), order: p.ids };
    S.selected = null; S.hover = null; renderInspector();
    // make sure every node on the path is drawn even if its kind is filtered off
    for (const id of p.ids) S.hidden.delete(raw.get(id).k);
    apply();
    renderPath();
    wake(1800);
    setSpin(false);
    setTimeout(() => { const set = new Set(p.ids); fg.zoomToFit(reduceMotion ? 0 : 1200, 90, (n) => set.has(String(n.id))); }, 120);
  }
  function clearPath() { S.highlight = null; pathState = { from: "", to: "", result: null, msg: "" }; apply(); if (S.tool === "path") renderPath(); camCmd("fit"); }

  // ── search ────────────────────────────────────────────────────────────────────────────────────────────────
  const qEl = $("#gcQ"), resEl = $("#gcRes");
  let results = [];
  function search() {
    const q = qEl.value.trim().toLowerCase();
    if (!q) { resEl.hidden = true; results = []; return; }
    const score = (n) => { const l = n._l ?? (n._l = n.l.toLowerCase()); return l.startsWith(q) ? 0 : l.includes(q) ? 1 : (n._d ?? (n._d = (n.d || "").toLowerCase())).includes(q) ? 2 : 9; };
    results = allNodes.filter((n) => n.k !== "core").map((n) => [score(n), n]).filter((x) => x[0] < 9).sort((a, b) => a[0] - b[0] || (a[1].k === "point") - (b[1].k === "point")).slice(0, 8).map((x) => x[1]);
    resEl.hidden = false;
    resEl.innerHTML = results.length ? results.map((n, i) => `<button class="res" data-res="${i}">${dot(n.k)}<span class="rl">${esc(n.l)}</span><small>${esc(n.sub || KIND[n.k].label)}</small></button>`).join("") : `<div class="none">Nothing matches “${esc(qEl.value)}”.</div>`;
  }
  const pick = (n) => { qEl.value = ""; resEl.hidden = true; qEl.blur(); if (S.lens === "lineage") { linFocus(n.id); return; } if (S.lens !== "explore") setLens("explore"); ensureVisible(n.id); S.hidden.delete(n.k); S.highlight = null; select(n.id); if (S.mode === "whole") flyTo(n.id); };
  qEl.addEventListener("input", search);
  qEl.addEventListener("keydown", (e) => { if (e.key === "Enter" && results[0]) pick(results[0]); if (e.key === "Escape") { qEl.value = ""; resEl.hidden = true; qEl.blur(); } });
  qEl.addEventListener("focus", () => qEl.value && search());


  // ── chrome: AI status, install ────────────────────────────────────────────────────────────────────────────
  function chrome() {
    const st = (cb.aiState && cb.aiState()) || { ok: false };
    const ai = $("#gcAI"); ai.classList.toggle("ok", !!st.ok);
    ai.querySelector(".lbl").textContent = st.ok ? "AI available" : "AI not connected";
    ai.title = st.ok ? (st.title || "AI is connected. Open settings.") : "No AI connected. Answers come from the graph only. Open settings to connect one.";
    const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
    $("#gcInstall").hidden = !!standalone;
  }
  const onBip = () => setTimeout(chrome, 60);
  window.addEventListener("beforeinstallprompt", onBip);
  window.addEventListener("appinstalled", onBip);

  // ── Ask: questions answered from the graph, lit up on the canvas ─────────────────────────────────────────
  const STOP = new Set("the a an and or of to in on for with is are was were be been do does did how what why when which who can could should would i me my you your it its this that these those about from into at as by not no yes please tell explain say use using vs between difference".split(" "));
  const stem = (w) => w.replace(/(ing|ed|es|s)$/, (m, x, i) => (w.length - m.length >= 3 ? "" : m));
  const askSt = { msgs: [], busy: false, open: false };
  const SUGGEST = ["How do I disagree politely?", "Difference between affect and effect?", "How can I sound confident?", "How do I open a presentation?"];
  const PH_SUG = ["What are the Four Noble Truths?", "Why did the Buddha leave home?", "Why did Ambedkar rewrite the Buddha's life?", "Who were the shramana teachers?", "What is Avyakrita?", "Why does karma need a soul?", "Is Indian philosophy pessimistic?", "Why did Gandhi link the Bihar earthquake to untouchability?", "How can there be rebirth without a soul?", "What are the twelve links of dependent origination?", "Was the Buddha a pessimist?", "What did Nagasena's chariot show King Milinda?", "Who were the Charvakas and how do we know them?", "Why did Charvaka accept only perception?", "How did critics answer the Charvaka on inference?", "Why does Charvaka have only four elements?", "Why did Charvaka vanish?", "What is Nishkama Karma Yoga?", "Is it possible to act without wanting the result?", "What is Swadharma in the Gita?", "Does the Gita support the Varna system?"];
  const sugList = () => {
    if (S.scope === "phil") return PH_SUG;
    if (!S.scope || S.scope === "eng") return SUGGEST;
    const pool = allNodes.filter((n) => inScope(n) && n.user && (n.k === "note" || n.k === "spark")).sort((a, b) => deg(b.id) - deg(a.id)).slice(0, 6);
    const out = pool.slice(0, 3).map((n) => `What do my notes say about ${n.l}?`);
    if (pool.length > 1) out.push(`How are ${pool[0].l} and ${pool[1].l} connected?`);
    for (const b of U.bridges) { if (out.length >= 6) break; const A = raw.get(b.a), B = raw.get(b.b); if (A && B && inScope(A) && inScope(B)) out.push(`What new idea comes from ${A.l} and ${B.l}?`); }
    return out.length ? out : ["Summarise what is in this topic"];
  };
  function retrieve(q) {
    const toks = [...new Set(tokens(q))];
    if (!toks.length) return [];
    const scored = [];
    for (const n of allNodes) {
      if (n.k === "core" || (n.k === "note" && !n.user) || !inScope(n)) continue;
      const lab = (n.l || "").toLowerCase(), desc = ((n.text || n.d || "") + " " + (n.ex || "") + " " + (n.sample || "") + " " + (n.tips || []).join(" ")).toLowerCase();
      let sc = 0, hit = 0;
      for (const t of toks) { const a = lab.includes(t), b = desc.includes(t); if (a) sc += 4; if (b) sc += 1.4; if (a || b) hit++; }
      if (!hit) continue;
      sc *= 0.55 + 0.45 * (hit / toks.length);
      if (n.k === "point") sc *= 0.6; else if (n.k === "hub") sc *= 0.7;
      scored.push([sc, n]);
    }
    scored.sort((a, b) => b[0] - a[0]);
    const main = scored.filter((x) => x[1].k !== "point").slice(0, 5).map((x) => x[1]);
    const pts = scored.filter((x) => x[1].k === "point").slice(0, 3).map((x) => x[1]);
    return scored.length && scored[0][0] >= 2.2 ? [...main, ...pts] : [];
  }
  const askLine = (n) => {
    const bits = [esc(n.d || "")];
    if (n.ex) bits.push(`<em>Try:</em> “${esc(n.ex)}”`);
    if (n.bad && n.good) bits.push(`<em>Instead of</em> “${esc(n.bad)}” <em>say</em> “${esc(n.good)}”`);
    if (n.notes) bits.push(`<a href="${esc(n.notes)}" target="_blank" rel="noopener noreferrer">Read the notes ↗</a> · <a href="${esc(n.quiz)}" target="_blank" rel="noopener noreferrer">Take the quiz ↗</a>`);
    if (n.sample) bits.push(`<em>Example:</em> “${esc(n.sample)}”`);
    if (n.tips && n.tips[0]) bits.push(`<em>Tip:</em> ${esc(n.tips[0])}`);
    return bits.join("<br>");
  };
  // plain-language commands in Ask: "link A with B", "A contradicts B", "find contradictions between Geology and Gita notes"
  const RELV = (w) => (/contradict|conflict|oppos|disagree/i.test(w) ? "CONTRADICTS" : /similar|same as|echo|resembl|parallel/i.test(w) ? "SIMILAR" : /support|confirm/i.test(w) ? "SUPPORTS" : "RELATED");
  function resolveIdea(txt) {
    const q = norm(txt.replace(/^["“'‘]|["”'’]$/g, "").replace(/^(the|my)\s+(idea|note|concept)\s+(of\s+)?/i, ""));
    if (!q) return null;
    const hit = labelIndex.get(q); if (hit) return raw.get(hit);
    const c = allNodes.filter((n) => n.k !== "point" && n.k !== "core" && n.k !== "hub" && norm(n.l).includes(q)).sort((a, b) => a.l.length - b.l.length);
    return c[0] ?? null;
  }
  function askCommand(q) {
    const t = q.trim().replace(/[.?!]+$/, "");
    const say = (html, nodes = []) => ({ role: "a", html, nodes });
    let m = t.match(/^(?:please\s+)?(?:find|show|search(?: for)?|look for|check|list)\s+(?:me\s+)?(?:all\s+)?(similar|related|contradict\w*|conflict\w*|opposing)\s*(?:ideas?|concepts?|notes?|points?|claims?|views?|things)?\s*(?:between|among|across|in|of)?\s*(.*)$/i);
    if (m) {
      const mode = /contradict|conflict|oppos/i.test(m[1]) ? "contradict" : "similar", rest = norm(m[2] || "");
      const ids = topicsAll().filter((tp) => rest.includes(norm(tp.label))).map((tp) => tp.id);
      openConn(mode, ids, true);
      return say(`<p>Looking for <b>${mode === "contradict" ? "contradictions" : "similar ideas"}</b> ${ids.length ? "between " + ids.map((x) => esc(topicInfo(x).label)).join(", ") : "across all topics"}. The results are in the Connections panel, where you can connect, mark or spark an idea from each.</p>`);
    }
    let A, B, rel = "RELATED";
    m = t.match(/^(?:please\s+)?(?:link|connect|relate|join)\s+(.+?)\s+(?:with|to|and)\s+(.+)$/i);
    const explicit = !!m;
    if (m) { A = m[1]; B = m[2].replace(/\s+as\s+(.+)$/i, (x, y) => { rel = RELV(y); return ""; }); }
    else if (!/^(how|what|why|which|who|when|where|does|do|is|are|can|could|should|would)\b/i.test(t)) {
      m = t.match(/^(.+?)\s+(contradicts?|conflicts? with|opposes?|is similar to|is the same as|is like|echoes|supports?|relates? to|is related to|connects? to|links? to)\s+(.+)$/i);
      if (m) { A = m[1]; B = m[3]; rel = RELV(m[2]); }
    }
    if (!A || !B) return null;
    const a = resolveIdea(A), b = resolveIdea(B);
    if (!a || !b) { if (!explicit) return null; return say(`<p>I could not find ${!a ? "“" + esc(A) + "”" : "“" + esc(B) + "”"} in the graph. Use a title as it appears on the map, or use Connections → Link ideas to search for it.</p>`); }
    if (a.id === b.id) return say("<p>Those are the same idea. Pick two different ones.</p>");
    if (!addBridge(a.id, b.id, rel, "from Ask: " + t.slice(0, 80))) return say(`<p><b>${esc(a.l)}</b> and <b>${esc(b.l)}</b> are already linked that way.</p>`, [a, b]);
    afterDataChange();
    return say(`<p>Linked <b>${esc(a.l)}</b> ${esc(REL[rel].verb)} <b>${esc(b.l)}</b>. ${rel === "CONTRADICTS" ? "It shows as a red line." : "It now shows on the map."} You can remove it from Connections → Your connections.</p>`, [a, b]);
  }
  function askTopic(hits) {
    const c = {}; for (const n of hits) c[topicOf(n)] = (c[topicOf(n)] ?? 0) + 1;
    const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (top === "phil") return { topic: "philosophy" };
    if (top && top.startsWith("u:")) return { topic: "notes", name: topicInfo(top)?.label || "" };
    return {};
  }
  function lightUp(nodes) {
    if (S.lens !== "explore") setLens("explore");
    const ids = new Set(nodes.map((n) => n.id));
    // include the connectors between the matches so the answer reads as a small sub-graph
    const ek = new Set();
    for (const e of edges) if (ids.has(e.s) && ids.has(e.t)) ek.add(e.key);
    S.highlight = { nodes: ids, edges: ek, order: [...ids], ask: true };
    S.selected = null; S.hover = null; renderInspector();
    for (const n of nodes) S.hidden.delete(n.k);
    apply(); wake(1800); setSpin(false);
    setTimeout(() => fg.zoomToFit(reduceMotion ? 0 : 1000, mobile() ? 160 : 110, (g) => ids.has(String(g.id))), 120);
  }
  function renderAsk() {
    const el = $("#gcAsk");
    const st = (cb.aiState && cb.aiState()) || { ok: false };
    const body = askSt.msgs.length ? askSt.msgs.map((m) => {
      if (m.role === "u") return `<div class="am u">${esc(m.text)}</div>`;
      const src = (m.nodes || []).map((n) => `<button class="gcchip" data-go="${esc(n.id)}">${dot(n.k)}<span>${esc(n.l)}</span></button>`).join("");
      return `<div class="am a"><div class="abadge ${m.ai ? "ai" : ""}">${m.ai ? "AI · grounded in the graph" : "From the graph"}</div>${m.html}${m.bn ? `<p class="abn" lang="bn">${m.bnHtml ? m.bn : esc(m.bn)}</p>` : ""}${src ? `<div class="asrc"><small>Sources</small>${src}</div>` : ""}</div>`;
    }).join("") : `<div class="aempty"><p>${S.scope === "phil" ? "Ask about Indian philosophy: schools, thinkers, ideas and history from the lectures. Answers come from the philosophy graph" : !S.scope || S.scope === "eng" ? "Ask anything about spoken English. Answers come from the skills, lessons, scenarios and word pairs in this graph" : `Ask about ${esc(scopeLabel())}. Answers come only from the notes in this view`}, and the points they use light up on the canvas.</p><div class="asug">${sugList().map((q, i) => `<button class="gcchip" data-sug="${i}">${esc(q)}</button>`).join("")}</div></div>`;
    el.innerHTML = `<div class="ah"><b><i class="ic ic-ask"></i>Ask the cosmos</b><span class="aflex"></span>${askSt.msgs.length ? `<button class="gc-icon" id="gcAskClear" title="Clear conversation" aria-label="Clear conversation"><i class="ic ic-trash"></i></button>` : ""}<button class="gc-icon" id="gcAskX" title="Close" aria-label="Close">✕</button></div>
      <div class="abody" id="gcAskBody">${body}${askSt.busy ? `<div class="am a"><div class="athink"><i></i><i></i><i></i></div></div>` : ""}</div>
      ${st.ok ? "" : `<div class="anote">AI is not connected, so answers are drawn from the graph only. <button class="lnk" data-nav="settings">Connect AI</button></div>`}
      <form class="af" id="gcAskForm"><input id="gcAskIn" placeholder="Ask a question…" autocomplete="off" maxlength="300" aria-label="Your question"><button class="gcbtn primary" type="submit" ${askSt.busy ? "disabled" : ""}>Ask</button></form>`;
    const b = $("#gcAskBody"); if (b) b.scrollTop = b.scrollHeight;
  }
  function toggleAsk(on) {
    askSt.open = on ?? !askSt.open;
    const el = $("#gcAsk"); el.hidden = !askSt.open;
    root.classList.toggle("has-ask", askSt.open);
    $("#gcAskBtn").setAttribute("aria-pressed", String(askSt.open));
    if (askSt.open) { renderAsk(); setTimeout(() => $("#gcAskIn")?.focus(), 30); }
    applyViewOffset();
  }
  async function ask(q) {
    q = q.trim(); if (!q || askSt.busy) return;
    askSt.msgs.push({ role: "u", text: q });
    const cmd = askCommand(q);
    if (cmd) { askSt.msgs.push(cmd); renderAsk(); return; }
    askSt.busy = true; renderAsk();
    const hits = retrieve(q);
    let msg;
    const st = (cb.aiState && cb.aiState()) || { ok: false };
    if (st.ok && cb.ask && hits.length) {
      try {
        const r = await cb.ask(q, hits.slice(0, 8).map((n) => ({ l: n.l, k: KIND[n.k]?.label || n.k, d: n.user ? tclip(n.text || n.d, 700) : [n.d, n.ex, n.sample].filter(Boolean).join(" ") })), askTopic(hits));
        if (r && r.answer) msg = { role: "a", ai: true, html: String(r.answer).split(/\n+/).map((p) => `<p>${cite(p, hits.slice(0, 8))}</p>`).join(""), bn: r.bn ? cite(r.bn, hits.slice(0, 8)) : "", bnHtml: true, nodes: hits.filter((n) => n.k !== "point").slice(0, 5) };
      } catch (e) { /* fall back to the graph answer */ }
    }
    if (!msg) {
      if (!hits.length) msg = { role: "a", html: `<p>I couldn’t find that in ${S.scope && S.scope !== "eng" ? "this view" : "the graph"}. ${!S.scope || S.scope === "eng" ? "Try a skill or situation, like “disagree”, “interview” or “affect effect”." : "Try a word that appears in one of the notes."}</p>`, nodes: [] };
      else {
        const top = hits.filter((n) => n.k !== "point").slice(0, 3);
        const lead = top.length ? top : hits.slice(0, 2);
        msg = { role: "a", html: lead.map((n) => `<div class="acard"><div class="atitle">${dot(n.k)}<b>${esc(n.l)}</b><small>${esc(KIND[n.k]?.label || n.k)}</small></div><p>${askLine(n)}</p></div>`).join(""), nodes: hits.filter((n) => n.k !== "point").slice(0, 6) };
      }
    }
    askSt.busy = false; askSt.msgs.push(msg); renderAsk();
    if (hits.length) lightUp(hits);
  }
  $("#gcAsk").addEventListener("submit", (e) => { e.preventDefault(); const i = $("#gcAskIn"); const v = i.value; i.value = ""; ask(v); });
  $("#gcAsk").addEventListener("click", (e) => {
    if (e.target.closest("#gcAskX")) return toggleAsk(false);
    if (e.target.closest("#gcAskClear")) { askSt.msgs = []; if (S.highlight?.ask) clearPath(); renderAsk(); return; }
    const sg = e.target.closest("[data-sug]"); if (sg) ask(sugList()[+sg.dataset.sug]);
  });
  $("#gcAskBtn").addEventListener("click", () => toggleAsk());

  // ── Help: what each part does ────────────────────────────────────────────────────────────────────────────
  function showHelp(on) {
    const m = $("#gcHelpM"); m.hidden = !on; if (!on) return;
    m.innerHTML = `<div class="mcard" role="dialog" aria-label="Guide"><div class="mh"><b>How the cosmos works</b><button class="gc-icon" id="gcHelpX" aria-label="Close">✕</button></div>
    <p class="msub">Every skill, lesson, scenario, word pair and example is a point. Lines show how ideas lead to each other.</p>
    <ul class="mlist">
      <li><i class="ic ic-explore"></i><div><b>Explore</b><span>Click a point to focus on it and its neighbours. Use 1 hop or 2 hops, or switch to Whole graph. Drag to rotate, scroll to zoom.</span></div></li>
      <li><i class="ic ic-ask"></i><div><b>Ask</b><span>Type a question. The answer is built from the graph, and the points it used light up. Connect an AI in Settings for fuller, grounded answers.</span></div></li>
      <li><i class="ic ic-route"></i><div><b>Find a path</b><span>Pick two ideas and see how one leads to the other, step by step.</span></div></li>
      <li><i class="ic ic-sliders"></i><div><b>Display</b><span>Colour by type or by constellation, hide link types, slow rotation on or off.</span></div></li>
      <li><i class="ic ic-phil"></i><div><b>Philosophy</b><span>Thinkers, schools, ideas and eras from the philosophy lectures, on their own map. Open Lineage to see who influenced or challenged whom.</span></div></li>
      <li><i class="ic ic-search"></i><div><b>Search · Ctrl K</b><span>Jump straight to any skill, lesson, phrase or word pair.</span></div></li>
      <li><i class="ic ic-speak"></i><div><b>Speak</b><span>Practise out loud in Voice Studio. “Practise speaking” in a skill opens it for that skill.</span></div></li>
      <li><i class="ic ic-download"></i><div><b>Install</b><span>Add SpeakCosmos to your phone or PC so it opens like an app, even on a weak connection.</span></div></li>
    </ul><div class="mf"><button class="gcbtn primary" id="gcHelpOk">Got it</button></div></div>`;
  }
  $("#gcHelp").addEventListener("click", () => showHelp(true));
  $("#gcHelpM").addEventListener("click", (e) => { if (e.target.id === "gcHelpM" || e.target.closest("#gcHelpX,#gcHelpOk")) showHelp(false); });
  chrome();

  root.addEventListener("click", (e) => {
    const lgo = e.target.closest("[data-lens-go]");
    if (lgo) { e.stopImmediatePropagation(); L.focus = lgo.dataset.id; if (S.scope) { S.scope = null; scopeChanged(); } setLens("lineage"); syncTabs(); return; }
    const exp = e.target.closest('[data-tab="explore"]');
    if (exp && S.scope) { e.stopImmediatePropagation(); setScope(null); return; }
    const lens = e.target.closest("[data-lens]");
    if (lens) { e.stopImmediatePropagation(); const t = lens.dataset.lens; if (t !== "explore") setLens(t); else { const f = S.lens === "lineage" ? L.focus : null; setLens("explore"); if (f && S.lens === "explore") select(f); } return; }
    const od = e.target.closest("#gcInspect [data-cday]"); if (od) { e.stopImmediatePropagation(); C.day = +od.dataset.cday; setLens("course"); renderCourse(); return; }
    const ox = e.target.closest("#gcInspect [data-cdone]"); if (ox) { e.stopImmediatePropagation(); const k = +ox.dataset.cdone; days.has(k) ? days.delete(k) : days.add(k); saveDays(); renderInspector(); return; }
    if (S.lens === "course" && e.target.closest('[data-nav="cosmos"]')) { e.stopImmediatePropagation(); setLens("explore"); select(null); camCmd("fit"); return; }
    if (S.lens === "lineage") {
      const go = e.target.closest("[data-go]"); if (go) { e.stopImmediatePropagation(); linFocus(go.dataset.go); return; }
      if (e.target.closest('[data-nav="cosmos"]')) { e.stopImmediatePropagation(); const f = L.focus; setLens("explore"); select(null); camCmd("fit"); return; }
    }
    if (e.target.closest("[data-hl-clear]")) { e.stopImmediatePropagation(); clearPath(); askSt.msgs.length && renderAsk(); return; }
    const m = e.target.closest("#gcFocus [data-mode]");
    if (m && m.dataset.mode === "focus" && !S.selected) {
      e.stopImmediatePropagation();
      let best = null; for (const n of data.nodes) if (n.k === "skill" && (!best || Math.abs(deg(n.id) - 11) < Math.abs(deg(best.id) - 11))) best = n;
      if (best) { S.mode = "focus"; S.hidden.delete("skill"); S.highlight = null; select(best.id); }
    }
  });

  // ── Lineage: one idea in the middle, what leads to it on the left, what it leads to on the right ─────────
  const CHAINS = {
    all: { label: "All connections", rels: null },
    path: { label: "Learning path", rels: ["NEXT_SKILL", "NEXT_LESSON", "COVERS", "BELONGS_TO"] },
    course: { label: "100-day course", rels: ["NEXT_DAY", "TEACHES", "PREPARES"] },
    practice: { label: "Practice", rels: ["PRACTISES", "USES", "TRAINS"] },
    words: { label: "Word mentions", rels: ["MENTIONS_WORD"] },
    time: { label: "Timeline", rels: ["NEXT_ERA"] },
    ideas: { label: "Founders & ideas", rels: ["FOUNDED", "HOLDS", "INFLUENCES", "EXPLAINS"] },
    debate: { label: "Debates", rels: ["CRITIQUES", "REJECTS", "CONTRASTS"] },
  };
  const L = { focus: null, chain: "all", back: [], more: new Set(), pick: false, view: { x: 0, y: 0, k: 1 }, off: {}, suppress: false };
  const canvasOn = () => root.clientWidth >= 900;
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const clip = (t, n) => (t.length > n ? t.slice(0, n - 1) + "…" : t);
  const LIN_START = "ls:verb-tenses";
  function linGroups(id) {
    const ok = CHAINS[L.chain].rels, g = { left: new Map(), right: new Map() };
    for (const a of adj.get(id) ?? []) {
      if (raw.get(a.other)?.k === "core") continue;
      if (ok && !ok.includes(a.e.rel)) continue;
      const side = a.out ? "right" : "left", key = a.e.rel;
      g[side].set(key, [...(g[side].get(key) ?? []), a.other]);
    }
    const fin = (m, side) => [...m.entries()].map(([rel, ids]) => ({ rel, side, title: cap(REL[rel][side === "left" ? "inverse" : "verb"]), ids: ids.sort((x, y) => (raw.get(x).k === "day" && raw.get(y).k === "day" ? raw.get(x).n - raw.get(y).n : 0) || (raw.get(y).k === "point") - (raw.get(x).k === "point") || deg(y) - deg(x)) }))
      .sort((x, y) => GROUP_RANK[REL[x.rel].group] - GROUP_RANK[REL[y.rel].group] || y.ids.length - x.ids.length);
    return { left: fin(g.left, "left"), right: fin(g.right, "right") };
  }
  const linCard = (id, rel) => {
    const n = raw.get(id), bn = n.bn || n.lvl || "";
    return `<div class="lcard" data-lgo="${esc(id)}" data-rel="${rel}" role="button" tabindex="0"><span class="lport"></span>
      <div class="lc-t">${dot(n.k)}<b>${esc(clip(n.l, 60))}</b>${bn ? `<small${n.bn ? ' lang="bn"' : ""}>${esc(bn)}</small>` : ""}</div>
      <div class="lc-s">${esc(n.sub || KIND[n.k]?.label.replace(/s$/, "") || "")}</div>
      ${n.d && n.k !== "day" ? `<p>${esc(clip(n.d, 120))}</p>` : ""}
      </div>`;
  };
  function linCol(groups, side) {
    return groups.map((g) => {
      const key = side + g.rel, open = L.more.has(key), lim = 3, shown = open ? g.ids : g.ids.slice(0, lim);
      return `<div class="lgrp"><h4>${esc(g.title)}<span>${g.ids.length}</span></h4>${shown.map((id) => linCard(id, g.rel)).join("")}${g.ids.length > lim ? `<button class="lmore" data-lmore="${key}">${open ? "Show fewer" : `Show ${g.ids.length - lim} more`}</button>` : ""}</div>`;
    }).join("");
  }
  function renderLineage() {
    const el = $("#gcLin"), n = raw.get(L.focus); if (!n) return;
    const gr = linGroups(L.focus), none = !gr.left.length && !gr.right.length;
    const bn = n.bn ? `<div class="lf-bn" lang="bn">${esc(n.bn)}</div>` : "";
    const meta = [n.sub || KIND[n.k]?.label.replace(/s$/, ""), n.lvl].filter(Boolean).join(" · ");
    el.innerHTML = `<div class="lin-bar">
        ${L.back.length ? `<button class="gcbtn" data-lback title="Back to ${esc(raw.get(L.back[L.back.length - 1])?.l || "")}">← Back</button>` : ""}
        <span class="lin-sp"></span>
        <div class="lin-pickwrap"><button class="gcbtn" id="gcLinChange" aria-expanded="${L.pick}">Change focus</button>
          <div class="lin-pick" id="gcLinPick" ${L.pick ? "" : "hidden"}><input id="gcLinQ" placeholder="Find a skill or lesson…" autocomplete="off" spellcheck="false"><div id="gcLinRes"></div></div></div>
        <select id="gcLinChain" aria-label="Connection type">${Object.entries(CHAINS).map(([k, c]) => `<option value="${k}" ${L.chain === k ? "selected" : ""}>${c.label}</option>`).join("")}</select>
        <button class="gc-icon" data-lens="explore" title="Show in the 3D graph" aria-label="Show in the 3D graph"><i class="ic ic-explore"></i></button>
      </div>
      <div class="lin-body" id="gcLinBody"><div class="lin-stage" id="gcLinStage"><svg class="lin-svg" id="gcLinSvg" aria-hidden="true"></svg>
        <div class="lin-col l">${linCol(gr.left, "left")}</div><div class="lin-gap"></div>
        <div class="lin-mid"><div class="lfocus" id="gcLinFocus"><span class="lport l"></span><span class="lport r"></span>
          <div class="lf-top"><span class="lf-kind">${dot(n.k)}${esc(meta)}</span><button class="gcbtn" id="gcLinDetails">Details</button></div>
          <h2>${esc(n.l)}</h2>${bn}${n.d ? `<p class="lf-d">${esc(clip(n.d, 220))}</p>` : ""}
          </div>
          ${none ? `<p class="lin-none">No “${esc(CHAINS[L.chain].label.toLowerCase())}” here. Try “All connections”.</p>` : ""}</div>
        <div class="lin-gap"></div><div class="lin-col r">${linCol(gr.right, "right")}</div></div>
        <div class="lin-zoom card" id="gcLinZoom"><button data-lz="in" title="Zoom in" aria-label="Zoom in">+</button><button data-lz="out" title="Zoom out" aria-label="Zoom out">−</button><button data-lz="fit" title="Fit everything" aria-label="Fit everything"><i class="ic ic-fit"></i></button><button data-lz="reset" title="Reset layout" aria-label="Reset layout"><i class="ic ic-rotate"></i></button></div></div>`;
    linApply();
    requestAnimationFrame(linDraw);
  }
  function linApply() {
    const st = $("#gcLinStage"); if (!st) return;
    const on = canvasOn(), v = L.view;
    st.style.transform = on ? `translate(${v.x}px, ${v.y}px) scale(${v.k})` : "none";
    st.querySelectorAll(".lcard,.lfocus").forEach((c) => {
      const o = L.off[c.classList.contains("lfocus") ? "mid" : c.dataset.lgo + "|" + c.dataset.rel];
      c.style.transform = on && o ? `translate(${o[0]}px, ${o[1]}px)` : "";
    });
  }
  function linDraw() {
    const body = $("#gcLinBody"), st = $("#gcLinStage"), svg = $("#gcLinSvg"), mid = $("#gcLinFocus"); if (!body || !st || !svg || !mid || $("#gcLin").hidden) return;
    if (!canvasOn()) { svg.innerHTML = ""; return; }
    const k = L.view.k, sr = st.getBoundingClientRect(), W = st.offsetWidth, H = st.offsetHeight;
    svg.setAttribute("width", W); svg.setAttribute("height", H); svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const m = mid.getBoundingClientRect(), mly = (m.top - sr.top) / k + 56, mlx = (m.left - sr.left) / k, mrx = (m.right - sr.left) / k;
    const col = { structure: "var(--lk-s)", curated: "var(--lk-c)", lexical: "var(--lk-l)" };
    let d = `<defs><marker id="lar" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z" fill="var(--lk-c)"/></marker></defs>`;
    st.querySelectorAll(".lcard").forEach((c) => {
      const r = c.getBoundingClientRect(), left = c.closest(".lin-col").classList.contains("l");
      const y = (r.top - sr.top) / k + Math.min(28, r.height / k / 2), rel = c.dataset.rel, stroke = col[REL[rel]?.group] || col.curated;
      const cl = (r.left - sr.left) / k, cr = (r.right - sr.left) / k;
      // a card dragged across the focus card flips to the other side of it, so the link never doubles back
      const toLeft = left ? cr <= mlx + 10 : cl < mrx - 10 && cr < (mlx + mrx) / 2;
      const x0 = toLeft ? cr : mrx, y0 = toLeft ? y : mly, x1 = toLeft ? mlx : cl, y1 = toLeft ? mly : y;
      const kk = Math.max(40, Math.abs(x1 - x0) * 0.5);
      d += `<path d="M${x0} ${y0} C${x0 + kk} ${y0} ${x1 - kk} ${y1} ${x1} ${y1}" stroke="${stroke}" ${toLeft ? 'marker-end="url(#lar)"' : ""}/>`;
    });
    svg.innerHTML = d;
  }
  const linClamp = () => { const v = L.view; v.k = Math.min(2.4, Math.max(0.25, v.k)); };
  function linZoomAt(f, cx, cy) {
    const body = $("#gcLinBody"); if (!body) return;
    const v = L.view, k0 = v.k; v.k *= f; linClamp(); const g = v.k / k0;
    const r = body.getBoundingClientRect(), px = cx - r.left, py = cy - r.top;
    v.x = px - (px - v.x) * g; v.y = py - (py - v.y) * g; linApply(); linDraw();
  }
  function linFit() {
    const body = $("#gcLinBody"), st = $("#gcLinStage"); if (!body || !st) return;
    // bounding box of every card at its current position, in stage pixels
    const sr = st.getBoundingClientRect(), k0 = L.view.k; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    st.querySelectorAll(".lcard,.lfocus").forEach((c) => { const r = c.getBoundingClientRect(); x0 = Math.min(x0, (r.left - sr.left) / k0); y0 = Math.min(y0, (r.top - sr.top) / k0); x1 = Math.max(x1, (r.right - sr.left) / k0); y1 = Math.max(y1, (r.bottom - sr.top) / k0); });
    if (x1 < x0) return;
    const pad = 28, vw = body.clientWidth, vh = body.clientHeight, w = x1 - x0 + pad * 2, h = y1 - y0 + pad * 2;
    const v = L.view; v.k = Math.min(1, Math.max(0.25, Math.min(vw / w, vh / h)));
    v.x = (vw - (x1 - x0) * v.k) / 2 - x0 * v.k; v.y = Math.max(8, (vh - (y1 - y0) * v.k) / 2) - y0 * v.k + (vh - (y1 - y0) * v.k) / 2 * 0; linApply(); linDraw();
  }
  function linReset() { L.view = { x: 0, y: 0, k: 1 }; L.off = {}; linApply(); linDraw(); }
  // pan the background, drag any card, wheel / pinch to zoom
  (() => {
    const lin = $("#gcLin"), ptrs = new Map(); let drag = null, pinch = 0;
    lin.addEventListener("pointerdown", (e) => {
      const body = e.target.closest("#gcLinBody"); if (!body || !canvasOn() || e.button > 0) return;
      if (e.target.closest(".lin-zoom,a,button,input,select")) return;
      ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); drag = null; return; }
      const card = e.target.closest(".lcard,.lfocus");
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, card, key: card ? (card.classList.contains("lfocus") ? "mid" : card.dataset.lgo + "|" + card.dataset.rel) : null, ox: 0, oy: 0 };
      if (card) { const o = L.off[drag.key] || [0, 0]; drag.ox = o[0]; drag.oy = o[1]; } else { drag.ox = L.view.x; drag.oy = L.view.y; }
    });
    lin.addEventListener("pointermove", (e) => {
      if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()], dst = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) linZoomAt(dst / pinch, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); pinch = dst; return; }
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved) { if (Math.hypot(dx, dy) < 4) return; drag.moved = true; try { lin.setPointerCapture(e.pointerId); } catch (er) {} (drag.card || $("#gcLinBody")).classList.add("dragging"); $("#gcLinBody").classList.add("panning"); }
      if (drag.card) { L.off[drag.key] = [drag.ox + dx / L.view.k, drag.oy + dy / L.view.k]; drag.card.style.transform = `translate(${L.off[drag.key][0]}px, ${L.off[drag.key][1]}px)`; }
      else { L.view.x = drag.ox + dx; L.view.y = drag.oy + dy; $("#gcLinStage").style.transform = `translate(${L.view.x}px, ${L.view.y}px) scale(${L.view.k})`; }
      if (!drag.raf) drag.raf = requestAnimationFrame(() => { if (drag) drag.raf = 0; linDraw(); });
    });
    const end = (e) => {
      ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = 0;
      if (drag && e.pointerId === drag.id) {
        if (drag.moved) { L.suppress = true; setTimeout(() => (L.suppress = false), 60); }
        lin.querySelectorAll(".dragging,.panning").forEach((x) => x.classList.remove("dragging", "panning")); drag = null; linDraw();
      }
    };
    lin.addEventListener("pointerup", end); lin.addEventListener("pointercancel", end);
    lin.addEventListener("wheel", (e) => { if (!canvasOn() || !e.target.closest("#gcLinBody")) return; e.preventDefault(); linZoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)), e.clientX, e.clientY); }, { passive: false });
    lin.addEventListener("dblclick", (e) => { if (canvasOn() && e.target.closest("#gcLinBody") && !e.target.closest(".lcard,.lfocus,.lin-zoom")) linFit(); });
  })();
  function linFocus(id, { push = true } = {}) {
    if (!raw.has(id) || id === L.focus) { L.pick = false; renderLineage(); return; }
    if (push && L.focus) L.back.push(L.focus);
    L.focus = id; L.pick = false; L.more.clear(); L.off = {}; L.view = { x: 0, y: 0, k: 1 };
    if (S.selected) { S.selected = id; renderInspector(); }
    linUrl(); renderLineage();
    
  }
  const linUrl = () => { try { history.replaceState(null, "", `${location.pathname}?view=cosmos&lens=lineage&node=${encodeURIComponent(L.focus)}`); } catch (e) {} };
  const syncTabs = () => {
    root.querySelectorAll(".gc-nav [data-tab]").forEach((b) => b.classList.toggle("on", b.dataset.tab === S.lens));
    const cur2 = S.lens === "explore" ? S.scope || "" : null;
    root.querySelectorAll(".tp[data-topic]").forEach((b) => { const on = b.dataset.topic === cur2; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
  };
  function ensureVisible(id) { const n = raw.get(id); if (n && !inScope(n) && S.scope) setScope(null, { fly: false }); }
  function setScope(id, { fly = true } = {}) {
    if (id === true) id = "phil"; if (id === false || id === "") id = null;
    if (id && !colOf(id) && !topicInfo(id)) id = null;
    if (S.scope !== id) { S.scope = id; S.selected = null; S.highlight = null; S.hover = null; S.bridgeOnly = false; scopeChanged(); }
    if (S.lens !== "explore") setLens("explore"); else renderInspector();
    syncTabs(); apply({ frame: false }); wake(1500);
    try { history.replaceState(null, "", `${location.pathname}?view=cosmos${id ? "&scope=" + encodeURIComponent(id) : ""}`); } catch (e) {}
    if (!fly) return;
    if (id === "phil") { setSpin(false); fg.cameraPosition(mobile() ? { x: 0, y: 620, z: 820 } : { x: 0, y: 430, z: 560 }, { x: 0, y: 0, z: 0 }, reduceMotion ? 0 : 900);
    } else camCmd("fit");
  }
  function setLens(lens) {
    if (S.lens === lens) return;
    const prev = S.lens; S.lens = lens;
    root.classList.toggle("lin", lens === "lineage"); root.classList.toggle("crs", lens === "course");
    syncTabs();
    $("#gcLin").hidden = lens !== "lineage"; $("#gcCourse").hidden = lens !== "course";
    if (lens === "explore") { renderInspector(); wake(1500); applyViewOffset(); return; }
    toggleAsk(false); S.tool && showPop(S.tool);
    if (prev === "explore") { sleeping = true; fg.pauseAnimation(); }
    if (lens === "lineage") {
      L.focus = S.selected && raw.has(S.selected) ? S.selected : L.focus || LIN_START; L.back = []; L.pick = false;
      S.selected = null; renderInspector(); linUrl(); renderLineage();
    } else { S.selected = null; renderInspector(); renderCourse(); try { history.replaceState(null, "", `${location.pathname}?view=cosmos&lens=course`); } catch (e) {} }
  }

  // ── Course: the 100-day plan as a daily routine (learn, practise, speak, own it) ────────────────────────
  const PHASES = [null,
    { name: "Basics & vocabulary", tip: "Build the bricks. Read each example aloud, because your mouth must learn the words, not just your eyes.", say: "Describe your morning in four short sentences using today's words." },
    { name: "Grammar & sentence structure", tip: "Grammar is the frame that holds your meaning. Learn one pattern, then use it on a real work situation.", say: "Tell a colleague about a real work situation using today's structure." },
    { name: "Idioms, phrasal verbs & expressions", tip: "Natural English comes in chunks. Learn the whole phrase, never the single word.", say: "Give a 30-second update that uses two of today's expressions." },
    { name: "Reading & comprehension", tip: "Reading feeds speaking. After each text, say its point, its reason and what happens next.", say: "Summarise today's reading aloud in three parts: point, reason, next." },
    { name: "Speaking & writing practice", tip: "Now you perform. Short, structured, calm. Begin without saying sorry.", say: "Deliver today's skill as a 60-second talk. Start without apologising." },
  ];
  const dayNodes = data.nodes.filter((n) => n.k === "day").sort((a, b) => a.n - b.n);
  const days = new Set((() => { try { return JSON.parse(read("sc_days") || "[]"); } catch (e) { return []; } })());
  const saveDays = () => store("sc_days", JSON.stringify([...days]));
  const C = { day: null };
  const nextDay = () => (dayNodes.find((d) => !days.has(d.n)) || dayNodes[dayNodes.length - 1])?.n || 1;
  const dayTargets = (d) => (adj.get("dy:" + d)?.filter((a) => a.out && (a.e.rel === "TEACHES" || a.e.rel === "PREPARES")).map((a) => raw.get(a.other)) ?? []);
  function renderCourse() {
    const el = $("#gcCourse"); if (!dayNodes.length) { el.innerHTML = "<p class='lin-none'>The course is not part of this build.</p>"; return; }
    if (!C.day) C.day = nextDay();
    const n = raw.get("dy:" + C.day), ph = PHASES[n.ph], tg = dayTargets(C.day), done = days.has(C.day);
    const skill = tg.find((t) => t.k === "skill") || data.nodes.find((x) => x.id === ["", "t:sentence-order", "t:point-reason-next", "t:natural-phrases", "t:point-reason-next", "t:speak-up"][n.ph]);
    const pct = Math.round((days.size / 100) * 100);
    const step = (i, h, p, btn) => `<div class="cstep"><span class="cn">${i}</span><div><b>${h}</b><p>${p}</p>${btn}</div></div>`;
    el.innerHTML = `<div class="crs-body">
      <header class="crs-hero"><div><h1>100-day English course</h1><p>One short routine a day: learn, practise, speak, own it. Confidence grows from small daily repetition, so keep each day small and keep the streak.</p></div>
        <div class="crs-prog"><div class="cbar"><i style="width:${pct}%"></i></div><b>${days.size} of 100 days</b><button class="gcbtn primary" data-cday="${nextDay()}">${days.size ? "Continue · Day " + nextDay() : "Start · Day 1"}</button></div></header>
      <section class="crs-today"><div class="ct-top"><span class="ct-k">Day ${n.n} · Phase ${n.ph} · ${esc(ph.name)}</span>${done ? '<span class="ct-done">✓ Done</span>' : ""}</div>
        <h2>${esc(n.l.replace(/^Day \d+ · /, ""))}</h2><p class="ct-tip">${esc(ph.tip)}</p>
        <div class="csteps">
          ${step(1, "Learn", "Read today's notes. Say every example sentence aloud once.", `<a class="gcbtn" href="${esc(n.notes)}" target="_blank" rel="noopener noreferrer">Open the notes ↗</a>`)}
          ${step(2, "Practise", "Take the quiz. Aim for 80%, then fix what you missed.", `<a class="gcbtn" href="${esc(n.quiz)}" target="_blank" rel="noopener noreferrer">Take the quiz ↗</a>${n.mega ? ` <a class="gcbtn" href="${esc(n.mega)}" target="_blank" rel="noopener noreferrer">Milestone quiz ↗</a>` : ""}`)}
          ${step(3, "Speak", esc(ph.say) + (skill?.tid ? `<br><small class="cskill">Practise with: ${esc(skill.l)}</small>` : ""), skill?.tid ? `<button class="gcbtn primary" data-action="practice-topic" data-id="${esc(skill.tid)}">◉ Speak it</button>` : `<button class="gcbtn primary" data-nav="practice">◉ Open Voice Studio</button>`)}
          ${step(4, "Own it", "Say your answer twice, slower the second time. Progress beats perfection.", `<button class="gcbtn ${done ? "done" : ""}" data-cdone="${n.n}">${done ? "✓ Day done" : "Mark day done"}</button>`)}
        </div>
        ${tg.length ? `<div class="ct-conn"><span>Connected in the cosmos</span>${tg.map((t) => `<button class="gcchip" data-cl="${esc(t.id)}">${dot(t.k)}<span>${esc(clip(t.l, 34))}</span></button>`).join("")}<button class="gcbtn ghost" data-cl="dy:${n.n}">See this day in Lineage</button></div>` : ""}
      </section>
      ${[1, 2, 3, 4, 5].map((p) => { const list = dayNodes.filter((d) => d.ph === p), dn = list.filter((d) => days.has(d.n)).length; return `<section class="crs-phase"><div class="cp-h"><b>Phase ${p} · ${esc(PHASES[p].name)}</b><span>Days ${list[0].n}–${list[list.length - 1].n} · ${dn}/${list.length}</span></div>
        <div class="ctiles">${list.map((d) => `<button class="ctile ${days.has(d.n) ? "done" : ""} ${d.n === C.day ? "sel" : ""} ${d.n === nextDay() ? "next" : ""}" data-cday="${d.n}" title="${esc(d.l)}" aria-label="${esc(d.l)}">${days.has(d.n) ? "✓" : d.n}</button>`).join("")}</div></section>`; }).join("")}
    </div>`;
  }
  $("#gcCourse").addEventListener("click", (e) => {
    const cd = e.target.closest("[data-cday]"); if (cd) { C.day = +cd.dataset.cday; renderCourse(); const b = $("#gcCourse"); b.scrollTop = 0; return; }
    const dn = e.target.closest("[data-cdone]"); if (dn) { const k = +dn.dataset.cdone; days.has(k) ? days.delete(k) : days.add(k); saveDays(); if (days.has(k) && C.day === k && k < 100) C.day = k + 1; renderCourse(); return; }
    const cl = e.target.closest("[data-cl]"); if (cl) { const id = cl.dataset.cl; setLens("lineage"); L.back = []; linFocus(id, { push: false }); return; }
  });

  function linSearch(q) {
    q = q.trim().toLowerCase(); const el = $("#gcLinRes"); if (!el) return;
    if (!q) { el.innerHTML = `<div class="none">Type to search ${data.nodes.length - 592} skills, lessons and scenarios.</div>`; return; }
    const sc = (n) => { const l = n.l.toLowerCase(); return l.startsWith(q) ? 0 : l.includes(q) ? 1 : (n.d || "").toLowerCase().includes(q) ? 2 : 9; };
    const r = allNodes.filter((n) => n.k !== "core" && n.k !== "point").map((n) => [sc(n), n]).filter((x) => x[0] < 9).sort((a, b) => a[0] - b[0]).slice(0, 8).map((x) => x[1]);
    el.innerHTML = r.length ? r.map((n) => `<button class="res" data-lgo="${esc(n.id)}">${dot(n.k)}<span class="rl">${esc(clip(n.l, 48))}</span><small>${esc(n.sub || KIND[n.k].label)}</small></button>`).join("") : `<div class="none">Nothing matches “${esc(q)}”.</div>`;
  }
  $("#gcLin").addEventListener("click", (e) => {
    if (L.suppress) { e.stopPropagation(); return; }
    const lz = e.target.closest("[data-lz]"); if (lz) { const t = lz.dataset.lz, b = $("#gcLinBody").getBoundingClientRect(); if (t === "in" || t === "out") linZoomAt(t === "in" ? 1.25 : 0.8, b.left + b.width / 2, b.top + b.height / 2); else if (t === "fit") linFit(); else linReset(); return; }
    if (e.target.closest(".lc-a")) return;
    const go = e.target.closest("[data-lgo]"); if (go) { linFocus(go.dataset.lgo); return; }
    const mo = e.target.closest("[data-lmore]"); if (mo) { const k = mo.dataset.lmore; L.more.has(k) ? L.more.delete(k) : L.more.add(k); renderLineage(); return; }
    if (e.target.closest("[data-lback]")) { const id = L.back.pop(); if (id) linFocus(id, { push: false }); return; }
    if (e.target.closest("#gcLinChange")) { L.pick = !L.pick; const p = $("#gcLinPick"); p.hidden = !L.pick; if (L.pick) { linSearch(""); $("#gcLinQ").focus(); } return; }
    if (e.target.closest("#gcLinDetails")) { if (S.selected === L.focus) S.selected = null; else S.selected = L.focus; renderInspector(); setTimeout(linDraw, 30); return; }
  });
  $("#gcLin").addEventListener("keydown", (e) => { const c = e.target.closest?.(".lcard"); if (c && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); linFocus(c.dataset.lgo); } if (e.key === "Escape" && L.pick) { L.pick = false; $("#gcLinPick").hidden = true; } });
  $("#gcLin").addEventListener("input", (e) => { if (e.target.id === "gcLinQ") linSearch(e.target.value); });
  $("#gcLin").addEventListener("change", (e) => { if (e.target.id === "gcLinChain") { L.chain = e.target.value; L.more.clear(); L.off = {}; renderLineage(); } });
  const linRo = new ResizeObserver(() => { if (S.lens === "lineage") linDraw(); });
  linRo.observe(root);
  $("#gcLin").addEventListener("scroll", () => {}, { passive: true });

  // ── Platform UI: topic tabs, notes, combined views, connections ────────────────────────────────────────────
  const modal = $("#gcModal"), toastEl = $("#gcToast");
  let toastT = 0;
  function toast(msg, ms = 3600) { toastEl.textContent = msg; toastEl.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { toastEl.hidden = true; }, ms); }
  function chromeSave() {
    const el = $("#gcSave"); if (!el) return;
    el.dataset.s = saveState;
    const cl = CL.state === "synced" ? " Also saved in your Google Drive." : CL.state === "syncing" ? " Syncing with Google Drive…" : CL.state === "error" ? " Google Drive sync failed: " + CL.err : cb.cloud ? " Not synced to Google Drive yet (open Library)." : "";
    el.parentElement.title = ({ idle: "Your topics and notes are kept in this browser", saving: "Saving…", saved: "Saved in this browser. Download a backup from Library now and then.", unsafe: "Could not save in this browser (private window or blocked storage). Download a backup from Library." }[saveState] || "") + cl;
  }
  const countsByTopic = () => { const c = {}; for (const n of allNodes) if (n.k !== "hub" && n.k !== "core") c[topicOf(n)] = (c[topicOf(n)] ?? 0) + 1; return c; };
  function renderTopics() {
    const el = $("#gcTopics"), cnt = countsByTopic(), on = S.lens === "explore" ? S.scope || "" : null;
    const tab = (id, label, extra = "", color = "") => `<button class="tp ${on === id ? "on" : ""}" role="tab" aria-selected="${on === id}" data-topic="${esc(id)}" ${color ? `style="--tc:${color}"` : ""}>${color ? '<i class="tdot"></i>' : ""}<span>${esc(label)}</span>${extra}</button>`;
    el.innerHTML = `<div class="tp-scroll">${tab("", "All topics")}${tab("eng", "English", `<b>${cnt.eng ?? 0}</b>`)}${tab("phil", "Philosophy", `<b>${cnt.phil ?? 0}</b>`)}${U.topics.map((t) => tab("u:" + t.id, t.label, `<b>${cnt["u:" + t.id] ?? 0}</b>`, t.color)).join("")}${U.cols.map((c) => tab("c:" + c.id, c.label, '<b class="col">combined</b>')).join("")}<button class="tp add" data-act="new-topic">+ Topic</button>${U.topics.length + 2 > 1 ? '<button class="tp add" data-act="combine">Combine</button>' : ""}</div>
      <div class="tp-right"><button class="tp tool" data-act="new-note">+ Note</button><button class="tp tool" data-act="connections" id="gcConn">Connections</button><button class="tp tool" data-act="library" id="gcLibB">Library<i class="sv" id="gcSave"></i></button></div>`;
    chromeSave();
  }
  function renderEmpty() {
    const el = $("#gcEmpty"), t = S.scope && !colOf(S.scope) ? U.topics.find((x) => "u:" + x.id === S.scope) : null;
    const n = t ? U.notes.filter((x) => x.topic === t.id).length : 1;
    if (!t || n || S.lens !== "explore") { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = `<div class="ecard"><b>${esc(t.label)} is empty</b><p>Add a note, or paste text or upload files to fill it. Link notes with [[Title]] and the map grows by itself.</p><div class="gcrow"><button class="gcbtn primary" data-act="new-note">+ Add a note</button><button class="gcbtn" data-act="import-into" data-id="${esc(t.id)}">Paste or upload text</button></div></div>`;
  }
  const openModal = (html, cls = "") => { modal.innerHTML = `<div class="mcard ${cls}" role="dialog" aria-modal="true">${html}</div>`; modal.hidden = false; const f = modal.querySelector("[autofocus]"); if (f) setTimeout(() => f.focus(), 30); };
  const closeModal = () => { modal.hidden = true; modal.innerHTML = ""; };
  const mHead = (t, sub) => `<div class="mh"><b>${t}</b><button class="gc-icon" data-m="close" aria-label="Close">✕</button></div>${sub ? `<p class="msub">${sub}</p>` : ""}`;
  const topicKeyOf = (scope) => (scope && scope.startsWith("u:") ? scope.slice(2) : null);
  function afterDataChange({ select: id, scope } = {}) {
    syncUser({ persist: true }); renderTopics();
    if (S.scope && !colOf(S.scope) && !topicInfo(S.scope)) S.scope = null;
    if (S.scope && colOf(S.scope)) { const c = colOf(S.scope); if (c.topics.filter((t) => topicInfo(t)).length < 1) S.scope = null; }
    scopeChanged(); renderEmpty();
    if (scope !== undefined) { const moved = scope !== S.scope; setScope(scope, { fly: moved && !id }); }
    if (S.selected && !raw.has(S.selected)) S.selected = null;
    if (S.highlight && [...S.highlight.nodes].some((x) => !raw.has(x))) S.highlight = null;
    if (id && raw.has(id)) { ensureVisible(id); select(id); } else { apply(); renderInspector(); }
    renderEmpty();
    if (S.tool === "conn") renderConn();
  }
  const tomb = (key) => { U.gone[key] = Date.now(); };
  const tombB = (b) => tomb("b:" + b.a + "|" + b.b + "|" + b.rel);
  const addNotes = (topicKey, list) => { const t0 = Date.now(); let c = 0; for (const x of list) { if (c >= 2500) break; U.notes.push({ id: newId("n"), topic: topicKey, title: String(x.title || "Untitled").slice(0, 120), text: String(x.text || "").slice(0, 20000), created: t0, updated: t0 }); c++; } return c; };
  const ensureTopic = (label, auto) => {
    let t = U.topics.find((x) => norm(x.label) === norm(label));
    if (!t) { let id = slug(label), k = 1; while (U.topics.some((x) => x.id === id) || id === "eng" || id === "phil") id = slug(label) + "-" + ++k; t = { id, label, color: auto ? "#d4380d" : COLORS[U.topics.length % COLORS.length], desc: auto ? "Ideas that join two topics" : "", created: Date.now(), updated: Date.now(), auto: !!auto }; U.topics.push(t); }
    return t;
  };
  async function readFiles(files) {
    const out = [], backups = [];
    for (const f of files) {
      if (f.size > 8e6) { toast(`${f.name} is larger than 8 MB, skipped`); continue; }
      let text = ""; try { text = await f.text(); } catch (e) { continue; }
      if (/\.json$/i.test(f.name)) { try { const j = JSON.parse(text); if (j && (j.topics || j.notes)) { backups.push(j); continue; } } catch (e) {} }
      out.push(...textToNotes(f.name, text));
    }
    return { notes: out, backups };
  }
  // ---- new topic
  function newTopicModal() {
    openModal(`${mHead("New topic", "A topic is its own 3D map. Add notes by hand, or paste text or upload files and they become connected notes.")}
      <form id="mfTopic" class="mform">
        <label>Name<input name="name" maxlength="40" required autofocus placeholder="e.g. Geology, Gita, Field notes" autocomplete="off"></label>
        <label>What is it about? <small>optional</small><input name="desc" maxlength="200" autocomplete="off"></label>
        <div class="swatches" role="radiogroup" aria-label="Colour">${COLORS.map((c, i) => `<label><input type="radio" name="color" value="${c}" ${i === U.topics.length % COLORS.length ? "checked" : ""}><i style="background:${c}"></i></label>`).join("")}</div>
        <label>Paste text <small>optional, becomes small notes</small><textarea name="paste" rows="5" placeholder="Paste notes, a transcript or an article…"></textarea></label>
        <label>Or upload files <small>.txt .md, or a backup .json</small><input type="file" name="files" accept=".txt,.md,.markdown,.json,text/plain" multiple></label>
        <div class="mf"><button type="button" class="gcbtn" data-m="close">Cancel</button><button class="gcbtn primary" type="submit">Create topic</button></div>
      </form>`, "wide");
  }
  async function submitTopic(f) {
    const name = f.name.value.trim(); if (!name) return;
    const btn = f.querySelector("[type=submit]"); btn.disabled = true; btn.textContent = "Creating…";
    const color = f.querySelector("input[name=color]:checked")?.value || COLORS[0];
    const t = ensureTopic(name); t.color = color; t.auto = false; if (f.desc.value.trim()) t.desc = f.desc.value.trim().slice(0, 300);
    let notes = textToNotes(name, f.paste.value), merged = 0;
    const r = await readFiles([...(f.files.files || [])]);
    notes.push(...r.notes);
    for (const b of r.backups) { const m = mergeState(U, b, { revive: true }); U = m.state; merged += m.addedN; }
    const c = addNotes(t.id, notes);
    closeModal(); afterDataChange({ scope: "u:" + t.id });
    toast(c || merged ? `Created ${t.label} with ${c + merged} note${c + merged === 1 ? "" : "s"}.` : `Created ${t.label}. Add your first note with + Note.`);
  }
  // ---- note editor
  const ED = { id: null };
  function noteModal(init = {}) {
    if (!U.topics.length && !init.spark) { newTopicModal(); toast("Create a topic first, then add notes to it."); return; }
    const editing = init.id ? U.notes.find((n) => n.id === init.id) : null;
    const d = editing ? { ...editing } : init;
    const topic = d.topic ?? topicKeyOf(S.scope) ?? U.topics[0]?.id;
    ED.id = editing?.id ?? null; ED.from = d.from ?? null; ED.spark = !!d.spark;
    const nid = editing ? "u:" + editing.id : null;
    const back = nid ? (adj.get(nid) ?? []).filter((a) => !a.out && a.e.rel === "LINKS_TO").map((a) => raw.get(a.other)).filter(Boolean) : [];
    const miss = nid ? unresolved.get(nid) ?? [] : [];
    const st = (cb.aiState && cb.aiState()) || { ok: false };
    openModal(`${mHead(editing ? "Edit note" : d.spark ? "New idea" : "New note", d.spark ? "Two topics meet here. Edit this first draft into your own idea." : "Write freely. Link to anything with [[Title]], tag with #word. The map updates when you save.")}
      <form id="mfNote" class="mform">
        <label>Title<input name="title" maxlength="120" required autofocus autocomplete="off" value="${esc(d.title || "")}"></label>
        <label>Topic<select name="topic">${topic === "__ideas" ? '<option value="__ideas" selected>New ideas (new topic)</option>' : ""}${U.topics.map((t) => `<option value="${esc(t.id)}" ${t.id === topic ? "selected" : ""}>${esc(t.label)}</option>`).join("")}</select></label>
        <label>Note <small>[[Title]] links · #tags</small><textarea name="text" rows="9" maxlength="20000" placeholder="Write here…">${esc(d.text || "")}</textarea></label>
        <div class="linkfind"><input id="mfFind" placeholder="Find something to link… (any topic)" autocomplete="off" aria-label="Find something to link"><div id="mfFound"></div></div>
        ${back.length ? `<div class="mnote"><b>Linked from</b> ${back.slice(0, 12).map((n) => `<button type="button" class="cb" data-go="${esc(n.id)}" data-m="close">${esc(clip(n.l, 30))}</button>`).join("")}</div>` : ""}
        ${miss.length ? `<div class="mnote"><b>Not written yet</b> ${miss.slice(0, 10).map((t) => `<button type="button" class="cb" data-act="create-note" data-title="${esc(t)}" data-topic="${esc(topic)}">+ ${esc(clip(t, 28))}</button>`).join("")}</div>` : ""}
        <div class="mf">${editing ? '<button type="button" class="gcbtn danger" data-m="del">Delete</button>' : ""}${d.spark && st.ok ? '<button type="button" class="gcbtn" data-m="ai">Ask AI to sharpen</button>' : ""}<span class="aflex"></span><button type="button" class="gcbtn" data-m="close">Cancel</button><button class="gcbtn primary" type="submit">Save</button></div>
      </form>`, "wide");
  }
  function saveNote(f) {
    let topic = f.topic.value; if (topic === "__ideas") topic = ensureTopic("New ideas", true).id;
    const title = f.title.value.trim() || "Untitled", text = f.text.value, now = Date.now();
    let note = ED.id ? U.notes.find((n) => n.id === ED.id) : null;
    if (note) { if (note.topic !== topic) delete note.p; Object.assign(note, { title, text, topic, updated: now }); }
    else {
      note = { id: newId("n"), topic, title, text, created: now, updated: now }; if (ED.spark) { note.spark = true; note.from = ED.from; }
      U.notes.push(note);
      if (ED.spark && ED.from?.length === 2 && !U.bridges.some((b) => (b.a === ED.from[0] && b.b === ED.from[1]) || (b.a === ED.from[1] && b.b === ED.from[0]))) U.bridges.push({ a: ED.from[0], b: ED.from[1], rel: "RELATED", note: "from idea: " + title.slice(0, 60), t: Date.now() });
    }
    closeModal();
    afterDataChange({ select: "u:" + note.id, scope: S.scope && !colOf(S.scope) && S.scope !== "u:" + topic ? "u:" + topic : undefined });
    toast("Saved.");
  }
  function deleteNote() {
    const n = U.notes.find((x) => x.id === ED.id); if (!n || !confirm(`Delete “${n.title}”? This cannot be undone.`)) return;
    tomb("n:" + n.id); U.bridges.filter((b) => b.a === "u:" + n.id || b.b === "u:" + n.id).forEach(tombB);
    U.notes = U.notes.filter((x) => x.id !== n.id); U.bridges = U.bridges.filter((b) => b.a !== "u:" + n.id && b.b !== "u:" + n.id);
    closeModal(); afterDataChange(); toast("Deleted.");
  }
  function noteHtml(text) {
    const RE = /\[\[([^\[\]|\n]{1,120}?)(?:\|([^\[\]\n]*))?\]\]/g;
    const fmt = (t) => esc(t).replace(/(^|[\s(,;])#([\p{L}\p{N}][\p{L}\p{N}_-]+)/gu, '$1<span class="tag">#$2</span>').replace(/\n/g, "<br>");
    return String(text).split(/\n{2,}/).map((p) => {
      let out = "", last = 0;
      for (const m of p.matchAll(RE)) {
        out += fmt(p.slice(last, m.index)); last = m.index + m[0].length;
        const id = resolveTitle(m[1]), shown = esc(m[2] || m[1]);
        out += id ? `<button class="cite wl" data-go="${esc(id)}">${shown}</button>` : `<span class="wl miss" title="Not written yet">${shown}</span>`;
      }
      return `<p>${out + fmt(p.slice(last))}</p>`;
    }).join("");
  }
  const platformActions = (n) => {
    if (n.k === "core") return "";
    if (n.k === "hub" && n.user) return `<div class="actions"><button class="gcbtn primary" data-act="new-note" data-topic="${esc(n.hubOf)}">+ Note here</button><button class="gcbtn" data-act="import-into" data-id="${esc(n.hubOf)}">Paste or upload text</button></div>`;
    if (n.k === "hub") return "";
    return `<div class="actions plat"><button class="gcbtn" data-act="relate" data-id="${esc(n.id)}">✦ Find related in other topics</button><button class="gcbtn ghost" data-act="note-about" data-id="${esc(n.id)}">+ Note about this</button></div>`;
  };
  // ---- library: topics, combined views, backup
  function libraryModal() {
    const cnt = countsByTopic(), kindTxt = { browser: "Saved in this browser (IndexedDB).", local: "Saved in this browser (local storage).", memory: "Not saved: this browser blocks storage (private window?). Download a backup before closing." }[userStore.kind] || "";
    openModal(`${mHead("Library", "Your topics, combined views and backup.")}
      <p class="lib-st" data-s="${userStore.kind}">${kindTxt}</p>
      ${cb.cloud ? `<div class="lib-sec cloud"><h4>Google Drive</h4><p class="lib-cl" data-s="${CL.state}">${{ off: "Not connected. Connect to keep everything in your own Google Drive and use it on every device.", syncing: "Syncing…", synced: "Synced " + new Date(CL.at).toLocaleTimeString() + ". Changes are uploaded automatically while this page is open.", error: "Sync failed: " + esc(CL.err) }[CL.state] || ""}</p><div class="gcrow wrap"><button class="gcbtn primary" data-act="cloud-sync" ${CL.busy ? "disabled" : ""}>${cloudOn() ? "Sync now" : "Connect Google Drive"}</button></div><p class="msub">Stored privately in this app\u2019s hidden folder in the Google account you choose at sign-in. Only this app can read it. Edits from two devices are merged, and a deletion is never undone by an older copy.</p></div>` : ""}
      <div class="lib-sec"><h4>Topics</h4>${U.topics.length ? U.topics.map((t) => `<div class="lib-row"><i class="tdot" style="--tc:${t.color}"></i><b>${esc(t.label)}</b><small>${cnt["u:" + t.id] ?? 0} items</small><span class="aflex"></span><button class="gcbtn ghost" data-act="import-into" data-id="${esc(t.id)}">Add text</button><button class="gcbtn ghost" data-act="rename-topic" data-id="${esc(t.id)}">Rename</button><button class="gcbtn ghost danger" data-act="del-topic" data-id="${esc(t.id)}">Delete</button></div>`).join("") : '<p class="msub">No topics of your own yet. Use + Topic.</p>'}</div>
      <div class="lib-sec"><h4>Combined views</h4>${U.cols.length ? U.cols.map((c) => `<div class="lib-row"><b>${esc(c.label)}</b><small>${c.topics.map((x) => esc(topicInfo(x)?.label ?? x)).join(" + ")}</small><span class="aflex"></span><button class="gcbtn ghost danger" data-act="del-col" data-id="${esc(c.id)}">Delete</button></div>`).join("") : '<p class="msub">A combined view shows several topics in one tab, side by side, so you can look for relations.</p>'}<button class="gcbtn" data-act="combine">+ Combine topics</button></div>
      <div class="lib-sec"><h4>Backup</h4><div class="gcrow"><button class="gcbtn primary" data-act="export">Download backup</button><label class="gcbtn filebtn">Restore or merge a backup<input type="file" id="libRestore" accept=".json,application/json" hidden></label></div><p class="msub">A backup is one small file with all your topics, notes and connections. Restoring never overwrites what you already have.</p></div>`, "wide");
  }
  function exportBackup() {
    const blob = new Blob([JSON.stringify({ ...U, exportedAt: new Date().toISOString(), app: "speakcosmos" }, null, 1)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `speakcosmos-backup-${new Date().toISOString().slice(0, 10)}.json`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function combineModal() {
    const all = topicsAll();
    openModal(`${mHead("Combine topics", "Pick two or more topics. They appear together in one tab, each as its own island, with the links between them.")}
      <form id="mfCombine" class="mform"><label>Name<input name="name" maxlength="40" required autofocus placeholder="e.g. Geology and the Gita" autocomplete="off"></label>
      <div class="checks">${all.map((t) => `<label class="chk"><input type="checkbox" name="t" value="${esc(t.id)}"><span>${esc(t.label)}</span></label>`).join("")}</div>
      <div class="mf"><button type="button" class="gcbtn" data-m="close">Cancel</button><button class="gcbtn primary" type="submit">Create combined view</button></div></form>`);
  }
  // ---- connections: find similar ideas, find contradictions, or link two ideas yourself
  const CN = { mode: "similar", topics: new Set(), only: null, res: null, busy: false, ai: "", aiBusy: false, link: { a: null, b: null, rel: "SIMILAR", note: "" } };
  const MODE = {
    similar: { word: "similar ideas", rel: "SIMILAR", accept: "Connect as similar", no: "Not related", intro: "Finds ideas in different topics that say the same thing, or something close to it." },
    contradict: { word: "contradictions", rel: "CONTRADICTS", accept: "Mark as contradiction", no: "Not a contradiction", intro: "Finds ideas that cover the same ground but lean opposite ways. Offline results are candidates; ask the AI to judge them." },
  };
  const aiOk = () => !!((cb.aiState && cb.aiState()) || {}).ok;
  const topicSel = () => { const all = new Set(topicsAll().map((t) => t.id)); return [...CN.topics].filter((t) => all.has(t)); };
  function connItems() {
    return allNodes.filter((n) => n.k !== "point" && n.k !== "hub" && n.k !== "core" && n.k !== "day").map((n) => ({ id: n.id, topic: topicOf(n), label: n.l, text: tclip([n.text || n.d, n.ex, n.sample, (n.tips || []).join(" ")].filter(Boolean).join(" "), 700), tags: n.tags }));
  }
  function connScope() {
    const sel = topicSel(), c = colOf(S.scope);
    if (sel.length >= 2) return { topics: sel, one: null };
    if (sel.length === 1) return { topics: null, one: sel[0] };
    return { topics: c ? c.topics : null, one: null };
  }
  function connInputs() {
    const mode = CN.mode, known = mode === "contradict" ? new Set(["CONTRADICTS", "CRITIQUES", "REJECTS", "CONTRASTS"]) : null;
    const links = edges.filter((e) => (known ? known.has(e.rel) : e.group !== "structure" && e.group !== "lexical")).map((e) => [e.s, e.t]);
    const skip = new Set(U.dismissed.filter((k) => (mode === "contradict") === k.startsWith("c:")).map((k) => k.replace(/^c:/, "")));
    return { items: connItems(), links, skip };
  }
  const BI = new Set(["eng", "phil"]);
  function runConn() {
    CN.busy = true; CN.ai = ""; renderConn();
    setTimeout(() => {
      const { items, links, skip } = connInputs(), sc = connScope();
      let res = (CN.mode === "contradict" ? contradictions : suggest)(items, links, { topics: sc.topics, skip, limit: 300, only: CN.only });
      if (CN.mode === "similar") res = res.filter((r) => { const A = raw.get(r.a), B = raw.get(r.b); if (BI.has(topicOf(A)) && BI.has(topicOf(B))) return r.why.title || r.why.words.length >= 3 || r.why.tags.length || r.why.via.length; return true; });
      if (sc.one) res = res.filter((r) => topicOf(raw.get(r.a)) === sc.one || topicOf(raw.get(r.b)) === sc.one);
      CN.res = res.slice(0, 25); CN.busy = false; if (S.tool === "conn") renderConn();
    }, 30);
  }
  const pairCtx = (list) => list.map((r, i) => { const A = raw.get(r.a), B = raw.get(r.b); return { l: `Pair ${i + 1}: ${clip(A.l, 50)} <-> ${clip(B.l, 50)}`, k: "pair", d: `A [${topicInfo(topicOf(A))?.label}]: ${tclip(A.text || A.d, 250)} || B [${topicInfo(topicOf(B))?.label}]: ${tclip(B.text || B.d, 250)}` }; });
  async function aiJudge() {
    if (!aiOk()) return toast("Connect AI in Settings first.");
    if (!CN.res?.length || CN.aiBusy) return;
    CN.aiBusy = true; renderConn();
    const list = CN.res.slice(0, 10);
    try {
      const r = await cb.ask("judge", pairCtx(list), { topic: "judge" });
      for (const v of r?.verdicts ?? []) if (list[v.i - 1]) list[v.i - 1].ai = { verdict: v.verdict, why: v.why };
      const rank = (x) => { const v = x.ai?.verdict; return !v ? 1 : v === (CN.mode === "contradict" ? "contradicts" : "similar") ? 0 : v === "complements" ? 2 : 3; };
      CN.res = CN.res.map((x, i) => [x, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map((x) => x[0]);
      CN.ai = r?.answer || "";
    } catch (e) { toast("AI could not judge: " + String(e?.message || "").slice(0, 90)); }
    CN.aiBusy = false; if (S.tool === "conn") renderConn();
  }
  async function aiDiscover() {
    if (!aiOk()) return toast("Connect AI in Settings first.");
    if (CN.aiBusy) return;
    CN.aiBusy = true; CN.ai = ""; renderConn();
    try {
      const { items, links, skip } = connInputs(), sc = connScope();
      const seeds = [], seen = new Set();
      const cand = (CN.mode === "contradict" ? contradictions : suggest)(items, links, { topics: sc.topics, skip, limit: 60, minShared: 1 });
      for (const r of cand) for (const id of [r.a, r.b]) if (!seen.has(id) && seeds.length < 16) { seen.add(id); seeds.push(id); }
      const pool = items.filter((i) => (sc.topics ? sc.topics.includes(i.topic) : true) && !seen.has(i.id)).sort((a, b) => deg(b.id) - deg(a.id));
      for (const i of pool) { if (seeds.length >= 16) break; seeds.push(i.id); }
      const ctx = seeds.map((id) => { const n = raw.get(id); return { l: n.l, k: topicInfo(topicOf(n))?.label || "", d: tclip(n.text || n.d, 460) }; });
      const r = await cb.ask("discover", ctx, { topic: "discover", name: CN.mode });
      const out = [], verdict = CN.mode === "contradict" ? "contradicts" : "similar", used = new Set();
      for (const p of r?.pairs ?? []) {
        const a = seeds[p.a - 1], b = seeds[p.b - 1]; if (!a || !b || a === b) continue;
        const key = [a, b].sort().join("|"); if (used.has(key) || skip.has(key) || topicOf(raw.get(a)) === topicOf(raw.get(b))) continue;
        if (links.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) continue;
        used.add(key); out.push({ a, b, score: 1, why: { words: [], tags: [], title: false, via: [], cues: [] }, ai: { verdict, why: p.why } });
      }
      CN.res = out; CN.ai = r?.answer || (out.length ? "" : "The AI found no solid pairs in the notes it was shown.");
    } catch (e) { toast("AI could not search: " + String(e?.message || "").slice(0, 90)); }
    CN.aiBusy = false; if (S.tool === "conn") renderConn();
  }
  function openConn(mode, topics = [], run = true) {
    CN.mode = mode; CN.topics = new Set(topics); CN.only = null; CN.res = null; CN.ai = "";
    if (S.tool !== "conn") showPop("conn"); else { renderConn(); }
    if (run && mode !== "link") runConn();
  }
  function renderConn() {
    pop.classList.add("wide");
    const mode = CN.mode, M = MODE[mode], tops = topicsAll(), sel = topicSel();
    const chip = (id) => { const n = raw.get(id); return `<button class="cn-n" data-go="${esc(id)}" title="Show in the map">${dot(n.k)}<span>${esc(clip(n.l, 34))}</span><small>${esc(topicInfo(topicOf(n))?.label ?? "")}</small></button>`; };
    const why = (w) => [w.title ? "same name" : "", w.words.length ? "both mention " + w.words.slice(0, 4).join(", ") : "", w.tags.length ? "tags " + w.tags.map((t) => "#" + t).join(" ") : "", w.via.length ? "both link to " + w.via.map((v) => raw.get(v)?.l).filter(Boolean).join(", ") : "", w.cues?.length ? "signals: " + w.cues.join("; ") : ""].filter(Boolean).join(" · ");
    const VL = { similar: "AI: similar", contradicts: "AI: contradicts", complements: "AI: related, not the same", unrelated: "AI: unrelated" };
    let body = "";
    if (mode === "link") {
      const side = (k) => { const id = CN.link[k]; return id && raw.has(id) ? `<div class="ln-pick">${chip(id)}<button class="gcbtn ghost" data-lclear="${k}" aria-label="Change">✕</button></div>` : `<div class="ln-find"><input data-lq="${k}" placeholder="${k === "a" ? "First idea…" : "Second idea…"} (type to search)" autocomplete="off" aria-label="${k === "a" ? "First idea" : "Second idea"}"><div class="ln-res" id="lres-${k}"></div></div>`; };
      body = `<div class="ln">${side("a")}<div class="ln-rel"><select id="lnRel" aria-label="Relation">${[["SIMILAR", "is similar to"], ["CONTRADICTS", "contradicts"], ["SUPPORTS", "supports"], ["RELATED", "is related to"]].map(([v, l]) => `<option value="${v}" ${CN.link.rel === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>${side("b")}<input id="lnNote" maxlength="200" placeholder="Why? (optional note)" value="${esc(CN.link.note)}" aria-label="Note"><div class="gcrow"><button class="gcbtn primary" id="lnGo" ${CN.link.a && CN.link.b ? "" : "disabled"}>Link these ideas</button></div></div><p class="sub">You can also type in Ask: “link Samsara with Rock cycle” or “Karma contradicts Fatalism”.</p>`;
    } else {
      const hint = sel.length === 0 ? "Comparing all topics with each other." : sel.length === 1 ? `Comparing “${esc(topicInfo(sel[0])?.label)}” with every other topic.` : `Comparing ${sel.length} topics with each other.`;
      const cards = CN.busy ? '<p class="sub">Looking…</p>' : CN.res ? (CN.res.length ? CN.res.map((r, i) => `<div class="cn-card ${r.ai?.verdict === "unrelated" ? "dim" : ""}" data-i="${i}"><div class="cn-pair">${chip(r.a)}<span class="cn-x">${mode === "contradict" ? "⇄" : "↔"}</span>${chip(r.b)}</div>${r.ai ? `<p class="cn-ai" data-v="${r.ai.verdict}"><b>${VL[r.ai.verdict] ?? "AI"}</b> ${esc(r.ai.why)}</p>` : ""}<p class="cn-why">${esc(why(r.why))}</p><div class="gcrow"><button class="gcbtn primary" data-cn="accept">${M.accept}</button><button class="gcbtn" data-cn="spark">✦ Spark an idea</button><button class="gcbtn ghost" data-cn="no">${M.no}</button></div></div>`).join("") : `<p class="sub">Nothing found for this choice. ${mode === "contradict" ? "Offline matching needs wording like “not”, “rejects” or opposite terms; the AI search can read meaning." : "Add more notes, share #tags, or try the AI search."}</p>`) : "";
      body = `<div class="cn-topics" role="group" aria-label="Topics to compare">${tops.map((t) => `<label class="tchip ${CN.topics.has(t.id) ? "on" : ""}"><input type="checkbox" data-cntopic="${esc(t.id)}" ${CN.topics.has(t.id) ? "checked" : ""}><span>${esc(t.label)}</span></label>`).join("")}${sel.length ? '<button class="tchip clear" data-cnall>All topics</button>' : ""}</div><p class="sub tight">${hint}</p>
        <div class="gcrow wrap"><button class="gcbtn primary" id="cnFind">${CN.res ? "Search again" : "Find " + M.word}</button><button class="gcbtn" id="cnAI" ${CN.aiBusy ? "disabled" : ""} title="${aiOk() ? "The AI reads the notes and proposes pairs" : "Connect an AI in Settings to use this"}">${CN.aiBusy ? "AI is reading…" : "✦ Ask AI to find"}</button>${CN.only ? '<button class="gcbtn ghost" id="cnAll">All nodes</button>' : ""}</div>
        ${CN.res?.length && aiOk() && !CN.aiBusy ? '<button class="lnk" id="cnJudge">Check these with AI</button>' : ""}${CN.ai ? `<p class="cn-sum">${esc(CN.ai)}</p>` : ""}
        <div class="cn-list" aria-live="polite">${cards}</div>`;
    }
    const REL_L = { SIMILAR: "≈", CONTRADICTS: "⇄", SUPPORTS: "→", RELATED: "↔" };
    const mine = U.bridges.filter((b) => raw.has(b.a) && raw.has(b.b));
    pop.innerHTML = `<h3>Connections</h3><div class="seg wide cn-modes" role="tablist">${[["similar", "Similar ideas"], ["contradict", "Contradictions"], ["link", "Link ideas"]].map(([k, l]) => `<button data-cnmode="${k}" class="${mode === k ? "on" : ""}" role="tab" aria-selected="${mode === k}">${l}</button>`).join("")}</div>
      <p class="sub">${mode === "link" ? "Tell the app that two ideas are related, similar or opposed. It draws the link between them, in any topics." : CN.only && raw.has(CN.only) ? `Looking at <b>${esc(raw.get(CN.only).l)}</b> against other topics. ${M.intro}` : M.intro}</p>${body}
      ${mine.length ? `<details class="cn-mine"><summary>Your connections · ${mine.length}</summary>${mine.map((b, i) => `<div class="cn-row"><span>${esc(clip(raw.get(b.a).l, 22))} <b class="rl" data-r="${b.rel || "RELATED"}">${REL_L[b.rel || "RELATED"]}</b> ${esc(clip(raw.get(b.b).l, 22))}</span><button class="gcbtn ghost" data-cn-del="${i}" title="Remove this connection">Remove</button></div>`).join("")}</details>` : ""}`;
  }
  const sparkFrom = (r) => { const A = raw.get(r.a), B = raw.get(r.b), dr = ideaDraft({ label: A.l }, { label: B.l }, r.why, CN.mode), t = U.topics.find((x) => norm(x.label) === "new ideas"); return { title: dr.title, text: dr.text, topic: t ? t.id : "__ideas", spark: true, from: [r.a, r.b] }; };
  async function aiSharpen() {
    const f = modal.querySelector("#mfNote"); if (!f || !ED.from) return;
    const btn = modal.querySelector('[data-m="ai"]'); btn.disabled = true; btn.textContent = "Thinking…";
    const ctx = ED.from.flatMap((id) => ctxFor(raw.get(id)).slice(0, 5));
    try {
      const A = raw.get(ED.from[0]).l, B = raw.get(ED.from[1]).l;
      const r = await cb.ask(`Using only the notes provided, propose one new concept that connects “${A}” and “${B}”. Give a short name, a two-sentence definition and one question worth exploring. Cite notes as [1], [2].`, ctx, { topic: "notes", name: "ideas" });
      if (r?.answer) { f.text.value = (f.text.value.trim() + "\n\nAI suggestion (check it before you keep it):\n" + String(r.answer).replace(/\[\d+(?:\s*,\s*\d+)*\]/g, "").trim()).slice(0, 20000); toast("AI suggestion added to your note."); }
      else toast("AI did not return an answer.");
    } catch (e) { toast("AI could not answer: " + String(e?.message || "").slice(0, 80)); }
    btn.disabled = false; btn.textContent = "Ask AI to sharpen";
  }
  // ---- events
  const strip = $("#gcTopics");
  strip.addEventListener("click", (e) => { const t = e.target.closest("[data-topic]"); if (t) { if (S.lens !== "explore") setLens("explore"); setScope(t.dataset.topic || null); renderEmpty(); } });
  const actions = {
    "new-topic": () => newTopicModal(), "combine": () => combineModal(), "library": () => libraryModal(),
    "connections": () => { if (S.tool === "conn") { showPop("conn"); return; } const k = topicKeyOf(S.scope); CN.topics = new Set(k ? [S.scope] : []); CN.only = null; CN.res = null; CN.ai = ""; showPop("conn"); },
    "new-note": (b) => { const t = b?.dataset.topic; noteModal(t ? { topic: t } : {}); },
    "note-about": (b) => { const n = raw.get(b.dataset.id); if (!n) return; noteModal({ title: "", text: `About [[${n.l}]]\n\n` }); },
    "create-note": (b) => { closeModal(); noteModal({ title: b.dataset.title, topic: b.dataset.topic }); },
    "edit-note": (b) => { const n = raw.get(b.dataset.id); if (n?.nid) noteModal({ id: n.nid }); },
    "relate": (b) => { CN.only = b.dataset.id; CN.topics = new Set(); CN.res = null; CN.ai = ""; if (CN.mode === "link") CN.mode = "similar"; if (S.tool !== "conn") showPop("conn"); else runConn(); },
    "import-into": (b) => { closeModal(); const t = U.topics.find((x) => x.id === b.dataset.id); if (!t) return; openModal(`${mHead("Add text to " + esc(t.label), "Paste text or upload files. They become small notes in this topic.")}<form id="mfImport" class="mform" data-topic="${esc(t.id)}"><label>Paste text<textarea name="paste" rows="7" autofocus></textarea></label><label>Or upload files <small>.txt .md</small><input type="file" name="files" accept=".txt,.md,.markdown,.json,text/plain" multiple></label><div class="mf"><button type="button" class="gcbtn" data-m="close">Cancel</button><button class="gcbtn primary" type="submit">Add to topic</button></div></form>`, "wide"); },
    "rename-topic": (b) => { const t = U.topics.find((x) => x.id === b.dataset.id); if (!t) return; const v = prompt("New name for this topic:", t.label); if (v && v.trim()) { t.label = v.trim().slice(0, 40); t.updated = Date.now(); afterDataChange(); libraryModal(); } },
    "del-topic": (b) => { const t = U.topics.find((x) => x.id === b.dataset.id); if (!t) return; const n = U.notes.filter((x) => x.topic === t.id).length; if (!confirm(`Delete the topic “${t.label}” and its ${n} note${n === 1 ? "" : "s"}? Download a backup first if unsure. This cannot be undone.`)) return; const ids = new Set(U.notes.filter((x) => x.topic === t.id).map((x) => "u:" + x.id)); tomb("t:" + t.id); U.notes.filter((x) => x.topic === t.id).forEach((x) => tomb("n:" + x.id)); U.bridges.filter((x) => ids.has(x.a) || ids.has(x.b)).forEach(tombB); U.topics = U.topics.filter((x) => x.id !== t.id); U.notes = U.notes.filter((x) => x.topic !== t.id); U.bridges = U.bridges.filter((x) => !ids.has(x.a) && !ids.has(x.b)); U.cols.forEach((c) => { c.topics = c.topics.filter((x) => x !== "u:" + t.id); }); U.cols = U.cols.filter((c) => c.topics.length > 1); if (S.scope === "u:" + t.id) S.scope = null; afterDataChange({ scope: S.scope }); libraryModal(); },
    "del-col": (b) => { tomb("c:" + b.dataset.id); U.cols = U.cols.filter((c) => c.id !== b.dataset.id); if (S.scope === "c:" + b.dataset.id) S.scope = null; afterDataChange({ scope: S.scope }); libraryModal(); },
    "cloud-sync": () => cloudSync(true),
    "export": () => { exportBackup(); toast("Backup downloaded."); },
  };
  root.addEventListener("click", (e) => { const b = e.target.closest("[data-act]"); if (!b || !root.contains(b)) return; const f = actions[b.dataset.act]; if (f) { e.preventDefault(); f(b); } });
  modal.addEventListener("click", (e) => {
    if (e.target === modal || e.target.closest('[data-m="close"]')) { if (e.target.closest("[data-go]")) { /* let the go handler run */ } closeModal(); return; }
    if (e.target.closest('[data-m="del"]')) return deleteNote();
    if (e.target.closest('[data-m="ai"]')) return aiSharpen();
    const ins = e.target.closest("[data-ins]"); if (ins) { const ta = modal.querySelector("textarea[name=text]"), s = ta.selectionStart ?? ta.value.length, v = `[[${ins.dataset.ins}]]`; ta.value = ta.value.slice(0, s) + v + ta.value.slice(ta.selectionEnd ?? s); ta.focus(); ta.setSelectionRange(s + v.length, s + v.length); modal.querySelector("#mfFind").value = ""; modal.querySelector("#mfFound").innerHTML = ""; }
  });
  modal.addEventListener("input", (e) => {
    if (e.target.id !== "mfFind") return;
    const q = norm(e.target.value), out = modal.querySelector("#mfFound"); if (!q) { out.innerHTML = ""; return; }
    const r = allNodes.filter((n) => n.k !== "point" && n.k !== "core" && n.k !== "hub" && norm(n.l).includes(q) && "u:" + ED.id !== n.id).sort((a, b) => (norm(a.l).startsWith(q) ? 0 : 1) - (norm(b.l).startsWith(q) ? 0 : 1)).slice(0, 6);
    out.innerHTML = r.length ? r.map((n) => `<button type="button" class="res" data-ins="${esc(n.l)}">${dot(n.k)}<span class="rl">${esc(clip(n.l, 44))}</span><small>${esc(topicInfo(topicOf(n))?.label ?? "")}</small></button>`).join("") : `<div class="none">No match. You can still type [[${esc(e.target.value)}]] to start a new idea.</div>`;
  });
  modal.addEventListener("change", async (e) => {
    if (e.target.id !== "libRestore") return;
    const f = e.target.files?.[0]; if (!f) return;
    try { const j = JSON.parse(await f.text()); if (!j || (!j.topics && !j.notes)) throw new Error("not a backup"); const m = mergeState(U, j, { revive: true }); U = m.state; closeModal(); afterDataChange(); toast(`Restored: ${m.addedT} topic${m.addedT === 1 ? "" : "s"}, ${m.addedN} note${m.addedN === 1 ? "" : "s"} added.`); }
    catch (err) { toast("That file is not a SpeakCosmos backup."); }
  });
  modal.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.id === "mfTopic") return submitTopic(f);
    if (f.id === "mfNote") return saveNote(f);
    if (f.id === "mfCombine") {
      const ts = [...f.querySelectorAll("input[name=t]:checked")].map((x) => x.value);
      if (ts.length < 2) { toast("Pick at least two topics."); return; }
      let id = slug(f.name.value), k = 1; while (U.cols.some((c) => c.id === id)) id = slug(f.name.value) + "-" + ++k;
      U.cols.push({ id, label: f.name.value.trim().slice(0, 40), topics: ts, t: Date.now() }); closeModal(); afterDataChange({ scope: "c:" + id }); toast("Combined view created."); return;
    }
    if (f.id === "mfImport") {
      const tk = f.dataset.topic, r = await readFiles([...(f.files.files || [])]), notes = [...textToNotes(U.topics.find((x) => x.id === tk)?.label, f.paste.value), ...r.notes];
      for (const b of r.backups) U = mergeState(U, b, { revive: true }).state;
      const c = addNotes(tk, notes); closeModal(); afterDataChange({ scope: "u:" + tk }); toast(`Added ${c} note${c === 1 ? "" : "s"}.`);
    }
  });
  const addBridge = (a, b, rel, note = "") => { if (!a || !b || a === b || U.bridges.some((x) => x.rel === rel && ((x.a === a && x.b === b) || (x.a === b && x.b === a)))) return false; U.bridges.push({ a, b, rel, note: String(note).slice(0, 200), t: Date.now() }); return true; };
  pop.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset?.cntopic) { t.checked ? CN.topics.add(t.dataset.cntopic) : CN.topics.delete(t.dataset.cntopic); CN.res = null; CN.ai = ""; renderConn(); }
    if (t.id === "lnRel") CN.link.rel = t.value;
  });
  pop.addEventListener("input", (e) => {
    const t = e.target;
    if (t.id === "lnNote") { CN.link.note = t.value; return; }
    if (!t.dataset?.lq) return;
    const q = norm(t.value), out = pop.querySelector("#lres-" + t.dataset.lq); if (!out) return;
    if (!q) { out.innerHTML = ""; return; }
    const r = allNodes.filter((n) => n.k !== "point" && n.k !== "core" && n.k !== "hub" && norm(n.l).includes(q)).sort((a, b) => (norm(a.l).startsWith(q) ? 0 : 1) - (norm(b.l).startsWith(q) ? 0 : 1)).slice(0, 6);
    out.innerHTML = r.length ? r.map((n) => `<button type="button" class="res" data-lpick="${esc(n.id)}" data-side="${t.dataset.lq}">${dot(n.k)}<span class="rl">${esc(clip(n.l, 36))}</span><small>${esc(topicInfo(topicOf(n))?.label ?? "")}</small></button>`).join("") : '<div class="none">No match</div>';
  });
  pop.addEventListener("click", (e) => {
    if (S.tool !== "conn") return;
    const md = e.target.closest("[data-cnmode]"); if (md) { CN.mode = md.dataset.cnmode; CN.res = null; CN.ai = ""; renderConn(); if (CN.mode !== "link") runConn(); return; }
    if (e.target.closest("[data-cnall]")) { CN.topics.clear(); CN.res = null; renderConn(); return; }
    if (e.target.closest("#cnFind")) { runConn(); return; }
    if (e.target.closest("#cnAI")) { aiDiscover(); return; }
    if (e.target.closest("#cnJudge")) { aiJudge(); return; }
    if (e.target.closest("#cnAll")) { CN.only = null; CN.res = null; renderConn(); return; }
    const lp = e.target.closest("[data-lpick]"); if (lp) { CN.link[lp.dataset.side] = lp.dataset.lpick; renderConn(); return; }
    const lc = e.target.closest("[data-lclear]"); if (lc) { CN.link[lc.dataset.lclear] = null; renderConn(); return; }
    if (e.target.closest("#lnGo")) { const { a, b, rel, note } = CN.link; if (addBridge(a, b, rel, note)) { CN.link = { a: null, b: null, rel, note: "" }; afterDataChange(); toast("Linked."); renderConn(); } else toast("Those two are already linked that way."); return; }
    const del = e.target.closest("[data-cn-del]"); if (del) { const mine = U.bridges.filter((b) => raw.has(b.a) && raw.has(b.b)), b = mine[+del.dataset.cnDel]; if (b) { tombB(b); U.bridges = U.bridges.filter((x) => x !== b); afterDataChange(); } return; }
    const btn = e.target.closest("[data-cn]"); if (!btn) return;
    const card = btn.closest(".cn-card"), r = CN.res?.[+card.dataset.i]; if (!r) return;
    const key = [r.a, r.b].sort().join("|");
    if (btn.dataset.cn === "accept") { addBridge(r.a, r.b, MODE[CN.mode].rel, r.ai?.why || ""); CN.res = CN.res.filter((x) => x !== r); afterDataChange(); toast(CN.mode === "contradict" ? "Marked. The contradiction shows as a red line." : "Connected. The link now shows in the map."); }
    else if (btn.dataset.cn === "no") { U.dismissed.push((CN.mode === "contradict" ? "c:" : "") + key); CN.res = CN.res.filter((x) => x !== r); syncUser({ persist: true }); renderConn(); }
    else if (btn.dataset.cn === "spark") { noteModal(sparkFrom(r)); }
  });

  // ── events ────────────────────────────────────────────────────────────────────────────────────────────────
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-nav]"); if (b) { const v = b.dataset.nav; if (v === "cosmos") { select(null); camCmd("fit"); } else cb.navigate(v); return; }
    const go = e.target.closest("[data-go]"); if (go) { if (!raw.has(go.dataset.go)) return; ensureVisible(go.dataset.go); S.hidden.delete(raw.get(go.dataset.go).k); S.highlight = null; select(go.dataset.go, { fly: true }); if (S.mode === "whole") flyTo(go.dataset.go); return; }
    const res = e.target.closest("[data-res]"); if (res) { pick(results[+res.dataset.res]); return; }
    const cam = e.target.closest("[data-cam]"); if (cam) { camCmd(cam.dataset.cam); return; }
    const kind = e.target.closest(".lg-row"); if (kind) { const k = kind.dataset.kind; S.hidden.has(k) ? S.hidden.delete(k) : S.hidden.add(k); if (S.selected && S.hidden.has(raw.get(S.selected)?.k)) { S.selected = null; renderInspector(); } apply(); return; }
    if (e.target.closest("#gcLg")) { S.legend = !S.legend; renderLegend(); return; }
    const mode = e.target.closest("[data-mode]"); if (mode) { S.mode = mode.dataset.mode; apply({ frame: true }); if (S.mode === "whole" && S.selected) flyTo(S.selected); else if (S.mode === "whole") camCmd("fit"); return; }
    const dep = e.target.closest("[data-depth]"); if (dep) { S.depth = +dep.dataset.depth; apply({ frame: true }); return; }
    if (e.target.closest("#gcDisplay")) return showPop("display");
    if (e.target.closest("#gcPath")) return showPop("path");
    const col = e.target.closest("[data-color]"); if (col) { S.colorBy = col.dataset.color; visuals.clear(); materials.clear(); fg.nodeThreeObject((g) => nodeObject(g)); apply(); renderDisplay(); return; }
    if (e.target.closest("#gcTheme")) { S.dark = !S.dark; store("sc_theme", S.dark ? "dark" : "light"); applyTheme(); buildScene(); visuals.clear(); materials.clear(); marks.pointLabels.clear(); marks.sel = null; fg.nodeThreeObject((g) => nodeObject(g)); apply(); if (S.selected) renderInspector(); return; }
    if (e.target.closest("#gcFind")) { runPath($("#gcFrom").value, $("#gcTo").value); return; }
    if (e.target.closest("#gcClear")) { clearPath(); return; }
    const pr = e.target.closest("[data-preset]"); if (pr) { const p = presetList()[+pr.dataset.preset]; if (!p) return; pathState.from = raw.get(p.from).l; pathState.to = raw.get(p.to).l; runPath(raw.get(p.from), raw.get(p.to)); return; }
  });
  root.addEventListener("change", (e) => {
    const ed = e.target.closest("[data-edge]"); if (ed) { S.edgeGroups[ed.dataset.edge] = ed.checked; apply(); return; }
    if (e.target.id === "gcSpinChk") setSpin(e.target.checked);
  });
  const onKey = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); qEl.focus(); qEl.select(); }
    else if (e.key === "Escape" && !modal.hidden) closeModal();
    else if (e.key === "Escape" && !$("#gcHelpM").hidden) showHelp(false);
    else if (e.key === "Escape" && document.activeElement !== qEl) { if (S.tool) showPop(S.tool); else if (S.highlight) clearPath(); else if (S.selected) select(null); }
  };
  document.addEventListener("keydown", onKey);
  const ro = new ResizeObserver(() => { const w = stage.clientWidth, h = stage.clientHeight; if (w > 50 && h > 50) { fg.width(w).height(h); applyViewOffset(); wake(500); } });
  ro.observe(stage);
  const onVis = () => { if (document.hidden) { fg.pauseAnimation(); sleeping = true; if (saveState === "saving") userStore.flush(U); } else wake(1200); };
  const onHide = () => { if (saveState === "saving") userStore.flush(U); };
  window.addEventListener("pagehide", onHide);
  document.addEventListener("visibilitychange", onVis);
  ["pointerdown", "pointermove", "wheel", "touchstart"].forEach((ev) => stage.addEventListener(ev, () => wake(ev === "pointermove" ? 900 : 1500), { passive: true }));

  // ── start ─────────────────────────────────────────────────────────────────────────────────────────────────
  fg.width(stage.clientWidth || 800).height(stage.clientHeight || 600);
  buildScene(); controlsInit(); $("#gcSpin").classList.toggle("on", S.autoRotate);
  const startId = new URLSearchParams(location.search).get("node");
  apply();
  startLoop();
  if (new URLSearchParams(location.search).get("lens") === "course") setLens("course");
  else if (["phil", "eng"].includes(new URLSearchParams(location.search).get("scope"))) { setScope(new URLSearchParams(location.search).get("scope")); if (startId && raw.has(startId)) setTimeout(() => select(startId), 600); }
  else if (new URLSearchParams(location.search).get("lens") === "lineage") { if (startId && raw.has(startId)) L.focus = startId; setLens("lineage"); }
  else if (startId && raw.has(startId)) setTimeout(() => select(startId), 200);

  // your own topics load after the first picture is on screen, so the app never waits on storage
  renderTopics(); syncTabs();
  const wantScope = new URLSearchParams(location.search).get("scope");
  userStore.load().then((st) => {
    if (destroyed) return;
    U = normalize(st); userReady = true; syncUser(); renderTopics();
    saveState = userStore.kind === "memory" ? "unsafe" : "saved"; chromeSave();
    if (wantScope && (wantScope.startsWith("u:") || wantScope.startsWith("c:")) && (colOf(wantScope) || topicInfo(wantScope))) { setScope(wantScope); if (startId && raw.has(startId)) setTimeout(() => select(startId), 700); }
    else { apply({ frame: false }); if (startId && raw.has(startId) && !S.selected && !wantScope) select(startId); }
    renderEmpty(); wake(1200);
    if (cloudOn()) cloudSync(false); else if (cb.cloud) { CL.state = "off"; chromeSave(); }
    if (!read("sc_intro_topics") && !U.topics.length) { store("sc_intro_topics", "1"); setTimeout(() => toast("New: add your own topics with + Topic, then link them with Connections.", 7000), 1500); }
  }).catch(() => { userReady = true; renderTopics(); });

  return {
    refresh() { renderInspector(); chrome(); if (askSt.open) renderAsk(); },
    destroy() {
      destroyed = true; cancelAnimationFrame(raf); clearTimeout(hoverTimer);
      document.removeEventListener("keydown", onKey); linRo.disconnect(); window.removeEventListener("beforeinstallprompt", onBip); window.removeEventListener("appinstalled", onBip); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("pagehide", onHide); if (saveState === "saving") userStore.flush(U); clearTimeout(toastT); ro.disconnect();
      try { fg.pauseAnimation(); fg._destructor?.(); fg.renderer().dispose(); fg.renderer().forceContextLoss?.(); } catch (e) {}
      root.innerHTML = "";
    },
  };
}
window.SpeakCosmos3D = { mount };
