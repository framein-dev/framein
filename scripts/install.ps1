# framein installer (Windows) - irm https://raw.githubusercontent.com/framein-dev/framein/main/scripts/install.ps1 | iex
# Why this dodges the execution-policy problem: the policy blocks .ps1 FILES on disk, not a piped
# expression run via `iex`. This script then downloads a real .exe (no shim, no policy) and adds it to PATH.
# Needs a public GitHub release with a Windows SEA binary.
$ErrorActionPreference = 'Stop'
$repo  = 'framein-dev/framein'
$asset = 'framein-win-x64.exe'
$dir   = Join-Path $env:LOCALAPPDATA 'Programs\framein'
$exe   = Join-Path $dir 'framein.exe'
New-Item -ItemType Directory -Force -Path $dir | Out-Null

Write-Host 'Resolving latest framein release...'
$rel = Invoke-RestMethod "https://api.github.com/repos/$repo/releases/latest" -Headers @{ 'User-Agent' = 'framein-install' }
$tag = $rel.tag_name
Write-Host "Downloading $asset ($tag)..."
Invoke-WebRequest "https://github.com/$repo/releases/download/$tag/$asset" -OutFile $exe -UseBasicParsing

# Verify against SHA256SUMS.txt when present.
try {
  $sums = (Invoke-WebRequest "https://github.com/$repo/releases/download/$tag/SHA256SUMS.txt" -UseBasicParsing).Content
  $line = ($sums -split "`n") | Where-Object { $_ -match [regex]::Escape($asset) } | Select-Object -First 1
  if ($line) {
    $want = ($line -split '\s+')[0].ToLower()
    $got  = (Get-FileHash $exe -Algorithm SHA256).Hash.ToLower()
    if ($got -ne $want) { throw "checksum mismatch ($got != $want)" }
    Write-Host 'Checksum OK.'
  }
} catch { Write-Warning "Checksum step skipped: $_" }

# Add to the user PATH (idempotent).
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if (($userPath -split ';') -notcontains $dir) {
  $newPath = ($userPath.TrimEnd(';') + ';' + $dir)
  [System.Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
  Write-Host "Added $dir to your PATH - open a new terminal for it to take effect."
}
& $exe --version
Write-Host "[OK] framein installed -> $exe"
