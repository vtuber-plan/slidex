export interface Revision {
  draft?:boolean;
  time: number;
  xml: string;
}
const key = (file: string) => `slidex-revisions:${file}`;
function readLocalRevisions(file: string): Revision[] {
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
    const list = readLocalRevisions(file);
    if (list[0]?.xml === xml) return;
    localStorage.setItem(
      key(file),
      JSON.stringify([{ time: Date.now(), xml }, ...list].slice(0, 20)),
    );
  } catch {
    /* Browser history is optional; the document file remains authoritative. */
  }
}
export async function readRevisions(file:string):Promise<Revision[]>{
  const local=readLocalRevisions(file);
  if(local.length)await fetch('/api/revisions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:file,revisions:local})});
  const response=await fetch('/api/revisions?path='+encodeURIComponent(file));
  if(!response.ok)throw Error('版本历史读取失败');
  return (await response.json()).revisions;
}
