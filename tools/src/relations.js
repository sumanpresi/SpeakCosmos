// Connections engine: finds likely relations between nodes that live in DIFFERENT topics.
// Pure functions (no DOM) so they can be unit-tested. Signals, all explainable to the reader:
//   1. shared meaningful words (TF-IDF cosine, labels weighted higher)   2. identical titles
//   3. shared #tags                                                       4. shared neighbours (Adamic–Adar)
import { tokens, norm } from "./text.js";

/**
 * items: [{id, topic, label, text, tags?: string[]}]
 * links: [[idA, idB]] existing connections (never suggested again)
 * opts: {topics?: Set|array limiting to these topics, limit=30, minShared=2, skip?: Set("a|b"), maxOps=2.5e7, only?: id}
 * returns [{a, b, score, why: {words:[], tags:[], title:bool, via:[]}}]
 */
export function suggest(items, links = [], opts = {}) {
  const { limit = 30, minShared = 2, skip = new Set(), maxOps = 25e6, only = null } = opts;
  const topicSet = opts.topics ? new Set(opts.topics) : null;
  const pool = topicSet ? items.filter((it) => topicSet.has(it.topic)) : items;
  const N = pool.length;
  if (N < 2) return [];
  const surface = new Map();
  const docs = pool.map((it) => {
    const tf = new Map();
    for (const t of tokens(it.label, surface)) tf.set(t, (tf.get(t) ?? 0) + 3);
    for (const t of tokens(it.text, surface)) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const g of it.tags ?? []) tf.set("#" + g, (tf.get("#" + g) ?? 0) + 4);
    return { it, tf };
  });
  const df = new Map();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const idf = (t) => Math.log(1 + N / (df.get(t) ?? 1));
  for (const d of docs) { let s = 0; for (const [t, f] of d.tf) s += (f * idf(t)) ** 2; d.norm = Math.sqrt(s) || 1; }
  const postings = new Map(), cap = Math.max(12, Math.min(150, Math.round(N * 0.06)));
  docs.forEach((d, i) => { for (const t of d.tf.keys()) { const c = df.get(t); if (c < 2 || c > cap) continue; (postings.get(t) ?? postings.set(t, []).get(t)).push(i); } });
  const linked = new Set();
  for (const [a, b] of links) { linked.add(a + "|" + b); linked.add(b + "|" + a); }
  const key = (a, b) => (a < b ? a + "|" + b : b + "|" + a);
  const acc = new Map();
  let ops = 0;
  const bump = (i, j, term, w) => {
    const a = docs[i].it, b = docs[j].it;
    if (a.topic === b.topic || linked.has(a.id + "|" + b.id) || skip.has(key(a.id, b.id))) return;
    if (only && a.id !== only && b.id !== only) return;
    const k = i < j ? i + "|" + j : j + "|" + i;
    let r = acc.get(k);
    if (!r) acc.set(k, (r = { i: Math.min(i, j), j: Math.max(i, j), dot: 0, words: [], tags: [], n: 0 }));
    r.dot += w; r.n++;
    if (term[0] === "#") r.tags.push(term.slice(1)); else r.words.push([term, w]);
  };
  outer: for (const [t, list] of postings) {
    const w2 = idf(t) ** 2;
    for (let x = 0; x < list.length; x++) {
      const i = list[x], fi = docs[i].tf.get(t);
      for (let y = x + 1; y < list.length; y++) {
        if (++ops > maxOps) break outer;
        const j = list[y];
        bump(i, j, t, fi * docs[j].tf.get(t) * w2);
      }
    }
  }
  // identical titles across topics are the strongest possible hint
  const byTitle = new Map();
  docs.forEach((d, i) => { const k = norm(d.it.label); if (k.length > 2) (byTitle.get(k) ?? byTitle.set(k, []).get(k)).push(i); });
  const titled = new Set();
  for (const list of byTitle.values()) for (let x = 0; x < list.length; x++) for (let y = x + 1; y < list.length; y++) {
    const a = docs[list[x]].it, b = docs[list[y]].it;
    if (a.topic === b.topic || linked.has(a.id + "|" + b.id) || skip.has(key(a.id, b.id))) continue;
    const k = list[x] < list[y] ? list[x] + "|" + list[y] : list[y] + "|" + list[x];
    if (!acc.has(k)) acc.set(k, { i: Math.min(list[x], list[y]), j: Math.max(list[x], list[y]), dot: 0, words: [], tags: [], n: 0 });
    titled.add(k);
  }
  // shared neighbours: two nodes that both connect to the same third node
  const nb = new Map(), idToIdx = new Map(docs.map((d, i) => [d.it.id, i]));
  for (const [a, b] of links) { (nb.get(a) ?? nb.set(a, new Set()).get(a)).add(b); (nb.get(b) ?? nb.set(b, new Set()).get(b)).add(a); }
  const via = new Map();
  for (const [c, set] of nb) {
    if (set.size < 2 || set.size > 40) continue;
    const arr = [...set].filter((id) => idToIdx.has(id)), w = 1 / Math.log(2 + set.size);
    for (let x = 0; x < arr.length; x++) for (let y = x + 1; y < arr.length; y++) {
      const i = idToIdx.get(arr[x]), j = idToIdx.get(arr[y]), a = docs[i].it, b = docs[j].it;
      if (a.topic === b.topic || linked.has(a.id + "|" + b.id) || skip.has(key(a.id, b.id))) continue;
      if (only && a.id !== only && b.id !== only) continue;
      const k = i < j ? i + "|" + j : j + "|" + i;
      if (!acc.has(k)) acc.set(k, { i: Math.min(i, j), j: Math.max(i, j), dot: 0, words: [], tags: [], n: 0 });
      (via.get(k) ?? via.set(k, []).get(k)).push([c, w]);
    }
  }
  const out = [];
  for (const [k, r] of acc) {
    const a = docs[r.i], b = docs[r.j], title = titled.has(k), v = via.get(k) ?? [];
    const strong = r.words.length + r.tags.length * 2;
    if (!title && !v.length && strong < minShared) continue;
    const cos = r.dot / (a.norm * b.norm);
    const score = cos + 0.35 * r.tags.length + (title ? 1 : 0) + 0.5 * v.reduce((s, x) => s + x[1], 0);
    out.push({
      a: a.it.id, b: b.it.id, score: Math.round(score * 1000) / 1000,
      why: { words: r.words.sort((x, y) => y[1] - x[1]).slice(0, 5).map((x) => surface.get(x[0]) ?? x[0]), tags: r.tags.slice(0, 4), title, via: v.sort((x, y) => y[1] - x[1]).slice(0, 2).map((x) => x[0]) },
    });
  }
  out.sort((x, y) => y.score - x.score || (x.a + x.b).localeCompare(y.a + y.b));
  // diversity: do not let one node hog the list
  const used = new Map(), res = [];
  for (const s of out) { if ((used.get(s.a) ?? 0) >= 3 || (used.get(s.b) ?? 0) >= 3) continue; used.set(s.a, (used.get(s.a) ?? 0) + 1); used.set(s.b, (used.get(s.b) ?? 0) + 1); res.push(s); if (res.length >= limit) break; }
  return res;
}

/** a readable first draft for a new idea that joins two nodes (works without AI) */
export function ideaDraft(A, B, why = {}, kind = "similar") {
  const shared = [...(why.words ?? []), ...(why.tags ?? []).map((t) => "#" + t)].slice(0, 4);
  if (kind === "contradict") {
    return { title: `${A.label} vs ${B.label}`, text: [
      `[[${A.label}]] and [[${B.label}]] seem to pull in opposite directions.`,
      (why.cues ?? []).length ? `Signals: ${why.cues.join("; ")}.` : "",
      shared.length ? `They are about the same ground: ${shared.join(", ")}.` : "",
      `Where exactly do they disagree? Is it a real conflict, or do they answer different questions?`,
      `My resolution (edit this): …`, `#tension`].filter(Boolean).join("\n\n") };
  }
  const lines = [
    `This idea joins [[${A.label}]] and [[${B.label}]].`,
    shared.length ? `They meet around: ${shared.join(", ")}.` : why.title ? "The two share the same name, which suggests they describe one thing from two sides." : "",
    `Question to explore: what does ${A.label} change about how we read ${B.label}, and the other way round?`,
    `My claim (edit this): …`,
    `#idea`,
  ].filter(Boolean);
  return { title: `${A.label} × ${B.label}`, text: lines.join("\n\n") };
}

// ── contradictions: a heuristic first pass. Two ideas that are about the same thing (shared words) but lean opposite
// ways (one denies/rejects what the other affirms, or they use opposite terms). The AI judge makes the final call.
const NEG = /\b(not|no|never|neither|nor|without|cannot|can't|isn't|aren't|doesn't|don't|won't|reject\w*|den(?:y|ies|ied|ial)|false|wrong|myth\w*|refut\w*|oppos\w*|against|critici[sz]\w*|challeng\w*|illusion\w*|impossible|deny|rule[sd]? out|disprov\w*|incorrect)\b/gi;
const OPP = [["eternal", "momentary"], ["permanent", "impermanent"], ["soul", "soulless"], ["real", "illusion"], ["increase", "decrease"], ["accept", "reject"], ["cause", "random"], ["fate", "free will"], ["begin", "never began"], ["finite", "infinite"], ["one", "many"], ["mind", "matter"], ["duty", "desire"], ["attach", "detach"], ["rise", "fall"], ["expand", "contract"], ["young", "old"], ["gradual", "sudden"], ["uniform", "catastroph"], ["stable", "unstable"], ["growth", "decline"], ["pleasure", "suffering"], ["is", "is not"], ["exist", "not exist"]];
export function stance(text) {
  const t = String(text ?? "").toLowerCase(), neg = (t.match(NEG) ?? []).length, opp = [];
  for (const [a, b] of OPP) { if (new RegExp("\\b" + a + "\\b").test(t)) opp.push(a); if (new RegExp("\\b" + b + "\\b").test(t)) opp.push(b); }
  return { neg, terms: new Set(opp), t };
}
/** same input as suggest(); returns pairs ranked by topical overlap x opposition cues, each with why.cues */
export function contradictions(items, links = [], opts = {}) {
  const limit = opts.limit ?? 30, byId = new Map(items.map((i) => [i.id, i]));
  const base = suggest(items, links, { ...opts, minShared: 2, limit: 500 });
  const st = new Map(), S = (id) => st.get(id) ?? st.set(id, stance(byId.get(id).label + ". " + byId.get(id).text)).get(id);
  const out = [];
  for (const r of base) {
    const A = S(r.a), B = S(r.b), cues = [];
    if (Math.min(A.neg, B.neg) === 0 && Math.abs(A.neg - B.neg) > 0) cues.push(`one of them denies or rejects (${A.neg > B.neg ? byId.get(r.a).label : byId.get(r.b).label})`);
    for (const [x, y] of OPP) { if ((A.terms.has(x) && B.terms.has(y) && !A.terms.has(y) && !B.terms.has(x)) || (A.terms.has(y) && B.terms.has(x) && !A.terms.has(x) && !B.terms.has(y))) cues.push(`${x} vs ${y}`); }
    if (!cues.length) continue;
    out.push({ ...r, score: Math.round(r.score * (1 + cues.length * 0.6) * 1000) / 1000, why: { ...r.why, cues: cues.slice(0, 3) } });
  }
  out.sort((x, y) => y.score - x.score);
  return out.slice(0, limit);
}
