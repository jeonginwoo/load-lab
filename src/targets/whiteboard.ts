// whiteboard-3d — github.com/jeonginwoo/whiteboard-3d, 프로토콜 shared/protocol.ts.
// hello{name} → welcome{id, players, history}, 움직임 state{st:{p, yaw, pitch}}(보낸 사람 빼고 중계). 채팅이 없어서
// 보낸 시각을 yaw 에 싣는다 — 움직임마다 탐침이 되어 중계 지연을 직접 잰다(봇 아바타는 빙글빙글 돈다).
// 낙서(paint)는 보내지 않는다 — 방 기록에 쌓여 늦게 온 사람의 welcome 이 커지는 것은 따로 재야 할 일
import { httpOrigin, randomCode, relayPairs, type BotLogic, type Incoming, type Target } from './target.ts';

const STAMP_MOD = 1e8; // ms — 약 27시간마다 돈다. yaw 는 이 안의 초
const AREA = 8; // m — 기둥 둘레를 이 반경 안에서 걷는다
const STEP = 0.35; // m — 한 번 움직이는 거리

/** 보낸 시각(ms) → yaw */
export function stampYaw(now: number): number {
  return (now % STAMP_MOD) / 1000;
}

/** yaw → 지연(ms). 시계가 한 바퀴 돈 경우를 메운다 */
export function latencyFromYaw(yaw: number, now: number): number {
  const d = (now % STAMP_MOD) - yaw * 1000;
  return d < 0 ? d + STAMP_MOD : d;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export const whiteboard: Target = {
  id: 'whiteboard',
  title: 'whiteboard-3d',
  defaultUrl: 'ws://localhost:8787/ws', // npm run build && STATS=1 npm start. 개발 서버면 ws://localhost:5174/ws
  roomCap: Infinity,
  maxHz: 30,
  probeMinMs: 0, // 움직임에 시각을 싣는다
  expected: (sizes, hz) => ({ perSec: relayPairs(sizes) * hz, approx: false }),
  newRoom: () => `load-${randomCode(6)}`,
  socketUrl: (base, room) => `${base}?room=${room}`,
  statsUrl: (base) => `${httpOrigin(base)}/__stats`,
  watch: (base, room) => ({ url: `${httpOrigin(base)}/?room=${room}`, note: '화이트보드에 들어가면 봇 아바타가 보인다 (이 창도 접속자 1명)' }),
  bot({ n }): BotLogic {
    let id: string | null = null;
    const angle = (n * 2.399) % (Math.PI * 2); // 봇마다 다른 자리에서 시작
    let x = Math.cos(angle) * 4;
    let z = Math.sin(angle) * 4;
    let heading = Math.random() * Math.PI * 2;
    return {
      hello: () => ({ t: 'hello', name: `봇${n + 1}` }),
      receive(msg, now): Incoming {
        if (!isRecord(msg)) return { kind: 'other' };
        if (msg.t === 'welcome' && typeof msg.id === 'string') {
          id = msg.id;
          return { kind: 'welcome', id };
        }
        if (msg.t === 'state' && typeof msg.id === 'string' && msg.id !== id && isRecord(msg.st) && typeof msg.st.yaw === 'number') {
          return { kind: 'probe', from: msg.id, sentAt: now - latencyFromYaw(msg.st.yaw, now) };
        }
        return { kind: 'other' };
      },
      move(now) {
        heading += (Math.random() - 0.5) * 0.8;
        x += Math.cos(heading) * STEP;
        z += Math.sin(heading) * STEP;
        if (Math.hypot(x, z) > AREA) heading += Math.PI; // 밖으로 나가면 돌아선다
        return { t: 'state', st: { p: [x, 1.6, z], yaw: stampYaw(now), pitch: 0 } };
      },
      probe: () => null,
    };
  },
};
