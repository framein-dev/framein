# ADR-0007 — MCP stdio 프레이밍은 NDJSON(Content-Length 아님) · 스펙 준수 작업을 A로 재분류

- **Status:** Accepted (2026-06-21)
- **관련:** PRD v0.7 §6.2, §6.3, §8 · [ADR-0006](./0006-interaction-model-in-place-default.md)(A/B 구현 순서) · [ADR-0004](./0004-scope-claims-to-detect-and-recommend.md)(감지·추천 경계) · `src/mcpServer.ts`

## Context

PRD §8·`CLAUDE.md`·`mcpServer.ts`/`cli.ts` 주석은 오케스트레이션 레이어(B)의 잔여 작업으로
**"MCP Content-Length 프레이밍(라이브 클라이언트 등록)"** 을 적어 두었다. 이 전제를 공식 MCP
스펙(2025-06-18)으로 검증한 결과 **틀린 전제**임이 확인됐다.

- **stdio 트랜스포트는 줄바꿈 구분(NDJSON)이다.** 스펙 원문:
  > *Messages are delimited by newlines, and **MUST NOT** contain embedded newlines.*
- **`Content-Length:` 헤더 프레이밍은 LSP(Language Server Protocol) 관례지 MCP가 아니다.**
  MCP에서 헤더를 쓰는 곳은 stdio가 아니라 **Streamable HTTP** 트랜스포트(HTTP POST/GET + SSE,
  `Mcp-Session-Id` 등)뿐이며, 로컬 CLI 연결에는 쓰지 않는다.
- 따라서 현재 `serve()`(`mcpServer.ts:82`)의 NDJSON 루프는 **이미 스펙에 맞는 와이어 포맷**이다
  (`JSON.stringify`는 임베디드 개행을 만들지 않고, readline은 줄 단위로 읽는다). Content-Length를
  새로 구현하면 오히려 **실제 클라이언트가 붙지 못한다.**

추가로 스펙 검증에서 드러난 **진짜 미준수 항목**(클라이언트가 실제로 연결·사용하려면 필요):

1. **`inputSchema` 필수.** Tool 정의는 `inputSchema`(JSON Schema, `type:"object"`)가 필수다.
   현재 `TOOLS`(`mcpServer.ts:12`)는 `{name, description}`뿐이라, Claude Code 등은 `tools/list`를
   받아도 도구를 무시/거부할 수 있다. **이것이 가장 큰 실질 공백.**
2. **`ping` 유틸리티 메서드** 미처리(현재 unknown method `-32601`로 떨어짐).
3. **protocolVersion 네고 부재** — `'2024-11-05'` 하드코딩. 규칙은 "클라이언트 버전 지원 시 echo,
   아니면 서버 최신 반환".
4. **tools/call 에러 표면화** — 도구 실행 에러를 JSON-RPC protocol error(`-32000`)로 던지면 모델이
   복구 못 한다. 스펙 권장은 결과 안에 `isError: true`로 담는 것(unknown *method* 만 protocol error).
5. **자잘:** `serverInfo.version` 문자열화(현재 숫자 `1`), `capabilities.tools.listChanged:false`
   명시, stdout 위생(서버는 stdout에 유효 MCP 메시지 외 출력 금지 — 로그는 stderr).

핵심 통찰: **위 1~5는 외부 CLI 없이 fixture로 단위테스트 가능한 순수 로직**이다. 즉 ADR-0006이
B(오케스트레이션, 실 CLI 필요)로 미뤄 둔 범위에 잘못 묶여 있었다.

## Decision

1. **"MCP Content-Length 프레이밍" 작업 항목을 폐기한다.** MCP stdio = NDJSON이며 현재 프레이밍이
   옳다. PRD §8, `CLAUDE.md`, `mcpServer.ts:77-81`·`cli.ts:251`의 "Content-Length" 전제를 정정한다.

2. **MCP 스펙 준수 작업(위 1~5)을 B에서 A(프로토타입+)로 재분류한다.** 외부 CLI 없이 TDD로 완결
   가능하므로 지금 구현한다. 이 작업이 끝나야 "`frame mcp serve`가 실제로 붙는 MCP 서버"라고
   정직하게 말할 수 있다(§8 정직 고지 원칙과 정합).

3. **B(실 외부 CLI 필요)에 진짜 남는 것**만 재정의한다:
   - **(B-1) 등록 apply + 검증.** `frameinMcpRegistration`(`detect.ts:65`)이 만든 패치를 *승인 받아*
     각 설정(Claude `.mcp.json` / Codex `config.toml` / Gemini `settings.json`)에 머지하고
     `claude mcp list` 등으로 연결 검증. **framein은 MCP 서버, 각 CLI가 클라이언트**다 — 각 CLI가
     자기 `frame mcp serve` 서브프로세스를 띄우므로 framein이 MCP *클라이언트* 코드를 짤 필요는
     없다(공유 시나리오 한정). N개의 서버 프로세스가 같은 `.frame/store.db`를 여는 안전성은 이미
     WAL + `busy_timeout` + 원자적 락 + `lock.mp.test.ts`로 보장돼 있다.
   - **(B-2) headless 위임 우선, 인터랙티브 PTY는 후순위·선택.** `frame ask`/delegate/자동 감사는
     PTY가 거의 불필요하다 — `claude -p` / `codex exec` / `gemini -p` 헤드리스 모드를
     `child_process.spawn` + 파이프로 구동하면 **PTY·ConPTY·Windows 리스크를 회피하고 zero-dep을
     유지**한다. node-pty/ConPTY(런타임 의존성)는 사용자를 라이브 인터랙티브 세션에 attach할 때만
     필요하므로 별도 선택적 경로로 한참 뒤에 둔다. → PRD §8의 "Windows 3-CLI PTY 리스크"는 사실상
     인터랙티브 경로에만 해당한다.
   - **(B-3) `trust`** — CLI별 권한 우회 플래그/설정 생성 + 에이전트별 opt-in + time-box(자동 만료)
     + allowlist. 로직은 얕아 패치 생성처럼 fixture 테스트 가능.
   - **(B-4) 반응형 쿼터 감지** — CLI stderr/exit code 파싱 → `QuotaExhausted → failover`. CLI 버전
     의존 취약부이므로 파서를 한 모듈로 격리하고 fixture 테스트.

## Consequences

- **지금 바로 구현(A):** `mcpServer.ts`에 `inputSchema`/`ping`/버전 네고/`isError`/`serverInfo`
  정정 + `mcpServer.test.ts`에 케이스 추가. 검증은 (a) JSON-RPC 파이프 스모크, (b) 실제
  `claude mcp add framein -- frame mcp serve` 연결 확인(마지막 한 줄만 외부 CLI 필요).
- **문서 정정:** "Content-Length" 표기를 전부 NDJSON로 바로잡고, §8 잔여 B 범위를 위 B-1~B-4로 갱신.
- **리스크 완화:** B의 80%(headless 위임)를 PTY 없이 낼 수 있게 되어 ADR-0006이 경고한 Windows PTY
  리스크의 영향 범위가 줄어든다.
- **정합성:** zero-dep 유지(Node 내장만), 감지·추천 경계(ADR-0004) 유지, A→B 순서(ADR-0006) 유지.

## Codex 리뷰 반영 (참고용, gpt-5.5)

외부 2차 의견(codex)이 Finding 1~4를 모두 확인(AGREE; Finding 4만 NUANCE)했고, Decision §2의
"스펙 준수 최소 세트"에 다음을 보강한다(전부 fixture 단위테스트 대상):

- **JSON-RPC 파스 에러는 `-32700`으로 응답**(현재 `serve()`는 깨진 줄을 조용히 드롭 → 응답으로 교체).
- **`tools/call` 파라미터 검증은 `-32602`**: `name` 누락/비문자열, unknown tool, 잘못된 arguments는
  protocol error(`-32602`)로. 도구 *실행* 실패만 `isError:true` 결과로.
- **초기화 순서 상태기계:** `initialize`·`ping`은 init 이전에도 허용, `notifications/initialized`를
  수신해 상태 전이, 그 전의 일반 요청(`tools/list`·`tools/call`)은 거부. 클라이언트가 관대하더라도
  테스트하기 쉬운 robustness이므로 추가. (`dispatch`에 선택적 session 인자로 도입 → 기존 단위테스트는
  무인자 호출이라 lenient 유지, `serve()`만 순서 강제.)
- `tools/list`의 `cursor`는 무시하되 받아만 두면 더 깔끔(전량 반환이라 `nextCursor` 생략). 배치(batch)는
  2025-06-18 stdio에서 불필요.

**Finding 4 nuance(중요):** "framein은 MCP *클라이언트*가 필요 없다"는 **공유 스토어 + 감지 전용
federation(ADR-0004 no-relay)** 에 한해서만 참이다. 향후 federation이 실제로 다른 에이전트의 MCP
서버를 `tools/list`로 introspect하거나 호출을 brokering/리소스 미러링/liveness 검증까지 하면 그때는
framein이 MCP 클라이언트가 된다. **"설정 파일 감지"는 federation이 아니다 — relay/query가 federation이다.**
이 경계는 ADR-0004와 정합하며, 클라이언트 구현은 그 범위를 실제로 넘을 때만 착수한다.

## Alternatives considered

- **Content-Length 프레이밍을 실제로 구현** — 기각. 스펙 위반이고 실 클라이언트가 못 붙는다.
  Content-Length가 필요한 경우는 (미래에) Streamable HTTP 트랜스포트를 추가할 때뿐인데, 로컬 CLI
  연결에는 stdio로 충분하므로 비목표.
- **스펙 준수 작업을 B에 그대로 둔다** — 기각. 외부 CLI 없이 테스트 가능한 순수 로직을 실 CLI
  의존 작업과 묶으면 "지금 검증 가능한 가치"를 불필요하게 미루게 된다(§8 정직 고지와 충돌).
- **MCP SDK(`@modelcontextprotocol/sdk`) 도입으로 한 번에 해결** — 기각. 런타임 의존성 0이 핵심
  셀링포인트(ADR-0003/§12). 도구 셋이 얇아 hand-rolled로 충분하다.
