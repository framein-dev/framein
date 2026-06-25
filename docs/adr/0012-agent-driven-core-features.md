# ADR-0012 — 핵심 기능은 에이전트가 `/`·`--`로 구동(주 경로), 수동 long-form은 fallback; 계약 변경은 자동적용 + 가시화

- **Status:** Accepted (2026-06-22).
- **근거:** 실사용 테스트에서 드러난 UX 불일치 — `docs/TEST-SCENARIOS.md`의 수동 long-form 명령은 **엔진 검증용**이지 실제 사용자 흐름이 아님. [ADR-0006](./0006-interaction-model-in-place-default.md)(in-place), [ADR-0010](./0010-command-surface-wrappers-shell-optional-pty.md)(명령 표면), [ADR-0002](./0002-reuse-existing-mcp-and-skills.md)/[0004](./0004-scope-claims-to-detect-and-recommend.md)(no-relay).

## Context

`framein task amend nongoal "UI 전체 리디자인"` 같은 long-form CLI는 단위 테스트가 못 덮는 엔진 동작을
손으로 검증하기엔 좋지만 — **일반 개발자는 터미널에서 그렇게 길게 치지 않는다.** 제품의 핵심 가치(작업
계약·증거 게이트·핸드오프 연속성 등)는 개발자가 **평소 쓰는 에이전트(Claude/Codex) 흐름 안에서** framein을
구동할 때만 살아난다. 다만 계약은 **끝까지 추적되는 단일 진실(SoT)** 이라, 에이전트가 그것을 *조용히* 바꾸면
개발자는 통제를 잃고 "나 모르게 부적절한 정의가 박제되어 추적된다"는 불안을 갖는다.

## Decision

1. **주 경로 = 에이전트 구동.** 6대 핵심 기능을 에이전트 안에서 `/fr:*`(Claude/Gemini)·`$fr-*`(Codex 스킬)·
   `--json`으로 호출 가능하게 한다. `WRAP_VERBS` = `start·verify·ship·rescue·status·challenge` + **`risk·task·
   capsule·decide`** (작업계약·블라스트반경·작업캡슐·반론해결까지 전부 포함).
2. **수동 long-form CLI는 fallback / QA 경로로만 유지.** 엔진은 SoT로 남지만(스크립트·CI·디버깅·자동화),
   제품 표면·문서는 long-form을 *일상 UX로 제시하지 않는다.*
3. **로비는 대화창이 아니다.** framein은 프롬프트를 LLM에 중계하지 않는다(no-relay, ADR-0002/0004). 대화는
   `/go`로 인계한 **에이전트 자신의 네이티브 TUI**에서 한다. 로비는 관제·전환 표면.
4. **계약 변경은 자동적용하되 절대 조용하지 않다.** `start`/`amend` 시 `⚠ Contract changed … git diff`로
   크게 표시한다. managed block은 **git 추적 평문**이므로 `git diff` = 감사 + 되돌리기. 인간이 최종 게이트
   (verify/ship에서 "계약 vs 증거"를 본다). 마찰 기본값 = 자동적용+가시화(확인 강제는 옵션).

## Consequences

- **신뢰 모델 = trust-but-verify, not blind-trust.** 에이전트가 계약을 틀리게 써도 *위험해지기 전에* git diff로
  보이고 되돌릴 수 있다 → 통제는 사용자에게 남는다.
- **검증:** 에이전트가 framein을 *실제로* 구동하는지는 경험적(라이브)으로 확인한다. 미구동 시 계약이 빌 뿐
  (우아한 degrade), 수동 fallback이 안전망.
- **`docs/TEST-SCENARIOS.md` 재정비:** A~V long-form 시나리오는 "엔진 QA"로 명시하고, 실제 UX는 `/fr:*`·
  `$fr-*`·`--json` 흐름으로 별도 제시한다.
- **Follow-up (이 ADR 범위 밖, 단계별):** Phase 1 — managed block에 "에이전트는 작업 시작 시 `/fr:start`,
  게이트에서 `/fr:verify`…" 구동 지침 투영. Phase 2 — 수동 UX 마감(로비 따옴표 파싱, 대화형 `start`).

## Alternatives considered

- **로비를 대화형으로(LLM 중계)** — 기각: no-relay 원칙 위반 + 인증/세션 재구현(ADR-0002/0004), zero-dep 깨짐.
- **계약 변경마다 확인 강제** — 기각(기본값): 마찰. 단 옵션으로 선택 가능(가장 안전 모드).
- **수동 long-form을 메인 UX로 유지** — 기각: 사용자가 안 쓴다(이 ADR의 출발점). 엔진/스크립트 경로로만 잔존.
