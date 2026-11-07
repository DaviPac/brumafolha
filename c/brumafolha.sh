#!/bin/sh
# Launcher for the release bundle: uses the system SDL2_ttf when there is one, else the copy in lib/.
DIR="$(cd "$(dirname "$0")" && pwd)"
if ! ldconfig -p 2>/dev/null | grep -q 'libSDL2_ttf-2.0.so.0'; then
  LD_LIBRARY_PATH="$DIR/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"; export LD_LIBRARY_PATH
fi
if ! ldconfig -p 2>/dev/null | grep -q 'libSDL2-2.0.so.0'; then
  echo "Falta o SDL2. Instale com: sudo apt install libsdl2-2.0-0" >&2
  exit 1
fi
exec "$DIR/brumafolha" "$@"
