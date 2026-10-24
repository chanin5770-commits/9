#!/bin/sh
# Upscales every clip in footage/ to 1920x1080 and dumps its frames as JPEGs
# into build/frames/<clip>/0001.jpg … (24 fps, 192 frames per 8 s clip).
set -e
cd "$(dirname "$0")/.."
for f in footage/*.mp4; do
  name=$(basename "$f" .mp4)
  out="build/frames/$name"
  [ -f "$out/0192.jpg" ] && continue
  mkdir -p "$out"
  ffmpeg -v error -y -i "$f" \
    -vf "hqdn3d=1.5:1.5:3:3,scale=1920:1080:flags=lanczos,unsharp=5:5:0.6:5:5:0.0" \
    -q:v 2 "$out/%04d.jpg"
  echo "$name: $(ls "$out" | wc -l) frames"
done
