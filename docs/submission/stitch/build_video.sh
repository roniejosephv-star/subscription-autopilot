#!/usr/bin/env bash
# Assembles storyboard.mp4 from the recorded passes + deck cards (+ optional terminal stills).
# Add terminal-*.png files to this directory and re-run to splice them in before pass 2.
set -euo pipefail
cd "$(dirname "$0")"

FONT=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf
VF_BASE="scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x0b1020"
ENC=(-r 30 -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -an)

cap() { # cap <text> -> drawtext filter with bottom caption bar
  echo "drawbox=y=ih-84:w=iw:h=84:color=0x0b1020@0.85:t=fill,drawtext=fontfile=${FONT}:text='$1':fontcolor=0xe7ecf5:fontsize=30:x=(w-text_w)/2:y=h-58"
}

# 1 · title card (6 s)
ffmpeg -y -loop 1 -t 6 -i card-title.png -vf "$VF_BASE" "${ENC[@]}" seg1.mp4

# 2 · pass 1 walkthrough (slowed 1.6x for readability)
ffmpeg -y -i pass1-dashboard-walkthrough.gif \
  -vf "setpts=1.6*PTS,$VF_BASE,$(cap "LIVE - metered x402 USDC payments · Gateway receipts · epochs anchored on Arc")" \
  "${ENC[@]}" seg2.mp4

# 3 · architecture card (8 s)
ffmpeg -y -loop 1 -t 8 -i card-architecture.png -vf "$VF_BASE" "${ENC[@]}" seg3.mp4

# 4 · optional terminal stills (5 s each, any terminal-*.png, sorted)
segs=(seg1.mp4 seg2.mp4 seg3.mp4)
i=4
for t in $(ls terminal-*.png 2>/dev/null | sort); do
  ffmpeg -y -loop 1 -t 5 -i "$t" -vf "$VF_BASE,$(cap "THE ATTACK — prompt-injected overspend, fired at the live signer")" "${ENC[@]}" "seg${i}.mp4"
  segs+=("seg${i}.mp4"); i=$((i+1))
done

# 5 · pass 2 attack (slowed 1.8x — the card + deny click deserve dwell time)
ffmpeg -y -i pass2-attack-deny-hold.gif \
  -vf "setpts=1.8*PTS,$VF_BASE,$(cap "DENIED at the policy wall (per_tx_max_exceeded) · HELD above threshold - human clicks Deny")" \
  "${ENC[@]}" "seg${i}.mp4"
segs+=("seg${i}.mp4"); i=$((i+1))

# 6 · close card (6 s)
ffmpeg -y -loop 1 -t 6 -i card-close.png -vf "$VF_BASE" "${ENC[@]}" "seg${i}.mp4"
segs+=("seg${i}.mp4")

printf "file '%s'\n" "${segs[@]}" > concat.txt
ffmpeg -y -f concat -safe 0 -i concat.txt -c copy storyboard.mp4
rm -f seg*.mp4 concat.txt
echo "OK → $(pwd)/storyboard.mp4"; ffprobe -v error -show_entries format=duration,size -of default=nw=1 storyboard.mp4
