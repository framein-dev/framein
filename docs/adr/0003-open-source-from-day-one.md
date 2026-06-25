# ADR-0003 — 첫날부터 오픈소스 전제로 운영

- **Status:** Accepted (2026-06-20)
- **관련:** PRD v0.4 §2.2, §12 · [ADR-0001](./0001-zero-friction-first.md)

## Context

GitHub 오픈소스 공개가 명시적 목표(PRD §2.2)다. 단, 팀이 **오픈소스를 목표로 한 프로젝트
경험이 없다.** 공개 직전에 라이선스·보안·CI·릴리스·문서를 몰아서 정비하면 품질이 떨어지고
신뢰를 잃는다. 특히 이 제품은 구독 자격증명·에이전트 프롬프트를 다루므로 **신뢰 서사가 곧
마케팅**이다("no relay, no pooled credentials").

## Decision

**처음부터 오픈소스 운영 준비물을 설계에 포함한다.** 핵심:

1. **라이선스: MIT.** 가벼운 기여 동의는 **DCO**(`Signed-off-by`) 권장, 무거운 CLA 지양.
2. **저장소 위생(공개 전 필수):** `LICENSE`, 강화 `README`(Quickstart·데모), `CONTRIBUTING.md`,
   `CODE_OF_CONDUCT.md`, `SECURITY.md`(비공개 제보 경로), 이슈/PR 템플릿, `CHANGELOG.md`(SemVer).
3. **CI/CD:** GitHub Actions 매트릭스 **Node 22·24 × {Windows·macOS·Linux}** 에서 `build+test`,
   `tsc --strict` 게이트. 태그→npm publish 릴리스 자동화. 배포는 npm + **`npx framein`** 원샷.
4. **보안·공급망:** 저장소 시크릿 0, `.frame/`·자격증명 커밋 금지, 시크릿 스캐닝, Dependabot,
   **최소 의존성 유지(현재 dev-only = 강점)**, `node:sqlite` 실험적 의존·Node 버전 요구 명시.
5. **프라이버시:** **기본 텔레메트리 없음**, 도입 시 opt-in·문서화.
6. **거버넌스(dogfooding):** 로드맵(PRD/PLAN)과 **ADR 로그를 공개**해 "결정의 이유"를 그대로
   드러낸다. `good first issue`·Discussions 운영. 경쟁 도구 비교를 공정하게 README에 정리.
7. **네이밍·상표 확정**을 공개 **차단 항목**으로 관리(npm `framein`/바이너리 `frame` 충돌·org·상표).

## Consequences

- 프로토타입 단계부터 CI·문서·릴리스 뼈대를 함께 만든다(부담 분산, 품질 유지).
- **크로스 플랫폼 동등성**이 필수가 된다 — P0 사용자가 Windows 네이티브이므로 WSL2로 미루지
   않는다(PRD §6.5, §9).
- 신뢰 서사(무릴레이·무수집·무텔레메트리)를 README 최상단에 고정한다.
- 공개 차단 항목(네이밍/상표/보안 점검)이 릴리스 체크리스트가 된다.

## Alternatives considered

- **검증 끝나고 공개 직전에 한꺼번에 정비** — 기각. 품질 저하·신뢰 손상·일정 리스크.
- **클로즈드로 길게 운영** — 기각. 공개가 명시 목표이고, 신뢰는 투명성(공개 ADR 등)에서 나온다.
