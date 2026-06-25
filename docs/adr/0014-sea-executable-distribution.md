# ADR-0014 — Single Executable App (SEA) `framein.exe` 배포: Windows PowerShell 정책 마찰의 원천 해결

- **Status:** Accepted (PoC 검증) (2026-06-23).
- **근거:** 사내 테스트에서 반복된 Windows 마찰을 실측 후 결정. [ADR-0003](./0003-zero-runtime-dependencies.md)(zero runtime deps), [ADR-0009](./0009-drop-programmatic-pty-requirement.md)와 정합. 조사·PoC 기록은 internal Windows distribution research.

## Context

npm 전역 설치는 Windows에 셰임 3종을 만든다: `framein`(sh) · `framein.cmd`(cmd) · **`framein.ps1`(PowerShell)**.
기본 **Restricted** 실행정책에서 PowerShell은 bare `framein`을 `framein.ps1`로 해석 → `UnauthorizedAccess`로 막는다.
**핵심 발견(테스트):** 사용자가 git bash에서 작업해도 이 마찰이 뜬다 — **에이전트(codex 등)가 자기 도구 명령을
스스로 PowerShell로 실행**하기 때문. 즉 "사용자의 터미널"과 무관하게 `.ps1` 정책이 에이전트 내부에서 framein 호출을 문다.

스톱갭은 둘뿐이었다: (a) 사용자가 `Set-ExecutionPolicy RemoteSigned` (수동·회사 GPO에선 무효), (b) `.cmd` 우회.
래퍼는 `framein.cmd`로 고쳐 에이전트 내부 호출은 해결했지만(아래 Consequences), bare `framein`을 PowerShell에서
직접 칠 때의 마찰은 셰임이 존재하는 한 남는다. **자동으로 정책을 바꾸는 것은 거부**한다 — 사용자 머신의 보안
정책을 동의 없이 바꾸는 것은 오버리치이자 공급망 안티패턴이고, 회사 GPO에선 먹지도 않는다.

경쟁 도구(Claude Code·Cursor·gh·Deno·Bun)는 전부 **진짜 네이티브 바이너리**라 이 문제가 없다. 순수 npm(Gemini CLI)만
같은 마찰을 가진다. 따라서 원천 해결 = **셰임 의존을 버리고 실제 `.exe`를 배포**.

## Decision

**Node SEA(Single Executable Application)로 `framein.exe`(및 mac/linux 바이너리)를 배포한다.** 세 불변식을 모두 보존하는
유일한 옵션이다: zero **runtime** deps(esbuild·postject은 **빌드 전용** devDep), Node 빌트인 `node:sqlite` 유지,
`child_process` 무관. (Bun은 `node:sqlite` 미구현, Deno는 네이티브 애드온 충돌로 탈락.)

빌드 파이프라인(`scripts/build-sea.mjs`, `npm run build:sea`):
1. **esbuild**로 `dist/cli.js`(ESM)를 단일 **CJS**로 번들(node: 빌트인은 external, npm 의존 0이라 우리 코드만).
2. `node --experimental-sea-config`로 blob 생성 → node 런타임 복사 → **postject** 주입.
3. **banner**가 (a) 버전을 전역에 bake(`__FRAMEIN_VERSION__` — exe 옆엔 package.json이 없음), (b) `node:sqlite`
   ExperimentalWarning만 in-process로 억제.

핵심 사실(PoC, Node 22.15·Windows):
- **`node:sqlite`는 22.15에서 플래그 없이 동작**(경고만). → SEA에 `--experimental-sqlite`/재실행 트릭 불필요.
  (22.5.0에선 필요했으나 완화됨. 빌드 Node가 unflagged면 exe도 unflagged.)
- **SEA `process.argv` = `[exe, exe, ...args]`** (exe 경로가 두 번) → cli.ts의 `argv.slice(2)`와 그대로 맞음. argv 보정 불필요.

배포 단계: (a) 지금 = GitHub 릴리스에 `framein.exe` 첨부 + `irm … | iex` 설치 스크립트, (b) 공개 후 = winget/scoop.
`npm i -g`도 Node 사용자용으로 **병행 유지**(정책 doc은 stopgap).

## Consequences

- **(+) 원천 해결:** `.ps1` 셰임이 사라져 PowerShell 정책이 끼어들 여지 없음 — 사용자·에이전트 어느 쪽이 불러도.
  Node 미설치 머신에서도 실행. PoC에서 `framein.exe init`(=`node:sqlite`)·`status`·`--version` 전부 통과.
- **(−) 코드 서명 필요:** 미서명 exe는 Windows SmartScreen / macOS Gatekeeper 경고. **배포 전 Authenticode 서명 +
  Apple 공증 필수.** (PoC는 미서명.) postject 주입은 node.exe의 기존 서명을 무효화하므로 *주입 후* 서명한다.
- **(−) 플랫폼별 빌드:** SEA는 크로스컴파일 불가 — win/mac/linux 각각 그 플랫폼 러너에서 빌드(GitHub Actions 매트릭스).
- **(−) 크기 ~80MB**(전체 Node 런타임 동봉). 바이너리로는 수용 가능.
- **(=) 빌드 devDep 증가**(esbuild·postject) — runtime zero-dep 불변식은 불변. `build/`는 gitignore.

## 남은 작업 (별도)
코드 서명·공증 · 3플랫폼 CI 매트릭스 · 릴리스에 바이너리 첨부 + `irm|iex` 설치 스크립트 · (공개 후) winget/scoop.
