# Code signing policy

Framein is preparing signed executable releases for Windows and macOS. This policy describes the
Windows code-signing process used for public release builds and the temporary test-signing process
used while the project is pre-release.

## Current status

- Public repository: <https://github.com/framein-dev/framein>
- Project website: <https://www.framein.dev>
- License: MIT
- Build system: GitHub Actions
- Windows artifact: `framein-win-x64.exe`

Framein has verified the SignPath signing workflow with a self-signed test certificate. Test-signed
artifacts are not public release artifacts and are not intended for end users.

Public Windows release builds are intended to use:

> Free code signing provided by SignPath.io, certificate by SignPath Foundation.

This statement applies to public release artifacts only after SignPath Foundation OSS signing has
been approved and connected to the release workflow.

## What may be signed

Only Framein release artifacts built from the public `framein-dev/framein` repository may be signed.
The project does not sign third-party binaries, private forks, internal builds, or artifacts built
from unpublished source.

Release signing is limited to:

- Windows standalone executable: `framein-win-x64.exe`
- Future installer artifacts, if Framein later publishes an installer

Pre-release test signing may use a self-signed certificate to validate the signing pipeline. Those
artifacts must stay clearly marked as test builds.

## Source and build requirements

Release artifacts must be built from the public repository using GitHub Actions. Build scripts and
release workflow files are part of the reviewed source and must not be changed outside the normal
repository review process.

The expected release path is:

1. A version tag matching `v*` is pushed to the public repository.
2. `.github/workflows/release.yml` builds the platform artifacts on GitHub-hosted runners.
3. The Windows artifact is submitted to SignPath for Authenticode signing.
4. The signed artifact and `SHA256SUMS.txt` are attached to the GitHub Release.

## Team roles

The Framein project is currently in pre-release with a small maintainer set.

- Authors / committers: repository maintainers with write access to
  [`framein-dev/framein`](https://github.com/framein-dev/framein)
- Reviewers: repository maintainers and future Framein maintainer teams
- Signing approvers: organization owners / release maintainers who can decide whether a release
  artifact may be signed

Current public organization membership can be reviewed at:
<https://github.com/orgs/framein-dev/people>

As additional maintainers join, these roles should move to explicit GitHub teams and this policy
should link to those teams.

All maintainers involved in signing must use multi-factor authentication for GitHub and SignPath.

## Privacy policy

This program will not transfer any information to other networked systems unless specifically
requested by the user or the person installing or operating it.

Framein is local-first. It does not collect provider credentials, pool AI subscriptions, proxy model
traffic, relay MCP tools, or screen-scrape terminal I/O. Provider authentication remains with the
official CLI used by the developer.

The install scripts contact GitHub only to download public release assets and optional checksum
files. Runtime commands may invoke locally installed agent CLIs only when the user explicitly asks
Framein to run or delegate work.

## User-visible system changes

The standalone installers place the Framein executable in a user-level binary directory and may add
that directory to the user's `PATH`.

Windows installer script:

- Downloads `framein-win-x64.exe` from GitHub Releases.
- Installs it to `%LOCALAPPDATA%\Programs\framein\framein.exe`.
- Adds that directory to the user `PATH` if it is missing.

macOS / Linux installer script:

- Downloads the matching release binary from GitHub Releases.
- Installs it to `$HOME/.local/bin/framein` by default, or `$FRAMEIN_BIN/framein` when overridden.

## Uninstall

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

Project-local Framein state can be removed from a repository by deleting `.frame/`,
`framein.store.json`, and the managed `framein:begin` / `framein:end` blocks from native agent
context files if you no longer want that repository to use Framein.

## Verification

Windows users can inspect an executable signature with:

```powershell
Get-AuthenticodeSignature .\framein-win-x64.exe
```

Release downloads should also be checked against the `SHA256SUMS.txt` file attached to the GitHub
Release.

## Contact

Security issues should be reported privately through GitHub Security Advisories when available, or
to <axc@frameout.co.kr>.
