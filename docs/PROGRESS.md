# 진행 상태 원장 (PROGRESS)

> **모든 세션은 이 파일을 읽는 것으로 시작하고, 이 파일을 갱신하는 것으로 끝난다.**

## 현재 상태 (2026-11-26)

- **목적:** 우리 게임 서버(game-hub 로비 · whiteboard-3d · rinfish)에 봇을 붙여 **방 하나에 몇 명까지 버티는지** 재는 도구 + 실시간 대시보드. 스터디(2026-11-16) 인우 몫 「서버 트래픽 성능 테스트 보고서」의 측정 도구
- **진행:** 봇 실행기(`src/run.ts` — 단계별 늘리기 · 방 나누기 · 중계 지연 p50/95/99 · 기대 수신 대비 · CSV · `--ui` 대시보드(대상 없이 띄워 화면에서 대상·주소를 고르고 바꾼다) · 이 PC 밖 주소는 `--allow-remote`), 대상 셋(`src/targets/`), 서버 지표 계약 v1(`docs/stats-contract.md` — game-hub·whiteboard-3d 에 적용, rinfish 는 해당 없음). game-hub·whiteboard-3d 는 로컬 서버에 20명 붙여 동작 확인, rinfish 는 테스트로만
- **검증 기준선:** `bash scripts/verify.sh` 6단계 PASS (docs · reviewer model · script line endings · typecheck · unit tests 15개 · branch discipline)
- **다음 작업:** rinfish 를 로컬 서버(`npx wrangler dev`)에 붙여 보기 — 혜린과 같이. 그 뒤 정식 측정(서버를 다른 PC·배포 VM 에 두고 game-hub·whiteboard-3d 단계별 측정 → 보고서)
- **차단 요소:** 없음

## 결정 기록 (Decision Log)

> 근거 없는 결정은 적지 않는다. 나중에 "왜 이렇게 했더라"에 답하는 것이 이 표의 유일한 목적이다.

| 날짜 | 결정 | 근거 |
|------|------|------|
| 2026-11-24 | `harness_default` 코드 프로파일을 적용하되, 부품마다 이 저장소의 실제 고통에 맞춰 재해석 | 완성본을 그대로 복사하면 부품별 존재 이유가 흐려진다 (harness_practice · O-Bab 교훈) |
| 2026-11-24 | 지시 파일(CLAUDE.md·커맨드·에이전트·스크립트)은 영어, 기록물(`docs/`·README)은 한국어 | LLM 지시문은 영어가 안정적, 기록물은 사람이 읽는 문서 |
| 2026-11-24 | reviewer 는 저자와 **다른 모델**로 고정(`model: sonnet`). 세션 모델과 같은 계열이면 verify 가 실패 | 같은 모델이 쓰고 같은 모델이 판정하면 같은 것을 놓친다 — 맹점 분리 (PPMS 결정 2026-09-19 승계) |
| 2026-11-24 | **별도 저장소** — game-hub `server/load/`(2026-11-19)에서 옮겨 대상별 어댑터(`Target`)로 다시 씀. 다른 저장소 코드는 import 하지 않고 메시지 모양만 다시 적는다 | 사용자 결정 — 다른 서버도 같이 잰다. 게임 프로토콜을 game-hub 에 넣으면 그 저장소의 불변식 1(로비는 게임 내부를 모른다)에 어긋난다. 저장소끼리 import 하면 한쪽 변경이 다른 쪽 빌드를 깬다 |
| 2026-11-24 | **지연 탐침은 대상마다** — game-hub·rinfish 는 채팅에 보낸 시각(`⏱<ms>`), whiteboard-3d 는 채팅이 없어 움직임 `state` 의 `yaw` 에 시각(1e8 ms 주기)을 싣는다(봇 아바타가 돈다). 표본은 창마다 저수지 표집(2만, 전체 20만) | 프로토콜을 바꾸지 않고 재려고. 화이트보드는 움직임마다 표본이 생겨 초당 수만 개라 다 모으면 메모리가 끝없이 는다 |
| 2026-11-24 | **방마다 첫 봇이 연 뒤에 나머지가 들어간다(`RoomPlan`), 대상의 방 상한을 넘으면 방을 더 연다** | rinfish 는 없는 방에 join 하면 `no-room`, 20명이 넘으면 `full` 로 거절한다. 다른 대상도 사람이 쓰는 순서와 같아 공용 규칙으로 |
| 2026-11-24 | **서버 지표 계약 v1** (`docs/stats-contract.md`) — `GET /__stats`, `STATS=1`(로컬) 또는 `STATS_TOKEN`(`?token=`, 공개 배포에서 켤 유일한 방법), 본문 `conns` 필수 + `rooms`·`cpu`·`memMb`·`loopP99Ms` 선택, CORS 없음. rinfish(Workers)는 해당 없음 — Cloudflare 대시보드 | 봇은 지연까지만 알아 「CPU 80% 에 닿는 인원」은 서버 안의 숫자가 있어야 답한다. 읽는 쪽이 봇 프로세스라 CORS 는 노출만 늘린다. Workers 는 코드에서 CPU·메모리를 못 읽는다 |
| 2026-11-24 | **이 PC 밖 주소는 `--allow-remote` 가 있어야, 남의 배포 서버(rinfish)는 주인 동의 후에만** (CLAUDE.md 불변식 5) | 공용 서버가 느려지면 다른 사람의 플레이를 망치고, Durable Objects 는 요청·시간만큼 요금이 붙으며 봇 방이 7일 남는다 |
| 2026-11-24 | **git-flow 로컬 판** — `main` 에 코드 작업 금지, 브랜치 작업은 `/wrap-up` 에서만 커밋 + `--ff-only` 합치기. verify 에 branch discipline(`main` 에서 바뀌어도 되는 것은 `docs/PROGRESS.md`·`README.md` 뿐) | 사용자의 다른 저장소(game-hub 결정 2026-10-26)와 같은 흐름 — 작업 끝나자마자 커밋되면 수정 요청이 `fix:` 커밋으로 줄줄이 붙는다(git-flow 고통 신호). 원격이 아직 없어 PR 판이 아니라 로컬 판 |
| 2026-11-26 | **대시보드에서 대상을 고르고 바꾼다 — 한 번에 한 대상만.** `src/run.ts` 의 전역 측정 상태를 「측정 한 판」(`createRun`)으로 묶고, 바꾸면 지금 판의 봇을 모두 끊고 새 판을 연다. 화면에서 넣은 주소도 명령줄과 같은 문(`checkBase`)을 지난다 | 사용자 결정 — 대상마다 프로세스를 따로 띄우는 것이 번거롭다. 여러 대상을 동시에 재면 봇이 같은 PC 의 CPU 를 나눠 써 서로의 지연을 흐리고 화면·집계가 세 벌 필요해, 동시 측정은 하지 않는다. 불변식 5 는 주소가 어디서 오든 지켜야 한다 |
| 2026-11-26 | **원격 저장소 `origin` = github.com/jeonginwoo/load-lab** — `main` 을 올린다. 흐름은 그대로 로컬 판(브랜치 → `/wrap-up` 에서 커밋·`--ff-only` 합치기), push 는 사용자가 말할 때만 | 사용자가 저장소를 만들고 올리라고 함. PR 을 받을 사람이 없어 PR 판으로 바꿀 이유가 아직 없다 (git-workflow §4) |
| 2026-11-24 | **`.claude/settings.json` 은 프로파일 기본 그대로** — allow 에 `npm test`·`npm run typecheck`·`npm run load`·`git merge` 를 더하는 것은 사용자가 직접 | 권한 목록은 에이전트가 스스로 넓히지 않는다(적용 중 자동 모드 분류기가 막음). 더하지 않아도 동작은 같고 확인 프롬프트가 뜰 뿐 |

## 작업 큐 (ralph 루프용)

> `scripts/ralph.sh`가 위에서부터 `- [ ]` 하나씩을 **새 세션**(`/next --loop`)으로 처리한다.
> **계획이 이미 합의된, 커밋 단위로 잘게 쪼갠 작업만** 넣는다. 사용자 승인 없이 후보 일감을 큐로 옮기지 않는다.

(비어 있음)

## 후보 일감 (사용자 승인 후 작업 큐로 이동)

- rinfish 실서버 확인 — 로컬 `wrangler dev` 에 봇을 붙여 hello(create/join)·state·채팅 탐침이 받아지는지. 서버가 보내는 `animals` 가 기대 수신을 얼마나 바꾸는지 보고 `expected` 를 고칠지 (지금은 「약」 표시)
- 정식 측정 — 서버를 다른 PC·배포 VM 에. game-hub 로컬 참고값(2026-11-19, 같은 PC, 움직임 12.5/초): 20명 CPU 3% · 지연 p99 2ms, 40명 15% · 11ms, 60명 31% · 41ms. 결과 CSV·보고서 자리(`reports/`)를 그때 정한다
- whiteboard-3d 낙서 부하 — 봇이 `paint` 도 보내기. 방 기록(최대 10만 토막)이 쌓이면 늦게 온 사람의 `welcome` 이 커진다(스터디 체크리스트 c7). 지금 봇은 움직임만
- 대시보드 그래프에 서버 메모리·방 수 줄 — 지금은 숫자 칸에만
- `--csv` 를 판마다 나누기 — 화면에서 대상을 바꾸면 같은 파일에 이어 적혀 `sec` 가 0 부터 다시 시작하고 어느 대상인지 열이 없다 (2026-11-26 대상 바꾸기 작업 중 발견, README 에 주의만 적음)
- verify 의 unit tests 가 Git Bash 에서 `cd /c/Projects/...` 로 들어간 셸에서는 실패(`describe` 에서 `reading 'config'`, 테스트 0개), `cd c:/Projects/...` 로 들어가면 15개 통과 — 코드 변경과 무관(변경 전 트리에서도 같음). vitest 5.1.1 이 작업 폴더 표기에 따라 모듈을 두 번 읽는 듯. 원인 확인 후 verify.sh 에서 폴더 표기를 고정할지

## 세션 로그

### 형식 (복사해서 사용)

```
### YYYY-MM-DD — <작업 요약>
- 완료: <한 것 + 검증 결과>
- 미해결: <다음 세션으로 넘기는 것 · 확인하지 못한 것>
- 다음 작업: <구체적으로>
```

### 2026-11-26 — 대시보드에서 대상 고르기·바꾸기
- 완료: `npm run load -- --ui` 로 대상 없이 띄워 화면에서 대상·주소를 고르고, 「바꾸기」 로 프로세스를 다시 띄우지 않고 대상을 바꾼다(`src/run.ts` `createRun`·`POST /start`, `dashboard.html` 대상 칸). 로컬 game-hub(18080)·whiteboard-3d(18787)에 대시보드 API 로 game-hub 10명 → whiteboard 8명 → game-hub 5명 전환 — 매번 지연·서버 CPU 가 나오고 앞 서버 접속이 0 으로 내려감. 대상 고르기 전 조작 409, 모르는 대상·원격·`http://` 주소 400, 다른 출처 403. verify 6단계 PASS, reviewer APPROVE(BLOCKER·MAJOR 없음 — MINOR 중 끝내는 중 `/start` 거절, 끝난 판의 늦은 거절 로그, 다시 붙을 때 주소 칸 덮어쓰기, 같은 대상·다른 주소로 바꿀 때 오른쪽 화면 갱신을 반영). CLAUDE.md 명령 목록에 `npm run load -- --ui` 한 줄. 원격 저장소 `origin` 연결
- 미해결: 대시보드 화면을 브라우저로 열어 보지 않음(대상 칸·확인 창·오류 알림·「화면에서 보기」 전환은 스크립트 문법 검사까지만). rinfish 는 전환 대상으로 붙여 보지 않음. 숫자는 봇과 서버가 같은 PC
- 다음 작업: 브라우저에서 대상 칸 눌러 보기 → rinfish 로컬 확인 (후보 일감)

### 2026-11-24 — 하네스 적용
- 완료: `harness_default` 코드 프로파일 적용(기존 코드에 입히기 — ADOPTION B) — CLAUDE.md(불변식 5개는 코드가 이미 지키는 구조에서) · PROGRESS · verify.sh(+ typecheck · unit tests · branch discipline) · /next · /wrap-up · Stop 훅(`src test`) · settings.json(기본) · reviewer · ralph · git-flow 로컬 판(`docs/conventions/git-workflow.md`). verify PASS
- 미해결: settings.json·Stop 훅은 다음 세션부터 유효. allow 추가는 사용자 몫(결정 기록). 원격 저장소 없음
- 다음 작업: rinfish 로컬 확인 (후보 일감)

### 2026-11-24 — 부하 테스트 도구 첫 판 (하네스 전)
- 완료: game-hub `server/load/` 를 옮겨 대상별 어댑터로 — game-hub · whiteboard-3d · rinfish. 서버 지표 계약 v1 과 game-hub·whiteboard-3d 적용. 로컬 18080·18787 에 봇 20명씩 붙여 지연·서버 CPU 확인, 토큰 잠금(없으면 403)·원격 차단 확인, 대시보드 스크린샷(오른쪽 화이트보드 iframe 은 headless 라 검게)
- 미해결: rinfish 는 실서버에 붙여 보지 않음(남의 저장소 코드를 PC 에서 설치·실행하지 않음)
- 다음 작업: 하네스 적용
