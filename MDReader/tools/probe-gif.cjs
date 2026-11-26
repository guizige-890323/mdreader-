// GIF 体检：时长分布 / 停留与过渡节奏 / 循环接缝 / 帧间变化量
const { execFileSync } = require('child_process');
const fs = require('fs');

const GIF = 'D:/WorkBuddy/2026-11-08-21-28-36/docs/assets/demo-carousel.gif';
const py = `
import sys, json
from PIL import Image, ImageChops
g = sys.argv[1]
im = Image.open(g)
W, H = im.size
frames, delays = [], []
try:
    while True:
        frames.append(im.convert('RGB').copy()); delays.append(im.info.get('duration'))
        im.seek(im.tell() + 1)
except EOFError:
    pass
n = len(frames)
total = sum(delays) / 1000.0
# 帧间变化量（判断是否连续、有无跳帧）
chg = []
for i in range(1, n):
    d = ImageChops.difference(frames[i-1], frames[i]).convert('L').point(lambda v: 255 if v > 8 else 0)
    chg.append(round(100.0 * d.histogram()[255] / (W * H), 2))
# 循环接缝：末帧 → 首帧
d = ImageChops.difference(frames[-1], frames[0]).convert('L').point(lambda v: 255 if v > 8 else 0)
seam = round(100.0 * d.histogram()[255] / (W * H), 2)
# 停留帧（变化=0）
holds = [i+1 for i, c in enumerate(chg) if c == 0]
print(json.dumps({
  'size': [W, H], 'frames': n, 'total_sec': round(total, 2),
  'fps_equiv': round(n / total, 1),
  'delay_min': min(delays), 'delay_max': max(delays),
  'hold_count': len(holds),
  'chg_mean': round(sum(chg)/len(chg), 2), 'chg_max': max(chg),
  'seam_chg': seam,
  'long_delays_ok': all(d >= 300 for d in delays if d > 200),
}, ensure_ascii=False, indent=1))
`;
fs.writeFileSync('D:/WorkBuddy/2026-11-08-21-28-36/docs/assets/_probe_gif.py', py);
console.log(execFileSync('python', ['D:/WorkBuddy/2026-11-08-21-28-36/docs/assets/_probe_gif.py', GIF], { encoding: 'utf8' }).trim());
console.log('bytes=' + fs.statSync(GIF).size + '  (' + ((fs.statSync(GIF).size / 1024 / 1024).toFixed(2)) + ' MB)');