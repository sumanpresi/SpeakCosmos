// Obsidian/Roam-style syntax: [[Title]], [[Title|shown text]] and #tags inside a note's text.
const RE_LINK = /\[\[([^\[\]|\n]{1,120}?)(?:\|[^\[\]\n]*)?\]\]/g;
const RE_TAG = /(?:^|[\s(,;])#([\p{L}\p{N}][\p{L}\p{N}_-]{1,39})/gu;
export function parseNote(text) {
  const t = String(text ?? "");
  const links = [...new Set([...t.matchAll(RE_LINK)].map((m) => m[1].trim()).filter(Boolean))];
  const tags = [...new Set([...t.matchAll(RE_TAG)].map((m) => m[1].toLowerCase()))];
  return { links, tags };
}
/** plain text for previews: strips link brackets and keeps the shown text */
export const plain = (text) => String(text ?? "").replace(/\[\[([^\[\]|\n]*?)(?:\|([^\[\]\n]*))?\]\]/g, (m, a, b) => b || a).replace(/(^|\s)#([\p{L}\p{N}][\p{L}\p{N}_-]+)/gu, "$1$2").replace(/\s+/g, " ").trim();
