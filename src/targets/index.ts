// 대상 목록 — 새 서버는 target.ts 의 Target 을 하나 만들어 여기에 더한다
import { gameHub } from './game-hub.ts';
import { rinfish } from './rinfish.ts';
import type { Target } from './target.ts';
import { whiteboard } from './whiteboard.ts';

export const TARGETS: readonly Target[] = [gameHub, whiteboard, rinfish];

export function targetById(id: string): Target | undefined {
  return TARGETS.find((t) => t.id === id);
}
