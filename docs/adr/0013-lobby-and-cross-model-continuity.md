# ADR-0013 — 인터랙티브 로비 & 모델 간 연속성: lobby 네이밍 · pull 기반 연속성(스크랩·push 아님) · /trust opt-in

- **Status:** Accepted (2026-06-22).
- **근거:** ADR-0010(명령 표면·선택적 shell)의 인터랙티브 레이어를 실사용 테스트하며 내린 결정. [ADR-0009](./0009-drop-programmatic-pty-requirement.md)(no-PTY/관찰은 store·ledger), [ADR-0010](./0010-command-surface-wrappers-shell-optional-pty.md), [ADR-0012](./0012-agent-driven-core-features.md)와 맞물림. F-TRUST(`trust.ts`)의 "live path" 실현.

## Context

ADR-0010은 선택적 `shell` 스위치보드를 두되 구조만 정했다. 실사용에서 (a) 이름 `shell`이 OS 셸과 혼동되고,
(b) 모델을 오가며 **맥락 연속성**을 어떻게 보장할지, (c) `/go`로 에이전트를 띄울 때 **권한 우회**를 어떻게
다룰지가 구체화되어야 했다. 핵심 제약은 ADR-0009: framein은 **TTY를 스크랩하지도, 주입하지도 않는다**(no-PTY,
zero-dep) — 관찰·기록은 store/ledger로만 한다. 이 제약 위에서 연속성을 설계해야 한다.

## Decision

1. **네이밍: 스위치보드 = "lobby".** 터미널에서 bare `framein` = 로비 진입(파이프/CI는 도움말). `framein shell`은
   숨은 하위호환 별칭. (ADR-0010이 "optional shell"로 부른 것을 사용자 대면 명칭으로 확정 — OS 셸 혼동 회피,
   "들어와서 방향 잡고 → /go" 통과-공간 의미와 일치.)

2. **모델 재진입 = 세션 이어가기, 단 스크랩이 아니다.** `/go` 재진입 시 각 CLI의 **resume-last** 형으로 직전
   세션을 잇는다: claude `--continue`, codex `resume --last`, gemini `--resume`. 화면에 출력된 session-id를 **긁지
   않는다**(ADR-0009); 재진입 여부는 framein **자기 ledger**(그 에이전트의 이전 enter/return)로 판단한다.
   특정 id를 지정하는 `--resume <id>`는 스크랩이 필요해 채택하지 않는다 — `--continue`(cwd 최근 세션)로 동일
   목적을 달성한다.

3. **캡슐 핸드오프 = pull, never push.** framein은 새 에이전트 TUI에 컨텍스트를 **주입하지 않는다**
   (stdio:inherit, ADR-0009). 대신:
   - **자동 pull:** 관리블록 지침이 새 모델에게 *세션 시작 시 `framein capsule` 실행*을 지시 → 진입한 모델이
     스스로 상태(계약·git·증거·결정)를 끌어온다(ADR-0012).
   - **예약 전환:** `framein capsule <agent>`(에이전트 안에서 `/fr:capsule <agent>`)가 다음 리드를 store에 1회성
     예약 → **현재 모델 종료를 트리거로** framein이 그 모델을 자동 launch.
   - **유일한 수동 단계 = 현재 모델 나가기.** framein은 살아있는 세션을 강제종료하지 않으며(그래선 안 됨),
     `/go` 동안은 일시정지 상태라 에이전트 내부를 보지도 못한다.
   - 캡슐은 채팅 요약이 아니라 **git·증거·계약·ledger에서 조립한 사실 스냅샷** → 컨텍스트가 소실돼도 생존.

4. **`/trust` = opt-in·시간제한 권한우회 적용.** 기본은 OFF(에이전트가 매 액션 승인). 로비 `/trust`로 무장
   (30분 time-box) → 그 동안 `/go`가 bypass 플래그(claude `--dangerously-skip-permissions` · codex `--full-auto`
   · gemini `--yolo`)를 적용. 무장·적용 시 경고를 표시. F-TRUST가 예고한 "live path"를 *명시적 무장*으로만
   여는 절충(안전 기본값 유지).

## Consequences

- **연속성의 신뢰 모델 = ground truth.** resume·캡슐은 git/ledger/store에서 나오므로 채팅이 사라져도 복원되고,
  LLM 환각이 끼지 않는다. ADR-0009의 "관찰은 store/ledger, 주입·스크랩 없음"이 resume·handoff에도 적용됨을 명문화.
- **에이전트 준수 전제.** 자동 pull·자동 체인은 에이전트가 관리블록 지침을 따른다는 전제(ADR-0012)에 의존 —
  **라이브 검증 필요**, 미준수 시 사람이 `/fr:capsule`·`/lead`로 수동 처리(우아한 degrade).
- resume·handoff 동사 문법은 버전 민감(각 CLI) → 깨지면 그 CLI의 현재 resume 플래그로 갱신.

## Alternatives considered

- **`--resume <id>`로 특정 세션 복원** — 기각: 출력된 id를 화면에서 스크랩해야 함(ADR-0009 위반). `--continue`로 대체.
- **캡슐을 새 모델에 push**(argv 첫 프롬프트/주입) — 기각: shell 주입 안전성(DEP0190)·no-PTY·no-relay. pull로.
- **/trust 항상 적용 / 변경마다 확인** — 기각: 전자는 위험, 후자는 마찰. opt-in + time-box로 절충(사용자 선택).
- **`shell` 명칭 유지** — 기각: OS 셸과 의미 충돌. `lobby`가 정확. (`shell` 별칭은 하위호환으로만 잔존.)
