// 부하 테스트 실행기 — 대상 서버(src/targets/)에 봇 여럿을 붙여 걷게 하고, 서버가 몇 명까지 버티는지 잰다.
// 중계 지연은 대상마다 「보낸 시각을 실은 메시지」(채팅 탐침 또는 움직임)를 같은 방 다른 봇이 받은 시각과 빼서 잰다
// (봇이 모두 한 프로세스라 시계가 같다). 서버 CPU·메모리는 대상이 docs/stats-contract.md 의 /__stats 를 내줄 때만.
//
//   npm run load -- --ui                               대시보드(http://localhost:9300)에서 대상·주소를 고르고 바꾼다
//   npm run load -- game-hub --ui                      game-hub 로 시작 — 화면에서 다른 대상으로 바꿀 수 있다
//   npm run load -- whiteboard --bots 30 --hz 10       30명, 60초, 콘솔 요약
//   npm run load -- rinfish --url ws://localhost:8787 --bots 40   방 20명 상한이라 방 2개로 나뉜다
//   npm run load -- game-hub --url https://<배포 주소> --allow-remote --ui   페이지 주소 → wss://<배포 주소>/ws
//   npm run load -- game-hub --bots 100 --step 10 --step-every 20 --csv reports/hub.csv
//
// 측정 한 판(createRun)은 대상 하나·주소 하나다. 화면에서 대상을 바꾸면 지금 판의 봇을 모두 끊고 새 판을 연다 —
// 한 번에 한 대상만 잰다(봇이 같은 PC 의 CPU 를 나눠 쓰면 서로의 지연을 흐린다).
// localhost 가 아닌 주소(배포 서버)는 --allow-remote 를 붙여야 간다 — 남의 서버·요금이 걸린 서버를 실수로 두드리지 않게.
// 화면에서 넣은 주소도 같은 문(checkBase)을 지난다. 게임 페이지 주소(https://…)를 넣으면 대상의 클라이언트 규칙으로
// ws 주소를 만든 뒤 지난다(toSocketBase — 규칙을 모르는 대상은 ws 주소를 넣어야 한다).
// 같은 PC 에서 서버와 봇을 함께 돌리면 봇도 CPU 를 쓴다 — 보고서에 적을 것. 「봇 루프 지연」이 크면 봇 쪽이 병목.
// 루프 지연은 Windows 타이머가 거칠어 쉬어도 20~30ms 쯤 나온다 — 절대값보다 인원을 늘릴 때 오르는지를 본다.
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import { dirname, join } from 'node:path';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { parseArgs } from 'node:util';
import { WebSocket, type RawData } from 'ws';
import { percentile, Window } from './core/metrics.ts';
import { RoomPlan } from './core/rooms.ts';
import { TARGETS, targetById } from './targets/index.ts';
import { toSocketBase, type BotLogic, type Target } from './targets/target.ts';

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    url: { type: 'string' }, // 대상 서버 ws 주소 — 없으면 대상의 로컬 기본값
    bots: { type: 'string' }, // 처음 붙일 봇 수 — 기본 20, --ui 면 0(화면에서 늘린다)
    rooms: { type: 'string', default: '1' }, // 봇을 고르게 나눌 방 수 (대상의 방 상한을 넘으면 방을 더 연다)
    'per-room': { type: 'string' }, // 방 하나 최대 봇 수 (대상 상한보다 작게만)
    hz: { type: 'string', default: '5' }, // 봇 하나가 초당 보내는 움직임
    step: { type: 'string' }, // 한 번에 늘릴 봇 수
    'step-every': { type: 'string', default: '15' }, // 초
    duration: { type: 'string' }, // 마지막 봇이 들어온 뒤 잴 시간(초). 0 = Ctrl+C 까지. 기본 60, --ui 면 0
    probe: { type: 'string', default: '2' }, // 채팅 탐침 간격(초). 0 = 끔
    report: { type: 'string', default: '5' }, // 콘솔 요약 간격(초)
    csv: { type: 'string' },
    ui: { type: 'boolean', default: false },
    'ui-port': { type: 'string', default: '9300' },
    'stats-token': { type: 'string' }, // 대상 서버가 STATS_TOKEN 으로 지표를 잠갔을 때
    'allow-remote': { type: 'boolean', default: false },
  },
});

function usage(msg: string): never {
  console.error(`${msg}\n\n쓰는 법: npm run load -- <대상> [옵션]   (--ui 면 대상 없이 띄워 화면에서 고를 수 있다)\n대상: ${TARGETS.map((t) => `${t.id} (${t.title})`).join(', ')}\n옵션은 src/run.ts 머리 주석과 README.md`);
  process.exit(1);
}

function num(name: keyof typeof opt, fallback: number, min: number): number {
  const raw = opt[name];
  if (raw === undefined) return fallback;
  const v = Number(raw);
  if (!Number.isFinite(v) || v < min) usage(`--${name} 은 ${min} 이상의 수여야 한다: ${String(raw)}`);
  return v;
}

const UI = opt.ui === true;
const ALLOW_REMOTE = opt['allow-remote'] === true;
// 대상은 명령줄에서, 또는 --ui 면 화면에서 고른다
const cliTarget: Target | null = positionals[0] === undefined ? null : (targetById(positionals[0]) ?? usage(`모르는 대상: ${positionals[0]}`));
if (cliTarget === null && !UI) usage('대상을 정해 주세요');
if (cliTarget === null && opt.url !== undefined) usage('--url 은 대상과 함께 쓴다 — 화면에서 고를 때는 화면의 주소 칸에 넣을 것');

const INITIAL_BOTS = num('bots', UI ? 0 : 20, 0);
const ROOMS = num('rooms', 1, 1);
const PER_ROOM_OPT = num('per-room', Infinity, 1);
const STEP = num('step', Math.max(1, INITIAL_BOTS), 1);
const STEP_EVERY_MS = num('step-every', 15, 1) * 1000;
const DURATION_MS = num('duration', UI ? 0 : 60, 0) * 1000;
const PROBE_OPT_MS = num('probe', 2, 0) * 1000;
const REPORT_MS = num('report', 5, 1) * 1000;
const UI_PORT = num('ui-port', 9300, 1);
const HZ_MIN = 0.1;
const HZ_OPT = num('hz', 5, HZ_MIN);
const JOIN_GAP_MS = 50; // 봇을 여럿 붙일 때 사이 간격
const MAX_BOTS = 2000;

/** 이 주소에 봇을 붙여도 되는가 — 안 되면 이유. 명령줄 주소도 화면에서 넣은 주소도 여기를 지난다 */
function checkBase(base: string): string | null {
  let u: URL;
  try {
    u = new URL(base);
  } catch {
    return `주소가 아니다: ${base}`;
  }
  if (u.protocol !== 'ws:' && u.protocol !== 'wss:') return `ws:// 또는 wss:// 주소여야 한다: ${base}`;
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(u.hostname) && !ALLOW_REMOTE) {
    return `${base} 는 이 PC 밖의 서버다. 서버 주인과 이야기한 뒤 --allow-remote 를 붙여 다시 실행할 것\n(공용 서버가 느려지거나, Cloudflare 같은 곳은 요금이 나올 수 있다)`;
  }
  return null;
}

function sizeOf(data: RawData): number {
  if (Array.isArray(data)) return data.reduce((n, b) => n + b.length, 0);
  return data instanceof ArrayBuffer ? data.byteLength : data.length;
}

const loop = monitorEventLoopDelay({ resolution: 10 });
loop.enable();
const nan2null = (v: number): number | null => (Number.isNaN(v) ? null : Math.round(v * 10) / 10);
const ms = (v: number): string => (Number.isNaN(v) ? '-' : `${v.toFixed(0)}ms`);
const CSV_HEAD = 'sec,bots,hz,sent_per_s,recv_per_s,recv_kb_per_s,expected_recv_per_s,lat_p50_ms,lat_p95_ms,lat_p99_ms,lat_max_ms,bot_loop_p99_ms,dropped,failed,server_conns,server_cpu_pct,server_mem_mb';
const HISTORY_MAX = 600;

// ── 대시보드로 나가는 줄 — 페이지에 붙은 창들(SSE)과 로그. 판이 바뀌어도 이어진다
const clients = new Set<ServerResponse>();
const logs: string[] = [];

function log(line: string): void {
  console.log(line);
  logs.push(line);
  if (logs.length > 200) logs.shift();
  broadcast('log', line);
}

function broadcast(event: string, data: unknown): void {
  const chunk = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(chunk);
}

interface ServerStats {
  readonly conns: number;
  readonly rooms?: number;
  readonly cpu?: number;
  readonly memMb?: number;
  readonly loopP99Ms?: number;
}

/** 측정 한 판 — 대상 하나·주소 하나에 붙은 봇들과 그 집계. end() 로 끝내면 다시 쓰지 않는다 */
function createRun(target: Target, base: string) {
  const PER_ROOM = Math.min(target.roomCap, PER_ROOM_OPT);
  const PROBE_MS = target.probeMinMs === 0 ? 0 : Math.max(target.probeMinMs, PROBE_OPT_MS);
  const PROBE_ON = PROBE_OPT_MS > 0 && PROBE_MS > 0;
  let hz = Math.min(target.maxHz, HZ_OPT);

  // ── 집계. 창은 셋 — 1초(대시보드), 콘솔 보고 간격, 처음부터 끝까지
  let secWin = new Window();
  let repWin = new Window();
  const total = new Window(200_000);
  const windows = (): Window[] => [secWin, repWin, total];
  let failed = 0; // welcome 전에 닫힘·거절
  let dropped = 0; // 측정 중 서버가 끊음 — 과부하 신호
  let open = 0;
  let peakOpen = 0;
  const rejects = new Map<string, number>(); // 거절 이유별 수
  let repLoopMax = 0;
  let ended = false;

  const plan = new RoomPlan((i) => target.newRoom(i), ROOMS, PER_ROOM);
  const inRoom = new Map<string, number>(); // welcome 받은 봇 수 — 기대 수신 계산용
  const waiting = new Map<string, Bot[]>(); // 방이 열리길 기다리는 봇

  class Bot {
    private ws: WebSocket | null = null;
    private readonly n: number;
    readonly room: string;
    private readonly create: boolean;
    private readonly logic: BotLogic;
    private id: string | null = null;
    private moveTimer: NodeJS.Timeout | undefined;
    private probeTimer: NodeJS.Timeout | undefined;
    private leaving = false;

    constructor(n: number, room: string, create: boolean) {
      this.n = n;
      this.room = room;
      this.create = create;
      this.logic = target.bot({ n, room, create });
    }

    connect(): void {
      if (this.leaving) return;
      const ws = new WebSocket(target.socketUrl(base, this.room));
      this.ws = ws;
      ws.on('open', () => this.send(this.logic.hello()));
      ws.on('message', (data) => this.receive(data));
      ws.on('error', () => {}); // 실패는 close 가 센다
      ws.on('close', () => this.closed());
    }

    private closed(): void {
      clearInterval(this.moveTimer);
      clearInterval(this.probeTimer);
      plan.release(this.room);
      if (this.id === null) {
        if (!this.leaving) failed++;
        if (this.create) roomFailed(this.room);
        return;
      }
      open--;
      inRoom.set(this.room, (inRoom.get(this.room) ?? 1) - 1);
      if (!this.leaving && !ended) dropped++;
    }

    private send(msg: unknown): void {
      if (msg === null || this.ws?.readyState !== WebSocket.OPEN) return;
      this.ws.send(JSON.stringify(msg));
      for (const w of windows()) w.sent++;
    }

    private receive(data: RawData): void {
      const size = sizeOf(data);
      for (const w of windows()) {
        w.recv++;
        w.bytes += size;
      }
      let msg: unknown;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return; // 깨진 프레임 하나로 측정 전체가 죽지 않게
      }
      const now = Date.now();
      const got = this.logic.receive(msg, now);
      if (got.kind === 'welcome' && this.id === null) this.welcome(got.id);
      else if (got.kind === 'reject') {
        rejects.set(got.reason, (rejects.get(got.reason) ?? 0) + 1);
        if (!ended) log(`── 봇${this.n + 1} 거절: ${got.reason} (방 ${this.room})`); // 끝난 판의 늦은 거절이 새 판 로그에 섞이지 않게
        this.ws?.close();
      } else if (got.kind === 'probe') {
        // 사람이 봇 방에서 탐침 머리로 시작하는 글을 쳐도 백분위가 깨지지 않게
        const lat = now - got.sentAt;
        if (Number.isFinite(lat) && lat >= 0 && lat < 60_000) for (const w of windows()) w.lat.add(lat);
      }
    }

    private welcome(id: string): void {
      this.id = id;
      open++;
      peakOpen = Math.max(peakOpen, open);
      inRoom.set(this.room, (inRoom.get(this.room) ?? 0) + 1);
      if (this.create) roomReady(this.room);
      this.startMoving();
      if (PROBE_ON) {
        setTimeout(() => {
          if (this.ws?.readyState !== WebSocket.OPEN) return;
          this.probeTimer = setInterval(() => this.send(this.logic.probe(Date.now())), PROBE_MS);
        }, Math.random() * PROBE_MS);
      }
    }

    /** 지금 hz 로 걷기 — hz 가 바뀌면 다시 부른다. 모두 같은 순간에 보내지 않게 시작을 흩는다 */
    startMoving(): void {
      if (this.id === null) return;
      clearInterval(this.moveTimer);
      const every = 1000 / hz;
      this.moveTimer = setTimeout(() => {
        if (this.ws?.readyState !== WebSocket.OPEN) return;
        this.moveTimer = setInterval(() => this.send(this.logic.move(Date.now())), every);
      }, Math.random() * every);
    }

    close(): void {
      this.leaving = true;
      if (this.ws) this.ws.close();
      else plan.release(this.room); // 방이 열리길 기다리던 봇
    }
  }

  function roomReady(code: string): void {
    plan.ready(code);
    const list = waiting.get(code) ?? [];
    waiting.delete(code);
    list.forEach((b, i) => setTimeout(() => b.connect(), i * JOIN_GAP_MS));
  }

  function roomFailed(code: string): void {
    plan.dead(code);
    const list = waiting.get(code) ?? [];
    waiting.delete(code);
    if (list.length > 0 && !ended) log(`── 방 ${code} 를 열지 못해 기다리던 봇 ${list.length}개 실패`);
    failed += list.length;
    for (const b of list) {
      b.close();
      const i = bots.indexOf(b);
      if (i >= 0) bots.splice(i, 1);
    }
  }

  // ── 봇 늘리기·줄이기
  const bots: Bot[] = [];
  let nextN = 0;
  let pending = 0;

  function addBots(k: number, gapMs = JOIN_GAP_MS, delayMs = 0): void {
    const count = Math.min(k, Math.max(0, MAX_BOTS - bots.length - pending));
    pending += count;
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        pending--;
        if (ended) return;
        const a = plan.assign();
        const bot = new Bot(nextN++, a.room, a.role === 'create');
        bots.push(bot);
        if (a.role === 'wait') waiting.set(a.room, [...(waiting.get(a.room) ?? []), bot]);
        else bot.connect();
      }, delayMs + i * gapMs);
    }
  }

  function removeBots(k: number): void {
    for (let i = 0; i < k && bots.length > 0; i++) {
      const b = bots.pop();
      if (!b) break;
      const w = waiting.get(b.room);
      if (w) waiting.set(b.room, w.filter((x) => x !== b));
      b.close();
    }
  }

  function setHz(v: number): void {
    hz = Math.min(target.maxHz, Math.max(HZ_MIN, v));
    for (const b of bots) b.startMoving();
  }

  function expected(): { perSec: number; approx: boolean } {
    return target.expected([...inRoom.values()], hz, PROBE_ON ? 1000 / PROBE_MS : 0);
  }

  // ── 서버 지표 (docs/stats-contract.md)
  const statsBase = target.statsUrl(base);
  let serverStats: ServerStats | null = null;

  async function pollServer(): Promise<void> {
    if (!statsBase) return;
    try {
      const url = opt['stats-token'] ? `${statsBase}?token=${encodeURIComponent(opt['stats-token'])}` : statsBase;
      const res = await fetch(url, { signal: AbortSignal.timeout(800) });
      const body: unknown = res.ok ? await res.json() : null;
      serverStats = typeof body === 'object' && body !== null && typeof (body as ServerStats).conns === 'number' ? (body as ServerStats) : null;
    } catch {
      serverStats = null; // 지표를 내주지 않는 서버(STATS 꺼짐·개발 서버) — 봇 쪽 지표만
    }
  }

  // ── 1초 샘플 — 대시보드로 보내고, 콘솔 창에 모은다
  const t0 = Date.now();
  let lastSec = t0;
  const history: unknown[] = [];

  function tick(): void {
    const now = Date.now();
    const secs = Math.max(0.001, (now - lastSec) / 1000);
    lastSec = now;
    const lat = secWin.lat.sorted();
    const botLoop = loop.percentile(99) / 1e6;
    repLoopMax = Math.max(repLoopMax, botLoop);
    loop.reset();
    const exp = expected();
    const s = {
      t: Math.round((now - t0) / 1000),
      bots: open,
      target: bots.length + pending,
      hz,
      sent: Math.round(secWin.sent / secs),
      recv: Math.round(secWin.recv / secs),
      expected: Math.round(exp.perSec),
      kb: Math.round(secWin.bytes / 1024 / secs),
      p50: nan2null(percentile(lat, 50)),
      p95: nan2null(percentile(lat, 95)),
      p99: nan2null(percentile(lat, 99)),
      max: nan2null(percentile(lat, 100)),
      botLoop: Math.round(botLoop * 10) / 10,
      dropped,
      failed,
      rooms: [...inRoom.values()].filter((n) => n > 0).length,
      server: serverStats,
    };
    secWin = new Window();
    history.push(s);
    if (history.length > HISTORY_MAX) history.shift();
    broadcast('sample', s);
    void pollServer();
  }

  // ── 콘솔·CSV
  let lastReport = t0;

  function report(): void {
    const now = Date.now();
    const secs = Math.max(0.001, (now - lastReport) / 1000);
    lastReport = now;
    const lat = repWin.lat.sorted();
    const sec = Math.round((now - t0) / 1000);
    const sent = Math.round(repWin.sent / secs);
    const recv = Math.round(repWin.recv / secs);
    const kb = Math.round(repWin.bytes / 1024 / secs);
    const exp = expected();
    const [p50, p95, p99, max] = [50, 95, 99, 100].map((p) => percentile(lat, p)) as [number, number, number, number];
    const srv = serverStats;
    log(
      `[${String(sec).padStart(4)}s] 봇 ${open} · 보냄 ${sent}/s · 받음 ${recv}/s (기대 ${exp.approx ? '약 ' : ''}${Math.round(exp.perSec)}/s, ${kb} KB/s)` +
      ` · 지연 p50 ${ms(p50)} p95 ${ms(p95)} p99 ${ms(p99)} 최대 ${ms(max)} · 봇 루프 p99 ${ms(repLoopMax)}` +
      (srv?.cpu !== undefined ? ` · 서버 CPU ${srv.cpu.toFixed(0)}%` : '') +
      (dropped > 0 ? ` · 끊김 ${dropped}` : '') +
      (failed > 0 ? ` · 실패 ${failed}` : ''),
    );
    if (opt.csv) {
      const f = (v: number | undefined): string => (v === undefined || Number.isNaN(v) ? '' : v.toFixed(1));
      appendFileSync(opt.csv, [sec, open, hz, sent, recv, kb, Math.round(exp.perSec), f(p50), f(p95), f(p99), f(max), f(repLoopMax), dropped, failed,
        f(srv?.conns), f(srv?.cpu), f(srv?.memMb)].join(',') + '\n');
    }
    repWin = new Window();
    repLoopMax = 0;
  }

  /** 이 판을 끝낸다 — 마지막 보고·요약을 찍고 봇을 모두 끊는다 */
  function end(): void {
    if (ended) return;
    ended = true;
    clearInterval(ticker);
    clearInterval(reporter);
    clearTimeout(durationTimer);
    report();
    const secs = (Date.now() - t0) / 1000;
    const lat = total.lat.sorted();
    console.log(`\n── 요약 · ${target.title} · ${base}`);
    console.log(`동시 접속 최대 ${peakOpen}·만든 봇 ${nextN} (방 ${plan.rooms.length}개, 봇당 움직임 ${hz}/s) · ${secs.toFixed(0)}초 · 실패 ${failed} · 측정 중 끊김 ${dropped}`);
    if (rejects.size > 0) console.log(`거절: ${[...rejects].map(([r, n]) => `${r} ${n}`).join(', ')}`);
    console.log(`보냄 ${total.sent} · 받음 ${total.recv} (${(total.bytes / 1024 / 1024).toFixed(1)} MB, 평균 ${Math.round(total.bytes / 1024 / secs)} KB/s)`);
    console.log(`지연 표본 ${total.lat.seen}개 · p50 ${ms(percentile(lat, 50))} · p95 ${ms(percentile(lat, 95))} · p99 ${ms(percentile(lat, 99))} · 최대 ${ms(percentile(lat, 100))}\n`);
    for (const b of bots) b.close();
  }

  // ── 시작
  log(`── ${target.title} ← 봇 · ${base}${statsBase ? '' : ' (서버 지표 없음)'}`);
  const ticker = setInterval(tick, 1000);
  const reporter = setInterval(report, REPORT_MS);
  for (let s = 0; s * STEP < INITIAL_BOTS; s++) addBots(Math.min(STEP, INITIAL_BOTS - s * STEP), JOIN_GAP_MS, s * STEP_EVERY_MS);
  let durationTimer: NodeJS.Timeout | undefined;
  if (DURATION_MS > 0) {
    const last = INITIAL_BOTS === 0 ? 0 : Math.floor((INITIAL_BOTS - 1) / STEP) * STEP_EVERY_MS + ((INITIAL_BOTS - 1) % STEP) * JOIN_GAP_MS;
    durationTimer = setTimeout(stop, last + DURATION_MS);
  }

  return {
    addBots,
    removeBots,
    setHz,
    end,
    hz: (): number => hz,
    goal: (): number => bots.length + pending,
    /** 대시보드가 붙을 때 받는 이 판의 모습 */
    info: () => ({ id: target.id, target: target.title, url: base, maxHz: target.maxHz, approx: expected().approx, stats: statsBase !== null, history }),
    /** 브라우저로 봇을 보러 갈 곳 — 방은 봇을 붙인 뒤에 생기므로 화면이 「보기」 를 누를 때 묻는다 */
    watch: () => {
      const code = plan.rooms.find((r) => r.state === 'ready')?.code ?? plan.rooms[0]?.code;
      return code ? { room: code, ...target.watch(base, code) } : null;
    },
  };
}

// ── 지금 판. 화면에서 대상을 고르기 전에는 없다
let run: ReturnType<typeof createRun> | null = null;
let exiting = false;

/** 대시보드가 붙을 때·판이 바뀔 때 보내는 것 */
function initPayload(): unknown {
  return {
    targets: TARGETS.map((t) => ({ id: t.id, title: t.title, defaultUrl: t.defaultUrl })),
    logs,
    ...(run ? run.info() : { id: null, target: null, url: null, maxHz: null, approx: false, stats: false, history: [] }),
  };
}

/** 새 판을 연다 — 지금 판이 있으면 봇을 모두 끊고 끝낸 뒤. base 는 checkBase 를 지난 주소여야 한다 */
function start(target: Target, base: string): void {
  run?.end();
  run = createRun(target, base);
  broadcast('init', initPayload());
}

// ── 대시보드 — 페이지 하나와 1초 샘플·로그 스트림(SSE), 대상 고르기·봇 조절 POST
function startUi(): void {
  const page = readFileSync(join(import.meta.dirname, 'core', 'dashboard.html'));
  // 이 PC 의 다른 웹 페이지가 fetch 로 봇을 조작하지 못하게(POST 는 사전 요청이 없다) — Host 는 DNS rebinding 막기
  const hosts = new Set([`localhost:${UI_PORT}`, `127.0.0.1:${UI_PORT}`]);
  const origins = new Set([...hosts].map((h) => `http://${h}`));
  const ui = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const origin = req.headers.origin;
    const refuse = (code: number, why: string): void => {
      res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' }).end(why);
    };
    if (!hosts.has(req.headers.host ?? '') || (origin !== undefined && !origins.has(origin))) {
      res.writeHead(403).end();
      return;
    }
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).end(page);
      return;
    }
    if (req.method === 'GET' && url.pathname === '/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write(`event: init\ndata: ${JSON.stringify(initPayload())}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/watch') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(run ? run.watch() : null));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/stop') {
      res.writeHead(204).end();
      stop();
      return;
    }
    if (req.method === 'POST' && url.pathname === '/start') {
      // 대상 고르기·바꾸기 — 주소는 명령줄과 같은 문을 지난다
      if (exiting) return refuse(409, '끝내는 중이다');
      const t = targetById(url.searchParams.get('target') ?? '');
      if (!t) return refuse(400, '모르는 대상이다');
      const to = toSocketBase(t, url.searchParams.get('url')?.trim() || t.defaultUrl);
      if ('error' in to) return refuse(400, to.error);
      const why = checkBase(to.base);
      if (why !== null) return refuse(400, why);
      start(t, to.base);
      res.writeHead(204).end();
      return;
    }
    if (req.method === 'POST') {
      if (!run) return refuse(409, '대상을 먼저 고를 것');
      const raw = url.searchParams.get('v');
      const v = raw === null || raw === '' ? Number.NaN : Number(raw);
      if (url.pathname === '/bots' && Number.isInteger(v) && v !== 0 && Math.abs(v) <= MAX_BOTS) {
        if (v > 0) run.addBots(v);
        else run.removeBots(-v);
        log(`── 봇 ${v > 0 ? '+' : ''}${v} → 목표 ${run.goal()}`);
      } else if (url.pathname === '/hz' && Number.isFinite(v)) {
        run.setHz(v);
        log(`── 봇당 움직임 ${run.hz()}/s`);
      } else {
        res.writeHead(400).end();
        return;
      }
      res.writeHead(204).end();
      return;
    }
    res.writeHead(404).end();
  });
  ui.on('error', (e) => {
    console.error(`대시보드를 열지 못했다 (포트 ${UI_PORT}): ${e.message} — --ui-port 로 다른 포트를`);
    if (!run) process.exit(1); // 화면에서 대상을 고르려던 실행 — 화면이 없으면 할 일이 없다
  });
  ui.listen(UI_PORT, '127.0.0.1', () => console.log(`대시보드 → http://localhost:${UI_PORT}${run ? '' : ' — 화면에서 대상을 고를 것'}`));
}

// ── 실행
function stop(): void {
  if (exiting) return;
  exiting = true;
  run?.end();
  broadcast('stopped', {});
  for (const res of clients) res.end();
  setTimeout(() => process.exit(0), 500).unref();
}

if (opt.csv) {
  mkdirSync(dirname(opt.csv), { recursive: true });
  writeFileSync(opt.csv, `${CSV_HEAD}\n`);
}
process.on('SIGINT', stop);
if (cliTarget) {
  const to = toSocketBase(cliTarget, opt.url ?? cliTarget.defaultUrl);
  if ('error' in to) usage(to.error);
  const why = checkBase(to.base);
  if (why !== null) usage(why);
  start(cliTarget, to.base);
}
if (UI) startUi();
