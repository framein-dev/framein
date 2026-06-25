# ADR-0011 — 네이밍 확정: `framein` (제품·npm·기본 바이너리), GitHub `framein-cli`, 슬래시 네임스페이스 `fr`

- **Status:** Accepted (2026-06-21) — ADR-0010 §8과 PRD §0의 **네이밍 TBD를 종료(close)**.
- **근거:** internal naming research(npm/GitHub/바이너리/브랜드 충돌 조사) · [ADR-0010](./0010-command-surface-wrappers-shell-optional-pty.md)(명령 표면) · PRD §0/§12.

## Context

ADR-0010은 명령 표면의 *구조*만 확정하고 **이름은 검토 중(placeholder)** 으로 남겼다. 조사
(internal naming research) 결과: **npm `framein` 사용 가능**, `frame`/`fr`는 npm
패키지로 선점됨, GitHub `framein` 핸들은 휴면 점유, "Frame*"는 브랜드 레드오션(Frame.io/Adobe·FrameVR·
A-Frame·Framer)이나 **`framein`은 coined로 구별성 높음**(회사 Frameout과 짝). 사용자가 `framein` 확정 +
GitHub `framein-cli` 선호를 결정.

## Decision

- **제품명 · npm 패키지 · 기본 전역 바이너리 = `framein`.** (npm 가용 확인.)
- **별칭 바이너리:** `fr`(짧음 — **opt-in 별칭**, 기본 노출 아님: 2글자 경합 + npm `fr` 점유), `frame`
  (**호환 별칭**, 현재 dev 기본). → 기본 노출/문서 표기는 `framein`.
- **GitHub = `framein-cli`** (repo/org). (`framein` 핸들은 휴면 계정이 점유 → 비의존.)
- **슬래시 네임스페이스(각 CLI 래퍼, ADR-0010) = `fr`** → Claude/Gemini `/fr:verify`, Codex `$fr-verify`.
  `fr:`는 **브랜드·네임스페이스 전용**(실행파일명 아님 — Windows `:` 예약).
- **회사 = Frameout** (제품 framein과 용어 쌍).

## Consequences

- **PRD 반영:** §0 네이밍 확정, §12 공개-전 차단 항목은 **정식 상표 검색(USPTO TESS + 한국 KIPRIS)만 잔여**
  (이름 자체는 확정; npm·핸들·바이너리 충돌은 해소).
- **구현 follow-up(이번 ADR 범위 아님 — 문서 결정만):** `package.json` `bin`을 `{ "framein", "fr", "frame" }`로,
  CLI help·CLAUDE.md·README·MANUAL의 `frame` 표기를 **`framein`(+별칭 안내)** 으로 일괄 갱신. ADR-0010의
  명령-표면 구현과 함께 진행. **현재 코드 bin은 여전히 `frame`(dev)** — canonical `framein`으로 전환 예정.
- ADR-0010은 append-only로 보존(본 ADR이 그 §8 네이밍 TBD를 종료).

## Alternatives considered

- `frame`(제품/패키지) — 기각: npm 선점 + "Frame*" 상표 레드오션.
- `fr`(기본 바이너리) — 기각: 2글자 경합 + npm `fr` 점유 + 별칭/로케일 충돌 → opt-in 별칭으로만.
- GitHub `framein`(휴면 핸들 회수) — 보류: 불확실 → `framein-cli` 채택.
- 전혀 다른 새 이름 — 기각: `framein`이 회사(Frameout)와 의미 쌍 + 가용성 확인됨.
