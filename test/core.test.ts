import { describe, expect, it } from 'vitest';
import { percentile, Sampler } from '../src/core/metrics.ts';
import { RoomPlan } from '../src/core/rooms.ts';

describe('percentile', () => {
  it('정렬된 값의 백분위, 비면 NaN', () => {
    const v = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(v, 50)).toBe(50);
    expect(percentile(v, 99)).toBe(99);
    expect(percentile(v, 100)).toBe(100);
    expect(percentile([], 50)).toBeNaN();
  });
});

describe('Sampler', () => {
  it('cap 까지는 다 담고, 넘쳐도 cap 개만 들고 seen 은 모두 센다', () => {
    const s = new Sampler(10);
    for (let i = 0; i < 1000; i++) s.add(i);
    expect(s.sorted()).toHaveLength(10);
    expect(s.seen).toBe(1000);
  });

  it('넘친 뒤에도 고르게 바꿔 넣는다 — 뒤쪽 값도 들어온다', () => {
    const s = new Sampler(100);
    for (let i = 0; i < 10_000; i++) s.add(i);
    expect(Math.max(...s.sorted())).toBeGreaterThan(5000);
  });
});

describe('RoomPlan', () => {
  const codes = (i: number) => `r${i}`;

  it('방마다 첫 봇이 만들고, 열리기 전엔 기다렸다가, 열리면 바로 들어간다', () => {
    const p = new RoomPlan(codes, 1, Infinity);
    expect(p.assign()).toEqual({ room: 'r0', role: 'create' });
    expect(p.assign()).toEqual({ room: 'r0', role: 'wait' });
    p.ready('r0');
    expect(p.assign()).toEqual({ room: 'r0', role: 'join' });
  });

  it('want 개 방에 고르게 나눈다', () => {
    const p = new RoomPlan(codes, 3, Infinity);
    const rooms = Array.from({ length: 6 }, () => p.assign().room);
    expect(rooms.sort()).toEqual(['r0', 'r0', 'r1', 'r1', 'r2', 'r2']);
  });

  it('방이 cap 에 차면 새 방을 연다 (rinfish 20명)', () => {
    const p = new RoomPlan(codes, 1, 20);
    for (let i = 0; i < 20; i++) p.assign();
    expect(p.assign()).toEqual({ room: 'r1', role: 'create' });
  });

  it('만들다 실패한 방은 버리고 다음 봇은 새 방을 연다', () => {
    const p = new RoomPlan(codes, 1, Infinity);
    p.assign();
    p.dead('r0');
    expect(p.assign()).toEqual({ room: 'r1', role: 'create' });
  });

  it('봇이 떠나면 자리가 빈다 — 방은 열린 채로 남는다', () => {
    const p = new RoomPlan(codes, 1, 2);
    p.assign();
    p.ready('r0');
    p.assign();
    p.release('r0');
    expect(p.assign()).toEqual({ room: 'r0', role: 'join' });
  });
});
