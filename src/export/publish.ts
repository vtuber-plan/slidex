import fs from "node:fs";
import path from "node:path";

export class ExportRecoveryError extends Error {}

/** Publish a fully rendered batch. Backups stay on the same volume for rollback. */
export function publishExport(
  staged: string[],
  targets: string[],
  scratch: string,
): void {
  if (
    staged.length !== targets.length ||
    new Set(targets).size !== targets.length
  )
    throw Error("Invalid export targets");
  const installed: string[] = [];
  const backups: { target: string; backup: string }[] = [];
  try {
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      if (fs.existsSync(target)) {
        if (!fs.statSync(target).isFile())
          throw Error(`导出目标不是文件：${target}`);
        const backup = path.join(scratch, `backup-${i}`);
        fs.renameSync(target, backup);
        backups.push({ target, backup });
      }
      fs.renameSync(staged[i], target);
      installed.push(target);
    }
  } catch (error) {
    const recoveryErrors: unknown[] = [];
    for (const file of installed.reverse())
      try {
        fs.unlinkSync(file);
      } catch (e) {
        recoveryErrors.push(e);
      }
    for (const { target, backup } of backups.reverse())
      try {
        fs.renameSync(backup, target);
      } catch (e) {
        recoveryErrors.push(e);
      }
    if (recoveryErrors.length)
      throw new ExportRecoveryError(
        `导出失败，自动恢复未完成；原文件备份保留在 ${scratch}。${String(error)}`,
      );
    throw error;
  }
}
