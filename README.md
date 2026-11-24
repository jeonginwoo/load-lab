# load-lab — 우리 게임 서버 부하 테스트

봇 여럿을 게임 서버에 붙여 걷게 하고, **방 하나에 몇 명까지 버티는지**를 잰다.
대상: game-hub 로비 · whiteboard-3d · rinfish(낚시섬). 서버마다 다른 것(입장·움직임 메시지)은 `src/targets/` 에 하나씩,
측정·대시보드는 공용.

```bash
npm install                               # 처음 한 번
npm run load -- game-hub --ui             # 대시보드 http://localhost:9300 — 버튼으로 봇을 늘리고 줄이며 본다
npm run load -- whiteboard --bots 30      # 30명 60초, 콘솔 요약
npm run load -- rinfish --bots 40         # 방 20명 상한이라 방 2개로 나뉜다
npm test                                  # 순수 규칙 테스트
```

## 무엇을 재나

| 숫자 | 어디서 | 뜻 |
|---|---|---|
| 접속 봇 · 실패 · 끊김 | 봇 | 입장 거절(rinfish `full` 등), 측정 중 서버가 끊은 수 — 과부하 신호 |
| 받은 메시지/초 vs 기대 | 봇 | 즉시 중계면 방 인원 n 일 때 n·(n−1)·hz. 받은 수가 기대보다 꾸준히 적으면 서버가 밀린다 |
| 중계 지연 p50·p95·p99 | 봇 | 보낸 시각을 실은 메시지를 같은 방 다른 봇이 받은 시각과 뺀다 (game-hub·rinfish 는 채팅 탐침, 화이트보드는 움직임마다) |
| 서버 CPU·메모리·루프 지연 | 서버 | [docs/stats-contract.md](docs/stats-contract.md) 의 `/__stats` 를 내주는 서버만 |

## 순서 (보고서용)

1. 서버를 배포 모양으로 지표와 함께 띄운다 — game-hub·whiteboard-3d: `npm run build && STATS=1 npm start`
2. 단계별로 늘린다 — `npm run load -- game-hub --bots 100 --step 10 --step-every 20 --csv reports/hub.csv`
3. CPU 80% 에 닿는 인원, 그때 지연 p99, 기대 대비 받은 수를 적는다. `--hz 12.5`(쉬지 않고 걷기)와 `--hz 5` 를 둘 다.
4. 방 하나 vs 방 여럿(`--rooms 10`) — 같은 인원이라도 방을 나누면 n² 이 줄어든다.

**주의**
- 같은 PC 에서 서버와 봇을 함께 돌리면 봇도 CPU 를 쓴다. 정식 측정은 서버를 다른 PC·배포 서버에.
- localhost 가 아닌 주소는 `--allow-remote` 를 붙여야 간다. **남의 서버(rinfish 배포 등)는 주인에게 먼저 말할 것** — 요금·다른 사람의 플레이.
- 공개 배포 서버에서 지표를 켤 때는 `STATS_TOKEN=<비밀>` 로 띄우고 봇에 `--stats-token <비밀>`.

## 옵션

| 옵션 | 기본 | 뜻 |
|---|---|---|
| `--url` | 대상마다 로컬 | 서버 ws 주소 (game-hub `ws://localhost:8080/ws`, whiteboard `ws://localhost:8787/ws`, rinfish `ws://localhost:8787`) |
| `--bots` | 20 (`--ui` 면 0) | 처음 붙일 봇 수 |
| `--rooms` / `--per-room` | 1 / 대상 상한 | 고르게 나눌 방 수 / 방 하나 최대 봇 |
| `--hz` | 5 | 봇당 초당 움직임 (rinfish 는 10 까지) |
| `--step`, `--step-every` | 한꺼번에, 15초 | 단계별 늘리기 |
| `--duration` | 60 (`--ui` 면 0) | 마지막 봇이 들어온 뒤 잴 시간(초), 0 = Ctrl+C 까지 |
| `--probe` | 2 | 채팅 탐침 간격(초), 0 = 끔 |
| `--report`, `--csv` | 5초 | 콘솔 요약 간격, CSV 파일 |
| `--ui`, `--ui-port` | 9300 | 대시보드 |
| `--stats-token` | | 서버가 `STATS_TOKEN` 으로 잠갔을 때 |
| `--allow-remote` | | 이 PC 밖 서버에 붙이기 |

## 새 서버 더하기

`src/targets/target.ts` 의 `Target` 을 하나 만들어 `src/targets/index.ts` 에 넣는다 — 주소, `hello`, 움직임 메시지,
받은 메시지에서 welcome·거절·지연 탐침 알아보기, 기대 수신 공식. 서버 쪽 지표가 필요하면 그 서버에
[docs/stats-contract.md](docs/stats-contract.md) 를 적용한다.
