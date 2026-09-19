import type { SlideElement, TableCell } from "./types.js";

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

/** Insert at a grid boundary or delete one grid track, without mutating input.
 * Cells spanning a deleted anchor keep their content and attributes.
 * Only cells wholly contained in the deleted track are discarded.
 */
export function editTableStructure(
  table: Pick<SlideElement, "rowsData" | "cols" | "rowsRatio">,
  axis: "row" | "col",
  operation: "insert" | "delete",
  at: number,
): Pick<SlideElement, "rowsData" | "cols" | "rowsRatio"> {
  const rows = table.rowsData || [],
    width = table.cols?.length || 1;
  const count = axis === "row" ? rows.length : width;
  if (
    !Number.isInteger(at) ||
    at < 0 ||
    at >= count + (operation === "insert" ? 1 : 0)
  )
    throw Error("行列位置超出表格范围");
  if (operation === "delete" && count <= 1) throw Error("表格至少保留一行一列");
  const delta = operation === "insert" ? 1 : -1;
  const height = rows.length + (axis === "row" ? delta : 0);
  const nextWidth = width + (axis === "col" ? delta : 0);
  const grid = tableGrid(rows, width);
  const positions = new Set(grid.flat().filter((p): p is CellPosition => !!p));
  const anchors: { row: number; col: number; cell: TableCell }[] = [];
  const occupied = Array.from({ length: height }, () =>
    Array(nextWidth).fill(false),
  );
  for (const pos of positions) {
    let row = pos.row,
      col = pos.col;
    let rs = Number(pos.cell["row-span"] || 1),
      cs = Number(pos.cell["col-span"] || 1);
    let start = axis === "row" ? row : col,
      span = axis === "row" ? rs : cs;
    if (operation === "insert") {
      if (start >= at) start++;
      else if (start + span > at) span++;
    } else {
      if (start > at) start--;
      else if (start + span > at) {
        if (span === 1) continue;
        span--;
      }
    }
    if (axis === "row") {
      row = start;
      rs = span;
    } else {
      col = start;
      cs = span;
    }
    const cell = structuredClone(pos.cell);
    if (rs > 1) cell["row-span"] = rs;
    else delete cell["row-span"];
    if (cs > 1) cell["col-span"] = cs;
    else delete cell["col-span"];
    anchors.push({ row, col, cell });
    for (let r = row; r < row + rs; r++)
      for (let c = col; c < col + cs; c++) occupied[r][c] = true;
  }
  for (let r = 0; r < height; r++)
    for (let c = 0; c < nextWidth; c++)
      if (!occupied[r][c]) anchors.push({ row: r, col: c, cell: { text: "" } });
  const rowsData: TableCell[][] = Array.from({ length: height }, () => []);
  anchors
    .sort((a, b) => a.row - b.row || a.col - b.col)
    .forEach(({ row, cell }) => rowsData[row].push(cell));
  const resizeRatios = (values: number[]) => {
    const next = [...values];
    if (operation === "insert")
      next.splice(at, 0, next[Math.min(at, count - 1)] || 1);
    else next.splice(at, 1);
    const sum = next.reduce((a, b) => a + b, 0);
    return next.map((n) => n / sum);
  };
  return {
    rowsData,
    cols:
      axis === "col"
        ? resizeRatios(table.cols || [1])
        : [...(table.cols || [1])],
    rowsRatio: table.rowsRatio?.length
      ? axis === "row"
        ? resizeRatios(table.rowsRatio)
        : [...table.rowsRatio]
      : undefined,
  };
}
