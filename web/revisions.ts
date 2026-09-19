export interface Revision {
  time: number;
  xml: string;
}
const key = (file: string) => `slidex-revisions:${file}`;
export function readRevisions(file: string): Revision[] {
  try {
    const value = JSON.parse(localStorage.getItem(key(file)) || "[]");
    return Array.isArray(value)
      ? value.filter(
          (x) => typeof x?.xml === "string" && typeof x?.time === "number",
        )
      : [];
  } catch {
    return [];
  }
}
export function recordRevision(file: string, xml: string) {
  try {
    const list = readRevisions(file);
    if (list[0]?.xml === xml) return;
    localStorage.setItem(
      key(file),
      JSON.stringify([{ time: Date.now(), xml }, ...list].slice(0, 20)),
    );
  } catch {
    /* Browser history is optional; the document file remains authoritative. */
  }
}
