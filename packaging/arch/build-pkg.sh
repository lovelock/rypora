#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:?usage: build-pkg.sh <version> <binary> [output-dir]}"
BIN="${2:?usage: build-pkg.sh <version> <binary> [output-dir]}"
OUT="${3:-packaging/arch/out}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/rypora-pkg.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

PKG="$WORK/pkg"
install -Dm755 "$BIN" "$PKG/usr/bin/rypora"
install -Dm644 "$ROOT/packaging/arch/rypora.desktop" \
  "$PKG/usr/share/applications/rypora.desktop"
install -Dm644 "$ROOT/src-tauri/icons/32x32.png" \
  "$PKG/usr/share/icons/hicolor/32x32/apps/rypora.png"
install -Dm644 "$ROOT/src-tauri/icons/128x128.png" \
  "$PKG/usr/share/icons/hicolor/128x128/apps/rypora.png"
install -Dm644 "$ROOT/src-tauri/icons/128x128@2x.png" \
  "$PKG/usr/share/icons/hicolor/256x256/apps/rypora.png"

mkdir -p "$OUT"
SIZE="$(du -sb "$PKG" | cut -f1)"
BUILDDATE="$(date +%s)"

cat > "$PKG/.PKGINFO" <<EOF
pkgname = rypora
pkgbase = rypora
pkgver = ${VERSION}-1
pkgdesc = A lightweight, local-first Markdown workspace
url = https://github.com/lovelock/rypora
builddate = ${BUILDDATE}
packager = lovelock <frostwong@gmail.com>
size = ${SIZE}
arch = x86_64
license = unknown
depend = webkit2gtk-4.1
depend = gtk3
depend = libsoup3
depend = glib2
depend = glibc
depend = gcc-libs
depend = cairo
depend = pango
depend = gdk-pixbuf2
depend = libx11
depend = libxkbcommon
depend = openssl
depend = xdg-utils
depend = hicolor-icon-theme
EOF

(
  cd "$PKG"
  bsdtar -czf .MTREE \
    --format=mtree \
    --options='!all,use-set,type,uid,gid,mode,time,size,md5,sha256,link' \
    .PKGINFO usr
  bsdtar --zstd -cf "$OUT/rypora-${VERSION}-1-x86_64.pkg.tar.zst" \
    .PKGINFO .MTREE usr
)

echo "$OUT/rypora-${VERSION}-1-x86_64.pkg.tar.zst"
