#!/bin/sh
# Dumps the moments of the finished clip that the teaser uses into
# build/frames/orig/NNNNN.jpg, numbered by the clip's own frame index
# (frame = round(time * 30) + 1). The ranges match EXCERPTS / END_SRC in src/teaser.js.
# Usage: tools/teaser/extract_clip_frames.sh [clip.mp4]   (default: build/master.mp4,
# the CRF 18 render from `node tools/render.cjs --out build/master.mp4`)
set -e
cd "$(dirname "$0")/../.."
SRC=${1:-build/master.mp4}
OUT=build/frames/orig
mkdir -p "$OUT"
# Each range runs 0.6 s past its cut: a crossfade keeps drawing the outgoing shot.
for range in 52.802:4.7 1.649:4.5 26.099:2.3 111.758:1.9 118.561:1.9 99.498:3.7; do
  start=${range%%:*}; dur=${range##*:}
  first=$(python3 -c "print(round($start * 30) + 1)")
  ffmpeg -v error -y -ss "$start" -i "$SRC" -t "$dur" -vf fps=30 -q:v 2 -start_number "$first" "$OUT/%05d.jpg"
done
echo "$(ls "$OUT" | wc -l) frames in $OUT"
