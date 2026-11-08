// Bhagavad Gita reader (data from Gita Lessons / GitaViśva, MIT). Loaded only when a verse is opened.
let reader = null, loading = null; const comm = new Map();
export const loadReader = () => reader ? Promise.resolve(reader) : (loading ??= fetch("assets/gita/reader.json").then((r) => { if (!r.ok) throw new Error("Could not load the Gita texts."); return r.json(); }).then((j) => { j.byId = new Map(j.verses.map((v) => [v.id, v])); j.auth = new Map(j.authors.map((a) => [a.id, a])); j.order = j.verses.map((v) => v.id); return (reader = j); }).catch((e) => { loading = null; throw e; }));
export const loadComm = (id) => comm.has(id) ? Promise.resolve(comm.get(id)) : fetch(`assets/gita/c/${id}.json`).then((r) => { if (!r.ok) throw new Error("No commentary for this verse."); return r.json(); }).then((a) => { comm.set(id, a); return a; });
const LANG = { en: "English", hi: "हिन्दी", sa: "संस्कृतम्" };
const pref = (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } };
export const setPref = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
export function trOptions(R, v) {
  const out = []; for (const lang of ["en", "hi"]) for (const [aid, text] of Object.entries(v.tl?.[lang] || {})) if (text) out.push({ key: lang + ":" + aid, label: `${R.auth.get(+aid)?.name ?? "Translation " + aid} · ${LANG[lang]}`, text });
  return out;
}
export function verseHTML(R, v, esc) {
  const tos = trOptions(R, v), want = pref("sc_gita_tr", "en:16"), cur = tos.find((o) => o.key === want) || tos[0];
  const i = R.order.indexOf(v.id), prev = R.order[i - 1], next = R.order[i + 1];
  const wd = (v.wd || []).filter((p) => p[1]);
  return `<div class="gv" data-gv="${esc(v.id)}">
    <div class="gv-ref">Chapter ${v.c} · verse ${v.n}${v.uv ? ` · <i>${esc(v.uv)}</i>` : ""}</div>
    <div class="gv-sa" lang="sa">${v.sa.map(esc).join("<br>")}</div>
    <div class="gv-ia">${v.ia.map(esc).join("<br>")}</div>
    ${tos.length ? `<div class="gv-tr"><select data-gv-tr aria-label="Translation">${tos.map((o) => `<option value="${esc(o.key)}" ${o === cur ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select><p class="gv-tt" data-gv-tt>${esc(cur?.text || "")}</p></div>` : ""}
    ${wd.length ? `<details class="gv-w"><summary>Word by word</summary><div class="gv-wd">${wd.map((p) => `<span><b>${esc(p[0])}</b> ${esc(p[1])}</span>`).join("")}</div></details>` : ""}
    ${v.au ? `<div class="gv-au"><audio controls preload="none" src="${esc(v.au)}"></audio></div>` : ""}
    <div class="gv-cm" data-gv-cm><button class="gcbtn" data-gv-loadcm>Read the classical commentaries</button></div>
    <div class="gv-nav">${prev ? `<button class="gcbtn ghost" data-gverse="${prev}">‹ ${prev.slice(3)}</button>` : ""}<button class="gcbtn ghost" data-gmap="${esc(v.id)}">Show in map</button><button class="gcbtn ghost" data-greflect="${esc(v.id)}">✍ Reflect</button><a class="gcbtn ghost" href="https://gita-lessons-steel.vercel.app/?view=cosmos&node=${esc(v.id)}" target="_blank" rel="noopener noreferrer">Open in Gita Lessons ↗</a>${next ? `<button class="gcbtn ghost" data-gverse="${next}">${next.slice(3)} ›</button>` : ""}</div>
  </div>`;
}
export function commHTML(R, list, esc) {
  if (!list.length) return '<p class="sub">No classical commentary for this verse.</p>';
  const want = +pref("sc_gita_cm", 0) || list[0][0], cur = list.find((c) => c[0] === want) || list[0];
  return `<select data-gv-cmsel aria-label="Commentary">${list.map((c, k) => `<option value="${k}" ${c === cur ? "selected" : ""}>${esc(c[1])} · ${esc(LANG[c[3]] || c[3])}${c[2] ? " · " + esc(c[2]) : ""}</option>`).join("")}</select><div class="gv-ct" lang="${esc(cur[3])}">${esc(cur[4])}</div>`;
}
export const chapterList = (R, esc) => R.chapters.map((c) => `<button class="gr-ch" data-gch="${c.number}"><b>${c.number}</b><span>${esc(c.meaning)}<small>${esc(c.title)} · ${c.verseCount} verses</small></span></button>`).join("");
export const verseList = (R, ch, esc) => { const c = R.chapters.find((x) => x.number === ch); return `<p class="sub">${esc(c?.summary?.split("\n")[0] || "")}</p><div class="gr-vl">${R.verses.filter((v) => v.c === ch).map((v) => `<button data-gverse="${v.id}"><b>${v.n}</b><span>${esc((v.tl?.en?.["16"] || Object.values(v.tl?.en || {})[0] || v.ia[0] || "").slice(0, 110))}</span></button>`).join("")}</div>`; };
