// 产品介绍 GIF（CR-2026-11-18-06）：15 个亮点轮播
// 直接渲染精确目标帧 → 调色板 → 精确延迟打包，避开「录屏挑帧 + 延迟取整」两处误差。
//
// 与旧 demo-carousel.gif 的差异（都来自页面改版）：
//   · 卡片 664×680、16:10 取景改为 4:3 附近的竖向构图 → 取景按卡片实际长宽算，不写死比例
//   · 15 项，停留时长按「读一行标题 + 一行说明」定为 1.0s
//   · 过渡沿用页面实装的 .68s 节奏，但 GIF 抽 7 帧（≈97ms/帧）够顺而不臃肿
//   · 末帧直接覆盖为首帧文件，量化前就完全一致 → 循环无接缝
const { chromium } = require('playwright-core');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL = 'file:///D:/WorkBuddy/2026-11-08-21-28-36/docs/showcase/MDReader-功能展示.html';
const BASE = 'D:/WorkBuddy/2026-11-08-21-28-36/docs/assets';
const TMP = path.join(BASE, '_pick15');
const OUT = path.join(BASE, 'demo-carousel.gif');
const PAL = path.join(BASE, '_pal15.png');
const SEQ = path.join(BASE, '_seq15.gif');

// 时间轴全部取 10ms 的整数倍：GIF delay 粒度是 10ms，否则逐帧截断会累计漂移
// 体积由「帧间差异面积 × 帧数」决定，与分辨率非线性：先定节奏，再按体积回退画幅。
const env = (k, d) => (process.env[k] !== undefined ? +process.env[k] : d);
const HOLD_MS = env('HOLD', 900);        // 每张停留
const SLIDE_MS = env('SLIDE', 600);      // 过渡总时长
const SLIDE_FRAMES = env('SF', 6);       // 过渡帧数
const SLIDE_DELAY = SLIDE_MS / SLIDE_FRAMES;
const W = env('W', 860);                 // 输出宽度
const COLORS = env('COLORS', 170);

const EASE = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1 });
  await p.goto(URL);
  await p.waitForTimeout(2200);

  const n = await p.evaluate(() => {
    const deck = document.getElementById('deck');
    const cards = [...deck.children];
    const N = cards.length;
    cards.forEach(c => { c.style.transition = 'none'; });
    window.__frozen = true;

    /* 与页面 pose() 同构：按舞台宽算步进，避免两侧卡被切 */
    const stage = document.querySelector('.stage');
    const cw = cards[0].getBoundingClientRect().width;
    const halfW = stage.clientWidth / 2;
    const fit = (halfW - cw * .31 - 10) / 1.62;
    const stepBase = Math.max(120, Math.min(360, fit));

    const ANCHOR = [
      { x: 0, s: 1, o: 1, r: 0 },
      { x: 1, s: .81, o: .90, r: 24 },
      { x: 1.62, s: .62, o: .62, r: 30 },
      { x: 1.62 + 46 / stepBase, s: .45, o: 0, r: 30 },
      { x: 1.62 + 92 / stepBase, s: .40, o: 0, r: 30 }
    ];
    const lerp = (a, c, t) => a + (c - a) * t;
    const at = a => {
      if (a >= 4) return ANCHOR[4];
      const i = Math.min(3, Math.floor(a)), t = a - i;
      const A = ANCHOR[i], B = ANCHOR[i + 1];
      return { x: lerp(A.x, B.x, t), s: lerp(A.s, B.s, t), o: lerp(A.o, B.o, t), r: lerp(A.r, B.r, t) };
    };
    window.__render = (off) => {
      for (let i = 0; i < N; i++) {
        let d = ((i - off) % N + N) % N;
        if (d > N / 2) d -= N;
        const a = Math.abs(d), sgn = d === 0 ? 0 : Math.sign(d);
        const q = at(a), c = cards[i];
        c.style.transform = `translate3d(${sgn * q.x * stepBase}px,0,0) rotateY(${-sgn * q.r}deg) scale(${q.s})`;
        c.style.opacity = q.o.toFixed(3);
        c.style.zIndex = 100 - Math.round(a);
        c.style.visibility = a > 3.05 ? 'hidden' : 'visible';
        c.classList.toggle('active', a < 0.5);
      }
      // 索引条跟随高亮：GIF 里也能看出「第几项 / 共几项」
      const cur = ((Math.round(off) % N) + N) % N;
      document.querySelectorAll('.chip').forEach((c, i) => c.classList.toggle('on', i === cur));
      const hint = document.getElementById('hint');
      if (hint) hint.innerHTML = '<b>自动滚动中</b> · 第 ' + (cur + 1) + ' / ' + N + ' 张 · 点击左右两侧翻页';
    };
    return N;
  });
  console.log('cards=' + n);

  // 精确目标帧：每张 1 停留 + SLIDE_FRAMES 过渡帧；末尾补 off=n（视觉等于 off=0）
  const plan = [];
  for (let k = 0; k < n; k++) {
    plan.push({ off: k, dur: HOLD_MS });
    for (let m = 1; m <= SLIDE_FRAMES; m++) plan.push({ off: k + EASE(m / SLIDE_FRAMES), dur: SLIDE_DELAY });
  }
  plan.push({ off: n, dur: SLIDE_DELAY });
  console.log('frames=' + plan.length + ' total=' + (plan.reduce((s, x) => s + x.dur, 0) / 1000).toFixed(2) + 's');

  // 取景：先滚到轮播区，再按「中央卡 + 两侧露出」算框
  await p.evaluate(() => {
    const st = document.getElementById('stage');
    scrollTo(0, Math.max(0, st.getBoundingClientRect().top + scrollY - 70));
  });
  await p.waitForTimeout(320);
  const rect = await p.evaluate(() => {
    const st = document.getElementById('stage').getBoundingClientRect();
    const card = document.querySelector('.card').getBoundingClientRect();
    // 只框「中央卡 + 两侧各露出约三成」：左右各多 0.36 张卡宽足以看出层叠，
    // 再宽只会把边角卡片圈进来、白增帧间差异（GIF 体积主要来自这里）。
    const w = Math.min(Math.round(card.width * 1.72), Math.round(st.width) - 8);
    // 高度：卡片本身 + 下方留 26px（露出索引条上沿即可，不必框完整两行）
    const h = Math.round(card.height) + 26;
    const x = Math.max(0, Math.round(card.x + card.width / 2 - w / 2));
    const y = Math.max(0, Math.round(card.y) - 12);
    return { x, y, width: w, height: Math.min(h, window.innerHeight - y) };
  });
  console.log('clip=' + JSON.stringify(rect) + ' ratio=' + (rect.width / rect.height).toFixed(3));

  fs.mkdirSync(TMP, { recursive: true });
  for (const f of fs.readdirSync(TMP)) { try { fs.unlinkSync(path.join(TMP, f)); } catch (_) {} }

  for (let i = 0; i < plan.length; i++) {
    await p.evaluate(o => window.__render(o), plan[i].off);
    await p.screenshot({ path: path.join(TMP, 'p' + String(i).padStart(4, '0') + '.png'), clip: rect });
  }
  await b.close();
  console.log('rendered=' + plan.length);

  // 循环接缝：末帧 PNG 直接复制首帧，量化前就完全一致
  fs.copyFileSync(path.join(TMP, 'p0000.png'),
                  path.join(TMP, 'p' + String(plan.length - 1).padStart(4, '0') + '.png'));
  console.log('seam: last := first');

  // 调色板 + 量化
  execFileSync('ffmpeg', ['-y', '-framerate', '1', '-i', path.join(TMP, 'p%04d.png'),
    '-vf', `scale=${W}:-1:flags=area,palettegen=max_colors=${COLORS}:stats_mode=full`,
    '-frames:v', '1', PAL], { stdio: 'ignore' });
  execFileSync('ffmpeg', ['-y', '-framerate', '1', '-i', path.join(TMP, 'p%04d.png'), '-i', PAL,
    '-lavfi', `scale=${W}:-1:flags=area[x];[x][1:v]paletteuse=dither=none`,
    '-loop', '0', SEQ], { stdio: 'ignore' });

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
frames, delays = [], []
for fr, d in zip(raw, durs):
    if frames and ImageChops.difference(frames[-1].convert('RGB'), fr.convert('RGB')).getbbox() is None:
        delays[-1] += d
        continue
    frames.append(fr); delays.append(d)
frames[0].save(out, save_all=True, append_images=frames[1:],
               duration=delays, loop=0, optimize=True, disposal=1)
print('raw=%d packed=%d total=%.2fs' % (len(raw), len(frames), sum(delays)/1000.0))
`;
  const pypath = path.join(TMP, '_pack.py');
  fs.writeFileSync(pypath, py);
  console.log(execFileSync('python', [pypath, SEQ, OUT, plan.map(x => x.dur).join(',')], { encoding: 'utf8' }).trim());
  console.log('OUT ' + ((fs.statSync(OUT).size / 1024) | 0) + ' KB');
})();