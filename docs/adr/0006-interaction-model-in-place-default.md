# ADR-0006 — 상호작용 모델: 제자리(in-place) 기본 · 역할 불러오기 · 오케스트레이션은 추가

- **Status:** Accepted (2026-06-20) — **PRD 열린질문 §11.5 종료(close)**
- **관련:** PRD v0.7 §5.7, §5.8, §4.2, §8 · [ADR-0001](./0001-zero-friction-first.md)(마찰 제로) · [ADR-0002](./0002-reuse-existing-mcp-and-skills.md)/[ADR-0004](./0004-scope-claims-to-detect-and-recommend.md)(재사용 우선) · [ADR-0005](./0005-audit-cadence-not-per-turn.md)(감사 cadence)

## Context

사용자가 framein으로 "어떻게 작업하는가"의 두 모드가 있었고, 어느 게 기본인지 미정이었다(열린질문 #5).

- **(A) 비가시 동기 모드** — 한 CLI(예: Claude Code)에 평소처럼 대화. framein은 공유 프레임
  (룰·역할·ADR·memory)을 밑에서 동기화. *지금 Claude Code로 대화하듯이.*
- **(B) 오케스트레이션 모드** — `frame ask <role>` 등으로 다른 에이전트(예: reviewer=codex)를
  불러 역할 분담. 핸드오프 없는 멀티 에이전트 협업과 감사(ADR-0005)가 여기 산다.

긴장: **마찰 제로(ADR-0001)** 의 기준선은 "지금 대화하듯이"라 A를 가리키고, **North Star
(핸드오프 없는 멀티 에이전트)** 는 B를 요구한다. 핵심 질문 세 개 —
(1) 기본 surface는 A인가 B인가? (2) 새 프롬프트 문법을 강요할 것인가? (3) 멀티 에이전트를
항상 켜야 하는가?

(사용자 확인: 흐름 5단계 "롤을 안 바꾸는 한 지금 너와 대화하며 작업하듯이"가 기준선임.)

## Decision

**A/B 중 택일이 아니라 계층화한다 — A를 기본 surface로, B는 A 안으로 "불러온다".**

1. **기본 surface = 제자리(in-place).** 사용자는 자기 네이티브 CLI(기본 lead/implementer
   = claude)에 **평소처럼 입력**한다. framein은 공유 프레임을 MCP + managed-block으로 **밑에서
   동기화**하고, 자기 기능은 **그 세션 안의 MCP 도구/스킬**로 노출한다. **공통 경로에 새 프롬프트
   문법 0** — 그냥 에이전트에 타이핑한다(셸 인자 쿼팅 지옥 없음).
2. **역할은 "전환"이 아니라 "불러오기".** 한 세션 안으로 다른 역할을 끌어온다 —
   (a) **명시적 위임**(`frame ask <role>` 또는 세션 내 스킬/도구), (b) **자동 감사**
   (ADR-0005: 게이트·이상징후). 불려온 에이전트는 **공유 스토어를 fresh-on-read로 조회**하고
   ADR/memory에 기록한다 → 복붙 핸드오프 소멸. *사용자는 세 터미널을 juggle하지 않는다.*
3. **단일 에이전트 = 완결된 baseline.** 세 에이전트를 다 띄우지 않아도 가치(컨텍스트 비드리프트,
   공유 룰/역할/ADR/memory)를 얻는다. 멀티 에이전트 오케스트레이션은 **추가·opt-in**이며,
   제자리 동기 가치 **다음에** 온다.
4. **`frame ask <role>`는 보조·세션 밖·스크립트 경로.** 프롬프트는 stdin/`$EDITOR`/REPL
   (§5.7 F-UX-1). 일상 주 surface가 아니다.
5. **비가시 우선, 그러나 관측 가능.** framein이 행동(동기·감사·위임)할 때 status line·주석으로
   보이되 **터미널을 가로채지 않는다**(F-UX-2).

**비목표(명시):** **3-pane 멀티플렉서 cockpit을 주 UX로 만들지 않는다**(CCB류). 차별점은
cockpit이 아니라 **"보이지 않는 동기 + 필요할 때 불러오기"**.

## Consequences

- **구현 순서가 명확해진다:** **A(제자리 동기) = 프로토타입+**(managed-block + MCP 서버 +
  스토어 동기), **B(오케스트레이션: 3-CLI PTY · delegate · 자동 감사 · 역할 전환) = MVP 이후.**
  A를 먼저 출시해 핵심 가설을 싸게 검증하고, codex가 경고한 **Windows 3-CLI PTY 리스크를 뒤로
  미룬다**(§8).
- **일상 주 경로가 셸 인자를 안 거치므로** §5.7의 쿼팅 문제를 구조적으로 회피한다.
- 마찰 제로(ADR-0001)·재사용 우선(ADR-0002/0004)·감사 cadence(ADR-0005)와 모두 정합.
- 열린질문 #5 종료.

## Alternatives considered

- **B를 기본(`frame ask`가 주 동사)** — 기각. 새 프롬프트 surface를 강요 = 마찰. ADR-0001 위반.
- **3-pane cockpit 멀티플렉서를 주 UX로** — 기각. 무겁고 네이티브 UX와 경쟁, 재사용 우선 위반,
  CCB와의 차별 약화.
- **A/B를 사용자가 매번 선택** — 기각. 선택 자체가 마찰. 기본 A + 자연 escalation이 옳다.
