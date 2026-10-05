import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { parseXML } from "./parser.js";
import { loadProject, type Project } from "./project.js";
import type { Diag } from "./types.js";

export interface SourceBuffer {
  path: string;
  xml: string;
  hash?: string;
}
export interface WorkspaceFile extends SourceBuffer {
  name: string;
  hash: string;
  referenced: boolean;
}
export interface DetachedSource {
  path: string;
  xml: string;
  hash: string;
}
const hash = (text: string) => createHash("sha256").update(text).digest("hex");

export function workspacePath(
  project: Project,
  input: string,
  directory = false,
): string {
  const root = fs.realpathSync(path.dirname(project.path)),
    file = fs.realpathSync(input);
  const relative = path.relative(root, file);
  if (
    relative === ".." ||
    relative.startsWith(".." + path.sep) ||
    path.isAbsolute(relative)
  )
    throw Error("源码文件路径越出项目目录");
  const stat = fs.statSync(file);
  if (
    directory
      ? !stat.isDirectory()
      : !stat.isFile() || path.extname(file).toLowerCase() !== ".slx"
  )
    throw Error("请选择项目内的 SLX 文件或目录");
  return file;
}
export function detachedDiagnostics(file: string, xml: string): Diag[] {
  const parsed = parseXML(xml),
    errors = parsed.errors.map((e) => ({ ...e, file }));
  if (parsed.root && !["deck", "slide", "slides"].includes(parsed.root.name))
    errors.push({
      code: "E_SOURCE_ROOT",
      message: "SLX 根节点必须为 deck、slide 或 slides",
      file,
      line: parsed.root.line,
      col: parsed.root.col,
    });
  return errors;
}
export function workspaceFiles(
  project: Project,
  detached: DetachedSource[] = [],
): WorkspaceFile[] {
  const root = fs.realpathSync(path.dirname(project.path));
  return [
    ...project.sources!.documents.map((d) => ({
      path: d.path,
      xml: d.text,
      referenced: true,
    })),
    ...detached.map((d) => ({ ...d, referenced: false })),
  ].map((d) => ({
    ...d,
    name: path.relative(root, d.path).split(path.sep).join("/"),
    hash: hash(fs.readFileSync(d.path, "utf8")),
  }));
}
export function workspaceSources(project: Project, input: unknown) {
  const overrides = new Map<string, string>(),
    expected = new Map<string, string>();
  if (input !== undefined) {
    if (!Array.isArray(input)) throw Error("源码文件列表无效");
    for (const item of input) {
      if (
        !item ||
        typeof item.path !== "string" ||
        typeof item.xml !== "string"
      )
        throw Error("源码文件列表无效");
      const file = workspacePath(project, item.path);
      if (file !== item.path || overrides.has(file))
        throw Error("源码文件路径无效或重复");
      const disk = fs.readFileSync(file, "utf8"),
        diskHash = hash(disk);
      const version =
        typeof item.hash === "string"
          ? item.hash
          : project.files.find((d) => d.path === file)?.hash;
      if (version && version !== diskHash)
        throw Error("源码文件已在外部修改，请重新打开后保存：" + file);
      if (!version && item.xml !== disk)
        throw Error("未引用文件缺少打开时的版本，请从文件树重新打开：" + file);
      overrides.set(file, item.xml);
      expected.set(file, version || diskHash);
    }
  }
  const preview = loadProject(project.path, overrides),
    referenced = new Set(preview.files.map((d) => d.path));
  const detached = [...overrides]
    .filter(([file]) => !referenced.has(file))
    .map(([path, xml]) => ({ path, xml, hash: expected.get(path)! }));
  return {
    overrides,
    preview,
    detached,
    errors: [
      ...preview.errors,
      ...detached.flatMap((d) => detachedDiagnostics(d.path, d.xml)),
    ],
  };
}
export function readWorkspaceFile(
  project: Project,
  input: string,
): WorkspaceFile {
  const file = workspacePath(project, input),
    xml = fs.readFileSync(file, "utf8");
  return {
    path: file,
    xml,
    hash: hash(xml),
    name: path
      .relative(fs.realpathSync(path.dirname(project.path)), file)
      .split(path.sep)
      .join("/"),
    referenced: project.files.some((d) => d.path === file),
  };
}
export function workspaceDirectory(project: Project, input?: string) {
  const directory = workspacePath(
    project,
    input || path.dirname(project.path),
    true,
  );
  const root = fs.realpathSync(path.dirname(project.path)),
    ignored = new Set([".git", "node_modules", ".cache", "__pycache__"]);
  const entries = fs
    .readdirSync(directory, { withFileTypes: true })
    .filter(
      (d) =>
        !d.isSymbolicLink() &&
        ((d.isDirectory() && !ignored.has(d.name)) ||
          (d.isFile() && path.extname(d.name).toLowerCase() === ".slx")),
    )
    .map((d) => {
      const file = fs.realpathSync(path.join(directory, d.name));
      return {
        path: file,
        name: path.relative(root, file).split(path.sep).join("/"),
        label: d.name,
        kind: d.isDirectory() ? "directory" : "file",
        referenced: project.files.some((p) => p.path === file),
      };
    })
    .sort(
      (a, b) =>
        Number(b.kind === "directory") - Number(a.kind === "directory") ||
        a.label.localeCompare(b.label, "zh-CN", { numeric: true }),
    );
  return {
    path: directory,
    name: path.relative(root, directory).split(path.sep).join("/"),
    entries,
  };
}
