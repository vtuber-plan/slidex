import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
export interface Revision {
  time: number;
  xml: string;
  draft?: boolean;
}
interface History {
  version: 1;
  file: string;
  revisions: Revision[];
  draft?: Revision;
}
export function historyStore(directory: string) {
  const target = (file: string) =>
    path.join(
      directory,
      createHash("sha256")
        .update(
          process.platform === "win32"
            ? path.resolve(file).toLowerCase()
            : path.resolve(file),
        )
        .digest("hex") + ".json",
    );
  const read = (file: string): History => {
    try {
      const value = JSON.parse(fs.readFileSync(target(file), "utf8"));
      if (value.version === 1 && Array.isArray(value.revisions)) return value;
      throw Error("不支持的历史记录格式");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    return { version: 1, file, revisions: [] };
  };
  const write = (file: string, value: History) => {
    fs.mkdirSync(directory, { recursive: true });
    const dest = target(file),
      tmp = dest + "." + randomUUID() + ".tmp";
    try {
      fs.writeFileSync(tmp, JSON.stringify(value));
      fs.renameSync(tmp, dest);
    } finally {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }
  };
  const record = (file: string, xml: string) => {
    const h = read(file);
    if (h.revisions[0]?.xml === xml) return;
    h.revisions = [{ time: Date.now(), xml }, ...h.revisions].slice(0, 20);
    while (
      h.revisions.length > 1 &&
      Buffer.byteLength(JSON.stringify(h)) > 50 * 1024 * 1024
    )
      h.revisions.pop();
    write(file, h);
  };
  return {
    read,
    record,
    import: (file: string, revisions: Revision[]) => {
      const h = read(file);
      const unique = new Map<string, Revision>();
      for (const r of [...h.revisions, ...revisions].sort(
        (a, b) => b.time - a.time,
      ))
        if (!unique.has(r.xml)) unique.set(r.xml, r);
      h.revisions = [...unique.values()].slice(0, 20);
      while (
        h.revisions.length > 1 &&
        Buffer.byteLength(JSON.stringify(h)) > 50 * 1024 * 1024
      )
        h.revisions.pop();
      write(file, h);
    },
    draft: (file: string, xml: string) => {
      const h = read(file);
      h.draft = { time: Date.now(), xml, draft: true };
      write(file, h);
    },
    saved: (file: string, xml: string) => {
      record(file, xml);
      const h = read(file);
      if (h.draft?.xml === xml) {
        delete h.draft;
        write(file, h);
      }
    },
  };
}
