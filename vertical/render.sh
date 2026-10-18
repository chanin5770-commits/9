#!/usr/bin/env bash
# Full render of the vertical ad: score + mix, picture, cover image.
#   bash vertical/render.sh            # needs ffmpeg and: pip install -r vertical/requirements.txt
set -euo pipefail
cd "$(dirname "$0")/.."
PY=${PYTHON:-python3}
$PY vertical/audio.py
$PY vertical/video.py "$@"
# cover: Yosef at the board with "לחשמל?" on screen
ffmpeg -v error -y -ss 8.90 -i dist/hashmali-cinematic-ad-vertical.mp4 -frames:v 1 -q:v 2 dist/hashmali-cinematic-ad-vertical-cover.jpg
echo dist/hashmali-cinematic-ad-vertical-cover.jpg
