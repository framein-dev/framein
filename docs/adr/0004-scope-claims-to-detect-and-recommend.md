# ADR-0004 — codex 외부 리뷰 반영: 약속 범위를 "감지·추천"으로 축소

- **Status:** Accepted (2026-06-20) — [ADR-0001](./0001-zero-friction-first.md)·[ADR-0002](./0002-reuse-existing-mcp-and-skills.md) **보강(amends)**
- **관련:** PRD v0.5 §2.4, §4.2, §4.3, §5.1, §5.4, §6.2~6.6, §8, §12

## Context

독립 2차 의견을 위해 **codex(gpt-5.5)** 에 PRD v0.4 + ADR + `src/`를 리뷰시켰다(세 CLI의 현재
MCP/스킬 설정 문서까지 확인). 핵심 지적: PRD가 **Stage 0 구현보다 두 단계 이상 앞서 약속**하고,
간판 전략 두 개의 표현이 기술 현실과 어긋난다.

1. **"세 CLI에 MCP 자동 배선"** — 각 CLI는 설정 경로·승인(trust) 게이팅이 다르다(Claude
   `claude mcp`/`.mcp.json`, Codex `~/.codex/config.toml`의 `mcp_servers.*`, Gemini
   `settings.json`의 `mcpServers`). 설정을 써줄 수는 있어도 **승인 없이는 연결이 보장되지 않는다.**
2. **"기존 스킬 연합"** — 대체로 **범주 오류**. 각 CLI 스킬은 포맷·런타임이 다르고(Gemini는
   스킬 런타임 자체가 없음), "Codex에서 Claude 스킬 실행"은 성립하지 않는다.
3. 기존 MCP **프록시**는 no-relay 원칙을 넘는다(자격증명·OAuth가 특정 호스트에 묶임).
4. PRD가 약속한 **managed-block 보존·원자적 다중프로세스 락·agent 검증**은 Stage 0에 **미구현**.
5. `real-time`은 실제로 **pull 기반(fresh-on-read)**.

(참고: codex가 보고한 "인코딩 손상"은 PowerShell 콘솔 표시 아티팩트로, 파일은 정상 UTF-8임을
`file`·바이트 확인으로 검증했다.)

## Decision

**약속을 기술적으로 참인 범위로 축소하고, 미구현을 정직히 표기한다.**

- **MCP:** "감지 → CLI별 설정 패치 제안 → 승인분만 적용 → 검증". "무조건 자동 연결"을 약속하지
  않는다. **기본값으로 MCP 프록시 없음**(F-REUSE-3); 프록시는 실험적·로컬·opt-in·감사로만.
- **스킬:** **카탈로그 + 추천(+ 안전 시 translate-lite)** 까지만. **교차 실행·공유는 비목표.**
- **직렬화:** 텍스트가 **유일 canonical**, `store.db`는 폐기형 캐시(스키마 버전·마이그레이션).
- **표현:** "real-time" → **"fresh-on-read"**, 명시적 refresh 트리거 제공.
- **정직 고지:** managed-block 보존·원자적 락·agent 검증을 **공개 전 필수 구현**으로 게이트하고,
  Stage 0가 이를 증명한 것처럼 읽히지 않게 한다(§8).
- **OSS 보강:** 위협 모델(프롬프트/도구 주입), npm provenance/서명, "커밋 금지 데이터" 가이드,
  지원 정책·호환성 매트릭스·bus factor, 네이밍=release blocker(§12).

## Consequences

- PRD를 **v0.5**로 개정. 차별점은 "연합의 넓이"가 아니라 **"동조화 + 인식·추천"**으로 더 또렷해짐.
- 약속이 작아지고 신뢰도가 올라간다(OSS에서 특히 중요 — [ADR-0003](./0003-open-source-from-day-one.md)).
- 구현 과제가 명확해짐: 공개 dogfood 전 managed-block·원자적 락·agent 검증·MCP 검증을 닫는다.

## Alternatives considered

- **야심찬 표현 유지** — 기각. 과약속은 신뢰를 깎고, OSS 공개에서 역효과.
- **재사용 전략 폐기** — 기각. "인식·추천"만으로도 실질 가치가 크다(ADR-0002 유지, 범위만 보강).
