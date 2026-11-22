// A push-optimal Sokoban solver, written for make.fun's sokoban-solver-01.
// The idea: a level is a hallway with rooms off it, and a box never leaves its
// room, so the level is solved one room at a time and the rooms' push counts add
// up. Inside a room the search is a breadth-first search over pushes (so the
// first solved state it meets is push-optimal), with two deadlocks pruned:
// a box on a dead square (no push from there ever reaches a goal) and a frozen
// 2x2 block of walls and boxes with a box off its goal. The player's walk
// between pushes is the shortest path around walls and boxes.
// Node 22, standard library only. Reads /input/<id>/level.txt, writes
// /output/<id>/solution.txt for every instance in one run.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** How many states one room search keeps before it gives up. */
const MAX_STATES = 250_000;
/** Soft wall-clock budget for the whole run, in ms (the harness allows 60 s). */
const TIME_BUDGET_MS = 50_000;

const DX = [0, 0, -1, 1];
const DY = [-1, 1, 0, 0];
const STEP = ['u', 'd', 'l', 'r'];
const PUSH = ['U', 'D', 'L', 'R'];

interface Level {
  w: number;
  h: number;
  wall: Uint8Array;
  goals: number[];
  boxes: number[];
  player: number;
}

function parse(text: string): Level {
  const rows = text.split('\n').filter((r) => r.length > 0);
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const wall = new Uint8Array(w * h).fill(1);
  const goals: number[] = [];
  const boxes: number[] = [];
  let player = -1;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      const i = y * w + x;
      if (ch === '#') continue;
      wall[i] = 0;
      if (ch === '.' || ch === '*' || ch === '+') goals.push(i);
      if (ch === '$' || ch === '*') boxes.push(i);
      if (ch === '@' || ch === '+') player = i;
    }
  });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) wall[y * w + x] = 1;
    }
  }
  return { w, h, wall, goals, boxes: boxes.sort((a, b) => a - b), player };
}

/**
 * The squares a box can be pushed from onto some goal: every goal, plus any
 * square y from which a push y -> x lands on a live square x while the player
 * can stand at y - d to make that push.
 */
function liveSquares(lv: Level): Uint8Array {
  const { w, wall, goals } = lv;
  const live = new Uint8Array(wall.length);
  const queue = [...goals];
  for (const g of goals) live[g] = 1;
  for (let qi = 0; qi < queue.length; qi++) {
    const x = queue[qi]!;
    for (let k = 0; k < 4; k++) {
      const d = DY[k]! * w + DX[k]!;
      const y = x - d;
      if (y < 0 || y >= wall.length) continue;
      if (!wall[y] && !wall[y - d] && !live[y]) {
        live[y] = 1;
        queue.push(y);
      }
    }
  }
  return live;
}

/** Flood-fill the squares the player reaches from `from` with `occ` in the way; returns the lowest square reached. */
function regionLow(lv: Level, occ: Uint8Array, from: number, seen: Int32Array, stamp: number, stack: Int32Array): number {
  const { w, wall } = lv;
  let low = from;
  let n = 0;
  stack[n++] = from;
  seen[from] = stamp;
  while (n > 0) {
    const p = stack[--n]!;
    if (p < low) low = p;
    for (let k = 0; k < 4; k++) {
      const q = k === 0 ? p - w : k === 1 ? p + w : k === 2 ? p - 1 : p + 1;
      if (q < 0 || q >= wall.length) continue;
      if (wall[q] === 0 && occ[q] === 0 && seen[q] !== stamp) {
        seen[q] = stamp;
        stack[n++] = q;
      }
    }
  }
  return low;
}

/** Whether the box pushed to `t` is stuck in a 2x2 block of walls and boxes with a box off its goal. */
function isFrozen(lv: Level, occ: Uint8Array, goal: Uint8Array, t: number): boolean {
  const { w, wall } = lv;
  for (const a of [t, t - 1, t - w, t - w - 1]) {
    if (a < 0 || a + w + 1 >= wall.length) continue;
    const b = a + 1;
    const c = a + w;
    const d = c + 1;
    if (!(wall[a] || occ[a]) || !(wall[b] || occ[b]) || !(wall[c] || occ[c]) || !(wall[d] || occ[d])) continue;
    if ((occ[a] && !goal[a]) || (occ[b] && !goal[b]) || (occ[c] && !goal[c]) || (occ[d] && !goal[d])) return true;
  }
  return false;
}

/** The shortest walk from `from` to `to` around walls and boxes, in lower-case LURD letters. */
function walk(lv: Level, occ: Uint8Array, from: number, to: number): string {
  const { w, wall } = lv;
  if (from === to) return '';
  const prev = new Int32Array(wall.length).fill(-1);
  const how = new Array<string>(wall.length);
  const queue = [from];
  prev[from] = from;
  for (let qi = 0; qi < queue.length; qi++) {
    const p = queue[qi]!;
    if (p === to) break;
    for (let k = 0; k < 4; k++) {
      const q = p + DY[k]! * w + DX[k]!;
      if (q < 0 || q >= wall.length) continue;
      if (wall[q] || occ[q] || prev[q] !== -1) continue;
      prev[q] = p;
      how[q] = STEP[k]!;
      queue.push(q);
    }
  }
  if (prev[to] === -1) throw new Error('walk: target out of reach');
  let s = '';
  for (let p = to; p !== from; p = prev[p]!) s = how[p]! + s;
  return s;
}

/** The player's square after playing `moves` (case aside) from `from` on a board `w` wide. */
function afterMoves(w: number, from: number, moves: string): number {
  let p = from;
  for (const ch of moves.toLowerCase()) p += ch === 'u' ? -w : ch === 'd' ? w : ch === 'l' ? -1 : 1;
  return p;
}

interface Solved {
  pushes: number;
  moves: string;
}

/**
 * The push-optimal solution of `lv`, or null when the search gives up. A state
 * is the sorted boxes plus the player's reachable region (named by its lowest
 * square); states are expanded in push order, so the first solved state is
 * optimal. Dead squares and frozen 2x2 blocks are pruned.
 */
function solvePushOptimal(lv: Level, deadline: number): Solved | null {
  const { w, wall, goals } = lv;
  const size = wall.length;
  const goal = new Uint8Array(size);
  for (const g of goals) goal[g] = 1;
  const live = liveSquares(lv);
  const occ = new Uint8Array(size);
  const seen = new Int32Array(size);
  const mark = new Int32Array(size);
  const stack = new Int32Array(size);
  let stamp = 0;
  const solved = (bs: number[]): boolean => bs.every((b) => goal[b]);
  if (lv.boxes.some((b) => !live[b])) return null;

  const stateBoxes: number[][] = [lv.boxes];
  const statePlayer: number[] = [lv.player];
  const parent: number[] = [-1];
  const index = new Map<number, number>();
  for (const b of lv.boxes) occ[b] = 1;
  index.set(keyOf(lv.boxes, regionLow(lv, occ, lv.player, seen, ++stamp, stack), size), 0);
  for (const b of lv.boxes) occ[b] = 0;
  let found = solved(lv.boxes) ? 0 : -1;
  for (let head = 0; found < 0 && head < stateBoxes.length; head++) {
    if ((head & 1023) === 0 && Date.now() > deadline) return null;
    const boxes = stateBoxes[head]!;
    for (const b of boxes) occ[b] = 1;
    regionLow(lv, occ, statePlayer[head]!, seen, ++stamp, stack);
    const here = stamp;
    for (let bi = 0; bi < boxes.length && found < 0; bi++) {
      const b = boxes[bi]!;
      for (let k = 0; k < 4; k++) {
        const d = DY[k]! * w + DX[k]!;
        const t = b + d;
        if (t < 0 || t >= size) continue;
        if (seen[b - d] !== here || wall[t] || occ[t] || !live[t]) continue;
        occ[b] = 0;
        occ[t] = 1;
        const frozen = isFrozen(lv, occ, goal, t);
        let key = -1;
        let next: number[] | null = null;
        if (!frozen) {
          next = boxes.slice();
          next[bi] = t;
          next.sort((a, b) => a - b);
          key = keyOf(next, regionLow(lv, occ, b, mark, ++stamp, stack), size);
        }
        occ[t] = 0;
        occ[b] = 1;
        if (frozen || index.has(key)) continue;
        if (stateBoxes.length >= MAX_STATES) {
          for (const x of boxes) occ[x] = 0;
          return null;
        }
        index.set(key, stateBoxes.length);
        stateBoxes.push(next!);
        statePlayer.push(b);
        parent.push(head);
        if (solved(next!)) {
          found = stateBoxes.length - 1;
          break;
        }
      }
    }
    for (const x of boxes) occ[x] = 0;
  }
  if (found < 0) return null;
  const path: number[] = [];
  for (let s = found; s > 0; s = parent[s]!) path.push(s);
  path.reverse();
  let moves = '';
  let player = lv.player;
  let boxes = lv.boxes;
  for (const s of path) {
    const nextBoxes = stateBoxes[s]!;
    const from = boxes.find((b) => !nextBoxes.includes(b))!;
    const to = nextBoxes.find((b) => !boxes.includes(b))!;
    const d = to - from;
    const k = DY.findIndex((dy, i) => dy * w + DX[i]! === d);
    for (const b of boxes) occ[b] = 1;
    moves += walk(lv, occ, player, from - d);
    for (const b of boxes) occ[b] = 0;
    moves += PUSH[k]!;
    player = from;
    boxes = nextBoxes;
  }
  return { pushes: path.length, moves };
}

/** A state's key: the region's lowest square and the boxes' squares, as digits in base `size`. */
function keyOf(boxes: number[], low: number, size: number): number {
  let k = low;
  for (const b of boxes) k = k * size + b;
  return k;
}

interface Room {
  boxes: number[];
  goals: number[];
  done: boolean;
}

/**
 * The level's rooms: cut the dead squares of the player's row (the hallway: a
 * box there reaches no goal) out of the floor, and each part left that holds a
 * box is a room. Null when a part holds more or fewer boxes than goals, or a
 * box starts in the hallway.
 */
function roomsOf(lv: Level): Room[] | null {
  const { w, wall, goals, boxes, player } = lv;
  const live = liveSquares(lv);
  const row = Math.floor(player / w);
  const cut = new Uint8Array(wall.length);
  for (let i = row * w; i < (row + 1) * w; i++) if (!wall[i] && !live[i]) cut[i] = 1;
  if (boxes.some((b) => cut[b])) return null;
  const part = new Int32Array(wall.length).fill(-1);
  const rooms: Room[] = [];
  for (let s = 0; s < wall.length; s++) {
    if (wall[s] || cut[s] || part[s] >= 0) continue;
    const squares = [s];
    part[s] = rooms.length;
    for (let i = 0; i < squares.length; i++) {
      for (let k = 0; k < 4; k++) {
        const q = squares[i]! + DY[k]! * w + DX[k]!;
        if (q < 0 || q >= wall.length) continue;
        if (!wall[q] && !cut[q] && part[q] < 0) {
          part[q] = rooms.length;
          squares.push(q);
        }
      }
    }
    rooms.push({ boxes: [], goals: [], done: false });
  }
  for (const b of boxes) rooms[part[b]!]!.boxes.push(b);
  for (const g of goals) if (part[g]! >= 0) rooms[part[g]!]!.goals.push(g);
  if (goals.some((g) => part[g]! < 0) || rooms.some((r) => r.boxes.length !== r.goals.length)) return null;
  return rooms.filter((r) => r.boxes.length > 0);
}

/**
 * The level solved room by room: each room's push-optimal solution in turn,
 * the other rooms' boxes standing as walls (on their goals once their room is
 * done), the player walking on from where the last room left it. A box never
 * leaves its room, so the rooms' optima add up to the level's.
 */
function solveByRooms(lv: Level, deadline: number): Solved | null {
  const rooms = roomsOf(lv);
  if (rooms === null) return solvePushOptimal(lv, deadline);
  let player = lv.player;
  let pushes = 0;
  let moves = '';
  for (const room of rooms) {
    const wall = lv.wall.slice();
    for (const other of rooms) {
      if (other === room) continue;
      for (const b of other.done ? other.goals : other.boxes) wall[b] = 1;
    }
    const sub: Level = {
      w: lv.w,
      h: lv.h,
      wall,
      goals: room.goals.slice().sort((a, b) => a - b),
      boxes: room.boxes.slice().sort((a, b) => a - b),
      player,
    };
    const solved = solvePushOptimal(sub, deadline);
    if (solved === null) return null;
    pushes += solved.pushes;
    moves += solved.moves;
    player = afterMoves(lv.w, player, solved.moves);
    room.done = true;
  }
  return { pushes, moves };
}

function solve(text: string, deadline: number): string {
  const lv = parse(text);
  const solved = solveByRooms(lv, deadline);
  return solved === null ? '' : solved.moves;
}

const start = Date.now();
const deadline = start + TIME_BUDGET_MS;
for (const id of readdirSync(I).sort()) {
  const moves = Date.now() > deadline ? '' : solve(readFileSync(join(I, id, 'level.txt'), 'utf8'), deadline);
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'solution.txt'), `${moves}\n`);
}
