// Small, dependency-free text helpers shared by search, Ask and the Connections engine.
// Works for English and for Indic scripts (Bengali, Devanagari…): words are runs of letters + combining marks.
export const STOP = new Set(("the a an and or of to in on for with is are was were be been being do does did how what why when which who whom whose can could should would may might must will shall " +
  "i me my we our you your he she it its they their them this that these those there here about from into onto at as by not no yes also than then so such very just only more most much many some any each every other over under " +
  "again between because before after while where whether have has had having like make made use used using see said say says one two per via vs etc however therefore thus both either neither").split(" "));
const RE_WORD = /[\p{L}\p{M}\p{N}]+/gu;
export function stem(w) {
  if (!/^[a-z]+$/.test(w) || w.length < 5) return w;
  const r = w.replace(/(ations|ation|ments|ment|ness|ities|ity|ingly|ings|ing|ies|ied|ers|er|ed|es|ly|s)$/, "");
  return r.length >= 4 ? r : w;
}
/** words of a text as stems; `surface` (optional Map) remembers one readable form per stem */
export function tokens(text, surface) {
  const out = [];
  for (const raw of String(text ?? "").toLowerCase().normalize("NFC").match(RE_WORD) ?? []) {
    const latin = /^[a-z0-9]+$/.test(raw);
    if (raw.length < (latin ? 3 : 2) || /^\d+$/.test(raw) || STOP.has(raw)) continue;
    const s = stem(raw);
    if (surface && !surface.has(s)) surface.set(s, raw);
    out.push(s);
  }
  return out;
}
export const norm = (s) => String(s ?? "").toLowerCase().normalize("NFC").replace(/[\s ]+/g, " ").trim();
export const clip = (s, n) => { s = String(s ?? ""); return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s; };
export function slug(s) { return norm(s).replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "topic"; }
