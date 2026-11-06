// Builds assets/cosmos-graph.json for SpeakCosmos: a typed knowledge graph from the app's own skills plus the
// speakwell content, with a PRECOMPUTED 3D layout (the same recipe GitaViśva uses: hubs fixed on a gently waved ring,
// the centre fixed, everything else placed by d3-force-3d with per-relation distances/strengths, then frozen).
// Usage: node gen-graph.mjs <base-index.html> <speakwell-dir> <out.json>
import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";
import { forceCenter, forceLink, forceManyBody, forceSimulation } from "d3-force-3d";

const [, , basePath, swDir, outPath, booksPath = new URL("./books.json", import.meta.url).pathname] = process.argv;

// ── source data ─────────────────────────────────────────────────────────────────────────────────────────────
const html = readFileSync(basePath, "utf8");
const a = html.indexOf("const groups = [");
const tStart = html.indexOf("const topics=[", a);
const tEnd = html.indexOf("\n];", tStart) + 3;
const app = vm.runInNewContext(html.slice(a, tEnd) + ";({groups,topics})", {});
const { groups, topics } = app;
const sandbox = { window: {} };
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const f of ["data-speak.js", "data-grammar.js", "data-write.js"]) vm.runInContext(readFileSync(`${swDir}/${f}`, "utf8"), sandbox);
const SW = sandbox.SW;

// ── helpers ─────────────────────────────────────────────────────────────────────────────────────────────────
const strip = (s) => String(s ?? "").replace(/<[^>]+>/g, "").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const STOP = new Set("about after again also because before being between could does doing each every from have into just like make more most much must need only other over same should some such than that their them then there these they this those very what when where which while will with would your you are the and for not use using used can its it's".split(" "));
const stems = (s) => new Set(strip(s).toLowerCase().match(/[a-z]{4,}/g)?.filter((w) => !STOP.has(w)).map((w) => w.slice(0, 5)) ?? []);

const nodes = [];
const edges = [];
const byId = new Map();
const add = (n) => (byId.set(n.id, n), nodes.push(n), n);
const link = (s, t, rel) => byId.has(s) && byId.has(t) && s !== t && edges.push([s, t, rel]);

// ── hubs: 21 constellations on the ring ─────────────────────────────────────────────────────────────────────
add({ id: "core", k: "core", l: "Spoken English", d: "Everything here connects to one skill: saying what you mean, clearly." });
const hubs = [];
const hub = (id, label, desc, color, extra = {}) => hubs.push(add({ id, k: "hub", l: label, d: desc, c: color, ...extra }));
for (const g of groups) hub("g:" + g.id, g.label, g.desc, g.color, { bn: g.bn, icon: g.icon });
const SCEN_COL = "#f4bf79", LES_COL = "#9da9ff";
for (const g of SW.scenarioGroups) hub("sg:" + g.id, g.name, "Speaking situations: " + g.name.toLowerCase() + ".", SCEN_COL);
for (const g of SW.lessonGroups) hub("lg:" + g.id, g.name, g.blurb, LES_COL);
hub("h:fw", "Thinking frameworks", "Reusable structures for organising what you say on the spot.", "#f4a6c3");
hub("h:drill", "Cognitive drills", "Fluency and word-retrieval exercises.", "#6ee7cc");
hub("h:word", "Confused words", "Pairs that are easy to mix up, with a sentence for each.", "#83c9f4");
const BOOKS = JSON.parse(readFileSync(booksPath, "utf8"));
hub("h:books", "Grammar library", `${BOOKS.length} grammar, usage and speaking books, each linked to the lessons and skills it explains or drills.`, "#e58ab0");
for (const h of hubs) link(h.id, "core", "ON_CORE");

// ── skills (the app's 35 topics) ────────────────────────────────────────────────────────────────────────────
for (const t of topics) {
  add({ id: "t:" + t.id, k: "skill", l: t.title, d: t.description, g: "g:" + t.group, tid: t.id, bn: t.bn, lvl: t.level, ex: t.example, bad: t.incorrect, good: t.correct, tips: t.tips });
  link("t:" + t.id, "g:" + t.group, "BELONGS_TO");
  const sk = "t:" + t.id, part = (suffix, sub, text, extra = {}) => { add({ id: `${sk}:${suffix}`, k: "point", sub, l: clip(text, 56), d: text, g: "g:" + t.group, ...extra }); link(`${sk}:${suffix}`, sk, "PART_OF"); };
  part("ex", "Expression", t.example, { good: t.example });
  part("mb", "Mistake", t.incorrect + " → " + t.correct, { bad: t.incorrect, good: t.correct });
  (t.tips || []).forEach((tip, i) => part("tip" + i, "Tip", tip));
}
// skills in a constellation follow each other in the order the app teaches them
for (const g2 of groups) {
  const list = topics.filter((t) => t.group === g2.id);
  for (let i = 1; i < list.length; i++) link("t:" + list[i - 1].id, "t:" + list[i].id, "NEXT_SKILL");
}
const SKILL_FW = { "point-reason-next": "prep", "answer-directly": "prep", "give-opinion": "prep", "tell-a-story": "star", "present-update": "ppf", "handle-question": "wsn", "explain-process": "three", "meeting-opening": "scqa", "why-what-next": "scqa", "polite-disagree": "pros" };


// ── lessons + their rules/examples ──────────────────────────────────────────────────────────────────────────
let prev = {};
for (const l of SW.lessons) {
  const id = "ls:" + l.id;
  add({ id, k: "lesson", l: l.title, d: l.summary, g: "lg:" + l.group });
  link(id, "lg:" + l.group, "BELONGS_TO");
  if (prev[l.group]) link(prev[l.group], id, "NEXT_LESSON");
  prev[l.group] = id;
  (l.points || []).forEach((p, i) => {
    const text = strip(p);
    add({ id: `${id}:r${i}`, k: "point", sub: "Rule", l: clip(text, 56), d: text, g: "lg:" + l.group });
    link(`${id}:r${i}`, id, "PART_OF");
  });
  (l.quiz || []).forEach((q, i) => {
    const ans = q.o?.[q.a];
    add({ id: `${id}:q${i}`, k: "point", sub: "Quiz", l: clip(strip(q.q), 56), d: `${strip(q.q)}  Answer: ${ans}. ${strip(q.why || "")}`, g: "lg:" + l.group });
    link(`${id}:q${i}`, id, "PART_OF");
  });
  (l.examples || []).forEach((e, i) => {
    const [bad, good] = e;
    add({ id: `${id}:e${i}`, k: "point", sub: "Example", l: clip(strip(good), 56), d: strip(good), bad: strip(bad), good: strip(good), g: "lg:" + l.group });
    link(`${id}:e${i}`, id, "PART_OF");
  });
}

// ── scenarios + phrases, frameworks + steps ─────────────────────────────────────────────────────────────────
for (const f of SW.frameworks) {
  add({ id: "fw:" + f.id, k: "fw", l: f.name, d: f.use + ". " + f.steps.map((s) => s[0]).join(" → "), sample: f.sample, g: "h:fw" });
  link("fw:" + f.id, "h:fw", "BELONGS_TO");
  f.steps.forEach(([k, d], i) => {
    add({ id: `fw:${f.id}:s${i}`, k: "point", sub: "Step", l: `${k}: ${clip(d, 40)}`, d: `${k}. ${d}`, g: "h:fw" });
    link(`fw:${f.id}:s${i}`, "fw:" + f.id, "PART_OF");
  });
}
for (const s of SW.scenarios) {
  const id = "sc:" + s.id;
  add({ id, k: "scen", l: s.title, d: s.goal, tips: s.tips, g: "sg:" + s.group });
  link(id, "sg:" + s.group, "BELONGS_TO");
  if (s.framework) link(id, "fw:" + s.framework, "USES");
  (s.phrases || []).forEach((p, i) => {
    add({ id: `${id}:p${i}`, k: "point", sub: "Phrase", l: clip(strip(p), 56), d: strip(p), g: "sg:" + s.group });
    link(`${id}:p${i}`, id, "PART_OF");
  });
}

// ── drills, word pairs ──────────────────────────────────────────────────────────────────────────────────────
for (const d of SW.drills) {
  add({ id: "dr:" + d.id, k: "drill", l: d.name, d: d.desc, g: "h:drill" });
  link("dr:" + d.id, "h:drill", "BELONGS_TO");
}
const words = [];
SW.confused.forEach((c, i) => {
  const id = "cw:" + i;
  add({ id, k: "word", l: `${c[0]} / ${c[3]}`, d: `${c[0]} (${c[1]}): ${c[2]}  ${c[3]} (${c[4]}): ${c[5]}`, a: c[0], b: c[3], g: "h:word" });
  link(id, "h:word", "BELONGS_TO");
  words.push({ id, re: new RegExp(`\\b(${c[0]}|${c[3]})\\b`, "i") });
});

// ── practice prompts, signposts, hedges, upgrades: small points hung on the skill they train ───────────────
const pointOn = (parent, sub, text, extra = {}) => {
  const id = `${parent}:${sub[0].toLowerCase()}${nodes.length}`;
  add({ id, k: "point", sub, l: clip(text, 56), d: text, g: byId.get(parent).g ?? parent, ...extra });
  link(id, parent, "PART_OF");
};
for (const [cat, list] of Object.entries(SW.topics)) {
  const parent = { office: "t:meeting-opening", social: "t:daily-words", think: "t:point-reason-next" }[cat];
  if (parent && byId.has(parent)) list.forEach((q) => pointOn(parent, "Prompt", q));
}
SW.signposts.forEach((w) => byId.has("t:link-ideas") && pointOn("t:link-ideas", "Signpost", `Signpost word: “${w}”`));
SW.hedges.forEach((w) => byId.has("t:give-opinion") && pointOn("t:give-opinion", "Hedge", `Softener: “${w}”`));
Object.entries(SW.wordUpgrades).forEach(([from, to]) => byId.has("t:better-verbs") && pointOn("t:better-verbs", "Upgrade", `${from} → ${to}`, { bad: from, good: to }));

for (const [sk, fw] of Object.entries(SKILL_FW)) link("t:" + sk, "fw:" + fw, "USES");
// ── cross-links: meaning (keyword overlap, weighted by rarity) and words (whole-word mentions) ─────────────
const skillStem = topics.map((t) => ({ id: "t:" + t.id, s: stems([t.title, t.description, t.example, (t.tips || []).join(" ")].join(" ")) }));
const df = new Map();
for (const x of skillStem) for (const w of x.s) df.set(w, (df.get(w) ?? 0) + 1);
const idf = (w) => Math.log(1 + skillStem.length / (df.get(w) ?? 1));
const skillGroup = new Map(topics.map((t) => ["t:" + t.id, t.group]));
const rank = (text, allow) => {
  const q = stems(text);
  return skillStem
    .filter((x) => !allow || allow.includes(skillGroup.get(x.id)))
    .map((x) => ({ id: x.id, sc: [...q].filter((w) => x.s.has(w)).reduce((a, w) => a + idf(w), 0), hit: [...q].filter((w) => x.s.has(w)).length }))
    .filter((x) => x.hit >= 2 && x.sc >= 3.4)
    .sort((p, q) => q.sc - p.sc)
    .slice(0, 2);
};
const report = [];
const LESSON_SKILL = {
  "parts-of-speech": ["word-families", "better-verbs"], verbs: ["better-verbs", "sentence-order"], nouns: ["sentence-order", "daily-words"], pronouns: ["sentence-order"], adjectives: ["describe-place", "better-verbs"],
  adverbs: ["better-verbs"], articles: ["sentence-order"], prepositions: ["describe-place", "sentence-order"], conjunctions: ["link-ideas"], interjections: ["natural-phrases", "small-talk"],
  "common-mistakes": ["recover-mistake", "natural-phrases"], "key-concepts": ["sentence-order"], "verb-tenses": ["tense-past", "tense-future"], modals: ["polite-phrases", "give-opinion"], sva: ["sentence-order"],
  "direct-objects": ["sentence-order"], "indirect-objects": ["sentence-order", "polite-phrases"], syntax: ["sentence-order", "link-ideas"], clauses: ["link-ideas"], fragments: ["answer-directly", "sentence-order"],
  "run-ons": ["link-ideas", "pause-and-speak"], diagramming: ["sentence-order"], subjects: ["sentence-order"], conditionals: ["link-ideas", "tense-future"], "sentence-structure": ["sentence-order", "point-reason-next"],
  "sentence-patterns": ["sentence-order", "natural-phrases"], "sentence-types": ["ask-questions", "answer-directly"], "simple-compound-complex": ["link-ideas", "sentence-order"],
  contractions: ["natural-phrases", "shadowing"], abbreviations: ["daily-words"], numbers: ["present-update", "daily-words"], plurals: ["daily-words"], comma: ["pause-and-speak", "link-ideas"],
  "question-exclamation": ["ask-questions", "tell-feelings"], "quotation-marks": ["tell-a-story"], ellipsis: ["pause-and-speak"], colon: ["explain-process"], period: ["pause-and-speak"],
};
for (const l of SW.lessons) for (const sid of LESSON_SKILL[l.id] ?? []) (link("ls:" + l.id, "t:" + sid, "COVERS"), report.push([l.title, byId.get("t:" + sid)?.l]));
for (const s of SW.scenarios) for (const m of rank(s.title + " " + s.goal + " " + (s.steps || []).join(" "), ["speaking", "work", "confidence", "everyday", "listening"])) (link("sc:" + s.id, m.id, "PRACTISES"), report.push([s.title, byId.get(m.id).l]));
for (const p of nodes.filter((n) => n.k === "point" && !["Step", "Upgrade", "Quiz", "Signpost", "Hedge"].includes(n.sub))) {
  let n = 0;
  for (const w of words) if (n < 2 && w.re.test(p.d)) (link(p.id, w.id, "MENTIONS_WORD"), n++);
}
// drills train the skills they sound like
for (const d of SW.drills) for (const m of rank(d.name + " " + d.desc)) link("dr:" + d.id, m.id, "TRAINS");

// ── books: the English-Grammar-Books library, linked to the lessons and skills they explain or drill ─────────
const BT = {
  ref: ["Reference", "A reference grammar. Look the rule up here, then practise it in the lesson."],
  work: ["Workbook", "Exercises with answers. Use it after the lesson to make the rule automatic."],
  test: ["Practice tests", "Short tests that show which rules you still get wrong."],
  fix: ["Common mistakes", "Typical learner errors, each with a correction and practice."],
  speak: ["Speaking & fluency", "Natural spoken English: expressions, rhythm and everyday talk."],
  vocab: ["Vocabulary", "Word lists and exercises that widen the words you can use."],
  ling: ["Linguistics", "How English grammar works, explained in depth. Best for advanced learners."],
  teach: ["For teachers", "Grammar explained for people who teach it, with clear terminology."],
  exam: ["Exam prep", "Grammar practice shaped for IELTS and Cambridge-style exams."],
  usage: ["Usage guide", "Which word or spelling to choose, and why."],
};
const BASE = "https://github.com/manjunath5496/English-Grammar-Books/blob/master/";
for (const b of BOOKS) {
  const [lab, blurb] = BT[b.type];
  add({ id: "bk:" + b.n, k: "book", sub: lab, l: b.t, d: `${blurb} Level: ${b.lvl}.`, lvl: b.lvl, bt: b.type, g: "h:books", url: `${BASE}eng%28${b.n}%29.pdf` });
  link("bk:" + b.n, "h:books", "BELONGS_TO");
  for (const to of b.to) link("bk:" + b.n, to, ["work", "test", "exam", "fix"].includes(b.type) ? "DRILLS" : "EXPLAINS");
}

// ── layout (the GitaViśva recipe) ───────────────────────────────────────────────────────────────────────────
const RING_R = 380;
const REL = {
  BELONGS_TO: { dist: 46, str: 0.55 }, PART_OF: { dist: 13, str: 0.75 }, USES: { dist: 120, str: 0.03 }, COVERS: { dist: 130, str: 0.025 },
  PRACTISES: { dist: 130, str: 0.025 }, MENTIONS_WORD: { dist: 110, str: 0.012 }, NEXT_LESSON: { dist: 60, str: 0 }, TRAINS: { dist: 140, str: 0.02 }, EXPLAINS: { dist: 150, str: 0.02 }, DRILLS: { dist: 150, str: 0.02 }, NEXT_SKILL: { dist: 70, str: 0 }, ON_CORE: { dist: 380, str: 0 },
};
const ringOrder = ["g:speaking", "g:work", "g:everyday", "sg:present", ...hubs.map((h) => h.id)].filter((v, i, a) => a.indexOf(v) === i);
hubs.sort((x, y) => ringOrder.indexOf(x.id) - ringOrder.indexOf(y.id));
hubs.forEach((h, i) => {
  const th = (i / hubs.length) * Math.PI * 2;
  h.fx = h.x = RING_R * Math.cos(th); h.fy = h.y = 26 * Math.sin(th * 3); h.fz = h.z = RING_R * Math.sin(th);
});
const core = byId.get("core");
core.fx = core.fy = core.fz = core.x = core.y = core.z = 0;
// seed each node near its hub so the simulation converges to clean clusters
const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647) - 0.5; })();
for (const n of nodes) {
  if (n.fx !== undefined) continue;
  const h = byId.get(n.g) && (byId.get(n.g).k === "hub" ? byId.get(n.g) : byId.get(byId.get(n.g).g)) || core;
  n.x = h.x * 0.8 + rnd() * 60; n.y = (h.y ?? 0) + rnd() * 60; n.z = h.z * 0.8 + rnd() * 60;
}
const containForce = () => {
  let ns = [];
  return Object.assign(
    (alpha) => {
      for (const n of ns) {
        if (n.fx !== undefined) continue;
        const r = Math.hypot(n.x, n.z), max = n.k === "point" ? RING_R * 1.2 : RING_R * 0.78;
        if (r > max) { const k = ((r - max) / r) * alpha * 0.35; n.vx -= n.x * k; n.vz -= n.z * k; }
        n.vy -= n.y * alpha * 0.03;
      }
    },
    { initialize: (x) => (ns = x) },
  );
};
const simLinks = edges.map(([s, t, rel]) => ({ source: s, target: t, rel }));
const sim = forceSimulation(nodes, 3)
  .alphaDecay(0.022).velocityDecay(0.33)
  .force("link", forceLink(simLinks).id((d) => d.id).distance((l) => REL[l.rel].dist).strength((l) => REL[l.rel].str))
  .force("charge", forceManyBody().strength(-24).distanceMax(420))
  .force("center", forceCenter())
  .force("contain", containForce())
  .stop();
for (let i = 0; i < 350; i++) sim.tick();

// ── write ───────────────────────────────────────────────────────────────────────────────────────────────────
const r1 = (v) => Math.round(v * 10) / 10;
const out = {
  kind: "speakcosmos-graph", version: 1, generatedAt: new Date().toISOString(),
  nodes: nodes.map((n) => {
    const { x, y, z, vx, vy, vz, fx, fy, fz, index, ...rest } = n;
    return { ...rest, p: [r1(x), r1(y), r1(z)] };
  }),
  edges,
};
writeFileSync(outPath, JSON.stringify(out));
const kinds = {};
nodes.forEach((n) => (kinds[n.k] = (kinds[n.k] ?? 0) + 1));
const rels = {};
edges.forEach((e) => (rels[e[2]] = (rels[e[2]] ?? 0) + 1));
console.log("nodes", nodes.length, kinds);
console.log("edges", edges.length, rels);
console.log("sample cross-links:\n" + report.slice(0, 40).map((r) => `  ${r[0]}  ↔  ${r[1]}`).join("\n"));
console.log("size", (JSON.stringify(out).length / 1024).toFixed(0) + " KB");
