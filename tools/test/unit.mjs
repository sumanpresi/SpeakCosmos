import assert from "node:assert/strict";
import { tokens, slug } from "../src/text.js";
import { parseNote, plain } from "../src/wikilinks.js";
import { suggest, contradictions, ideaDraft } from "../src/relations.js";
import { normalize, buildGraph, textToNotes, mergeState, emptyState, sameState } from "../src/userdata.js";
let n = 0; const t = (name, f) => { try { f(); n++; console.log("ok  ", name); } catch (e) { console.error("FAIL", name, "\n", e.message); process.exitCode = 1; } };

t("tokens: english stems and stopwords", () => { const k = tokens("The Rocks are sedimentary and metamorphic"); assert.ok(k.includes("rock") && !k.includes("the")); });
t("tokens: bengali words survive", () => { const k = tokens("কর্ম ও পুনর্জন্ম বুদ্ধ"); assert.ok(k.length >= 3, JSON.stringify(k)); });
t("wikilinks and tags", () => { const r = parseNote("See [[Plate tectonics|plates]] and [[Karma]] #geo #Idea, not#this"); assert.deepEqual(r.links, ["Plate tectonics", "Karma"]); assert.deepEqual(r.tags, ["geo", "idea"]); assert.equal(plain("a [[B|c]] #dd"), "a c dd"); });
t("normalize repairs bad input", () => {
  const s = normalize({ topics: [{ label: "Geo" }, { label: "Geo" }, null, { id: "eng", label: "x" }], notes: [{ title: "a", topic: "nope" }, { title: "b", topic: "geo", id: "x" }, { title: "c", topic: "geo", id: "x" }], bridges: [{ a: "u:x", b: "u:x" }, { a: "p", b: "q" }] });
  assert.equal(new Set(s.topics.map((x) => x.id)).size, s.topics.length); assert.equal(new Set(s.notes.map((x) => x.id)).size, 3); assert.ok(s.topics.find((x) => x.id === "inbox")); assert.equal(s.bridges.length, 1);
  assert.deepEqual(normalize(null), emptyState()); assert.deepEqual(normalize("garbage").notes, []);
});
const mk = () => normalize({ topics: [{ id: "geo", label: "Geology" }, { id: "gita", label: "Gita" }], notes: [
  { id: "1", topic: "geo", title: "Subduction", text: "Oceanic plate sinks beneath another plate; recycling of crust over deep time. #cycle" },
  { id: "2", topic: "geo", title: "Rock cycle", text: "Rocks are recycled: [[Subduction]] melts crust. #cycle" },
  { id: "3", topic: "gita", title: "Samsara", text: "Cycle of rebirth, recycling of lives over deep time. #cycle" },
  { id: "4", topic: "gita", title: "Nishkama karma", text: "Act without clinging to results. [[Samsara]] [[Missing note]] [[Karma]]" } ] });
t("buildGraph: nodes, links, unresolved, positions", () => {
  const s = mk(), g = buildGraph(s, new Set(["pn:karma"]), new Map([["karma", "pn:karma"]]));
  assert.equal(g.nodes.length, 2 + 4); const ids = new Set(g.nodes.map((x) => x.id));
  for (const [a, b] of g.edges) assert.ok(ids.has(a) && (ids.has(b) || b === "pn:karma"), a + b);
  assert.ok(g.edges.some((e) => e[0] === "u:4" && e[1] === "pn:karma" && e[2] === "LINKS_TO"));
  assert.deepEqual(g.unresolved.get("u:4"), ["Missing note"]); assert.equal(g.placed.length, 4);
  assert.ok(g.edges.some((e) => e[2] === "SHARES_TAG"));
  const again = buildGraph({ ...s, notes: s.notes.map((n) => ({ ...n, p: g.placed.find((p) => p.id === n.id).p })) }, new Set(), new Map());
  assert.equal(again.placed.length, 0); assert.deepEqual(again.nodes.find((x) => x.id === "u:1").q, g.nodes.find((x) => x.id === "u:1").q);
});
t("suggest finds cross-topic relation with reasons, never within a topic", () => {
  const s = mk(), g = buildGraph(s, new Set(), new Map());
  const items = g.nodes.filter((x) => x.k === "note").map((x) => ({ id: x.id, topic: x.t, label: x.l, text: x.d, tags: x.tags }));
  const r = suggest(items, [], { minShared: 2 });
  assert.ok(r.length >= 1); const top = r[0];
  assert.ok(items.find((i) => i.id === top.a).topic !== items.find((i) => i.id === top.b).topic);
  assert.ok(top.why.tags.includes("cycle") || top.why.words.length >= 2);
  assert.equal(suggest(items, [[top.a, top.b]]).some((x) => (x.a === top.a && x.b === top.b)), false);
  assert.equal(suggest(items, [], { skip: new Set([[top.a, top.b].sort().join("|")]) }).some((x) => x.a === top.a && x.b === top.b), false);
  assert.ok(ideaDraft({ label: "A" }, { label: "B" }, top.why).text.includes("[[A]]"));
});
t("textToNotes: headings, paragraphs, empty", () => {
  assert.equal(textToNotes("a.md", "# One\nx\n\n## Two\ny").length, 2); assert.equal(textToNotes("a.txt", "").length, 0);
  const big = Array.from({ length: 40 }, (_, i) => "Paragraph number " + i + " with some words in it to make length.").join("\n\n"); assert.ok(textToNotes("big.txt", big).length > 2);
});
t("mergeState never overwrites and is idempotent", () => { const a = mk(), m1 = mergeState(a, a); assert.equal(m1.addedN, 0); const b = normalize({ topics: [{ id: "x", label: "X" }], notes: [{ id: "9", topic: "x", title: "n" }] }); const m2 = mergeState(a, b); assert.equal(m2.addedN, 1); assert.equal(mergeState(m2.state, b).addedN, 0); });
t("scale: 3000 notes in 5 topics build + suggest in reasonable time", () => {
  const words = "granite basalt fold fault strata mineral ore river delta monsoon ethics duty karma mind self rebirth verse chapter speech grammar tense".split(" ");
  const notes = Array.from({ length: 3000 }, (_, i) => ({ id: "n" + i, topic: "t" + (i % 5), title: "Note " + i + " " + words[i % words.length], text: Array.from({ length: 25 }, (_, k) => words[(i * 7 + k * 13) % words.length] + (k % 6 ? "" : "s")).join(" ") + " [[Note " + ((i * 17) % 3000) + " " + words[((i * 17) % 3000) % words.length] + "]]" }));
  const s = normalize({ topics: [0, 1, 2, 3, 4].map((i) => ({ id: "t" + i, label: "T" + i })), notes });
  let t0 = performance.now(); const g = buildGraph(s, new Set(), new Map()); const b = performance.now() - t0;
  t0 = performance.now(); const r = suggest(g.nodes.filter((x) => x.k === "note").map((x) => ({ id: x.id, topic: x.t, label: x.l, text: x.d, tags: x.tags })), g.edges.filter((e) => e[2] === "LINKS_TO").map((e) => [e[0], e[1]])); const sg = performance.now() - t0;
  console.log(`      build ${b | 0} ms, suggest ${sg | 0} ms, ${g.nodes.length} nodes ${g.edges.length} edges, ${r.length} suggestions`);
  assert.ok(b < 4000 && sg < 8000);
});
t("contradictions: same ground, opposite lean; ignores agreeing pairs", () => {
  const items = [
    { id: "a", topic: "x", label: "Uniformitarianism", text: "Earth change is gradual and uniform over long time; slow processes shape rocks and mountains." },
    { id: "b", topic: "y", label: "Catastrophism", text: "Earth change is not gradual: sudden catastrophic events shape rocks and mountains, uniform change is a myth." },
    { id: "c", topic: "y", label: "Slow weathering", text: "Gradual uniform weathering shapes rocks and mountains over long time." },
  ];
  const r = contradictions(items, []);
  assert.ok(r.length >= 1); assert.ok(r[0].why.cues.length >= 1);
  assert.ok([r[0].a, r[0].b].sort().join() === "a,b", JSON.stringify(r.map((x) => [x.a, x.b, x.why.cues])));
  assert.deepEqual(contradictions(items, [["a", "b"]]).filter((x) => [x.a, x.b].sort().join() === "a,b"), []);
});
t("userdata keeps bridge relation types", () => {
  const s = normalize({ topics: [{ id: "g", label: "G" }], notes: [{ id: "1", topic: "g", title: "A" }, { id: "2", topic: "g", title: "B" }], bridges: [{ a: "u:1", b: "u:2", rel: "CONTRADICTS" }, { a: "u:2", b: "u:1", rel: "bogus" }] });
  assert.equal(s.bridges[0].rel, "CONTRADICTS"); assert.equal(s.bridges[1].rel, "RELATED");
  const g = buildGraph(s, new Set(), new Map()); assert.ok(g.edges.some((e) => e[2] === "CONTRADICTS"));
});
t("cloud merge: newer edit wins, deletions propagate, restore can revive", () => {
  const base = normalize({ topics: [{ id: "g", label: "G", updated: 1 }], notes: [{ id: "1", topic: "g", title: "old", updated: 10 }, { id: "2", topic: "g", title: "keep", updated: 10 }] });
  const A = JSON.parse(JSON.stringify(base)); A.notes[0].title = "edited on A"; A.notes[0].updated = 50;
  const B = JSON.parse(JSON.stringify(base)); B.notes = B.notes.filter((n) => n.id !== "2"); B.gone["n:2"] = 60; B.notes.push({ id: "3", topic: "g", title: "new on B", updated: 70, created: 70 });
  const m = mergeState(A, B).state;
  assert.equal(m.notes.find((n) => n.id === "1").title, "edited on A"); assert.ok(!m.notes.find((n) => n.id === "2")); assert.ok(m.notes.find((n) => n.id === "3"));
  assert.ok(sameState(m, mergeState(B, A).state), "merge is symmetric");
  assert.ok(sameState(m, mergeState(m, A).state) && sameState(m, mergeState(m, B).state), "merge is idempotent");
  const newerEdit = normalize({ topics: base.topics, notes: [{ id: "2", topic: "g", title: "edited after delete", updated: 90 }] });
  assert.ok(mergeState(B, newerEdit).state.notes.find((n) => n.id === "2"), "edit after deletion keeps the note");
  assert.ok(!mergeState(B, A).state.notes.find((n) => n.id === "2"), "older copy cannot undo a deletion");
  assert.ok(mergeState(B, A, { revive: true }).state.notes.find((n) => n.id === "2"), "manual restore revives");
});
console.log(n + " tests passed");
