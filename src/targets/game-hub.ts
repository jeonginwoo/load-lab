// game-hub 로비 — github.com/jeonginwoo/game-hub, 프로토콜 server/src/protocol.ts, 접속 주소 규칙 lobby/src/net/net.ts.
// hello{name, at, look} → welcome{id, room}, 움직임 move{at}(칸 단위), 탐침은 chat(보낸 사람에게도 돌아온다, 5초에 5줄).
// 봇은 welcome 의 문자 맵(rows)에서 벽(#)·문(D)을 피해 걷는다 — 물체가 막는 칸은 보지 않는다(서버도 위치를 검사하지 않는다)
import { httpOrigin, randomCode, sameOriginSocket, relayPairs, type BotLogic, type Incoming, type Target } from './target.ts';

type Dir = 'up' | 'down' | 'left' | 'right';
interface Spot {
  readonly x: number;
  readonly y: number;
  readonly dir: Dir;
}

const PROBE = '⏱';
const STEPS: Readonly<Record<Dir, readonly [number, number]>> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const DIRS = Object.keys(STEPS) as Dir[];
const KEEP_GOING = 0.8; // 같은 방향으로 계속 걸을 확률

export interface Grid {
  canStand(x: number, y: number): boolean;
  readonly starts: readonly { readonly x: number; readonly y: number }[];
}

/** 문자 맵 → 걸을 곳. '.'·'S'·'G' 는 바닥, '#'·'D'·맵 밖은 못 간다 */
export function gridOf(rows: readonly string[]): Grid {
  const starts: { x: number; y: number }[] = [];
  rows.forEach((row, y) => [...row].forEach((ch, x) => ch === 'S' && starts.push({ x, y })));
  const canStand = (x: number, y: number): boolean => {
    const ch = rows[y]?.[x];
    return ch === '.' || ch === 'S' || ch === 'G';
  };
  return { canStand, starts: starts.length > 0 ? starts : [{ x: 1, y: 1 }] };
}

/** 다음 자리 — 막히면 다른 방향, 사방이 막히면 제자리에서 방향만 */
export function nextStep(at: Spot, grid: Grid, random: () => number = Math.random): Spot {
  const first: Dir = random() < KEEP_GOING ? at.dir : DIRS[Math.floor(random() * DIRS.length)] ?? 'down';
  for (const dir of [first, ...DIRS.filter((d) => d !== first)]) {
    const [dx, dy] = STEPS[dir];
    if (grid.canStand(at.x + dx, at.y + dy)) return { x: at.x + dx, y: at.y + dy, dir };
  }
  return { ...at, dir: DIRS[(DIRS.indexOf(at.dir) + 1) % DIRS.length] ?? 'down' };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const pick = (n: number): number => Math.floor(Math.random() * n);

export const gameHub: Target = {
  id: 'game-hub',
  title: 'game-hub 로비',
  defaultUrl: 'ws://localhost:8080/ws', // npm run build && STATS=1 npm start. 개발 서버면 ws://localhost:5173/ws
  deployedPage: 'https://nolja-lobby.duckdns.org/',
  pageToSocket: sameOriginSocket('/ws'), // lobby/src/net/net.ts socketUrl — 페이지와 같은 호스트의 /ws
  roomCap: Infinity,
  maxHz: 30,
  probeMinMs: 1000, // 서버 채팅 제한 5초에 5줄
  expected(sizes, hz, probeHz) {
    // move 는 보낸 사람 빼고, chat 은 보낸 사람 포함
    const nn = sizes.reduce((s, n) => s + n * n, 0);
    return { perSec: relayPairs(sizes) * hz + nn * probeHz, approx: false };
  },
  newRoom: () => randomCode(6),
  socketUrl: (base, room) => `${base}?room=${room}`,
  statsUrl: (base) => `${httpOrigin(base)}/__stats`,
  watch: (base, room) => ({ url: `${httpOrigin(base)}/?room=${room}`, note: '로비에 이름을 넣고 들어가면 봇이 보인다 (이 창도 접속자 1명)' }),
  bot({ n }): BotLogic {
    let id: string | null = null;
    let grid: Grid = gridOf([]);
    let at: Spot = { x: 1, y: 1, dir: 'down' };
    return {
      hello: () => ({
        t: 'hello',
        name: `봇${n + 1}`,
        at,
        look: { body: pick(8), hair: pick(5), hat: pick(4), beard: pick(3) },
      }),
      receive(msg): Incoming {
        if (!isRecord(msg)) return { kind: 'other' };
        if (msg.t === 'welcome' && typeof msg.id === 'string') {
          id = msg.id;
          const room = isRecord(msg.room) && Array.isArray(msg.room.rows) ? (msg.room.rows as string[]) : [];
          grid = gridOf(room);
          const s = grid.starts[n % grid.starts.length] ?? { x: 1, y: 1 };
          at = { ...s, dir: 'down' };
          return { kind: 'welcome', id };
        }
        if (msg.t === 'chat' && msg.id !== id && typeof msg.id === 'string' && typeof msg.text === 'string' && msg.text.startsWith(PROBE)) {
          return { kind: 'probe', from: msg.id, sentAt: Number(msg.text.slice(PROBE.length)) };
        }
        return { kind: 'other' };
      },
      move() {
        at = nextStep(at, grid);
        return { t: 'move', at };
      },
      probe: (now) => ({ t: 'chat', text: `${PROBE}${now}` }),
    };
  },
};
