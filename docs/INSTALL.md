# Framein Install Guide

Framein is pre-release. Public npm is not live yet, so the default install path is the standalone
binary from GitHub Releases.

Korean guide: [INSTALL.ko.md](INSTALL.ko.md)

Code signing policy: [CODE_SIGNING.md](CODE_SIGNING.md)

## 0. Requirements

- **A supported OS:** Windows x64, macOS arm64/x64, or Linux x64.
- **Node.js 22.5.0 or newer** only when you install from source or use the npm package path.
- Optional, for agent integration: installed `claude`, `codex`, and/or `gemini` CLIs on `PATH`.

The standalone binary is built from Node SEA and does not require a separate Node installation for
normal use.

## 1. Windows

PowerShell:

```powershell
irm https://raw.githubusercontent.com/framein-dev/framein/main/scripts/install.ps1 | iex
framein --version
```

The installer downloads the latest `framein-win-x64.exe` release asset, verifies `SHA256SUMS.txt`
when present, installs the binary under the user profile, and adds that directory to the user PATH.
Open a new terminal if `framein` is not immediately found.

Windows release signing is being prepared through SignPath. See the
[code signing policy](CODE_SIGNING.md) for the release-signing model, current pre-release status,
and uninstall instructions.

Manual fallback:

1. Download `framein-win-x64.exe` from the latest GitHub Release.
2. Put it in a directory on your user PATH.
3. Rename or alias it to `framein.exe` if desired.
4. Run `framein --version`.

## 2. macOS / Linux

```bash
curl -fsSL https://raw.githubusercontent.com/framein-dev/framein/main/scripts/install.sh | sh
framein --version
```

The installer selects the matching release asset:

- `framein-macos-arm64`
- `framein-macos-x64`
- `framein-linux-x64`

It installs to `~/.local/bin` by default. Override with:

```bash
FRAMEIN_BIN=/usr/local/bin curl -fsSL https://raw.githubusercontent.com/framein-dev/framein/main/scripts/install.sh | sh
```

If your shell cannot find `framein`, add the install directory to `PATH`:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

## 3. First Repo Setup

Run these commands from the repository you want Framein to manage:

```bash
cd your-project
framein init
framein integrations install all --write
framein status
```

This creates Framein's local store and installs namespaced agent wrappers where supported. The
generated wrappers call the local `framein` CLI; they do not relay credentials or proxy model
traffic.

## 4. Build from Source

Use this path when you want to develop Framein itself or test a local checkout:

```bash
git clone https://github.com/framein-dev/framein.git
cd framein
npm install
npm run build
npm test
npm link
framein --version
```

Node.js 22.5.0 or newer is required because the source build uses the built-in experimental
`node:sqlite` module.

## 5. Uninstall

Windows PowerShell:

```powershell
$dir = Join-Path $env:LOCALAPPDATA 'Programs\framein'
Remove-Item -LiteralPath (Join-Path $dir 'framein.exe') -Force -ErrorAction SilentlyContinue

$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$newPath = (($userPath -split ';') | Where-Object { $_ -and $_ -ne $dir }) -join ';'
[Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
```

macOS / Linux:

```bash
rm -f "${FRAMEIN_BIN:-$HOME/.local/bin}/framein"
```

## 6. Troubleshooting

### Windows blocks `.ps1` scripts

The recommended command pipes the installer into `iex`; PowerShell execution policy blocks `.ps1`
files on disk, not a piped expression. If your organization blocks `iex`, download the `.exe`
release asset manually.

### macOS says the binary is from an unidentified developer

Framein's signed/notarized macOS release path is still being prepared. Until then, Gatekeeper may
warn on downloaded binaries. Use the source build path if you prefer not to run a pre-release binary.

### No release asset exists yet

Framein is pre-release. If the latest GitHub Release does not contain your platform's binary yet,
use [Build from Source](#4-build-from-source).

### `framein: command not found`

Your install directory is not on `PATH`. Open a new terminal after install, or add the install
directory manually.

### Agent commands are missing

Install wrappers inside the target project:

```bash
framein integrations install all --write
framein doctor
```

### WSL cannot see the Windows install

WSL is a separate Linux environment. Install the Linux binary or build from source inside WSL. If you
use live delegation from WSL, install the target agent CLIs (`claude`, `codex`, `gemini`) inside WSL
too.
