import type { TableCell } from "../src/types";
export interface CellPosition {
  cell: TableCell;
  row: number;
  col: number;
  index: number;
}
export function tableGrid(rows: TableCell[][], width: number) {
  const grid: (CellPosition | undefined)[][] = rows.map(() => Array(width));
  rows.forEach((cells, row) => {
    let col = 0;
    cells.forEach((cell, index) => {
      while (grid[row][col]) col++;
      const pos = { cell, row, col, index };
      for (let y = 0; y < Number(cell["row-span"] || 1); y++)
        for (let x = 0; x < Number(cell["col-span"] || 1); x++) {
          if (grid[row + y]) grid[row + y][col + x] = pos;
        }
      col += Number(cell["col-span"] || 1);
    });
  });
  return grid;
}
export function mergeCells(
  rows: TableCell[][],
  width: number,
  from: [number, number],
  to: [number, number],
) {
  const grid = tableGrid(rows, width),
    r0 = Math.min(from[0], to[0]),
    r1 = Math.max(from[0], to[0]),
    c0 = Math.min(from[1], to[1]),
    c1 = Math.max(from[1], to[1]);
  const positions = new Set<CellPosition>();
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) {
      const p = grid[r]?.[c];
      if (
        !p ||
        p.row < r0 ||
        p.col < c0 ||
        p.row + Number(p.cell["row-span"] || 1) - 1 > r1 ||
        p.col + Number(p.cell["col-span"] || 1) - 1 > c1
      )
        throw Error("选区必须完整包含合并单元格");
      positions.add(p);
    }
  const anchor = grid[r0][c0]!;
  anchor.cell.text = [...positions]
    .map((p) => p.cell.text || "")
    .filter(Boolean)
    .join(" ");
  anchor.cell["row-span"] = r1 - r0 + 1;
  anchor.cell["col-span"] = c1 - c0 + 1;
  return rows.map((cells, row) =>
    cells.filter(
      (cell, index) =>
        ![...positions].some(
          (p) => p !== anchor && p.row === row && p.index === index,
        ),
    ),
  );
}
export function splitCell(
  rows: TableCell[][],
  width: number,
  row: number,
  col: number,
) {
  const grid = tableGrid(rows, width),
    target = grid[row]?.[col];
  if (!target) return rows;
  return grid.map((line, r) =>
    line.flatMap((p, c) => {
      if (!p) return [{ text: "" }];
      if (p === target) {
        if (r === target.row && c === target.col) {
          const cell = { ...p.cell };
          delete cell["row-span"];
          delete cell["col-span"];
          return [cell];
        }
        return [{ text: "" }];
      }
      return p.row === r && p.col === c ? [p.cell] : [];
    }),
  );
}
