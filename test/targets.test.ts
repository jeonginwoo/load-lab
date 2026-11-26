import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { gridOf, nextStep } from '../src/targets/game-hub.ts';
import { TARGETS, targetById } from '../src/targets/index.ts';
import { toSocketBase } from '../src/targets/target.ts';
import { passHashFor, rinfish, roomIdFor } from '../src/targets/rinfish.ts';
import { latencyFromYaw, stampYaw, whiteboard } from '../src/targets/whiteboard.ts';

describe('game-hub', () => {
  const rows = ['#####', '#S..#', '#.#.#', '#...#', '##D##'];
  const grid = gridOf(rows);

  it('S 가 시작점, 벽·문·맵 밖은 못 간다', () => {
    expect(grid.starts).toEqual([{ x: 1, y: 1 }]);
    expect(grid.canStand(1, 1)).toBe(true);
    expect(grid.canStand(2, 2)).toBe(false);
    expect(grid.canStand(2, 4)).toBe(false); // 문
    expect(grid.canStand(-1, 0)).toBe(false);
  });

  it('오래 걸어도 걸을 수 있는 칸만, 한 칸씩', () => {
    let at = { x: 1, y: 1, dir: 'down' as const } as Parameters<typeof nextStep>[0];
    for (let i = 0; i < 500; i++) {
      const to = nextStep(at, grid);
      expect(Math.abs(to.x - at.x) + Math.abs(to.y - at.y)).toBeLessThanOrEqual(1);
      expect(grid.canStand(to.x, to.y)).toBe(true);
      at = to;
    }
  });

  it('welcome 의 문자 맵 시작점에서 걷고, 남의 탐침 채팅만 지연으로 본다', () => {
    const bot = TARGETS[0]!.bot({ n: 0, room: 'abc234', create: true });
    expect(bot.receive({ t: 'welcome', id: 'p1', room: { rows } }, 0)).toEqual({ kind: 'welcome', id: 'p1' });
    expect(bot.move(0)).toMatchObject({ t: 'move' });
    expect(bot.receive({ t: 'chat', id: 'p2', text: '⏱1000' }, 1005)).toEqual({ kind: 'probe', from: 'p2', sentAt: 1000 });
    expect(bot.receive({ t: 'chat', id: 'p1', text: '⏱1000' }, 1005)).toEqual({ kind: 'other' }); // 내 것
  });
});

describe('whiteboard', () => {
  it('yaw 에 실은 시각으로 지연을 되찾는다 — 시계가 한 바퀴 돌아도', () => {
    const sent = 1_799_999_999_990;
    expect(latencyFromYaw(stampYaw(sent), sent + 25)).toBeCloseTo(25, 3);
    const wrapSent = 1e8 * 18000 - 10; // 한 바퀴 직전
    expect(latencyFromYaw(stampYaw(wrapSent), wrapSent + 30)).toBeCloseTo(30, 3);
  });

  it('남의 state 는 탐침, 탐침 채팅은 없다', () => {
    const bot = whiteboard.bot({ n: 0, room: 'load-x', create: true });
    bot.receive({ t: 'welcome', id: 'u1' }, 0);
    const now = 1_800_000_000_000;
    const st = (bot.move(now) as { st: { yaw: number } }).st;
    expect(bot.receive({ t: 'state', id: 'u2', st }, now + 12)).toMatchObject({ kind: 'probe', from: 'u2' });
    expect(bot.probe(now)).toBeNull();
  });
});

describe('rinfish', () => {
  const sha = (s: string) => createHash('sha256').update(s).digest('hex');

  it('방 id·암호 해시를 게임과 같은 규칙으로 (roomKey.ts)', () => {
    expect(roomIdFor('  Load-AB ')).toBe(sha('rinfish-room|load-ab').slice(0, 32));
    expect(passHashFor('abc', 'pw')).toBe(sha('abc|pw'));
    expect(rinfish.socketUrl('ws://localhost:8787/', 'load-ab')).toBe(`ws://localhost:8787/rooms/${roomIdFor('load-ab')}`);
  });

  it('방마다 첫 봇은 create, 나머지는 join — 서버 error 는 거절', () => {
    expect(rinfish.bot({ n: 0, room: 'r', create: true }).hello()).toMatchObject({ type: 'hello', mode: 'create', v: 1 });
    const joiner = rinfish.bot({ n: 1, room: 'r', create: false });
    expect(joiner.hello()).toMatchObject({ mode: 'join' });
    expect(joiner.receive({ type: 'error', code: 'full' }, 0)).toEqual({ kind: 'reject', reason: 'full' });
  });
});

describe('게임 페이지 주소 → 서버 ws 주소 (toSocketBase)', () => {
  const hub = targetById('game-hub')!;

  it('game-hub·whiteboard 는 클라이언트 규칙대로 같은 호스트의 /ws — https 면 wss, 경로·쿼리·# 는 버린다', () => {
    expect(toSocketBase(hub, 'https://hub.example.com/lobby?room=ab#x')).toEqual({ base: 'wss://hub.example.com/ws' });
    expect(toSocketBase(hub, 'http://localhost:5173')).toEqual({ base: 'ws://localhost:5173/ws' });
    expect(toSocketBase(whiteboard, 'https://wb.example.com:8443/')).toEqual({ base: 'wss://wb.example.com:8443/ws' });
  });

  it('ws(s):// 는 그대로, 규칙을 모르는 대상(rinfish)·다른 프로토콜·주소 아닌 것은 거절', () => {
    expect(toSocketBase(rinfish, 'wss://rooms.example.workers.dev')).toEqual({ base: 'wss://rooms.example.workers.dev' });
    expect(toSocketBase(rinfish, 'https://rinfish.example.com')).toHaveProperty('error');
    expect(toSocketBase(hub, 'ftp://x')).toHaveProperty('error');
    expect(toSocketBase(hub, 'hub.example.com')).toHaveProperty('error');
  });
});
