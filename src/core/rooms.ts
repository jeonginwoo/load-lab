// 봇을 어느 방에 넣을지 — 순수 모듈.
// 방마다 첫 봇(만드는 봇)이 welcome 을 받아야 나머지가 들어간다 — rinfish 는 없는 방에 join 하면 거절하고,
// 다른 서버도 「방을 만드는 hello」 가 먼저인 편이 사람이 쓰는 순서와 같다.

export type RoomState = 'new' | 'opening' | 'ready' | 'dead';

export interface PlanRoom {
  readonly code: string;
  members: number; // 배정된 봇(기다리는 봇 포함)
  state: RoomState;
}

export type Assignment =
  | { readonly room: string; readonly role: 'create' } // 이 봇이 방을 연다
  | { readonly room: string; readonly role: 'join' } // 바로 들어간다
  | { readonly room: string; readonly role: 'wait' }; // 방이 열릴 때까지 기다렸다 join

export class RoomPlan {
  private readonly list: PlanRoom[] = [];
  private readonly makeCode: (i: number) => string;
  private readonly want: number;
  private readonly cap: number;

  /** want = 처음부터 고르게 나눌 방 수, cap = 방 하나의 최대 봇 수(넘치면 방을 더 연다) */
  constructor(makeCode: (i: number) => string, want: number, cap: number) {
    this.makeCode = makeCode;
    this.want = Math.max(1, want);
    this.cap = Math.max(1, cap);
  }

  get rooms(): readonly PlanRoom[] {
    return this.list;
  }

  /** 가장 덜 찬 방에 — 열린 방이 want 개보다 적거나 모두 cap 이면 새 방 */
  assign(): Assignment {
    const live = this.list.filter((r) => r.state !== 'dead');
    let room = live.reduce<PlanRoom | undefined>((best, r) => (best === undefined || r.members < best.members ? r : best), undefined);
    if (live.length < this.want || room === undefined || room.members >= this.cap) {
      room = { code: this.makeCode(this.list.length), members: 0, state: 'new' };
      this.list.push(room);
    }
    room.members++;
    if (room.state === 'new') {
      room.state = 'opening';
      return { room: room.code, role: 'create' };
    }
    return { room: room.code, role: room.state === 'ready' ? 'join' : 'wait' };
  }

  /** 만드는 봇이 welcome 을 받았다 */
  ready(code: string): void {
    const r = this.find(code);
    if (r && r.state === 'opening') r.state = 'ready';
  }

  /** 만드는 봇이 거절당했다 — 이 방은 버린다(기다리던 봇도 실패) */
  dead(code: string): void {
    const r = this.find(code);
    if (r) r.state = 'dead';
  }

  /** 봇 하나가 방을 떠났다. 방은 비어도 'ready' 로 둔다 — rinfish 는 빈 방이 저장소에 남아 다시 create 하면 거절한다 */
  release(code: string): void {
    const r = this.find(code);
    if (r && r.members > 0) r.members--;
  }

  private find(code: string): PlanRoom | undefined {
    return this.list.find((r) => r.code === code);
  }
}
