# Framein Install Guide

Framein is a public pre-release. The supported cross-platform install path is npm.

Korean guide: [INSTALL.ko.md](INSTALL.ko.md)

## 0. Requirements

- **Node.js 22.5.0 or newer.** Framein uses the built-in experimental `node:sqlite` module.
- Optional, for agent integration: installed `claude`, `codex`, and/or `gemini` CLIs on `PATH`.

Check Node first:

```bash
node --version
```

If this prints a version below `v22.5.0`, upgrade Node with `nvm`, `fnm`, Homebrew, Volta, or the
official installer before installing Framein. Older Node versions may install the package but crash
at runtime when `node:sqlite` is loaded.

## 1. Install from npm

```bash
npm install -g framein
framein --version
```

Expected result:

```text
framein 0.0.5
```

To remove the global install:

```bash
npm rm -g framein
```

## 2. OS Notes

| Environment | Recommended command | Notes |
|---|---|---|
| Windows PowerShell | `npm.cmd install -g framein` | Avoids PowerShell `.ps1` execution-policy friction during install. |
| Windows cmd.exe | `npm install -g framein` | Usually works without policy changes. |
| Windows Git Bash | `npm install -g framein` | Uses the shell shim, not PowerShell. |
| macOS zsh/bash | `npm install -g framein` | If global npm permissions fail, use a Node version manager. |
| Linux | `npm install -g framein` | Prefer `nvm`, `fnm`, or Volta over distro Node when the version is old. |
| WSL | Install inside WSL with WSL's own Node/npm | Windows `.cmd` or `.exe` shims are not a substitute inside WSL. |

## 3. Troubleshooting

### Windows PowerShell blocks `npm.ps1` or `framein.ps1`

This is PowerShell's execution policy, not a Framein runtime failure.

Use one of these paths:

```powershell
npm.cmd install -g framein
framein.cmd --version
```

Or allow local user scripts:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

Git Bash and `cmd.exe` also avoid the PowerShell `.ps1` shim.

### macOS or Linux shows `EACCES: permission denied`

Your global npm prefix is probably owned by the system.

Preferred fix: use a Node version manager (`nvm`, `fnm`, Volta) or Homebrew Node on macOS, then
install again without `sudo`.

Temporary workaround:

```bash
sudo npm install -g framein
```

### `framein: command not found`

Your global npm bin directory is not on `PATH`.

```bash
npm prefix -g
```

Add the matching `bin` directory to your shell profile, then restart the terminal or reload the
profile.

### WSL cannot see the Windows install

WSL is a separate Linux environment. Install Node 22.5+ and Framein inside WSL itself:

```bash
node --version
npm install -g framein
```

If you use `/go` or live delegation from WSL, install the target agent CLIs (`claude`, `codex`,
`gemini`) inside WSL too.

## 4. First Repo Setup

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

## 5. Build from Source

Use this path when you want to develop Framein itself or test a local checkout:

```bash
git clone https://github.com/framein-dev/framein.git
cd framein
npm install
npm run build
npm test
npm install -g .
framein --version
```

## 6. Standalone Executables

Framein currently works on Windows, macOS, Linux, and WSL through npm. Node.js 22.5+ is the only
required runtime for that path.

Standalone executables are planned as an optional convenience path, not a replacement for npm. The
main benefits are:

- users can run Framein without installing Node/npm separately;
- Windows users can avoid npm-generated `.ps1` shims and PowerShell execution-policy friction;
- future package-manager paths such as `winget`, `scoop`, or Homebrew can point at release assets.

The planned executable form bundles the Node runtime with Framein's code. It does not install Node
globally or modify the user's system Node installation.

There is no official standalone `.exe`, `.pkg`, `.dmg`, Linux binary package, `winget`, `scoop`, or
Chocolatey install path for `v0.0.5`. Do not treat self-built, unsigned, or test-signed binaries as
official releases. The expected future Windows path is a GitHub Release asset such as
`framein-win-x64.exe`, accompanied by `SHA256SUMS.txt`, signature verification instructions, and
clear signed/unsigned release notes.

The Windows Authenticode signing route is not finalized: SignPath Foundation OSS has been requested,
and commercial OV or another suitable signing path may be used if that proves more practical. macOS
signing/notarization and clean-machine smoke tests are tracked separately before binary downloads
are documented as the default path.

## 7. Verification

```bash
framein --version
framein
```

The bare `framein` command opens the lobby in an interactive terminal. In non-interactive contexts,
it prints help and exits safely.

When reporting install issues, include:

- OS and shell
- `node --version`
- exact install command
- exact error message
