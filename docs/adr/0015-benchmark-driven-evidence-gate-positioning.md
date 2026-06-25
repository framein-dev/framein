# ADR-0015 — 벤치마크 기반 포지셔닝 선회: 증거 게이트 + 상태 있는 skill surface

- **Status:** Accepted (2026-06-24)
- **관련:** [ADR-0002](./0002-reuse-existing-mcp-and-skills.md) · [ADR-0004](./0004-scope-claims-to-detect-and-recommend.md) · [ADR-0008](./0008-reposition-to-quality-continuity-layer.md) · [ADR-0010](./0010-command-surface-wrappers-shell-optional-pty.md) · internal benchmark notes
- **벤치마크:** [SuperClaude_Framework](https://github.com/SuperClaude-Org/SuperClaude_Framework) · [mattpocock/skills](https://github.com/mattpocock/skills) · [garrytan/gstack](https://github.com/garrytan/gstack)

## Context

ADR-0008은 Framein을 "멀티 AI 실행기"가 아니라 "바이브 코딩의 품질·연속성 제어층"으로
재정의했다. 방향은 맞았지만, 공개 README와 웹 랜딩을 같은 원고로 재사용하면서 메시지가 다시
흐려졌다.

특히 `https://www.framein.dev/ko` 기준 공개 페이지는 다음 성격이 한 화면에 섞여 있었다.

- 마케팅 랜딩: 왜 필요한지, 누구를 위한지, 어떤 결과를 주는지
- 개발자 README: 설치, CLI 사용법, 상태, 신뢰 경계
- 매뉴얼: 전체 명령어 레퍼런스와 고급 동사
- 내부 상태 보고: pre-release 검증 범위, 거친 부분, 배포 마찰

동시에 주요 벤치마크가 이미 강한 포지션을 차지하고 있다.

- **SuperClaude**: Claude Code를 구조화된 개발 플랫폼처럼 쓰게 하는 명령·페르소나·MCP 프레임워크.
- **mattpocock/skills**: 작고 조합 가능한 실전 엔지니어링 스킬 묶음.
- **gstack**: Claude Code를 가상 엔지니어링 팀처럼 쓰게 하는 역할 기반 도구 세트.

이들과 같은 축에서만 경쟁하면 Framein은 "또 하나의 스킬팩/슬래시 명령 모음"으로 보인다. 그 축에서는
설치 마찰, SQLite store, wrapper, MCP, ADR, ledger가 모두 장점이 아니라 무게로 읽힐 수 있다.

반대로 벤치마크들이 강할수록 남는 빈틈이 선명해진다. 좋은 스킬팩은 에이전트가 더 잘 일하게 한다.
하지만 에이전트가 "끝났다"고 말한 뒤 실제로 빌드·테스트·위험·결정 근거가 통과했는지는 별개의
문제다.

동시에 Framein은 스킬팩 면에서도 약하지 않다. 오히려 강점이 있다. `integrations`가 생성하는
`/fr:*`(Claude/Gemini)와 `$fr-*`(Codex)는 각 호스트의 네이티브 skill/command surface로 노출되고,
각 wrapper는 logic-less하게 같은 `framein <verb>` 엔진을 호출한다. 즉, Framein의 skill surface는
"프롬프트 묶음"이 아니라 **로컬 상태와 증거 게이트를 호출하는 얇은 네이티브 진입점**이다.

## Decision

Framein의 주 포지션을 다음으로 좁힌다.

> **Framein is a local evidence gate, decision ledger, and native skill surface for AI coding agents.**

한국어 제품 문장은 다음을 우선한다.

> **AI 에이전트가 "끝났다"고 해도, 증거가 없으면 출하하지 않습니다.**

Framein은 SuperClaude, gstack, mattpocock/skills 같은 워크플로우를 대체하지 않는다. 동시에
스킬팩 사용자가 기대하는 짧고 기억 가능한 호출 표면은 제공한다. 그 위나 옆에서 다음 네 가지를 담당한다.

1. **Define done:** 작업 계약으로 "완료" 기준을 먼저 고정한다.
2. **Prove done:** build/test/git diff 기반 증거를 실제로 확인한다.
3. **Block ship:** 증거가 없거나 위험 반경이 크면 `ship`에서 막는다.
4. **Leave a trail:** 결정, 실패, 위험, 인수 맥락을 로컬 ledger/ADR/capsule에 남긴다.

따라서 공개 메시지의 경쟁축을 바꾼다.

| 비교축 | 벤치마크 스킬팩/프레임워크 | Framein |
|---|---|---|
| 주 기능 | 에이전트가 더 잘 수행하게 함 | 수행 결과가 출하 가능한지 증명 |
| 표면 | slash command, skill, role, persona | native `/fr:*`/`$fr-*` skill surface + local CLI + evidence gate + ledger |
| 핵심 질문 | "어떤 명령/전문가로 시킬까?" | "정말 끝났고 안전하게 출하 가능한가?" |
| 성공 경험 | 좋은 답변/리뷰/계획 생성 | 거짓 완료 차단, 위험 변경 감지, 증거 있는 ship |

## Documentation split

README와 웹 랜딩은 더 이상 같은 원고를 공유하지 않는다. 같은 메시지 spine은 유지하되 목적을 분리한다.

| 표면 | 역할 | 포함 | 제외 |
|---|---|---|---|
| **웹 랜딩** | 제품 포지션과 첫 이해 | 문제, 선회 이유, 3단계 루프, 벤치마크 대비, 짧은 설치 CTA | 전체 명령 레퍼런스, 내부 구현 상세, 긴 상태 보고 |
| **GitHub README** | 개발자용 진입 문서 | 설치, 빠른 사용, 핵심 명령, 아키텍처, 신뢰 경계, 테스트/기여 | 마케팅식 장문, 전체 매뉴얼, 연구 서사 |
| **MANUAL** | 전체 사용 설명 | 모든 명령, 플래그, 운용 시나리오 | 포지셔닝 설득 |
| **ADR** | 결정 근거 | 왜 선회했는지, 무엇을 포기했는지 | 사용 튜토리얼 |

## Product priority shift

전면 기능 우선순위를 조정한다.

| 우선 | 전면에 둘 것 | 이유 |
|---|---|---|
| P0 | `start` / task contract | "done" 기준 고정 |
| P0 | `verify` / `ship` | 포지션의 중심인 evidence gate |
| P0 | `risk` | 출하 차단의 실질적 이유를 설명 |
| P0 | ledger / ADR digest / capsule | 증거와 결정의 추적성 |
| P1 | `rescue` | 반복 실패 감지, evidence trail의 활용 |
| P1 | `challenge` / `decide` | 위험 게이트에서만 독립 반론 |
| P2 | `lobby`, `route`, `recipe`, `debt`, 전체 command catalog | 고급 기능. 공개 첫 화면에서는 뒤로 보낸다 |

`lobby`와 multi-agent routing은 폐기하지 않는다. 다만 공개 포지션의 주인공이 아니다. "여러 에이전트를
조종하는 도구"가 아니라 "어떤 에이전트를 쓰든 결과를 증거로 검증하는 도구"가 우선이다.

`/fr:*`와 `$fr-*` skill surface는 전면에 남긴다. 단, 강조점은 "명령이 많다"가 아니라 "각 명령이
같은 로컬 계약·증거·원장 상태를 읽고 쓴다"이다.

## Consequences

- README 첫 문장을 "quality & continuity layer"에서 **local evidence gate with a native skill surface**로 수정한다.
- 웹 랜딩은 README 복사본이 아니라 짧은 제품 설명 페이지로 재작성한다.
- 전체 명령 레퍼런스는 웹 첫 화면에서 제거하고 `docs/MANUAL.md`로 연결한다.
- `package.json` description도 "multi-agent synchronization harness"에서 evidence-gate + skill-surface 중심으로 바꾼다.
- 향후 공개 출시에서 GitHub Action / PR check를 1급 표면으로 검토한다. 이 포지션에서는 CLI보다
  "PR이 증거 부족으로 실패했다"는 경험이 더 즉시 이해된다.

## Alternatives considered

- **상태 없는 일반 스킬팩으로 정면 경쟁** — 기각. 벤치마크들이 이미 더 가볍고 강한 사회적 증거를 갖고 있다.
- **스킬 표면을 숨기고 CLI만 강조** — 기각. 오픈소스 벤치마크의 성공은 짧은 네이티브 호출 표면의
  중요성을 보여준다. Framein도 `/fr:*`·`$fr-*`를 강하게 보여주되, 차별점은 로컬 상태와 증거 게이트에 둔다.
- **멀티에이전트 orchestration을 전면 유지** — 기각. GitHub, Claude, Gemini, Codex 생태계가 빠르게
  흡수 중이며 Framein의 no-relay 원칙과도 긴장이 있다.
- **README를 그대로 웹에 재사용** — 기각. OSS README와 랜딩 페이지는 성공 기준이 다르다.
- **기술 세부를 모두 숨김** — 기각. Framein의 신뢰는 로컬성, managed block 보존, append-only ADR,
  zero runtime dependency 같은 구현 경계에서 나온다. 단, 이 정보는 README/Manual/ADR로 내려 보낸다.
