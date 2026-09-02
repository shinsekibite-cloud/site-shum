/** Russian draughts (русские шашки) — pure board rules. */

export type Cell = 0 | 1 | 2 | 3 | 4;
/** dark = black (top / AI), light = white (bottom / player) */
export type Side = 'dark' | 'light';
export type Pos = { r: number; c: number };
export type Capture = { to: Pos; mid: Pos };

export const BOARD_SIZE = 8;

export function initialBoard(): Cell[][] {
  const b: Cell[][] = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if ((r + c) % 2 === 1) {
        if (r < 3) b[r][c] = 1; // dark men
        if (r > 4) b[r][c] = 2; // light men
      }
    }
  }
  return b;
}

export function cloneBoard(board: Cell[][]): Cell[][] {
  return board.map((row) => [...row]) as Cell[][];
}

export function sideOf(v: Cell): Side | null {
  if (v === 1 || v === 3) return 'dark';
  if (v === 2 || v === 4) return 'light';
  return null;
}

export function isKing(v: Cell) {
  return v === 3 || v === 4;
}

export function inBoard(r: number, c: number) {
  return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
}

/** Playable (dark) squares only. */
export function isPlayableSquare(r: number, c: number) {
  return inBoard(r, c) && (r + c) % 2 === 1;
}

const DIAG: Pos[] = [
  { r: -1, c: -1 },
  { r: -1, c: 1 },
  { r: 1, c: -1 },
  { r: 1, c: 1 },
];

/** Quiet step directions for a man (forward only). */
function manQuietDirs(side: Side): Pos[] {
  return side === 'dark'
    ? [
        { r: 1, c: -1 },
        { r: 1, c: 1 },
      ]
    : [
        { r: -1, c: -1 },
        { r: -1, c: 1 },
      ];
}

export function promote(v: Cell, r: number): Cell {
  if (v === 1 && r === BOARD_SIZE - 1) return 3;
  if (v === 2 && r === 0) return 4;
  return v;
}

function samePos(a: Pos, b: Pos) {
  return a.r === b.r && a.c === b.c;
}

/** Captures available from a square (men: adjacent; kings: flying). */
export function capturesFrom(board: Cell[][], from: Pos): Capture[] {
  const v = board[from.r][from.c];
  const me = sideOf(v);
  if (!me) return [];
  return isKing(v) ? kingCapturesFrom(board, from, me) : manCapturesFrom(board, from, me);
}

function manCapturesFrom(board: Cell[][], from: Pos, me: Side): Capture[] {
  const out: Capture[] = [];
  for (const d of DIAG) {
    const mr = from.r + d.r;
    const mc = from.c + d.c;
    const tr = from.r + d.r * 2;
    const tc = from.c + d.c * 2;
    if (!inBoard(tr, tc) || !isPlayableSquare(tr, tc)) continue;
    const mid = board[mr]?.[mc] || 0;
    if (!mid || sideOf(mid) === me) continue;
    if (board[tr][tc] !== 0) continue;
    out.push({ to: { r: tr, c: tc }, mid: { r: mr, c: mc } });
  }
  return out;
}

function kingCapturesFrom(board: Cell[][], from: Pos, me: Side): Capture[] {
  const out: Capture[] = [];
  for (const d of DIAG) {
    let r = from.r + d.r;
    let c = from.c + d.c;
    // Slide over empties until a piece
    while (inBoard(r, c) && board[r][c] === 0) {
      r += d.r;
      c += d.c;
    }
    if (!inBoard(r, c)) continue;
    const midV = board[r][c];
    if (!midV || sideOf(midV) === me) continue;
    const mid = { r, c };
    r += d.r;
    c += d.c;
    // Must land on at least one empty beyond the captured piece
    while (inBoard(r, c) && board[r][c] === 0) {
      if (isPlayableSquare(r, c)) out.push({ to: { r, c }, mid });
      r += d.r;
      c += d.c;
    }
  }
  return out;
}

export function allCaptures(board: Cell[][], side: Side): { from: Pos; to: Pos; mid: Pos }[] {
  const list: { from: Pos; to: Pos; mid: Pos }[] = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (sideOf(board[r][c]) !== side) continue;
      for (const cap of capturesFrom(board, { r, c })) {
        list.push({ from: { r, c }, ...cap });
      }
    }
  }
  return list;
}

/** Quiet (non-capture) destinations. Respects mandatory capture. */
export function quietMovesFrom(board: Cell[][], from: Pos): Pos[] {
  const v = board[from.r][from.c];
  const me = sideOf(v);
  if (!me) return [];
  if (allCaptures(board, me).length) return [];

  if (!isKing(v)) {
    const out: Pos[] = [];
    for (const d of manQuietDirs(me)) {
      const r = from.r + d.r;
      const c = from.c + d.c;
      if (inBoard(r, c) && isPlayableSquare(r, c) && board[r][c] === 0) out.push({ r, c });
    }
    return out;
  }

  const out: Pos[] = [];
  for (const d of DIAG) {
    let r = from.r + d.r;
    let c = from.c + d.c;
    while (inBoard(r, c) && board[r][c] === 0) {
      if (isPlayableSquare(r, c)) out.push({ r, c });
      r += d.r;
      c += d.c;
    }
  }
  return out;
}

export function movesFrom(board: Cell[][], from: Pos): Pos[] {
  const v = board[from.r][from.c];
  const me = sideOf(v);
  if (!me) return [];
  const caps = capturesFrom(board, from);
  if (allCaptures(board, me).length) return caps.map((x) => x.to);
  return quietMovesFrom(board, from);
}

export function findCapture(board: Cell[][], from: Pos, to: Pos): Capture | null {
  return capturesFrom(board, from).find((c) => samePos(c.to, to)) || null;
}

export function applyQuietMove(board: Cell[][], from: Pos, to: Pos): Cell[][] {
  const next = cloneBoard(board);
  const v = next[from.r][from.c];
  next[from.r][from.c] = 0;
  next[to.r][to.c] = promote(v, to.r);
  return next;
}

export function applyCaptureMove(board: Cell[][], from: Pos, to: Pos, mid: Pos): Cell[][] {
  const next = cloneBoard(board);
  const v = next[from.r][from.c];
  next[from.r][from.c] = 0;
  next[mid.r][mid.c] = 0;
  next[to.r][to.c] = promote(v, to.r);
  return next;
}

export function applyBoardMove(board: Cell[][], from: Pos, to: Pos): Cell[][] {
  const cap = findCapture(board, from, to);
  if (cap) return applyCaptureMove(board, from, to, cap.mid);
  return applyQuietMove(board, from, to);
}

export function allMoves(board: Cell[][], side: Side): { from: Pos; to: Pos }[] {
  const caps = allCaptures(board, side);
  if (caps.length) return caps.map((c) => ({ from: c.from, to: c.to }));
  const options: { from: Pos; to: Pos }[] = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (sideOf(board[r][c]) !== side) continue;
      for (const t of quietMovesFrom(board, { r, c })) options.push({ from: { r, c }, to: t });
    }
  }
  return options;
}

export function countSide(board: Cell[][], side: Side) {
  let n = 0;
  for (const row of board) for (const cell of row) if (sideOf(cell) === side) n += 1;
  return n;
}

/** Pieces only on dark squares — invariant for Russian draughts. */
export function assertDarkSquaresOnly(board: Cell[][]): boolean {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] && (r + c) % 2 === 0) return false;
    }
  }
  return true;
}
