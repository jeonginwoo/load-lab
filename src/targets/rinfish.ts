// rinfish(낚시섬) — github.com/HYERINI/rinfish, 서버는 Cloudflare Workers + Durable Objects(방 하나 = 객체 하나).
// 주소 <서버>/rooms/<방 id 32자>, 방 id = sha256("rinfish-room|" + 소문자 방 이름) 앞 32자, 암호 해시 = sha256("<방 id>|<암호>").
// hello{v, mode: create|join, passHash, nick, look} → welcome{you} 또는 error{code}. 방 하나 20명(넘으면 'full'),
// 움직임 state 는 서버가 초당 10개까지, 채팅은 1초에 한 줄(보낸 사람 빼고 중계). 서버가 동물(animals)도 보내 기대값은 대략.
// 빈 방도 7일 동안 Durable Object 저장소에 남는다 — 봇 방은 매번 새 이름이라 그만큼 쌓인다
import { createHash } from 'node:crypto';
import { randomCode, relayPairs, type BotLogic, type Incoming, type Target } from './target.ts';

const PROTOCOL_VERSION = 1; // rinfish NET.protocolVersion — 다르면 서버가 'version' 으로 거절
const PASSWORD = 'loadtest';
const PROBE = '⏱';
const AREA = 20; // m
const STEP = 0.6; // m

const sha256Hex = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

export function roomIdFor(name: string): string {
  return sha256Hex(`rinfish-room|${name.trim().toLowerCase()}`).slice(0, 32);
}

export function passHashFor(roomId: string, password: string): string {
  return sha256Hex(`${roomId}|${password}`);
}

/** 서버가 받는 가장 작은 모습 — 낚시·배·도구 없이 서 있거나 걷는 사람 */
export function netState(x: number, z: number, facing: number, speed: number): unknown {
  return {
    p: [x, 0, z],
    f: facing,
    v: speed,
    rest: false,
    fish: null,
    rod: 0,
    rodOn: false,
    bob: null,
    act: { emote: null, emoteAge: 0, airAge: null, landedAge: 0, eat: null, eatAge: 0 },
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export const rinfish: Target = {
  id: 'rinfish',
  title: 'rinfish (낚시섬)',
  defaultUrl: 'ws://localhost:8787', // server 폴더에서 npx wrangler dev
  // 배포 접속 서버(VITE_ROOM_SERVER) — 페이지 https://seommaeul.vercel.app/ 는 접속 서버가 아니라 wss 주소를 바로 둔다.
  // 남의 서버라 주인(혜린) 동의를 받고 넣었다(2026-11-27, CLAUDE.md 불변식 5)
  deployedPage: 'wss://rinfish-rooms.rinlee2001.workers.dev',
  pageToSocket: null, // 접속 서버(Workers)가 페이지와 따로 — 빌드 때 넣은 VITE_ROOM_SERVER 라 페이지 주소로 알 수 없다
  roomCap: 20,
  maxHz: 10,
  probeMinMs: 1000,
  expected: (sizes, hz, probeHz) => ({ perSec: relayPairs(sizes) * (Math.min(hz, 10) + probeHz), approx: true }),
  newRoom: () => `load-${randomCode(8)}`,
  socketUrl: (base, room) => `${base.replace(/\/+$/, '')}/rooms/${roomIdFor(room)}`,
  statsUrl: () => null, // Workers 는 CPU·메모리를 코드에서 못 본다 — Cloudflare 대시보드 (docs/stats-contract.md)
  watch: (_base, room) => ({ url: null, note: `게임에서 「같이 하기」 → 방 이름 ${room} · 암호 ${PASSWORD} (같은 서버를 쓰는 화면에서)` }),
  bot({ n, room, create }): BotLogic {
    let id: string | null = null;
    const roomId = roomIdFor(room);
    const angle = (n * 2.399) % (Math.PI * 2);
    let x = Math.cos(angle) * 5;
    let z = Math.sin(angle) * 5;
    let heading = Math.random() * Math.PI * 2;
    return {
      hello: () => ({
        type: 'hello',
        v: PROTOCOL_VERSION,
        mode: create ? 'create' : 'join',
        passHash: passHashFor(roomId, PASSWORD),
        nick: `봇${n + 1}`.slice(0, 10),
        look: { gender: n % 2 === 0 ? 'male' : 'female' }, // 나머지는 서버가 기본값으로 채운다(normalizeLook)
      }),
      receive(msg): Incoming {
        if (!isRecord(msg)) return { kind: 'other' };
        if (msg.type === 'welcome' && typeof msg.you === 'string') {
          id = msg.you;
          return { kind: 'welcome', id };
        }
        if (msg.type === 'error') return { kind: 'reject', reason: String(msg.code) };
        if (msg.type === 'chat' && typeof msg.id === 'string' && msg.id !== id && typeof msg.text === 'string' && msg.text.startsWith(PROBE)) {
          return { kind: 'probe', from: msg.id, sentAt: Number(msg.text.slice(PROBE.length)) };
        }
        return { kind: 'other' };
      },
      move() {
        heading += (Math.random() - 0.5) * 0.8;
        x += Math.cos(heading) * STEP;
        z += Math.sin(heading) * STEP;
        if (Math.hypot(x, z) > AREA) heading += Math.PI;
        return { type: 'state', s: netState(x, z, heading, 3) };
      },
      probe: (now) => ({ type: 'chat', text: `${PROBE}${now}` }),
    };
  },
};
