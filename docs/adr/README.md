# Architecture Decision Records (ADR)

Framein의 중요한 의사결정을 **추가 전용(append-only)** 으로 기록하는 로그입니다.
제품 정체성과도 맞닿아 있습니다 — Framein 자신의 ADR을 Framein 방식으로 남겨(dogfooding),
오픈소스 공개 시 "어떤 결정을, 왜 내렸는가"를 그대로 공개합니다.

## 규칙

- **append-only.** 한 번 기록한 ADR은 수정·삭제하지 않습니다. 결정을 바꾸려면 **새 ADR을
  추가해 기존 것을 `supersede`(대체)** 합니다(이전 ADR의 Status에 대체 관계를 표기).
- 한 파일 = 하나의 결정. 파일명: `NNNN-kebab-title.md`.
- 형식은 코드의 `Adr` 타입과 정렬: **Title · Status · Context · Decision · Consequences
  (+ Alternatives)**.

> 참고: 향후 `frame adr` CLI가 리치 ADR(근거 포함)과 `show`/`supersede`를 지원하면
> 이 마크다운 로그는 스토어의 텍스트 직렬화본(PRD §6.2, F-SYNC-6)과 합류할 수 있습니다.
> 현재 단계(Stage 0)에서는 CLI가 제목만 저장하므로 결정 근거는 이 마크다운으로 남깁니다.

## 목록

| ADR | 제목 | 상태 |
|---|---|---|
| [0001](./0001-zero-friction-first.md) | 마찰 제로를 제1 설계 제약으로 | Accepted |
| [0002](./0002-reuse-existing-mcp-and-skills.md) | 기존 MCP·스킬 재사용 우선, 얇은 자체 레이어 | Accepted (PRD v0.3 §5.4 대체, ADR-0004로 범위 보강) |
| [0003](./0003-open-source-from-day-one.md) | 첫날부터 오픈소스 전제로 운영 | Accepted |
| [0004](./0004-scope-claims-to-detect-and-recommend.md) | codex 리뷰 반영 — 약속 범위를 "감지·추천"으로 축소 | Accepted (ADR-0001·0002 보강) |
| [0005](./0005-audit-cadence-not-per-turn.md) | 감사는 매 턴이 아니라 게이트·이상징후 트리거(블로커만·비동기) | Accepted |
| [0006](./0006-interaction-model-in-place-default.md) | 상호작용 모델 — 제자리 기본·역할 불러오기·오케스트레이션은 추가 | Accepted (열린질문 #5 종료) |
| [0007](./0007-mcp-stdio-framing-ndjson-not-content-length.md) | MCP stdio는 NDJSON(Content-Length 아님) · 스펙 준수 작업을 A로 재분류 | Accepted |
| [0008](./0008-reposition-to-quality-continuity-layer.md) | 리포지셔닝 — 바이브 코딩 품질·연속성 제어층 + 의도→증거→구조 제품 루프 | Accepted |
| [0009](./0009-drop-programmatic-pty-requirement.md) | 프로그래밍 PTY를 요구사항에서 제거 (헤드리스 파이프 + stdio:inherit가 대체) | Accepted (ADR-0006/0007의 PTY 측면 supersede) |
| [0010](./0010-command-surface-wrappers-shell-optional-pty.md) | 명령 표면 — 네이티브 `/fr:*` 래퍼 + MCP + 셸(`--json`), 선택적 `fr` shell, node-pty는 선택적 의존성 | Accepted (문서 결정, 구현 추후) |
| [0011](./0011-naming-confirmed-framein.md) | 네이밍 확정 — `framein`(제품·npm·기본 bin), GitHub `framein-cli`, 슬래시 `fr` | Accepted (ADR-0010 §8 네이밍 TBD 종료) |
| [0012](./0012-agent-driven-core-features.md) | 에이전트 구동 우선 — 6대 기능 `/`·`$`·`--`로, 수동 long-form은 fallback, 계약 변경 자동적용+가시화 | Accepted |
| [0013](./0013-lobby-and-cross-model-continuity.md) | 인터랙티브 로비 & 모델 간 연속성 — lobby 네이밍, pull 기반 연속성(스크랩·push 아님), `/trust` opt-in | Accepted |
| [0014](./0014-sea-executable-distribution.md) | SEA `framein.exe` 배포 — Windows PowerShell 정책 마찰의 원천 해결(셰임 제거); 빌드전용 esbuild·postject, runtime zero-dep 유지 | Accepted (PoC) |
| [0015](./0015-benchmark-driven-evidence-gate-positioning.md) | 벤치마크 기반 포지셔닝 선회 — 로컬 증거 게이트와 상태 있는 skill surface | Accepted |
| [0016](./0016-work-frame-across-agents-positioning.md) | Claude, Codex, Gemini를 오가는 하나의 작업 프레임으로 포지셔닝 보정 | Accepted |
