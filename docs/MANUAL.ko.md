# Framein 사용 매뉴얼

> **바이너리:** `framein` (짧은 별칭 `fr` · 호환 별칭 `frame`). 에이전트 안에서는 네임스페이스 슬래시
> 명령(`/fr:verify` — Claude/Gemini, `$fr-verify` — Codex 스킬)이나 MCP 도구로 나타납니다 — 새 프롬프트
> 창을 배울 필요가 없습니다. 자동화·래퍼 대상 명령은 `--json`도 지원합니다(§8.4).

> **주 사용법 = 에이전트 구동 (ADR-0012).** `framein init`이 컨텍스트 파일(관리블록)에 사용 지침을 심어,
> 평소처럼 에이전트와 대화만 해도 작업 시작 시 계약을 잡고 "완료" 전에 증거 게이트를 돌리는 걸 **에이전트가
> 스스로** 합니다. 사람이 치는 long-form `framein <verb>`는 **fallback/스크립트 경로**입니다(계약 변경은
> `git diff`로 드러나 통제는 사용자에게). 터미널에서 `framein start`(인자 없이)는 대화형으로 계약을 안내합니다.

> **Framein is a local evidence gate, decision ledger, and native skill surface for AI coding agents.**
>
> Framein은 "여러 AI를 돌리는 실행기"나 상태 없는 일반 스킬팩이 아니라 **로컬 증거 게이트, 결정 원장,
> 네이티브 스킬 표면**입니다. 평소처럼 네이티브 CLI(Claude·Codex·Gemini)나 SuperClaude/gstack/skills로
> 개발하되, 그 결과가 출하 가능한지는 framein이 *작업 계약, 빌드·테스트 증거, 위험 반경, 결정 기록*으로 판정합니다.
> — [ADR-0015](./adr/0015-benchmark-driven-evidence-gate-positioning.md)

이 문서는 처음 쓰는 분도 따라 할 수 있도록 **개념 → 설치 → 빠른 시작 → 6개 제품 동사 → 기능별
상세 → 안전 → 현재 상태 → FAQ/개발자용** 순서로 설명합니다. 예시 출력은 실제 실행을 그대로 옮긴 것입니다.

---

## 목차

1. [Framein이 푸는 문제](#1-framein이-푸는-문제)
2. [설계 철학 (왜 이렇게 만들었나)](#2-설계-철학-왜-이렇게-만들었나)
3. [멘탈 모델: 단일 원천 + 제품 루프](#3-멘탈-모델-단일-원천--제품-루프)
4. [설치와 사전 준비](#4-설치와-사전-준비)
5. [빠른 시작 — 제품 루프 한 바퀴](#5-빠른-시작--제품-루프-한-바퀴)
6. [6개 제품 동사](#6-6개-제품-동사)
7. [기능별 상세](#7-기능별-상세)
8. [실 에이전트 연동 + 명령 표면 (위임·MCP·도구·`--json`·`/fr:*` 래퍼·shell)](#8-실-에이전트-연동-위임mcp도구-호출)
9. [기반(엔진) 명령](#9-기반엔진-명령)
10. [안전: trust · Blast Radius · 경계](#10-안전-trust--blast-radius--경계)
11. [생성되는 파일과 폴더 구조](#11-생성되는-파일과-폴더-구조)
12. [현재 상태 (정직 고지)](#12-현재-상태-정직-고지)
13. [FAQ](#13-faq)
14. [문제 해결](#14-문제-해결)
15. [개발자용: 빌드·테스트·구조](#15-개발자용-빌드테스트구조)

---

## 1. Framein이 푸는 문제

바이브 코딩의 진짜 문제는 *"AI가 코드를 못 쓰는 것"* 이 아닙니다. AI는 코드를 빠르게 잘 씁니다.
문제는 그 **빠른 생성을 둘러싼 통제**입니다:

1. **의도 이탈** — 작업 도중 원래 요구에서 조금씩 벗어납니다("이메일 로그인 유지하면서 Google 추가"가
   어느새 인증 라이브러리 교체가 되어 있음).
2. **거짓 완료** — "구현 완료, 테스트 통과"라고 하지만 실제로는 테스트를 안 돌렸거나 일부만 돌린 경우.
3. **수리 루프** — 같은 테스트가 같은 이유로 반복 실패하는데 에이전트가 증상만 계속 패치.
4. **컨텍스트 유실** — compact·쿼터·CLI 전환 시 작업 맥락이 날아가 대화를 복붙해 넘겨야 함.
5. **(기반) 컨텍스트 파편화** — Claude는 `CLAUDE.md`, Codex는 `AGENTS.md`, Gemini는 `GEMINI.md`.
   한 곳을 고치면 나머지가 뒤처짐.

Framein은 단일 진실원천(`.frame` 스토어) 위에 **로컬 증거 게이트, 결정 원장, 네이티브 스킬 표면**을 얹어 이 다섯을 다룹니다.
세 벤더가 이미 skills·hooks·subagents·memory를 흡수하고 있으므로, framein은 그것들을 *다시 만들지 않고*
**의도 고정·완료 증명·위험 판정·세션 구조**라는, 어느 단일 CLI도 책임지지 않는 빈틈에 집중합니다.
`/fr:*`와 `$fr-*`는 이 빈틈을 각 에이전트 안에서 바로 호출하게 해 주는 얇은 skill surface입니다.

> 핸드오프에 대한 정직한 표현: ~~"실시간 공유"~~ 가 아니라 **"No manual handoff. Framein rebuilds the
> working context from evidence."** — 복붙 핸드오프 문서를 안 만들어도, 증거에서 작업 상태가 복원됩니다.

---

## 2. 설계 철학 (왜 이렇게 만들었나)

각 원칙은 ADR로 기록돼 있습니다(`docs/adr/`).

| 원칙 | 의미 | 근거 |
|---|---|---|
| **제어층 ≠ 실행기** | 터미널을 구동·스크래핑하지 않고, 공유 store/ledger로 **관측**한다. | ADR-0008 |
| **제자리(in-place) 기본** | 평소처럼 네이티브 CLI에 입력. 다른 역할은 *전환*이 아니라 한 세션 안으로 *불러온다*. 새 프롬프트 문법 0. | ADR-0006 |
| **no-relay** | 구독 자격증명을 중앙에 모으거나 대신 라우팅하지 않는다. 각 CLI가 자기 인증을 직접 처리. | PRD §2.3 |
| **감사 cadence** | 매 턴 리뷰가 아니라 **게이트·이상징후**에서만 다른 모델을 부른다(블로커만, 비동기). | ADR-0005 |
| **fresh-on-read** | 공유는 pull 기반. "항상 최신을 조회 가능"이지 자동 푸시가 아니다. | PRD §4.2 |
| **append-only ADR** | 결정은 수정·삭제 불가, 정정은 `supersede`. | ADR-0001~ |
| **zero runtime dependency** | Node 내장만(`node:sqlite`/`node:test`). `npx framein` 무마찰 + 크로스플랫폼. | ADR-0003 |
| **재사용 우선** | 기존 MCP·스킬을 재구현하지 않고 **감지·추천·등록**까지만(프록시 없음). | ADR-0002/0004 |

---

## 3. 멘탈 모델: 단일 원천 + 제품 루프

**(1) 단일 진실원천 → 투영.** 모든 룰·역할·결정(ADR)·메모리·Task Contract는 `.frame` 스토어 한 곳에
있고, 거기서 세 네이티브 파일의 **managed-block**이 *글자 단위로 동일*하게 투영됩니다(블록 밖 사용자
내용은 보존). 데이터는 항상 한 방향: **스토어 → 파일**.

```
   .frame/store.db (캐시) ⇄ framein.store.json (git 원천)
        │  store → projector.renderManagedBlock()
        ▼
   CLAUDE.md / AGENTS.md / GEMINI.md  (framein:begin … framein:end 블록만 갱신)
```

**(2) 제품 루프 — 의도 → 증거 → 구조.** framein의 핵심 동선입니다([ADR-0008](./adr/0008-reposition-to-quality-continuity-layer.md)):

```
 framein start  (의도를 Task Contract로 고정)
     ↓
 주도 AI가 평소처럼 개발 (framein이 변경·테스트·실패를 ledger에 기록)
     ↓
 이상징후면  framein rescue  (수리 루프 진단 → 선택지, 자동 실행 X)
     ↓
 완료 게이트  framein verify / ship  (build·test 증거를 계약과 대조)
     ↓
 다른 모델이 blocker review  framein challenge  (구조화된 판정 + lead 1회 응답, 사용자가 결정)
     ↓
 framein ship + framein explain  (증거·리스크 정리 + 인수 문서)
```

**(3) 역할은 전환이 아니라 불러오기.** 단일 에이전트만으로도 가치(비드리프트·공유 룰/ADR/memory)가
나오고, 다른 역할(reviewer/explainer 등)은 `framein ask`/루프 동사로 한 세션 안으로 *불려와* 같은
스토어를 조회·기록합니다.

---

## 4. 설치와 사전 준비

### 4.1 요구사항
- **Node.js ≥ 22.5.0** (필수 — 내장 `node:sqlite` 사용). 확인: `node --version`
- **런타임 의존성 0개.** 소스 checkout에서 `npm install`로 받는 것은 빌드 도구(`typescript`, `@types/node`)뿐입니다.
- 실 에이전트 연동(§8)을 쓰려면 해당 CLI 설치: `claude` / `codex` / `gemini`(+ API key).

### 4.2 설치
```bash
npm install -g framein
framein --version
```

이 npm 경로는 Node.js 22.5+ 환경의 Windows, macOS, Linux, WSL에서 동작합니다. Standalone 실행 파일은
Node와 Framein을 함께 담는 추가 편의 경로로 준비 중이며, 주로 별도 Node/npm 설치와 Windows npm shim
마찰을 줄이기 위한 것입니다. 현재 Framein을 쓰기 위해 필수인 경로는 아닙니다.

### 4.3 로컬 checkout 빌드 & 검증
```bash
git clone https://github.com/framein-dev/framein.git
cd framein
npm install      # 개발 도구
npm run build    # tsc → dist/
npm test         # 빌드 + 전체 테스트 — pass / fail 요약 확인
```

### 4.4 로컬 개발 실행 방법 (바이너리: `framein` · 별칭 `fr` / `frame`)
```bash
node dist/cli.js <명령>          # A) 직접 (빌드만 한 상태)
npm run framein -- <명령>        # B) npm 스크립트 ( -- 뒤에 인자 )
npm link && framein <명령>       # C) 전역 등록 → framein / fr / frame 모두 같은 CLI
```
> 이 매뉴얼은 `framein <명령>`으로 표기합니다(짧게 `fr <명령>`도 동일). `npm link`를 안 했다면
> `node dist/cli.js`로 바꿔 읽으세요. 자동화·래퍼 대상 동사는 `--json`을 지원합니다(§8.4).

---

## 5. 빠른 시작 — 제품 루프 한 바퀴

빈 폴더(가급적 git 저장소)에서:

```bash
# 0) 도입: 스토어 + 세 네이티브 파일 투영 + 기본 역할
framein init

# 1) 의도 고정 — Task Contract
framein start "기존 이메일 로그인 유지하면서 Google 로그인 추가"
framein task amend acceptance "기존 사용자는 이메일 로그인이 계속 된다"
framein task amend nongoal "UI 전체 리디자인"
#   → 계약이 CLAUDE/AGENTS/GEMINI.md 의 "## Task Contract" 로 항상 투영됨(모든 에이전트가 같은 기준)

# 2) 알려진 양호 지점 표시
framein checkpoint baseline
#   Checkpoint recorded: f7acccf (baseline). Return here with `framein rewind`.

# 3) (평소처럼 개발…) 막히면 — 수리 루프 진단
framein rescue
#   Framein detected a repair loop.
#     'auth.test.ts' failed 2× — stuck on the same test
#   Recommended:  A. Ask codex to diagnose  B. Rewind to f7acccf  ...
#   No action taken automatically.

# 4) 완료 게이트 — 증거로 검증
framein ship
#   NOT READY
#   ✓ Tests: 143 passed, 0 failed
#   ! 1 acceptance criteria need verification (reviewer/human)
#   Safe to commit: yes   Safe to deploy: requires human confirmation

# 5) 세션을 끊어야 하면 — Task Capsule 로 캡처
framein pause      # 나중에 framein resume 으로 복원 (대화 복붙 불필요)
```

이 한 바퀴가 framein의 본질입니다: **의도를 고정하고(start) → 증거로 완료를 증명하고(ship) →
막히면 구조하고(rescue) → 끊겨도 복원(pause/resume)**.

---

## 6. 6개 제품 동사

전면에 기억할 동사는 여섯 개입니다. (나머지는 §9의 기반 명령.)

| 동사 | 얻는 가치 | 핵심 |
|---|---|---|
| **`framein start <goal>`** | 의도를 Task Contract로 고정 | `task start`의 별칭. acceptance/non-goal은 `framein task amend` |
| **`framein ask <role> [prompt]`** | 다른 역할의 판단을 불러옴 | `--show`(미리보기)·`--run`(헤드리스 실행)·`--interactive`·`--trust` |
| **`framein verify`** | 완료 조건·증거 확인(정보용) | build/test 실행 → 계약 대조 |
| **`framein challenge "<제안>"`** | 다른 모델의 독립 반론 | 리뷰어 판정, lead 1회 응답, 결정 브리프. 최대 2왕복, 미합의 시 사람에게 2선택지 |
| **`framein rescue`** | 실패 루프 진단·복구 | 3선택지 제안(자동 실행 X). `--run`으로 리뷰어 진단 |
| **`framein ship`** | 최종 증거·리스크·승인 정리(게이트) | 통과 못 하면 exit 1. 위험 변경 시 Blast Radius 게이트↑ |

---

## 7. 기능별 상세

### 7.1 Task Contract — "무엇을 완료로 볼 것인가" (`start` · `task`)
기존 memory가 *"무엇을 아는가"* 를 공유한다면, Task Contract는 **"무엇을 완료로 볼 것인가"** 를 공유합니다.
```bash
framein start "<goal>"                       # = framein task start
framein task show                            # 현재 계약 전체 출력 (+ 미흡 항목 경고)
framein task amend <field> "<값>"            # field: goal|preserve|acceptance|protected|nongoal
```
- 계약은 `.frame`의 **구조화 task 상태**(가변, ADR과 별개)로 보존되고, managed-block의 `## Task Contract`로
  항상 투영되어 세 에이전트가 같은 기준을 봅니다. MCP `read_memory(scope:"task", key:"contract")`로도 조회 가능.
- 이상적으로는 lead가 사용자 프롬프트에서 초안을 만들고 위험·애매 항목만 한 번 확인합니다(라이브 경로).

### 7.2 Evidence Gate — "완료"를 증거로 (`verify` · `ship`)
"완료했습니다"를 자연어 선언이 아니라 **검증 증거 묶음**으로 정의합니다.
```bash
framein verify     # build/test 실행 → 계약 acceptance와 대조 (정보용, exit 0)
framein ship       # 강제 게이트: READY/WARNING 요약 + commit/deploy 구분 (미통과 시 exit 1)
```
- 하드 체크 = **build·tests**(둘 다 통과해야 ready). 계약 acceptance·unresolved 항목은 **경고**로 표면화
  (게이트가 자동으로 "verified"라 우기지 않음 — 리뷰어/사람 몫).
- `framein verify`는 프로젝트의 `npm run build`/`npm test`를 실제로 실행하고 결과를 파싱합니다.
- `ship`은 위험 변경 시 Blast Radius(§7.6)를 덧붙입니다.

### 7.3 Rescue Mode — 삼천포 자동 구조 (`rescue` · `checkpoint` · `rewind`)
이상징후 감지기(반복 수정·반복 실패·무진전)를 **대표 기능으로 승격**한 것입니다.
```bash
framein checkpoint [label]   # 현재 git 커밋을 'green' 지점으로 기록
framein rescue               # 루프 감지 시: 신호 + last-green + 3선택지 (자동 실행 X)
framein rescue --run         # 리뷰어가 읽기전용으로 진단 (root cause + next action)
framein rewind [--force]     # 마지막 checkpoint로 git reset 미리보기 (--force로 실행)
```
- `rescue`는 **절대 자동으로 행동하지 않습니다** — 진단/되감기/계속 중 사람이 고릅니다.
- `rewind`는 파괴적이라 기본 미리보기, `--force`로만 실제 `git reset --hard`.

### 7.4 Task Capsule — 세션·모델 바꿔도 복원 (`pause` · `resume` · `capsule`)
대화 전문 대신 **자동 생성되는 구조화 상태**로 작업을 넘깁니다(계약+ADR+git+테스트+ledger에서 합성).
```bash
framein pause          # 캡슐 저장 (goal/branch/last-green/decisions/changed/evidence/blocker/recent)
framein resume         # 저장된 캡슐 출력 (없으면 즉석 합성) → "No manual handoff needed"
framein capsule show   # 즉석으로 캡슐 렌더
```
- `blocker`는 ledger의 반복 실패 신호에서 자동 도출됩니다.

### 7.5 Disagreement Protocol — 끝없는 논쟁 차단 (`challenge` · `decide`)
모델 간 논쟁을 **형식 제한**(제안 → 리뷰어 판정 → lead 1회 응답 → 해결, **최대 2왕복**)합니다.
리뷰어는 코드를 고치지 않고 `verdict`, `claim`, `requiredChange`, `basis`, `missingEvidence`만 반환합니다.
Framein은 lead에게 한 번만 응답하게 한 뒤 결정 브리프를 출력하고, 최종 선택은 사용자가 `decide`로 기록합니다.
```bash
framein challenge "<제안>"                       # 논쟁 시작 (lead 제안)
framein challenge "<제안>" --run                 # 리뷰어 JSON verdict + lead 1회 응답 + 결정 브리프
framein challenge --block "<주장>" --require "<요구>"   # 리뷰어 반론 수동 기록
framein challenge --accept                        # 리뷰어 수용 → resolved
framein decide accept|reject ["<수정/사유>"]      # lead가 해결
framein challenge --show                          # 현재 논쟁 + 상태
```
- 2왕복 후 미합의면 **사람에게 정확히 2선택지**(lead 입장 vs 리뷰어 요구)로 escalate.
- 에이전트 wrapper의 `/fr:challenge`·`$fr-challenge`는 내부적으로 `--run --by <host>`를 붙입니다.

### 7.6 Blast Radius Guard — 위험할 때만 게이트↑ (`risk`)
변경 파일이 민감 영역(auth/결제/migration/secrets/deploy = HIGH, deps/config = MEDIUM)을 건드리면
필요 게이트를 올립니다 — **모든 작업이 아니라 위험도가 *변할 때만***(감사 cadence와 정합).
```bash
framein risk     # git 변경 파일 → 위험도 + 필요 게이트 (위험도 상승 시 알림)
```
`framein ship`이 위험 변경을 감지하면 자동으로 이 블록을 덧붙입니다.

### 7.7 Repo-local Routing — 내 저장소 실적 기반 (`route` · `stats`)
일반 모델 평가가 아니라 **이 저장소의 실제 결과**로 역할을 조정하고, **왜 골랐는지 설명**합니다
(자동 선택보다 신뢰가 중요).
```bash
framein stats                  # ledger에서 도출한 에이전트별 실적(위임/실패/쿼터)
framein route explain [role]   # 이 역할에 누구를 쓸지 + 이유 (로컬 실적이 기본 우선순위를 오버라이드)
#   Selected codex as reviewer.
#   Why:  + 100% delegation success in this repo (3/3)  + no quota issues
#   Alternative: claude, confidence 0.29
```

### 7.8 Framein Recipe — 벤더중립 프로토콜 (`recipe`)
"Claude 스킬을 Codex에서 실행" 같은 무리수 대신, 벤더중립 작업 프로토콜을 정의해 **각 CLI 네이티브로
컴파일/투영**합니다(교차 실행 아님 — ADR-0002/0004).
```bash
framein recipe list                    # feature / bugfix / ship
framein recipe show <name>             # 단계 목록
framein recipe compile <name> <agent>  # 해당 에이전트 네이티브 메커니즘 헤더 + 동일 프로토콜 본문
```

### 7.9 Vibe Debt Delta + Ownership Brief (`debt` · `explain`)
```bash
framein debt        # 이번 변경이 *추가한* 부채만 (새 deps/TODO/±라인) — 전체 경고 더미가 아님
framein explain     # 인수 문서 골격 (변경/테스트/롤백은 자동, 서술은 explainer 몫)
framein explain --run   # explainer 에이전트가 서술 섹션을 완성 (라이브)
```

---

## 8. 실 에이전트 연동 (위임·MCP·도구 호출)

> **실 CLI로 라이브 검증됨:** claude 2.1.156 · codex 0.141 · gemini 0.47.

### 8.1 헤드리스 위임 — `framein ask`
다른 역할을 한 세션 안으로 불러오는 주 경로입니다. 에이전트는 **헤드리스 서브프로세스**로 구동됩니다
(인터랙티브 TUI를 프로그램으로 모는 PTY가 아님, [ADR-0009](./adr/0009-drop-programmatic-pty-requirement.md)).
```bash
framein ask reviewer "이 변경 리뷰해줘" --show   # 실행할 명령 미리보기 (spawn·기록 없음)
framein ask reviewer "이 변경 리뷰해줘" --run    # 실제 실행 → 결과를 ledger + 캡슐에 ingest
framein ask reviewer --interactive               # 에이전트 TUI를 직접 몰기 (stdio:inherit)
framein ask implementer "..." --run --trust --ttl 30m   # 권한 우회 플래그 부착 (§10)
```
구현 디테일(라이브로 확정):
- **프롬프트는 stdin으로**, argv에는 고정 플래그만 → 쉘 주입 안전(`shell:true`로 Windows npm `.cmd`
  shim 해석).
- 에이전트별 호출형: `claude -p` / `codex exec --skip-git-repo-check` / `gemini --prompt= --skip-trust`.
- 위임 출력에서 **쿼터/과부하 신호**를 감지하면 다른 에이전트로 **페일오버**를 제안(예: gemini 503 →
  "consider failover to claude").

### 8.2 MCP 서버 — 에이전트가 framein 스토어를 도구로 사용
framein은 얇은 MCP 서버를 제공합니다. **각 CLI가 자기 `framein mcp serve` 서브프로세스를 띄우는 클라이언트**가
되고, 모두 같은 `.frame/store.db`를 공유합니다(WAL + 원자적 락으로 N-프로세스 안전).
```bash
framein mcp                       # 감지된 기존 MCP 서버 나열 (프록시 아님)
framein mcp register [path] --write   # framein MCP를 설정에 등록 (framein on PATH면 `frame`, 아니면 node+경로)
framein mcp serve                 # MCP stdio 서버 실행 (NDJSON JSON-RPC — Content-Length 아님, ADR-0007)
```
- 도구: `append_adr / list_adr / get_adr / read_memory / write_memory / list_memory / get_role /
  get_roles / acquire_lock / release_lock` — 각 도구는 `inputSchema`를 갖춰 실 클라이언트가 인식합니다.
- **검증됨:** `claude mcp list` → `framein … ✓ Connected`, 그리고 **claude·codex·gemini가 실제로
  `list_adr` 도구를 호출**해 스토어를 읽음(에이전트→MCP→store 전체 루프).

### 8.3 도구 호출엔 trust가 필요
세 CLI 모두 MCP 도구 *호출*에는 각자의 자동승인 플래그가 필요합니다 — claude
`--dangerously-skip-permissions`, codex `--full-auto`, gemini `--yolo`. 이는 정확히 `framein trust`(§10)가
공급하는 것이라, trust와 tool-use가 자연스럽게 맞물립니다.

### 8.4 명령 표면: `--json` 자동화 · `/fr:*` 네이티브 래퍼 (ADR-0010/0011)

같은 엔진을 네 표면으로 씁니다 — (1) 셸에서 `framein <동사>`, (2) MCP 도구, (3) **에이전트 네이티브 슬래시
래퍼**, (4) (선택) `framein shell`. 핵심은 **단일 진실원천**: 래퍼에는 로직이 없고 각 동사에 맞는
`framein <동사>` 호출만 수행하므로 호스트별로 동작이 갈리지 않습니다(드리프트 0).

**(1) `--json` — 자동화 출력.** 모든 wrap 대상 동사가 안정적 JSON을 냅니다(`{schemaVersion, command, …}`):
```bash
framein verify --json     # {"schemaVersion":1,"command":"verify","ready":false,"checks":[…],"warnings":[…]}
framein ship --json       # ready/safeToCommit/safeToDeploy/risk/requiredGates (미통과 시 exit 1 유지)
framein status | risk | debt | route explain | stats | rescue | task show   # 모두 --json 지원
```

**(3) `framein integrations` — 로직 없는 네이티브 래퍼 생성.** 에이전트 안에서 `/fr:verify`처럼 부를 수 있는
얇은 명령 파일을 만듭니다(각 파일은 `framein <동사> --json`만 호출 + provenance 마커).
```bash
framein integrations list                  # 호스트별 설치 현황
framein integrations show claude           # 생성될 파일 내용 미리보기
framein integrations install all --write   # 실제 생성 (미리보기는 --write 없이)
framein integrations uninstall claude      # 우리가 만든 파일만 제거(손으로 쓴 fr/ 명령은 보존)
```
| 호스트 | 생성 파일 | 호출 형태 |
|---|---|---|
| Claude | `.claude/commands/fr/<동사>.md` | `/fr:verify` (`allowed-tools: Bash(framein:*)`) |
| Gemini | `.gemini/commands/fr/<동사>.toml` | `/fr:verify` (`!{framein verify --json}`) |
| Codex | `.agents/skills/fr-<동사>/SKILL.md` | `$fr-verify` (repo skill — `$` 접두어) |

대상 동사: `start · verify · ship · rescue · status · challenge · risk · task · capsule · decide`. 네임스페이스 `fr`로 묶어 베어 이름 충돌을
피합니다(ADR-0011).

운영 제약:

- Windows에서는 생성 래퍼가 `framein.cmd`를 호출해 PowerShell 실행정책이 `framein.ps1`을 막는 문제를
  피합니다. 이전 버전에서 생성한 래퍼가 bare `framein`을 호출한다면 `framein integrations install all --write`로
  다시 생성하세요.
- Codex 등 에이전트가 read-only sandbox로 실행되면 `.frame/store.db`와 SQLite WAL 파일을 열 수 없어
  `verify`/`ship`/`capsule` 같은 store-backed 명령이 실패할 수 있습니다. Framein skill surface를 실제로
  실행하려면 프로젝트 쓰기 권한(workspace-write 이상)이 필요합니다.

**`framein doctor` / `setup`.** 에이전트 CLI 설치 여부 + 래퍼 설치 현황을 점검/추천합니다.
```bash
framein doctor    # claude/codex/gemini가 PATH에 있는지 + 호스트별 래퍼 N/6 설치됨
framein setup     # doctor + 감지된 CLI에 대한 install 추천
```

### 8.5 (선택) `framein shell` — zero-dep 스위치보드

장기적으로 회사 솔루션 라인업을 위한 **선택적** 인터랙티브 셸입니다. 의존성 0(Node 내장 readline)으로 동사를
인라인 실행하고, **리드 에이전트의 네이티브 TUI에 터미널을 양도**합니다. 진입 시 브랜드 프레임 + 라이브 상태
(project/lead/reviewer/task)를 보여줍니다([디자인 스타일 가이드](./FRAMEIN-DESIGN-STYLE-GUIDE.md) §8/§18 적용).
```text
$ framein shell
┌─ FRAMEIN ─────────────────────────────┐
│ Intent in · Evidence in · Drift out   │
└───────────────────────────────────────┘

  project    framein · main
  lead       claude
  reviewer   codex
  task       no active contract

fr(claude)› verify --json     # 아무 framein 동사나 인라인 실행 (프롬프트의 fr 는 brand 색)
fr(claude)› /lead codex       # 리드 에이전트 전환
fr(codex)›  /go               # 리드의 '네이티브' TUI로 터미널 양도 (framein 일시정지 → 종료 시 복귀)
fr(codex)›  codex 버그 고쳐줘   # 베어 에이전트명으로도 바로 양도
fr(codex)›  /help · exit
```
- `/go`(또는 베어 에이전트명)는 `stdio:inherit`로 **Claude/Codex/Gemini가 제공하는 화면·기능을 그대로** 보여
  줍니다. 그동안 framein은 멈춰 있다가, 에이전트를 빠져나오면 셸로 복귀합니다.
- **숨은 비용(정직 고지):** framein 화면과 라이브 TUI를 *동시에* 겹쳐 보여주려면 `node-pty`(네이티브 의존성)가
  필요합니다 — zero-dep을 깨므로 **번들하지 않는 선택적 의존성**으로만 남깁니다([ADR-0010](./adr/0010-command-surface-wrappers-shell-optional-pty.md)).
- **출력 모드(스타일 가이드 §12):** 색은 인터랙티브 터미널에서만 켜지고 파이프·CI·`--json`은 자동 plain.
  `--plain`/`--no-color` 또는 `NO_COLOR` 환경변수로 끌 수 있으며, 유니코드 박스가 깨지는 레거시 콘솔(예: 일부
  Windows)에선 자동으로 ASCII(`+--+`, `[ok]`)로 폴백합니다. 같은 색·기호 체계가 `verify`/`ship`/`rescue`/`risk`
  등 전 CLI 출력에 공통 적용됩니다.
- TTY가 아니면(파이프 입력) 배치 모드로 동작 — 동사만 실행하고 TUI 양도는 안전하게 건너뜁니다.

---

## 9. 기반(엔진) 명령

일반 사용자에겐 내부 고급 명령이지만, framein을 떠받치는 기반입니다.

| 명령 | 설명 |
|---|---|
| `framein init` | 스토어 생성 + 기본 룰/역할 + 세 파일 투영 (멱등). |
| `framein status` | 역할·락·결정 수 요약. |
| `framein role set <role> <agent>` / `role list` | 역할 배정/조회. **agent·role 값 검증됨**(claude/codex/gemini, lead/implementer/reviewer/explainer/researcher 외 거부; agent 누락 시 오류). |
| `framein adr add <title>` / `supersede <id> <title>` / `show <id>` / `list` | 결정 로그(append-only, 정정은 supersede). |
| `framein sync [--dry-run]` | 스토어 → 세 파일 재투영 (`--dry-run`으로 변경 미리보기). |
| `framein export [path]` / `import [path]` | git-canonical 텍스트 스냅샷(`framein.store.json`) ↔ 스토어. |
| `framein unlock [scope]` | stale write-lock 강제 해제. |
| `framein ledger add <kind> [target]` / `ledger list` | 작업 이벤트 기록(이상징후 감지의 입력). |
| `framein audit` | ledger의 thrash 신호 보고(블로커만). |
| `framein skills` | framein 자체 + 감지된 스킬 카탈로그(교차 실행 안 함). |
| `framein integrations` / `doctor` / `setup` / `shell` | 명령 표면(§8.4–8.5): 네이티브 `/fr:*` 래퍼 · CLI/래퍼 점검 · 선택적 스위치보드. |
| `framein --version` / `--help` / `<cmd> --help` | CLI 위생. |

> **메모리:** memory는 MCP 도구(`read_memory`/`write_memory`)로 쓰며, Task Contract도 그 위에 얹혀
> 있습니다. memory 전용 CLI 동사는 아직 없습니다.

---

## 10. 안전: trust · Blast Radius · 경계

### `framein trust <agent> [--ttl <dur>]`
가장 위험한 기능이라 **편의보다 안전**을 앞세웁니다(미리보기 기본, 자동 적용 안 함).
```bash
framein trust codex --ttl 20m
#   trust preview for codex (time-box ~20m):
#     would add: --full-auto
#     ⚠ codex will run WITHOUT per-action permission prompts ...
#     ⚠ A worktree is NOT a sandbox: network, credentials, npm install are NOT blocked.
```
- `framein ask ... --run --trust`로 실제 위임 spawn에 우회 플래그가 주입됩니다(시간 제한·ledger 기록).
- **한계 고지:** worktree는 파일시스템만 격리할 뿐 **샌드박스가 아닙니다**(네트워크·자격증명·설치 미차단).

### Blast Radius (§7.6) / 커밋 금지 데이터
- 위험 파일 변경 시 `ship`이 게이트를 올립니다.
- ADR·memory에는 **시크릿/토큰/내부 경로가 섞이기 쉽습니다.** git에 커밋되는 텍스트 스냅샷
  (`framein.store.json`)에 무엇을 적을지 주의하세요.

---

## 11. 생성되는 파일과 폴더 구조

```
내-프로젝트/
├── .frame/
│   └── store.db        ← 재생성 가능한 로컬 캐시 (SQLite, .gitignore)
├── framein.store.json  ← git-canonical 원천 (framein export 로 생성, 커밋 대상)
├── CLAUDE.md           ← 투영 결과물 (Claude)  ┐ framein:begin … framein:end
├── AGENTS.md           ← 투영 결과물 (Codex)   ├ 마커 사이 본문이 세 파일 byte-identical
└── GEMINI.md           ← 투영 결과물 (Gemini)  ┘ 블록 밖 사용자 텍스트는 보존
```

managed-block 본문 구조(예):
```markdown
<!-- framein:begin … -->
## Task Contract
**Goal:** 기존 이메일 로그인 유지하면서 Google 로그인 추가
- Acceptance: 기존 사용자는 이메일 로그인이 계속 된다
- Non-goals: UI 전체 리디자인

## Project Rules
- Write tests first (TDD). …

## Agent Roles
- **implementer** → claude   …

## Architecture Decisions (digest)
- [ADR-1] … (accepted)
<!-- framein:end -->
```
- 텍스트 스냅샷이 **유일 canonical**, `.frame/store.db`는 폐기 가능 캐시(F-SYNC-6). 팀은 `framein.store.json`을
  커밋해 공유하고 clone 시 `framein import`로 복원합니다.
- ⚠️ **이 framein 저장소 루트에서는 `framein init`/`sync`를 돌리지 마세요** — 손으로 쓴 `CLAUDE.md`에
  managed-block이 주입됩니다. 테스트는 항상 별도 폴더에서.

---

## 12. 현재 상태 (정직 고지)

**구현·테스트 완료 (249 tests, green, zero runtime dep, 2026-06-28 기준):**
- 코어(스토어·투영·managed-block·원자적 다중프로세스 락·텍스트 직렬화·역할 라우팅·ADR).
- MCP/스킬 감지·등록, 스펙 준수 MCP 서버(initialize 네고·ping·inputSchema·isError, ADR-0007).
- **제품 루프 P0~P2 전부:** Task Contract · Evidence Gate · Rescue · Capsule · Disagreement ·
  Blast Radius · Repo-local Routing · Recipe · Debt · Ownership Brief.
- **명령 표면 (ADR-0010/0011):** 자동화·래퍼 대상 동사의 `--json`, 로직 없는 네이티브 래퍼(`integrations` →
  `/fr:*` · `$fr-*`), `doctor`/`setup`, 선택적 `framein` 로비(스위치보드), 멀티-bin
  `framein`/`fr`/`frame`. (§8.4–8.5)

**실 CLI로 라이브 검증 완료:** 3-에이전트 헤드리스 위임(`ask --run`), MCP 연결 + **도구 호출**,
`trust` 적용, `--interactive`(stdio:inherit), 구조화/모델 내용 ingest(`challenge/rescue/explain --run`),
쿼터→페일오버. (claude 2.1.156 / codex 0.141 / gemini 0.47)

**아직 남음:** 스킬 라우터 자동 주입(`framein route` v2, opt-in), 각 기능 모델 내용의 대규모 운영,
OSS 릴리스 준비(LICENSE/CI/SECURITY 등).

**⛔ 의도적 미구현:** **프로그래밍 PTY(node-pty/ConPTY)** — 네이티브 런타임 의존성이라 zero-dep
불변식(ADR-0003)을 깨고, framein은 TTY를 스크래핑하지 않고 store/ledger로 관측하므로 불필요합니다.
사람-개입은 `--interactive`/`framein shell`의 `/go`(둘 다 `stdio:inherit`)가 커버합니다. `framein shell`
자체는 **구현됨(§8.5)** — 다만 framein과 라이브 TUI를 *동시에 겹쳐* 보여주는 오버레이만 node-pty가 필요해
선택적·미번들로 남겼습니다 — [ADR-0009](./adr/0009-drop-programmatic-pty-requirement.md)/[ADR-0010](./adr/0010-command-surface-wrappers-shell-optional-pty.md).

---

## 13. FAQ

**Q. 처음부터 다시 시작하고 싶어요.** → `.frame/` 폴더를 지우고 `framein init`. (`.frame/`은 `.gitignore`에 포함.)

**Q. `.md` 파일을 직접 고쳐도 되나요?** → managed-block 안은 다음 sync에 덮어써집니다. 블록 *밖*은
보존되니 손으로 쓴 내용은 마커 밖에 두세요. 블록 안 내용은 `frame` 명령으로 스토어를 바꿔 반영하세요.

**Q. 세 파일이 정말 같나요?** → managed-block 본문은 byte-identical(테스트로 검증). 파일명 제목/마커만 다릅니다.

**Q. Gemini를 개인 계정으로 쓰면?** → 약관상 금지(2026-06-18 소비자 로그인 종료), 라우팅에서 −∞로 자동
차단. **API key / Vertex / Workspace**만. (예: `GEMINI_API_KEY` 환경변수 → gemini가 직접 읽음, no-relay.)

**Q. Windows에서 되나요?** → 네, Node 22.5+면 Windows 네이티브에서 동작(검증 완료). 에이전트 구동도
헤드리스 파이프(npm `.cmd` shim은 `shell:true`)라 그대로 됩니다. **PTY를 안 쓰므로 ConPTY 문제 없음.**

**Q. 다른 에이전트가 새 ADR을 자동으로 받나요?** → 아니요(fresh-on-read). 도구 호출/`framein sync`/세션
재시작 시 최신을 조회합니다. "실시간 푸시"가 아니라 "핸드오프 없이 항상 최신 조회 가능"입니다.

---

## 14. 문제 해결

| 증상 | 원인 / 해결 |
|---|---|
| `No .frame/store.db found. Run 'framein init' first.` | 해당 폴더에서 `framein init` 먼저. |
| `node:sqlite` 오류 / 모듈 없음 | Node < 22.5. `node --version` 확인. |
| `framein` 또는 `frame` 명령 못 찾음 | npm 설치본은 `npm install -g framein`. 로컬 checkout은 `npm run build` 후 `node dist/cli.js …` 또는 `npm link`. |
| `ask --run`이 `'codex' not found` | 해당 CLI 미설치(또는 PATH 밖). 설치하거나 `--show`로 명령만 확인. |
| MCP 도구 호출이 `user cancelled` | 도구 호출엔 trust 필요 — `--trust`(claude) / codex `--full-auto` / gemini `--yolo`. |
| 역할 set 했는데 안 바뀜 | agent 인자 누락 시 오류가 납니다. `framein role set <role> <agent>` 형식 확인. |
| 소스 변경이 반영 안 됨 | `src/*.ts` 수정 후 `npm run build` 필요. |

---

## 15. 개발자용: 빌드·테스트·구조

```bash
npm run build      # tsc → dist/
npm test           # 빌드 후 dist/**/*.test.js 전체
node --no-warnings --test dist/store.test.js                              # 한 파일
node --no-warnings --test --test-name-pattern="supersede" dist/**/*.test.js   # 이름으로
node --no-warnings dist/cli.js <cmd>                                      # 로컬 실행
```
- 테스트는 콜로케이트(`*.test.ts`), Node 내장 `node:test` + `node:assert/strict`. 린터 없음, `tsc --strict`가
  유일한 정적 게이트. `lock.mp.test.ts`는 자식 프로세스를 띄우는 다중프로세스 락 테스트(결정성 유지).

**모듈 맵 (의존 방향 대략):**
```
db → store → (roles, adr, anomaly, task) → projector → fileWriter
                                              ↘ mcpServer / mcpRegister / detect
제품 루프(순수): evidence · rescue · capsule · disagree · blast · stats · recipe · debt · brief · ingest · quota · delegate · trust
명령 표면(순수): wrappers(네이티브 래퍼 생성) · shell(셸 라인 라우터)
cli.ts → 위 전부를 배선 (runCommand는 CliError throw, main이 감싸 exit 1 → shell이 인프로세스 재사용)
```

| 파일 | 역할 |
|---|---|
| `db.ts` | `node:sqlite` 얇은 파사드(다른 곳에서 직접 import 금지). |
| `store.ts` | config·roles·**append-only adr**·scoped memory·write_lock·ledger + export/import. |
| `managedBlock.ts` | 마커 기반 upsert(사용자 텍스트 보존, 중복 마커 붕괴, 마커 defang). |
| `projector.ts`·`fileWriter.ts` | core 블록 생성(세 파일 동일) + `--dry-run` plan + 변경분만 기록. |
| `roles.ts` | agent/role 가드 · `scoreAgent`/`selectAgent` · `repoBonus` · 약관 차단(−∞). |
| `adr.ts`·`anomaly.ts` | ADR 다이제스트 · `detectThrash`(이상징후). |
| `detect.ts`·`mcpRegister.ts`·`mcpServer.ts` | MCP/스킬 감지 · 등록 머지 · 스펙 준수 stdio 서버. |
| `task.ts`·`evidence.ts`·`rescue.ts`·`capsule.ts` | 제품 루프 P0 순수 로직. |
| `disagree.ts`·`blast.ts`·`stats.ts` | P1 순수 로직. |
| `recipe.ts`·`debt.ts`·`brief.ts`·`ingest.ts` | P2 + 구조화 ingest. |
| `quota.ts`·`delegate.ts`·`trust.ts` | 라이브 위임/페일오버/권한(순수 부분). |
| `wrappers.ts`·`shell.ts` | 로직 없는 네이티브 래퍼 생성 · `framein shell` 라인 라우터(순수). |
| `cli.ts`·`types.ts` | 명령 디스패치(`runCommand`/`main`) · `--json`(`wantsJson`/`emitJson`) · 공유 타입. |

**바꾸면 안 되는 불변식:** ADR append-only · managed-block byte-identical(+블록 밖 보존) · 원자적
write lock · 텍스트 canonical · 재사용(no-relay/no cross-exec) · **zero runtime dependency** ·
소비자 Gemini 차단. 각각 `docs/adr/`의 ADR로 뒷받침됩니다.

**코드 컨벤션:** ESM + `NodeNext` — `.ts` 소스에서 import 시 **`.js` 확장자 명시**. 자세한 가이드는 루트
[`CLAUDE.md`](../CLAUDE.md), 제품 전체 그림은 [`PRD.md`](./PRD.md), 결정 로그는 [`adr/`](./adr/).

---

**Framein by Frameout** · MIT([`LICENSE`](../LICENSE)) · 현재 상태 [`STATUS.md`](../STATUS.md) ·
신뢰 경계 [`SECURITY.md`](../SECURITY.md) · 디자인 [`FRAMEIN-DESIGN-STYLE-GUIDE.md`](./FRAMEIN-DESIGN-STYLE-GUIDE.md).
