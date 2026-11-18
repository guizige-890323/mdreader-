// 主 GIF 合成：停留段用长 delay、过渡段用短 delay，保持总时长与观感
// 做法：ffmpeg 生成节选帧的调色板版，PIL 仅改写每帧 duration（不重量化，避免偏色）
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DIR = 'D:/WorkBuddy/2026-11-08-21-28-36/docs/assets/_frames-carousel';
const TMP = 'D:/WorkBuddy/2026-11-08-21-28-36/docs/assets/_pick';
const OUT = 'D:/WorkBuddy/2026-11-08-21-28-36/docs/assets/demo-carousel.gif';
const PAL = 'D:/WorkBuddy/2026-11-08-21-28-36/docs/assets/_pal-carousel.png';
const SEQ = 'D:/WorkBuddy/2026-11-08-21-28-36/docs/assets/_seq.gif';

const FPS_SRC = 14;
const HOLD = 0.44, SLIDE = 0.28;
const W = 1156;              // 与素材原生 1:1，避免上采样糊边
const HOLD_DELAY = Math.round(HOLD * 1000);
const SLIDE_FRAMES = 6;      // 过渡帧密度：6 帧/0.28s ≈ 21fps 的观感
const SLIDE_DELAY = Math.round(SLIDE * 1000 / SLIDE_FRAMES);
const COLORS = 256;

const HOLD_FRAMES = Math.round(HOLD * FPS_SRC);
const STEP = Math.round((HOLD + SLIDE) * FPS_SRC);

const all = fs.readdirSync(DIR).filter(f => /^f\d{4}\.png$/.test(f)).sort();

// 素材帧 → 它对应的连续 off（与 gif-carousel.cjs 的 offAt 完全一致）
const EASE = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const STEP_SEC = HOLD + SLIDE;
const offOf = (frameIdx) => {
  const t = frameIdx / FPS_SRC;
  const k = Math.floor(t / STEP_SEC);
  const local = t - k * STEP_SEC;
  if (k >= 10) return 10;
  return local <= HOLD ? k : k + EASE((local - HOLD) / SLIDE);
};
const OFF = all.map((_, i) => offOf(i));
// 找 off 最接近目标的素材帧
const nearest = (target) => {
  let bi = 0, bd = 1e9;
  for (let i = 0; i < OFF.length; i++) {
    const d = Math.abs(OFF[i] - target);
    if (d < bd) { bd = d; bi = i; }
  }
  return all[bi];
};

const picks = [];
for (let k = 0; k < 10; k++) {
  picks.push({ f: nearest(k + 0.12), dur: HOLD_DELAY });            // 停留：略过起势瞬间
  for (let m = 1; m <= SLIDE_FRAMES; m++) {
    picks.push({ f: nearest(k + EASE(m / SLIDE_FRAMES)), dur: SLIDE_DELAY });
  }
}
// 末帧补一张 off=10（即第 1 张重新居中），让循环接缝与首帧完全重合
picks.push({ f: nearest(10), dur: SLIDE_DELAY });
console.log('frames=' + picks.length + ' total=' + (picks.reduce((s, x) => s + x.dur, 0) / 1000).toFixed(2) + 's');

fs.mkdirSync(TMP, { recursive: true });
for (const f of fs.readdirSync(TMP)) { try { fs.unlinkSync(path.join(TMP, f)); } catch (_) {} }
picks.forEach((p, i) => fs.copyFileSync(path.join(DIR, p.f), path.join(TMP, 'p' + String(i).padStart(4, '0') + '.png')));

// 调色板 + 序列（一次性 lanczos→area 统一缩放）
execFileSync('ffmpeg', ['-y', '-framerate', '1', '-i', path.join(TMP, 'p%04d.png'),
  '-vf', `scale=${W}:-1:flags=area,palettegen=max_colors=${COLORS}:stats_mode=full`,
  '-frames:v', '1', PAL], { stdio: 'ignore' });
execFileSync('ffmpeg', ['-y', '-framerate', '1', '-i', path.join(TMP, 'p%04d.png'), '-i', PAL,
  '-lavfi', `scale=${W}:-1:flags=area[x];[x][1:v]paletteuse=dither=none`,
  '-loop', '0', SEQ], { stdio: 'ignore' });

// PIL：先自行合并相邻相同帧（累加 delay），再只改 delay，避免 optimize 擅自抽帧
const py = `
import sys
from PIL import Image, ImageChops
seq, out, durs = sys.argv[1], sys.argv[2], [int(x) for x in sys.argv[3].split(',')]
im = Image.open(seq)
raw = []
try:
    while True:
        raw.append(im.copy()); im.seek(im.tell() + 1)
except EOFError:
    pass
assert len(raw) == len(durs), 'count %d != %d' % (len(raw), len(durs))

# 合并像素完全相同的相邻帧：保留前一帧，延迟相加
frames, delays = [], []
for fr, d in zip(raw, durs):
    if frames:
        prev = frames[-1]
        if prev.size == fr.size and ImageChops.difference(prev.convert('RGB'), fr.convert('RGB')).getbbox() is None:
            delays[-1] += d
            continue
    frames.append(fr); delays.append(d)

frames[0].save(out, save_all=True, append_images=frames[1:],
               duration=delays, loop=0, optimize=False, disposal=1)
print('raw=%d merged=%d total=%.2fs' % (len(raw), len(frames), sum(delays)/1000.0))
`;
const pypath = path.join(TMP, '_pack.py');
fs.writeFileSync(pypath, py);
console.log(execFileSync('python', [pypath, SEQ, OUT, picks.map(p => p.dur).join(',')], { encoding: 'utf8' }).trim());
console.log('OUT ' + ((fs.statSync(OUT).size / 1024) | 0) + ' KB');