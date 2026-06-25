# ADR-0008 — 리포지셔닝: 바이브 코딩 품질·연속성 제어층 + 의도→증거→구조 제품 루프

- **Status:** Accepted (2026-06-21)
- **관련:** internal research notes · PRD v0.7 §2, §5, §8 · 기존 ADR 전부(0001~0007)를 **유지**하고
  그 위에 제품 레이어를 얹는다(부정·대체 아님).

## Context

Stage 0 + 프로토타입+ + B-레이어 로직(B-1~B-4)이 구현·테스트 완료됐다(97 tests). 그러나 세 벤더
(Claude Code·Codex·Gemini)가 skills·hooks·subagents·memory·checkpoint·auto-review를 빠르게 흡수
중이라 **"세 AI 메모리 동기화 엔진"만으로는 장기 차별화가 어렵다**(internal research notes).

동시에, 기존 설계의 핵심 원칙 — **제자리 사용, 공유 ADR·memory, 게이트·이상징후 감사, no-relay** —
은 그대로 옳다. 필요한 것은 엔진 교체가 아니라 **엔진 위에 사용자가 즉시 체감하는 제품 레이어**다.

바이브 코딩의 실제 페인은 "AI가 코드를 못 쓰는 것"이 아니라 **(1) 작업 중 원래 의도에서 이탈,
(2) '완료했습니다'의 거짓 신뢰, (3) 수리 루프에 빠져 삼천포로 감, (4) 세션/모델 전환 시 컨텍스트
유실**이다.

## Decision

**Framein을 "멀티 AI 실행기"가 아니라 "바이브 코딩의 품질·연속성 제어층"으로 리포지셔닝한다.**
공유 스토어 엔진은 그대로 기반(substrate)으로 두고, 그 위에 제품 루프를 얹는다.

> **Framein keeps AI coding aligned with your intent, proves when the work is done, and rescues
> the session when an agent gets lost.**

### 1. North Star 재정의 (핸드오프-free는 폐기가 아니라 메커니즘으로 격하)

기존 "핸드오프 문서 없는 협업"은 **수단**으로 남는다. 제품 메시지는:
> **No manual handoff. Framein rebuilds the working context from evidence.**

### 2. 제품 루프 (의도 → 증거 → 구조)

```
Task Contract → (주도 AI가 평소처럼 개발) → Framein이 변경·테스트·실패 기록
  → 이상징후면 Rescue → 완료 게이트에서 다른 모델 blocker review
  → 주도 AI 수정 → Evidence Gate 통과 → Ship + Ownership Brief
```

### 3. 기능 채택 + 우선순위

| 우선 | 기능 | 한 줄 | 기반 재사용 |
|---|---|---|---|
| **P0** | **Task Contract** | 프롬프트를 goal/must_preserve/acceptance/protected/non_goals 계약으로 고정 | 신규 스토어 엔티티 |
| **P0** | **Evidence Gate** | "완료"를 자연어가 아닌 **검증 증거 묶음**으로 정의(`verify`/`ship`) | build/test 실행 + 계약 대조 |
| **P0** | **Rescue Mode** | 이상징후 시 snapshot+last-green+압축+타모델 호출+3선택지(자동실행 X) | `anomaly.ts` 승격 |
| **P0** | **Task Capsule** | 세션/모델 바꿔도 증거에서 작업상태 자동 복원(`pause`/`resume`) | 계약+ADR+git+테스트+ledger 합성 |
| **P1** | **Disagreement Protocol** | 제안→반론→해결, 최대 2왕복, 리뷰어는 주장만 반환(`challenge`/`decide`) | 순수 상태기계 |
| **P1** | **Blast Radius Guard** | 위험 파일(auth/결제/migration/secrets/deps) 변경 시 리뷰 게이트↑ | diff→위험도(ADR-0005 cadence) |
| **P1** | **Repo-local Routing** | 일반 모델평가 아닌 **내 repo 실적**으로 역할 조정 + **왜 골랐는지 설명** | `roles.scoreAgent` 확장 + stats |
| **P2** | **Frame Recipe** | 벤더중립 작업 프로토콜(feature/bugfix/ship)을 각 CLI 네이티브로 **컴파일** | projector/detect 패턴 |
| **P2** | **Vibe Debt Delta** | 이번 작업이 *추가한* 부채만 표시 | diff 분석 |
| **P2** | **Ownership Brief** | explainer를 "인수 가능한 문서"로(`explain`) | 라이브 생성(구조는 순수) |

### 4. 명령 표면 재편 (ADR-0001 "소수·자명"과 정합)

전면에 기억할 제품 동사 6개: **`start · ask · verify · challenge · rescue · ship`**.
`adr · memory · ledger · unlock · mcp · trust · audit`는 **내부 고급 명령**으로 유지(제거 아님).

### 5. 라이브/로직 경계는 ADR-0007 그대로

각 기능의 **순수 로직(계약 구조·증거 대조·rescue 리포트 합성·논쟁 상태기계·레시피 정의·위험도·부채
delta·캡슐 합성)은 지금 TDD로 완결**하고, **실제 모델 호출(rescue 진단·challenge 왕복·review·brief
생성)은 라이브 deferred**(헤드리스 `ask --run` 위에 얹음). `verify`의 build/test 실행과 `rewind`의 git
조작은 로컬·결정적이라 검증 가능.

## Invariant 보존 (충돌 없음의 증명)

| 기존 invariant / ADR | 이 결정의 영향 |
|---|---|
| ADR-0001 마찰 제로·소수 명령 | 6개 동사로 **강화**. 계약은 lead가 프롬프트에서 초안(새 문법 0) |
| ADR-0002/0004 재사용·감지/추천, no cross-exec | **Frame Recipe는 교차실행 아님** — 계약을 각 CLI 네이티브로 컴파일(translate-lite 심화) |
| ADR-0005 감사 cadence(게이트·이상징후·블로커·비동기) | **Rescue/Evidence/Blast-Radius가 이 cadence를 그대로 구현** |
| ADR-0006 제자리 기본·역할 불러오기·lead 주도 | Disagreement Protocol이 "리뷰어는 주장만, lead가 결정"으로 **준수** |
| ADR-0007 로직 now / 라이브 deferred | 동일 경계 유지. 모델 호출부만 deferred |
| ADR append-only | Task Contract는 **별개의 가변 task 엔티티**(ADR 아님). ADR append-only 불변 |
| managed-block byte-identical·사용자 텍스트 보존 | 계약 다이제스트도 managed-block로 투영(동일 안전 규칙) |
| 원자적 write lock·텍스트 canonical·zero-dep | 신규 테이블도 동일 직렬화. 계약/레시피는 내부 **JSON**(YAML 의존성 없음) |
| 비목표(중앙 릴레이·런타임 래퍼·소비자 Gemini·한도우회·MCP/스킬 재구현) | **어느 것도 위반하지 않음** |

## Consequences

- **PRD 갱신:** §2(North Star/포지셔닝)·§5(신규 §5.9 제품 루프 기능군)·§5.3(명령 표면)·§8(마일스톤
  M12~)에 반영. 이 ADR이 단일 결정 출처.
- **신규 스토어 엔티티 2종:** task contract(가변), repo-stats(라우팅 학습). ADR/memory와 구분.
- **구현 순서:** P0 루프(Task Contract → Evidence Gate → Rescue → Capsule) 먼저, 이후 P1, P2.
  각 마일스톤 TDD·zero-dep·커밋(작업 규율 유지).
- **리스크:** 스코프 확대. 완화 — 우선순위(P0/P1/P2) 엄수, 순수 로직만 먼저, 라이브는 ADR-0007 경계 유지,
  6개 동사로 표면 단순 유지.

## Alternatives considered

- **순수 동기화 도구로 유지** — 기각. 벤더가 skills/hooks/subagents/memory를 흡수 중이라 장기 차별성 부족.
- **완전 자율 멀티에이전트 cockpit** — 기각. ADR-0006 비목표(3-pane cockpit), 마찰↑.
- **각 CLI 스킬을 교차 실행** — 기각. ADR-0002/0004 범주 오류. Recipe는 "컴파일/투영"으로 대체.
- **모든 기능 동시 구현** — 기각. P0 루프부터 증분, 라이브는 deferred.
