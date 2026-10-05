import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export interface FileChange {
  path: string;
  before: string;
  after: string;
}
const journalPath = (entry: string) =>
  path.join(
    path.dirname(entry),
    ".slidex-save-" + hash(path.resolve(entry)).slice(0, 16) + ".json",
  );
function replace(file: string, text: string) {
  const temp = file + "." + randomUUID() + ".tmp";
  try {
    fs.writeFileSync(temp, text, { encoding: "utf8", flag: "wx" });
    fs.renameSync(temp, file);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}
function rollback(changes: FileChange[]) {
  for (const change of [...changes].reverse()) {
    const current = fs.readFileSync(change.path, "utf8");
    if (current === change.before) continue;
    if (current !== change.after)
      throw Error(
        "保存恢复遇到外部修改，请保留恢复记录并人工检查：" + change.path,
      );
    replace(change.path, change.before);
  }
}
/** Recover a interrupted partial publication; never replace an unknown externally edited file. */
export function recoverProject(entry: string) {
  const journal = journalPath(entry);
  if (!fs.existsSync(journal)) return;
  const value = JSON.parse(fs.readFileSync(journal, "utf8"));
  if (
    Number.isInteger(value.pid) &&
    value.pid > 0 &&
    value.pid !== process.pid
  ) {
    let running = false;
    try {
      process.kill(value.pid, 0);
      running = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") running = true;
    }
    if (running) throw Error("项目保存事务正在其他进程中进行，请稍后重试");
  }
  const root = fs.realpathSync(path.dirname(entry));
  if (
    value.version !== 1 ||
    value.entry !== path.resolve(entry) ||
    !Array.isArray(value.changes)
  )
    throw Error("项目保存恢复记录无效：" + journal);
  const changes: FileChange[] = value.changes;
  for (const change of changes) {
    if (
      typeof change.path !== "string" ||
      typeof change.before !== "string" ||
      typeof change.after !== "string"
    )
      throw Error("保存恢复记录格式无效");
    const rel = path.relative(root, fs.realpathSync(change.path));
    if (rel === ".." || rel.startsWith(".." + path.sep) || path.isAbsolute(rel))
      throw Error("保存恢复路径越界");
  }
  if (!changes.every((c) => fs.readFileSync(c.path, "utf8") === c.after))
    rollback(changes);
  fs.unlinkSync(journal);
}
/** Recoverable multi-file publication, not a filesystem-wide atomic operation. */
export function publishProject(
  entry: string,
  changes: FileChange[],
  dependencies: Array<{ path: string; hash: string }>,
) {
  if (!changes.length) return;
  const journal = journalPath(entry);
  const check = () => {
    for (const dep of dependencies) {
      const written = changes.find((c) => c.path === dep.path);
      const current = fs.readFileSync(dep.path, "utf8");
      if (hash(current) !== dep.hash && (!written || current !== written.after))
        throw Error("项目文件已在外部修改：" + dep.path);
    }
  };
  check();
  fs.writeFileSync(
    journal,
    JSON.stringify({
      version: 1,
      pid: process.pid,
      entry: path.resolve(entry),
      changes,
    }),
    { encoding: "utf8", flag: "wx" },
  );
  try {
    for (const change of changes) {
      check();
      if (fs.readFileSync(change.path, "utf8") !== change.before)
        throw Error("项目文件在保存期间发生变化：" + change.path);
      replace(change.path, change.after);
    }
    fs.unlinkSync(journal);
  } catch (error) {
    try {
      rollback(changes);
      fs.unlinkSync(journal);
    } catch (recovery) {
      throw Error(
        String(error) +
          "；自动恢复失败，请保留记录 " +
          journal +
          "：" +
          String(recovery),
      );
    }
    throw error;
  }
}
