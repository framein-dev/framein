#!/bin/sh
# framein installer (macOS/Linux) - curl -fsSL https://raw.githubusercontent.com/framein-dev/framein/main/scripts/install.sh | sh
# Detects OS/arch, downloads the matching SEA binary from the latest GitHub release, verifies its
# checksum, and installs to ~/.local/bin (override with FRAMEIN_BIN). Needs a PUBLIC repo/release.
set -eu

repo="framein-dev/framein"
os="$(uname -s)"; arch="$(uname -m)"
case "$os" in
  Darwin) case "$arch" in
            arm64)  asset="framein-macos-arm64" ;;
            x86_64) asset="framein-macos-x64" ;;
            *) echo "framein: unsupported arch '$arch' on macOS" >&2; exit 1 ;;
          esac ;;
  Linux)  case "$arch" in
            x86_64|amd64) asset="framein-linux-x64" ;;
            *) echo "framein: unsupported arch '$arch' on Linux" >&2; exit 1 ;;
          esac ;;
  *) echo "framein: unsupported OS '$os'" >&2; exit 1 ;;
esac

tag="$(curl -fsSL "https://api.github.com/repos/$repo/releases/latest" \
  | grep -m1 '"tag_name"' | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/')"
[ -n "$tag" ] || { echo "framein: could not resolve latest release" >&2; exit 1; }

base="https://github.com/$repo/releases/download/$tag"
dir="${FRAMEIN_BIN:-$HOME/.local/bin}"
mkdir -p "$dir"
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

echo "Downloading $asset ($tag)..."
curl -fsSL "$base/$asset" -o "$tmp"

# Verify against SHA256SUMS.txt when present.
if want="$(curl -fsSL "$base/SHA256SUMS.txt" 2>/dev/null | grep " $asset\$" | awk '{print $1}')" && [ -n "${want:-}" ]; then
  if command -v sha256sum >/dev/null 2>&1; then got="$(sha256sum "$tmp" | awk '{print $1}')";
  else got="$(shasum -a 256 "$tmp" | awk '{print $1}')"; fi
  [ "$got" = "$want" ] || { echo "framein: checksum mismatch" >&2; exit 1; }
  echo "Checksum OK."
fi

chmod +x "$tmp"
mv "$tmp" "$dir/framein"
trap - EXIT
echo "[OK] framein installed -> $dir/framein"
case ":$PATH:" in
  *":$dir:"*) ;;
  *) echo "Add to PATH:  export PATH=\"$dir:\$PATH\"" ;;
esac
"$dir/framein" --version || true
