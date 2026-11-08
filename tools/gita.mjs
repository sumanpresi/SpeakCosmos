// Adds the Bhagavad Gita (from Gita Lessons / GitaViśva, MIT) to the cosmos graph as its own built-in topic "gita".
import fs from "node:fs";
const SRC = "/home/claude/gita/public/data", OUT = "/home/claude/speakcosmos/assets";
const G = JSON.parse(fs.readFileSync(OUT + "/cosmos-graph.json", "utf8"));
const gg = JSON.parse(fs.readFileSync(SRC + "/gita-graph.json", "utf8")), lay = JSON.parse(fs.readFileSync(SRC + "/gita-layout.json", "utf8")).positions;
const vs = JSON.parse(fs.readFileSync(SRC + "/gita-verses.json", "utf8"));
// idempotent: drop an earlier import
const isG = (n) => n.t === "gita"; const dropIds = new Set(G.nodes.filter(isG).map((n) => n.id));
G.nodes = G.nodes.filter((n) => !isG(n)); G.edges = G.edges.filter(([s, t]) => !dropIds.has(s) && !dropIds.has(t));
const R = 0.92, q = (id) => (lay[id] || [0, 0, 0]).map((x) => Math.round(x * R * 10) / 10);
const clip = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s; };
const chap = new Map(vs.chapters.map((c) => [c.number, c])); const iast = new Map(vs.verses.map((v) => [v.id, v]));
const CHC = ["#e0a030", "#d9822b", "#c9682f"]; const out = [], ed = [];
const add = (n) => { n.t = "gita"; n.p = n.q; out.push(n); };
const cats = { ethics: "Dharma & Ethics", action: "Path of Action", knowledge: "Path of Knowledge", devotion: "Path of Devotion", practice: "Discipline & Practice", metaphysics: "Metaphysics", cosmology: "Cosmology & Gunas", psychology: "Inner Instruments" };
const members = new Map();
const hub = (id, l, d, c) => { members.set(id, []); return { id, k: "hub", l, d, c, q: [0, 0, 0] }; };
const hubs = {
  main: hub("gh:gita", "Bhagavad Gita", "The 701 verses, the ideas they teach, the states of mind they heal and the situations they answer. From Gita Lessons (GitaViśva).", "#e0a030"),
  states: hub("gh:states", "Gita: states of mind", "Afflictive and healing mental states named in the Gita.", "#d1507a"),
  situ: hub("gh:situations", "Gita: life situations", "Timeless human situations the verses speak to.", "#3b82c4"),
  people: hub("gh:people", "Gita: speakers and persons", "Who speaks, and who is spoken about.", "#a0652d"),
};
for (const [k, l] of Object.entries(cats)) hubs[k] = hub("gh:" + k, "Gita ideas: " + l, "Concepts of the Gita in this group: " + l + ".", "#c9a227");
for (const n of gg.nodes) {
  const id = n.id, Q = q(id);
  if (n.type === "Chapter") { const c = chap.get(n.number); const h = { id, k: "hub", l: `Gita ${n.number} · ${n.title}`, d: clip(c?.summary?.en || n.summary, 260), sub: `${n.meaning} · ${n.verseCount} verses`, c: CHC[n.number % 3], q: Q, text: `${n.title} ${n.iast} ${n.meaning} ${clip(c?.summary?.en, 600)}` }; add(h); ed.push([id, "gh:gita", "BELONGS_TO"]); }
  else if (n.type === "Verse") { const v = iast.get(id); add({ id, k: "verse", l: `BG ${n.ref}`, d: clip(n.snippet, 220), sub: `Chapter ${n.chapter} · verse ${n.verse}`, g: "CH_" + n.chapter, text: clip(n.snippet, 420) + " " + (v ? v.iast.join(" ") : ""), q: Q }); }
  else if (n.type === "SanskritConcept") { const h = n.category in cats ? n.category : "ethics"; add({ id, k: "idea", l: n.label, d: clip(n.desc, 260), sub: `${n.sa} · ${n.en}`, g: "gh:" + h, text: clip(n.desc, 500) + " " + n.iast + " " + n.en, q: Q }); members.get("gh:" + h).push(Q); ed.push([id, "gh:" + h, "BELONGS_TO"]); }
  else if (n.type === "Emotion") { add({ id, k: "state", l: n.label, d: clip(n.desc, 260), sub: `${n.sa} · ${n.en} · ${n.valence}`, g: "gh:states", text: clip(n.desc, 400) + " " + (n.modern || "") + " " + (n.lexicon || []).join(" "), q: Q }); members.get("gh:states").push(Q); ed.push([id, "gh:states", "BELONGS_TO"]); }
  else if (n.type === "LifeDilemma") { add({ id, k: "situation", l: n.label, d: clip(n.desc, 260), sub: n.sa || "Life situation", g: "gh:situations", text: clip(n.desc, 400) + " " + (n.keywords || []).join(" "), q: Q }); members.get("gh:situations").push(Q); ed.push([id, "gh:situations", "BELONGS_TO"]); }
  else if (n.type === "Character") { add({ id, k: "thinker", l: n.label, d: clip(n.role + ". " + n.desc, 260), sub: `${n.sa} · speaks ${n.versesSpoken} verses`, g: "gh:people", text: clip(n.role + " " + n.desc, 400), q: Q }); members.get("gh:people").push(Q); ed.push([id, "gh:people", "BELONGS_TO"]); }
}
// hub positions: centroid of members
const cen = (a) => { if (!a.length) return [0, 0, 0]; const s = a.reduce((p, c) => [p[0] + c[0], p[1] + c[1], p[2] + c[2]], [0, 0, 0]); return s.map((x) => Math.round((x / a.length) * 10) / 10); };
for (const [id, h] of Object.entries(hubs)) { h.q = id === "main" ? [0, 0, 0] : cen(members.get(h.id)); add(h); if (id !== "main") ed.push([h.id, "gh:gita", "BELONGS_TO"]); }
const have = new Set(out.map((n) => n.id));
for (const e of gg.edges) { if (!have.has(e.source) || !have.has(e.target)) continue; if (e.type === "BELONGS_TO" && e.source.startsWith("BG_")) continue; ed.push([e.source, e.target, e.type]); }
// verses belong to their chapter hub
for (const n of out) if (n.k === "verse") ed.push([n.id, n.g, "BELONGS_TO"]);
G.nodes.push(...out); G.edges.push(...ed);
fs.writeFileSync(OUT + "/cosmos-graph.json", JSON.stringify(G));
// reader data, loaded only when a verse is opened
const rd = { meta: { source: "Gita Lessons / GitaViśva (MIT). Texts: The Gita Initiative, vedicscriptures. Recitations stream from holy-bhagavad-gita.org.", defaults: vs.meta.defaults }, authors: vs.authors, chapters: vs.chapters.map((c) => ({ id: c.id, number: c.number, name: c.name, iast: c.iast, title: c.title, meaning: c.meaning, verseCount: c.verseCount, summary: c.summary?.en, audio: c.audio })), threads: gg.threads, chains: gg.chains, dialogues: gg.dialogues.map((d) => ({ id: d.id, question: d.question, asker: d.asker, theme: d.theme, anchor: d.anchor, q: d.q, a: d.a })), verses: vs.verses.map((v) => ({ id: v.id, ref: v.ref, c: v.chapter, n: v.verse, sp: v.speaker, uv: v.uvacha?.iast || "", sa: v.sanskrit, ia: v.iast, tr: v.transliteration, wd: (v.padaccheda || []).map((p) => [p.w, p.m]), au: v.audio?.verse?.[0] || "", tl: v.translations })) };
fs.writeFileSync(OUT + "/gita/reader.json", JSON.stringify(rd));
fs.mkdirSync(OUT + "/gita/c", { recursive: true });
for (const f of fs.readdirSync(SRC + "/commentary")) { const j = JSON.parse(fs.readFileSync(SRC + "/commentary/" + f, "utf8")); fs.writeFileSync(OUT + "/gita/c/" + f, JSON.stringify(j.commentaries.map((c) => [c.authorId, c.author, c.school, c.lang, c.text]))); }
console.log("nodes", out.length, "edges", ed.length, "reader", (fs.statSync(OUT + "/gita/reader.json").size / 1e6).toFixed(2) + "MB");
