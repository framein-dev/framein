# ADR-0009 — 프로그래밍 PTY를 요구사항에서 제거 (헤드리스 파이프 + stdio:inherit가 대체)

- **Status:** Accepted (2026-06-21)
- **관련:** [ADR-0003](./0003-open-source-from-day-one.md)(zero-dep) · [ADR-0006](./0006-interaction-model-in-place-default.md)(제자리·cockpit 비목표) · [ADR-0007](./0007-mcp-stdio-framing-ndjson-not-content-length.md)(헤드리스 위임) · [ADR-0008](./0008-reposition-to-quality-continuity-layer.md)(제어층 리포지셔닝) · PRD §6.1/§6.3/§6.5/§7/§9/§11
- ADR-0006 §Consequences("B = 3-CLI PTY")와 ADR-0007 §B-2("node-pty는 인터랙티브 attach에 필요")의
  **PTY 측면을 supersede**한다(두 ADR은 append-only라 본문은 보존).

## Context

초기 PRD(v0.3~v0.7)는 오케스트레이션을 **"PTY(node-pty/ConPTY)로 세 CLI를 띄워 구동"** 으로 보고,
아키텍처에 "세션·PTY 생명주기 관리"를 두고 **Windows 네이티브 PTY를 최상위 리스크**(§6.5/§9/§11.6)로
잡았다. 이는 "오케스트레이션 = 인터랙티브 TUI를 띄워 프로그램으로 구동"이라는 초기 프레이밍이었다.

그 전제가 이후 결정·구현으로 무너졌다:

- **ADR-0006**: 3-pane cockpit/멀티플렉서는 비목표. 제자리(in-place) + 역할 불러오기.
- **ADR-0008**: framein은 터미널을 구동·스크래핑하는 게 아니라 **공유 store/ledger로 관측**하는
  품질·연속성 제어층이다.
- **구현(M10/M21/M24/M26)**: 에이전트 구동은 **헤드리스 파이프**(`claude -p`/`codex exec`/`gemini`,
  `child_process.spawn` + 프롬프트 stdin)로, 사람이 직접 모는 인터랙티브는 **`stdio:inherit`**
  (`frame ask --interactive`)로 충족 — **둘 다 zero-dep, 실 3-CLI로 검증.**

즉 **프로그래밍 PTY**(에이전트 TTY를 읽기/주입/리사이즈 제어)가 필요한 제품 경로가 없다. 반면
node-pty/ConPTY는 **네이티브 런타임 의존성**이라 zero-dep 불변식(ADR-0003)을 깬다.

## Decision

1. **프로그래밍 PTY를 framein 요구사항에서 제거한다.** (PRD의 "PTY로 3-CLI 구동" 및 "Windows PTY
   최상위 리스크"는 폐기.) 미구현이 아니라 **불필요해진 요구사항의 삭제**다.
2. **에이전트 구동 = 헤드리스 child_process 파이프**(프롬프트는 stdin, argv는 고정 플래그).
   **사람-개입 = `stdio:inherit`**(`--interactive`). 둘 다 zero-dep.
3. **node-pty/ConPTY는 의도적으로 채택하지 않는다.** zero-dep 위반 + 제품이 TTY를 스크래핑하지 않음.
4. **복구 분류 `PTYDead` → `SubprocessExit`**(서브프로세스 비정상 종료/스폰 실패)로 일반화한다.
5. **열린질문 §11.6(Windows 네이티브 PTY)는 종료한다** — PTY 자체가 불필요하므로 리스크가 소멸.

## Consequences

- **PRD 정정:** §6.1 다이어그램("세션·PTY 생명주기"→"서브프로세스 생명주기"), §6.3(어댑터: PTY→헤드리스
  파이프 + stdio:inherit), §6.5(기술스택: PTY 핵심리스크 제거), §7(`PTYDead`→`SubprocessExit`),
  §8/§9(3-CLI PTY 리스크 제거), §11.6 종료. Planning notes for the PTY adapter were updated to
  the headless path.
- **리스크 감소:** codex가 경고했던 Windows 3-CLI PTY 리스크가 통째로 사라진다(Windows P0 사용자에게 큰 이득).
- **정합:** zero-dep(ADR-0003) 유지, 제어층(ADR-0008)·헤드리스(ADR-0007)·제자리(ADR-0006)와 일치.
- **되돌릴 여지:** 장차 *헤드리스 모드가 전혀 없는* TUI-only 에이전트를 프로그램으로 구동해야 하는
  구체적 필요가 생기면, 그때 **선택적·격리된 네이티브 애드온**으로 재검토한다 — 코어엔 절대 넣지 않는다.

## Alternatives considered

- **PTY를 코어 메커니즘으로 유지** — 기각. 어디서도 안 쓰이고, 네이티브 의존성이며, 제어층 설계와 배치.
- **node-pty를 지금 선택적 의존성으로 추가** — 기각. 현재 필요 없음(YAGNI), zero-dep 강점 훼손.
- **문서에서 PTY만 조용히 삭제** — 기각. 요구사항·리스크 변경은 추적 가능한 결정(ADR)으로 남긴다.
