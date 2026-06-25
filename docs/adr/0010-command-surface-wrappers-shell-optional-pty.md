# ADR-0010 — 명령 표면: 네이티브 `/fr:*` 래퍼 + MCP + 셸(+`--json`), 선택적 `fr` 통합 shell, node-pty는 선택적 의존성으로 보류

- **Status:** Accepted (2026-06-21) — **문서 결정만. 구현은 추후.**
- **관련:** [ADR-0001](./0001-zero-friction-first.md)(마찰 제로) · [ADR-0002](./0002-reuse-existing-mcp-and-skills.md)/[0004](./0004-scope-claims-to-detect-and-recommend.md)(재사용·각 CLI 네이티브로 컴파일) · [ADR-0006](./0006-interaction-model-in-place-default.md)(제자리·cockpit 비목표) · [ADR-0008](./0008-reposition-to-quality-continuity-layer.md)(제어층) · [ADR-0003](./0003-open-source-from-day-one.md)/[0009](./0009-drop-programmatic-pty-requirement.md)(zero-dep·코어 PTY 미사용)
- **근거 리서치:** internal UX research notes

## Context

사용자 피드백에서 시작: (1) "에이전트와 동시에 쓸 때 **터미널 탭을 따로** 여는 건 불편하다", (2) 처음엔
framein이 **Auggie(Augment Code CLI)처럼 자체 프롬프트 창**을 열어 각 LLM과 대화하는 걸 상상했다, (3)
에이전트가 MCP로 부른다면 **`/` 슬래시가 더 자연스럽지 않나?**

리서치 결과:
- 시장은 **3형태** — ① cockpit/멀티플렉서(Squad·Conductor·vibe-kanban), ② native in-place 확장(기존 CLI에
  plugin/skill/MCP 삽입), ③ unified agent shell(Auggie). Auggie는 ②가 아니라 ③이며 **자체 모델(Context
  Engine)** 을 가진 진짜 agent다.
- framein은 **자체 모델이 없는 얇은 제어층**(no-relay, ADR-0008)이라 ①(레드오션·ADR-0006 비목표)도, Auggie식
  자체 agent도 아니다. 현재는 ②를 택했다.
- 세 CLI 모두 사용자정의 슬래시/스킬을 지원하지만 **표면 문법이 다르고**(Codex `/prompts` deprecated→`$skill`,
  Gemini 셸주입 `!{...}`) **이름 충돌 위험**이 크다(예: bare `/verify`가 기존 동작을 덮음).
- 사용자 핵심 판단: **"엔진도, 대단한 스킬셋도 없는데 무겁게 제어할 필요 없다. 얇으면 된다."**

## Decision

**명령 표면은 4겹이며 모두 같은 `fr` 엔진을 호출한다(단일 진실원천). UI는 얇게 — framein의 레버리지는
화면이 아니라 store + 제품 루프다.**

1. **(a) 셸 `fr <cmd>`** — 엔진/CI/스크립트의 토대. **`--json` 구조화 출력을 추가**한다(래퍼·자동화의
   선행조건; 안정 schema).
2. **(b) MCP 도구** — 모델이 *자율적으로* 호출(계약/메모리/ADR 조회·기록). 이미 구현·검증됨.
3. **(c) 네이티브 네임스페이스 래퍼 — 주(主) ergonomics.** 지금 쓰는 에이전트 세션 *안에서* framein을
   호출(탭/창 전환 0). **개념·동사는 통일, 문법은 각 호스트 존중, 항상 네임스페이스(bare 금지).**
   | 용도 | Claude | Codex | Gemini |
   |---|---|---|---|
   | 검증 | `/fr:verify`(skill/plugin) | `$fr-verify`(skill; `/prompts` deprecated) | `/fr:verify`(`!{...}`) |
   - 래퍼는 **로직 0** — `fr <cmd> --json`을 호출해 결과만 host에 맞게 표시(진실원천은 엔진 하나, drift 방지).
4. **(d) 선택적 `fr` 통합 shell — focus mode(장기 회사 솔루션 라인업용, 선택 사용).** zero-dep readline
   스위치보드: 평문→현재 lead 에이전트, `/lead <agent>`·`/verify`·`/ship`·`/rescue`·`/status`. 인터랙티브는
   **`stdio:inherit`로 lead의 *진짜 네이티브 TUI*에 진입**(나가면 shell로 복귀). **cockpit이 아니라
   control-plane console.** 기본이 아니라 *원할 때 여는* 통합 경로.
5. **충돌 관리는 제품 기능으로**(정적 표 금지): `fr setup` / `fr doctor commands` / `fr integrations
   install|uninstall` — 네임스페이스만 설치, 설치 전 diff, provenance(버전) 기록, framein 생성 파일만 삭제,
   설치된 CLI 버전 기준 compatibility report.
6. **B(node-pty 동시 오버레이)는 "선택적 의존성"으로만 보류 — 코어에는 절대 넣지 않는다.** "네이티브 TUI를
   그대로 보여주기 + fr이 *동시에* 떠 있기(실시간 provenance·중간 게이트·미이탈 전환)"는 원리상 PTY가 필요한데,
   inherit(d)는 *순차*(에이전트 도는 동안 fr 잠듦)로 충분하다. 동시 오버레이가 진짜 필요하면 `fr --rich`류
   **선택적 shell 애드온에서만** node-pty를 로드한다(ADR-0009의 "코어=no, 선택적 add-on 가능" 단서의 구체화).
   **지금은 미구현 — 문서로만 남긴다.**
7. **"마찰 제로" 표현 정직화:** ADR-0001/§2.4의 *"새 프롬프트 문법 0"* → **"새 프롬프트 표면을 강제하지
   않는다; `/fr:*`와 `fr` shell은 선택적 단축 경로다."**
8. **네이밍은 검토 중.** 제품명('framein')과 바이너리명은 PRD §0 공개-전 검증 게이트 대상이다. 본 ADR이
   결정하는 것은 **표면 *구조*(네임스페이스 래퍼·multi-bin·logic-less·`--json`)** 이며, `fr`/`/fr:`/`$fr-`는
   **작업용 placeholder**다. `fr:`는 Windows에서 실행파일명 불가(`:` 예약)이므로 **프롬프트 브랜드·네임스페이스
   전용**. 바이너리 후보: `fr`(일상)·`framein`(fallback)·`frame`(호환) — *이름 확정 후 문서·`bin` 반영*.

## Consequences

- **구현 순서(문서 우선, 코드는 추후):** ① 엔진 `--json` → ② 네이티브 래퍼 + `fr setup`/`doctor` →
  ③ 실사용 검증 → ④ 선택적 `fr` shell(inherit, zero-dep) → (필요 시) node-pty **선택 애드온**으로 동시 오버레이.
- **정합:** zero-dep 코어 유지(ADR-0003/0009), 재사용·네이티브 컴파일(ADR-0002/0004, Frame Recipe의 확장),
  제자리 기본(ADR-0006), 제어층(ADR-0008). framein 정체성 강화 = **얇은 UI, store+루프가 레버리지.**
- **문서 갱신:** PRD §0(네이밍 후보·검토중), §2.4(마찰 제로 표현), §5.9/§5.3(명령 표면), §8(마일스톤). ADR-0009는
  append-only로 보존(이미 "선택적 add-on 가능" 단서 포함 → 본 ADR이 구체화).
- **회사 라인업 메모:** 선택적 `fr` shell은 장기적으로 framein을 단일 통합 콘솔로도 제공할 여지를 연다(기본은
  여전히 native + 래퍼).

## Alternatives considered

- **cockpit/멀티플렉서** — 기각(레드오션, ADR-0006, 자체 엔진 없음).
- **bare 슬래시 명령**(`/verify` 등 직접) — 기각(기존 CLI 명령·번들 스킬을 조용히 덮을 위험; 벤더가 명령을 계속
  추가 → 정적 회피 불가, 그래서 §5 `fr doctor`).
- **node-pty를 코어 의존성으로** — 기각(zero-dep 위반, 자체 엔진 없는 제품이 엔진급 UI 인프라를 짊어짐, 치장 대비
  비용 과다). **선택적 add-on으로만 보류.**
- **shell을 아예 안 만듦** — 기각(장기 통합 콘솔 가치). 단 후순위·선택적.
- **세 CLI 문법을 강제로 동일하게(`/fr:*` 일괄)** — 기각(Codex `$skill` 등 호스트별 차이; 개념·동사만 통일).
