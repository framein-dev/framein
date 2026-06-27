# Framein 설치 가이드

Framein은 현재 public pre-release입니다. 기본 공개 설치 경로는 npm입니다.

English guide: [INSTALL.md](INSTALL.md)

Code signing policy: [CODE_SIGNING.md](CODE_SIGNING.md)

## 0. 사전 준비

- **Node.js 22.5.0 이상.** Framein은 Node 내장 experimental `node:sqlite` 모듈을 사용합니다.
- 선택: 실제 에이전트 연동에는 `claude`, `codex`, `gemini` CLI가 PATH에 있어야 합니다.

먼저 Node 버전을 확인하세요.

```bash
node --version
```

`v22.5.0`보다 낮으면 `nvm`, `fnm`, Homebrew, Volta, 공식 설치본 등으로 Node를 올린 뒤 진행하세요.
오래된 Node에서는 설치가 되더라도 실행 시 `node:sqlite` 로딩에서 실패할 수 있습니다.

## 1. npm 설치

```bash
npm install -g framein
framein --version
```

예상 결과:

```text
framein 0.0.4
```

전역 설치 제거:

```bash
npm rm -g framein
```

## 2. 환경별 메모

| 환경 | 권장 명령 | 주의 |
|---|---|---|
| Windows PowerShell | `npm.cmd install -g framein` | PowerShell `.ps1` 실행정책 마찰을 피합니다. |
| Windows cmd.exe | `npm install -g framein` | 보통 별도 정책 변경 없이 동작합니다. |
| Windows Git Bash | `npm install -g framein` | PowerShell shim을 쓰지 않습니다. |
| macOS zsh/bash | `npm install -g framein` | 전역 npm 권한 오류가 나면 Node 버전 매니저를 권장합니다. |
| Linux | `npm install -g framein` | distro Node가 오래된 경우가 많으므로 `nvm`, `fnm`, Volta를 권장합니다. |
| WSL | WSL 내부 Node/npm으로 설치 | Windows `.cmd` 또는 `.exe` shim은 WSL 설치를 대신하지 않습니다. |

## 3. 문제 해결

### Windows PowerShell에서 `npm.ps1` 또는 `framein.ps1`이 차단됨

PowerShell 실행정책 문제이며 Framein 런타임 오류가 아닙니다.

정책을 바꾸기 싫으면 `.cmd`를 사용하세요.

```powershell
npm.cmd install -g framein
framein.cmd --version
```

또는 사용자 범위에서 로컬 스크립트를 허용할 수 있습니다.

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

Git Bash와 `cmd.exe`도 PowerShell `.ps1` shim을 피합니다.

### macOS/Linux에서 `EACCES: permission denied`

전역 npm prefix가 시스템 소유일 가능성이 큽니다.

권장: `nvm`, `fnm`, Volta 또는 macOS Homebrew Node처럼 사용자 소유 Node를 사용한 뒤 다시 설치합니다.

임시 우회:

```bash
sudo npm install -g framein
```

### 설치 후 `framein: command not found`

npm 전역 bin 디렉터리가 PATH에 없을 수 있습니다.

```bash
npm prefix -g
```

해당 prefix의 `bin` 디렉터리를 셸 프로필에 추가하고 터미널을 다시 여세요.

### WSL에서 Windows 설치본이 보이지 않음

WSL은 Windows와 분리된 Linux 환경입니다. WSL 내부에 Node 22.5+와 Framein을 별도로 설치하세요.

```bash
node --version
npm install -g framein
```

`/go`나 live delegation을 WSL에서 쓸 경우, 대상 에이전트 CLI(`claude`, `codex`, `gemini`)도 WSL
안에 설치되어 있어야 합니다.

## 4. 프로젝트 초기화

Framein을 사용할 프로젝트에서 실행합니다.

```bash
cd your-project
framein init
framein integrations install all --write
framein status
```

이 명령은 로컬 store를 만들고 지원되는 에이전트 wrapper를 설치합니다. 생성된 wrapper는 로컬 `framein`
CLI를 호출할 뿐, 자격증명을 릴레이하거나 모델 트래픽을 프록시하지 않습니다.

## 5. 소스에서 빌드

Framein 자체를 개발하거나 로컬 checkout을 테스트할 때 사용합니다.

```bash
git clone https://github.com/framein-dev/framein.git
cd framein
npm install
npm run build
npm test
npm install -g .
framein --version
```

## 6. standalone binary 상태

Windows/macOS/Linux standalone binary는 아직 기본 공개 설치 경로가 아닙니다. Windows Authenticode
서명 경로는 아직 확정되지 않았습니다. SignPath Foundation OSS signing은 신청해 둔 상태이며, 필요하면
상용 OV 인증서나 다른 서명 경로를 검토할 수 있습니다. macOS signing/notarization 및 clean-machine
smoke test는 별도로 검증 중입니다. 이 경로가 준비되기 전까지는 npm 설치 경로를 기준으로 문서화합니다.

## 7. 설치 확인

```bash
framein --version
framein
```

대화형 터미널에서는 bare `framein` 명령이 lobby를 엽니다. 비대화형 환경에서는 help를 출력하고 안전하게
종료합니다.

문제 보고 시 아래 정보를 함께 보내 주세요.

- OS와 셸
- `node --version`
- 정확한 설치 명령
- 정확한 오류 메시지
