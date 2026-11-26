// 부하 대상 하나 — 서버마다 다른 것(주소, 입장, 움직임, 지연 탐침)만 여기에. 측정·화면은 core 가 맡는다.

export interface BotCtx {
  readonly n: number; // 봇 번호 (0부터)
  readonly room: string; // 이 대상의 방 코드·이름
  readonly create: boolean; // 이 봇이 방을 연다 (방마다 첫 봇)
}

/** 받은 메시지를 core 가 알아야 하는 만큼만 */
export type Incoming =
  | { readonly kind: 'welcome'; readonly id: string }
  | { readonly kind: 'reject'; readonly reason: string } // 서버가 입장을 거절 (rinfish 의 error)
  | { readonly kind: 'probe'; readonly from: string; readonly sentAt: number } // 다른 봇이 보낸 시각이 실린 메시지
  | { readonly kind: 'other' };

/** 봇 하나의 대상별 상태 — 걷기 자리 등 */
export interface BotLogic {
  hello(): unknown;
  receive(msg: unknown, now: number): Incoming;
  /** 움직임 한 번 — 보낼 메시지 (시각을 싣는 대상은 now 를 싣는다) */
  move(now: number): unknown;
  /** 지연 탐침 — 움직임에 시각을 싣는 대상은 null */
  probe(now: number): unknown;
}

export interface Target {
  readonly id: string;
  readonly title: string;
  readonly defaultUrl: string; // 로컬 서버 기본 주소
  /** 배포된 게임 페이지 주소 — --allow-remote 로 띄우면 이쪽이 기본. 남의 서버(주인 동의 전)·페이지로 접속 주소를 모르는 대상은 null */
  readonly deployedPage: string | null;
  readonly roomCap: number; // 방 하나 최대 인원 (서버 규칙). 없으면 Infinity
  readonly maxHz: number; // 서버가 받아 주는 봇당 움직임 빈도 상한
  readonly probeMinMs: number; // 탐침 간격 하한 (서버 채팅 빈도 제한). 움직임에 싣는 대상은 0
  /** 지금 방 인원 n 들, 봇당 hz, 탐침 hz → 서버가 초당 봇들에게 보내야 하는 메시지 수 (대략이면 approx) */
  expected(roomSizes: readonly number[], hz: number, probeHz: number): { readonly perSec: number; readonly approx: boolean };
  newRoom(i: number): string;
  /**
   * 게임 페이지 주소(http/https) → 서버 ws 주소. 실제 클라이언트가 페이지 주소에서 접속 주소를 만드는 규칙을 그대로 옮긴다
   * (대상 파일 머리에 따라 한 클라이언트 파일을 적는다). 접속 서버가 페이지와 따로라 페이지로 알 수 없는 대상은 null
   */
  readonly pageToSocket: ((page: URL) => string) | null;
  socketUrl(base: string, room: string): string;
  /** 서버 지표 주소 (docs/stats-contract.md) — 없는 대상은 null */
  statsUrl(base: string): string | null;
  /** 브라우저로 봇을 보러 갈 곳 — url 이 없으면 안내 글만 */
  watch(base: string, room: string): { readonly url: string | null; readonly note: string };
  bot(ctx: BotCtx): BotLogic;
}

/** 페이지와 같은 호스트의 path 로 붙는 클라이언트 규칙 — https 면 wss. 페이지의 경로·쿼리·# 는 버린다 */
export function sameOriginSocket(path: string): (page: URL) => string {
  return (page) => {
    const u = new URL(path, page);
    u.protocol = page.protocol === 'https:' ? 'wss:' : 'ws:';
    return u.href;
  };
}

/**
 * 사람이 넣은 주소 → 봇이 붙을 ws 주소. ws(s):// 는 그대로, http(s):// 는 대상의 pageToSocket 으로.
 * 원격 여부는 여기서 보지 않는다 — 바꾼 주소가 run.ts 의 checkBase 를 지난다
 */
export function toSocketBase(target: Target, input: string): { readonly base: string } | { readonly error: string } {
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    return { error: `주소가 아니다: ${input}` };
  }
  if (u.protocol === 'ws:' || u.protocol === 'wss:') return { base: input };
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { error: `ws(s):// 서버 주소나 http(s):// 게임 페이지 주소여야 한다: ${input}` };
  if (!target.pageToSocket) return { error: `${target.title} 은 페이지 주소로 서버 주소를 알 수 없다(접속 서버가 따로다) — ws(s):// 서버 주소를 넣을 것: ${input}` };
  return { base: target.pageToSocket(u) };
}

/** ws(s)://host/... → http(s)://host */
export function httpOrigin(wsBase: string): string {
  const u = new URL(wsBase);
  return `${u.protocol === 'wss:' ? 'https:' : 'http:'}//${u.host}`;
}

const CODE_CHARS = '23456789abcdefghjkmnpqrstuvwxyz';

export function randomCode(len: number, random: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < len; i++) s += CODE_CHARS[Math.floor(random() * CODE_CHARS.length)] ?? 'a';
  return s;
}

/** 방마다 인원 n 이면 n·(n−1) 의 합 — 보낸 사람을 빼고 같은 방 모두에게 중계 */
export function relayPairs(roomSizes: readonly number[]): number {
  return roomSizes.reduce((s, n) => s + n * Math.max(0, n - 1), 0);
}
