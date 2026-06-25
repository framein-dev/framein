# Framein 설치 가이드

Framein은 아직 pre-release입니다. 공개 npm 배포 전까지는 GitHub Release의 standalone binary를 기본 설치 경로로 사용합니다.

English guide: [INSTALL.md](INSTALL.md)

## 0. 요구사항

- **지원 OS:** Windows x64, macOS arm64/x64, Linux x64
- **Node.js 22.5.0 이상:** 소스에서 빌드하거나 npm 패키지 경로를 사용할 때만 필요
- 선택 사항: 실제 에이전트 연동을 위해 `claude`, `codex`, `gemini` CLI가 `PATH`에 설치되어 있으면 좋습니다.

standalone binary는 Node SEA로 빌드되므로 일반 사용에는 별도 Node 설치가 필요하지 않습니다.

## 1. Windows

PowerShell:

```powershell
irm https://raw.githubusercontent.com/framein-dev/framein/main/scripts/install.ps1 | iex
framein --version
```

설치 스크립트는 최신 GitHub Release에서 `framein-win-x64.exe`를 내려받고, `SHA256SUMS.txt`가 있으면 체크섬을 검증한 뒤 사용자
프로필 아래에 설치하고 사용자 PATH에 추가합니다. 바로 `framein`을 찾지 못하면 새 터미널을 열어 주세요.

수동 설치:

1. 최신 GitHub Release에서 `framein-win-x64.exe`를 다운로드합니다.
2. 사용자 PATH에 포함된 폴더에 둡니다.
3. 필요하면 파일명을 `framein.exe`로 맞춥니다.
4. `framein --version`을 실행합니다.

## 2. macOS / Linux

```bash
curl -fsSL https://raw.githubusercontent.com/framein-dev/framein/main/scripts/install.sh | sh
framein --version
```

설치 스크립트는 OS와 아키텍처에 맞는 release asset을 선택합니다.

- `framein-macos-arm64`
- `framein-macos-x64`
- `framein-linux-x64`

기본 설치 위치는 `~/.local/bin`입니다. 다른 위치를 쓰려면:

```bash
FRAMEIN_BIN=/usr/local/bin curl -fsSL https://raw.githubusercontent.com/framein-dev/framein/main/scripts/install.sh | sh
```

셸에서 `framein`을 찾지 못하면 설치 위치를 `PATH`에 추가합니다.

```bash
export PATH="$HOME/.local/bin:$PATH"
```

## 3. 프로젝트에서 처음 실행

Framein을 적용할 실제 프로젝트 폴더에서 실행합니다.

```bash
cd your-project
framein init
framein integrations install all --write
framein status
```

이 명령은 Framein 로컬 store를 만들고, 지원되는 에이전트용 namespaced wrapper를 설치합니다. 생성된 wrapper는 로컬
`framein` CLI를 호출할 뿐, 자격증명을 중계하거나 모델 트래픽을 프록시하지 않습니다.

## 4. 소스에서 빌드

Framein 자체를 개발하거나 로컬 checkout을 테스트할 때 사용합니다.

```bash
git clone https://github.com/framein-dev/framein.git
cd framein
npm install
npm run build
npm test
npm link
framein --version
```

소스 빌드는 Node 내장 experimental `node:sqlite`를 사용하므로 Node.js 22.5.0 이상이 필요합니다.

## 5. 문제 해결

### Windows에서 `.ps1` 실행이 막힘

권장 명령은 설치 스크립트를 `iex`로 파이프합니다. PowerShell 실행 정책은 디스크에 저장된 `.ps1` 파일을 막는 경우가 많고,
파이프된 표현식은 통과하는 경우가 많습니다. 조직 정책상 `iex`가 막혀 있다면 GitHub Release에서 `.exe`를 직접 다운로드하세요.

### macOS에서 확인되지 않은 개발자 경고가 뜸

macOS 서명/공증 release path는 아직 준비 중입니다. 그 전까지는 다운로드한 pre-release binary에서 Gatekeeper 경고가 뜰 수
있습니다. 원하지 않으면 소스 빌드 경로를 사용하세요.

### 아직 release asset이 없음

Framein은 pre-release입니다. 최신 GitHub Release에 현재 플랫폼용 binary가 없다면 [소스에서 빌드](#4-소스에서-빌드)를 사용하세요.

### `framein: command not found`

설치 위치가 `PATH`에 없을 가능성이 큽니다. 설치 후 새 터미널을 열거나 설치 폴더를 직접 `PATH`에 추가하세요.

### 에이전트 명령이 보이지 않음

대상 프로젝트 안에서 wrapper를 설치하고 진단합니다.

```bash
framein integrations install all --write
framein doctor
```

### WSL에서 Windows 설치본이 보이지 않음

WSL은 별도 Linux 환경입니다. WSL 내부에 Linux binary를 설치하거나 소스에서 빌드하세요. WSL에서 live delegation을 쓸 경우
`claude`, `codex`, `gemini` CLI도 WSL 내부에 설치되어 있어야 합니다.
