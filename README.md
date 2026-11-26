# load-lab — 우리 게임 서버 부하 테스트

봇 여럿을 게임 서버에 붙여 걷게 하고, **방 하나에 몇 명까지 버티는지**를 잰다.
대상: game-hub 로비 · whiteboard-3d · rinfish(낚시섬). 서버마다 다른 것(입장·움직임 메시지)은 `src/targets/` 에 하나씩,
측정·대시보드는 공용.

```bash
npm install                               # 처음 한 번
npm run ui -- --allow-remote              # 배포 서버 측정 — 대시보드 http://localhost:9300, 주소 칸이 대상의 배포 페이지로 채워진다
npm run ui                                # 로컬 서버 — 봇이 제대로 붙는지 확인용
npm run load -- game-hub --ui             # game-hub 로 바로 시작 (화면에서 다른 대상으로 바꿀 수 있다)
npm run load -- whiteboard --bots 30      # 30명 60초, 콘솔 요약
npm run load -- rinfish --bots 40         # 방 20명 상한이라 방 2개로 나뉜다
npm test                                  # 순수 규칙 테스트
```

대시보드의 「대상」 칸에서 대상을 고르면 로컬 기본 주소가 채워진다(고쳐 쓸 수 있다). 「바꾸기」 는 지금 봇을 모두 끊고
새 대상으로 처음부터 다시 잰다 — **한 번에 한 대상만**. 프로세스를 다시 띄울 필요는 없다.
화면에서 넣은 주소도 localhost 가 아니면 거절한다(`--allow-remote` 로 띄웠을 때만 간다).
`--bots`·`--step`·`--duration` 은 판마다 다시 적용된다 — `--ui --duration 30` 이면 마지막으로 바꾼 뒤 30초에 프로세스가 끝난다.
`--csv` 는 대상을 바꿔도 같은 파일에 이어 적는다(`sec` 가 0 부터 다시 시작) — 보고서용 측정은 대상마다 따로 실행할 것.

## 무엇을 재나

| 숫자 | 어디서 | 뜻 |
|---|---|---|
| 접속 봇 · 실패 · 끊김 | 봇 | 입장 거절(rinfish `full` 등), 측정 중 서버가 끊은 수 — 과부하 신호 |
| 받은 메시지/초 vs 기대 | 봇 | 즉시 중계면 방 인원 n 일 때 n·(n−1)·hz. 받은 수가 기대보다 꾸준히 적으면 서버가 밀린다 |
| 중계 지연 p50·p95·p99 | 봇 | 보낸 시각을 실은 메시지를 같은 방 다른 봇이 받은 시각과 뺀다 (game-hub·rinfish 는 채팅 탐침, 화이트보드는 움직임마다) |
| 서버 CPU·메모리·루프 지연 | 서버 | [docs/stats-contract.md](docs/stats-contract.md) 의 `/__stats` 를 내주는 서버만 |

## 순서 (보고서용)

측정은 **배포 서버**에서 한다 — 같은 PC 에서 서버와 봇을 함께 돌리면 봇이 CPU 를 나눠 써 숫자가 흐리고, 실제 네트워크·배포 환경의 한도가 빠진다.
로컬 서버는 봇이 붙는지 확인할 때만.

| 대상 | 배포 페이지 (`--allow-remote` 면 기본) |
|---|---|
| game-hub | https://nolja-lobby.duckdns.org/ |
| whiteboard | https://nolja-board.duckdns.org/ |
| rinfish | 기본값 없음 — 남의 서버라 주인 동의 후, 접속 서버 `wss://` 주소를 직접 |

1. 배포 서버를 `STATS_TOKEN=<비밀>` 로 띄워 두고, 이 저장소 `.env`(git 에 안 올라간다)에 `LOAD_STATS_TOKEN=<같은 비밀>` 한 줄
2. 단계별로 늘린다 — `npm run load -- game-hub --allow-remote --bots 100 --step 10 --step-every 20 --csv reports/hub.csv`
3. CPU 80% 에 닿는 인원, 그때 지연 p99, 기대 대비 받은 수를 적는다. `--hz 12.5`(쉬지 않고 걷기)와 `--hz 5` 를 둘 다.
4. 방 하나 vs 방 여럿(`--rooms 10`) — 같은 인원이라도 방을 나누면 n² 이 줄어든다.

**주의**
- 같은 PC 에서 서버와 봇을 함께 돌리면 봇도 CPU 를 쓴다. 정식 측정은 서버를 다른 PC·배포 서버에.
- localhost 가 아닌 주소는 `--allow-remote` 를 붙여야 간다. **남의 서버(rinfish 배포 등)는 주인에게 먼저 말할 것** — 요금·다른 사람의 플레이.
- 배포 서버 지표는 `STATS_TOKEN=<비밀>` 로 잠가 띄우고, 봇 쪽은 `.env` 의 `LOAD_STATS_TOKEN` · `--stats-token` · 대시보드 토큰 칸(이 순서로 덮어쓴다 — 칸이 가장 우선)에 같은 값. 틀리면 서버 CPU 칸에 「거절(403)」 이 뜬다. 토큰은 판마다 — 바꾸려면 「시작」 으로 새 판. `.env`·`--stats-token` 토큰은 칸이 비면 어느 대상으로 시작하든 그 서버에 보낸다 — 대상마다 토큰이 다르면 칸에 넣을 것.

## 옵션

| 옵션 | 기본 | 뜻 |
|---|---|---|
| `--url` | 대상마다 로컬, `--allow-remote` 면 배포 페이지 | 서버 ws 주소 (game-hub `ws://localhost:8080/ws`, whiteboard `ws://localhost:8787/ws`, rinfish `ws://localhost:8787`), 또는 게임 페이지 주소 — 아래 |
| `--bots` | 20 (`--ui` 면 0) | 처음 붙일 봇 수 |
| `--rooms` / `--per-room` | 1 / 대상 상한 | 고르게 나눌 방 수 / 방 하나 최대 봇 |
| `--hz` | 5 | 봇당 초당 움직임 (rinfish 는 10 까지) |
| `--step`, `--step-every` | 한꺼번에, 15초 | 단계별 늘리기 |
| `--duration` | 60 (`--ui` 면 0) | 마지막 봇이 들어온 뒤 잴 시간(초), 0 = Ctrl+C 까지 |
| `--probe` | 2 | 채팅 탐침 간격(초), 0 = 끔 |
| `--report`, `--csv` | 5초 | 콘솔 요약 간격, CSV 파일 |
| `--ui`, `--ui-port` | 9300 | 대시보드. `--ui` 면 대상 없이 띄워 화면에서 고를 수 있다 |
| `--stats-token` | `.env` 의 `LOAD_STATS_TOKEN` | 서버가 `STATS_TOKEN` 으로 잠갔을 때 — 대시보드 토큰 칸이 비었을 때 쓰인다 |
| `--allow-remote` | | 이 PC 밖 서버에 붙이기 |

## 주소는 게임 페이지 주소로도

`--url`·대시보드 주소 칸에 브라우저 주소창의 게임 페이지 주소(`https://…`)를 넣으면, 그 게임의 클라이언트가 접속 주소를
만드는 규칙 그대로 ws 주소를 만든다 — 서버에 묻지 않는다.

| 대상 | 페이지 → 서버 | 규칙 출처 |
|---|---|---|
| game-hub | `https://<주소>/…` → `wss://<주소>/ws` | `lobby/src/net/net.ts` `socketUrl` |
| whiteboard | `https://<주소>/…` → `wss://<주소>/ws` | `client/net.ts` |
| rinfish | 알 수 없음 — `wss://` 서버 주소를 넣는다 | 접속 서버(Workers)가 페이지와 따로, 빌드 때 넣은 `VITE_ROOM_SERVER` |

`http://` 페이지면 `ws://`. 클라이언트가 접속 주소를 만드는 법을 바꾸면 그 대상 파일의 `pageToSocket` 도 고친다.

## 새 서버 더하기

`src/targets/target.ts` 의 `Target` 을 하나 만들어 `src/targets/index.ts` 에 넣는다 — 주소, `hello`, 움직임 메시지,
받은 메시지에서 welcome·거절·지연 탐침 알아보기, 기대 수신 공식. 서버 쪽 지표가 필요하면 그 서버에
[docs/stats-contract.md](docs/stats-contract.md) 를 적용한다.
