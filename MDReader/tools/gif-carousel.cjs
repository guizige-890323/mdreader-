// 主 GIF 一站式生成：直接渲染精确目标帧 → 调色板 → 精确延迟打包
// 不再从录制序列挑帧，彻底避免重复帧与延迟取整误差
const { chromium } = require('playwright-core');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL = 'file:///D:/WorkBuddy/2026-11-08-21-28-36/docs/showcase/MDReader-功能展示.html';
const BASE = 'D:/WorkBuddy/2026-11-08-21-28-36/docs/assets';
const TMP = path.join(BASE, '_pick');
const OUT = path.join(BASE, 'demo-carousel.gif');
const PAL = path.join(BASE, '_pal-carousel.png');
const SEQ = path.join(BASE, '_seq.gif');

// 秒表（全部为 10ms 整数倍，避开 GIF 延迟取整）
const HOLD_MS = 900;          // 每张停留：0.9s 才读得完标题+描述+对比
const SLIDE_MS = 400;         // 过渡：与页面 0.9s 过渡同调，但 GIF 略快以控体积
const SLIDE_FRAMES = 8;       // 过渡帧数 → 每帧 50ms
const SLIDE_DELAY = SLIDE_MS / SLIDE_FRAMES;   // 50
const W = 1120, COLORS = 192;

const EASE = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  // 舞台是 100vw（铺满视口），录制视口要够宽才能拍下两侧完整卡片
  const p = await b.newPage({ viewport: { width: 1480, height: 900 }, deviceScaleFactor: 1 });
  await p.goto(URL);
  await p.waitForTimeout(1800);

  const n = await p.evaluate(() => {
    const deck = document.getElementById('deck');
    const cards = [...deck.children];
    const N = cards.length;
    cards.forEach(c => { c.style.transition = 'none'; });
    window.__frozen = true;
    if (typeof timer !== 'undefined' && timer) { clearInterval(timer); timer = null; }

    const stage = document.querySelector('.stage');
    const stepBase = Math.min(360, Math.max(190, stage.clientWidth * 0.245));
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
      const cur = ((Math.round(off) % N) + N) % N;
      document.querySelectorAll('.dot').forEach((dt, i) => dt.classList.toggle('on', i === cur));
      const hint = document.getElementById('hint');
      if (hint) hint.innerHTML = '<b>自动滚动中</b> · 第 ' + (cur + 1) + ' / ' + N + ' 张';
    };
    return N;
  });

  // 精确目标帧：每张 1 停留 + SLIDE_FRAMES 过渡；最后一帧 off=N，与首帧同视位 → 循环无缝
  const plan = [];
  for (let k = 0; k < n; k++) {
    plan.push({ off: k, dur: HOLD_MS });
    for (let m = 1; m <= SLIDE_FRAMES; m++) {
      plan.push({ off: k + EASE(m / SLIDE_FRAMES), dur: SLIDE_DELAY });
    }
  }
  // 去掉与首帧重复的收尾帧，改用 0 延迟不可行 → 保留但只停留 1 帧时长的一半
  const tail = plan.pop();                       // off=n → 视觉等于 off=0
  plan.push({ off: n, dur: SLIDE_DELAY });
  console.log('frames=' + plan.length + ' total=' + (plan.reduce((s, x) => s + x.dur, 0) / 1000).toFixed(2) + 's');

  // 取景
  await p.evaluate(() => {
    const st = document.querySelector('.stage');
    scrollTo(0, Math.max(0, st.getBoundingClientRect().top + scrollY - 40));
  });
  await p.waitForTimeout(260);
  // 取景：舞台已铺满视口（1480×628，比例 2.36 太扁，卡片显矮）。
  // README 门面用 16:10 更舒服：横向收进中间 1000 宽（保留中心卡 + 两侧各一张完整可见），纵向给足舞台高度。
  const rect = await p.evaluate(() => {
    const r = document.querySelector('.stage').getBoundingClientRect();
    const ratio = 16 / 10;
    const h = Math.min(Math.round(r.height) + 28, window.innerHeight);
    const w = Math.min(Math.round(h * ratio), Math.round(r.width));
    const cx = r.x + r.width / 2;
    let x = Math.round(cx - w / 2);
    x = Math.max(0, Math.min(x, window.innerWidth - w));
    const y = Math.max(0, Math.round(r.y) - 14);
    return { x, y, width: w, height: Math.min(h, window.innerHeight - y) };
  });
  console.log('clip=' + JSON.stringify(rect));

  fs.mkdirSync(TMP, { recursive: true });
  for (const f of fs.readdirSync(TMP)) { try { fs.unlinkSync(path.join(TMP, f)); } catch (_) {} }

  for (let i = 0; i < plan.length; i++) {
    await p.evaluate(o => window.__render(o), plan[i].off);
    await p.screenshot({ path: path.join(TMP, 'p' + String(i).padStart(4, '0') + '.png'), clip: rect });
  }
  await b.close();
  console.log('rendered=' + plan.length);

  // 循环接缝：把末帧 PNG 直接覆盖为首帧文件，让「量化前」就完全一致（量化会引入 16 级内色差）
  {
    const pFirst = path.join(TMP, 'p' + String(0).padStart(4, '0') + '.png');
    const pLast = path.join(TMP, 'p' + String(plan.length - 1).padStart(4, '0') + '.png');
    fs.copyFileSync(pFirst, pLast);
    console.log('seam: last frame := first frame');
  }

  // 调色板（从全部帧采样）
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
               duration=delays, loop=0, optimize=False, disposal=1)
print('rendered=%d packed=%d total=%.2fs' % (len(raw), len(frames), sum(delays)/1000.0))
`;
  const pypath = path.join(TMP, '_pack.py');
  fs.writeFileSync(pypath, py);
  console.log(execFileSync('python', [pypath, SEQ, OUT, plan.map(p => p.dur).join(',')], { encoding: 'utf8' }).trim());
  console.log('OUT ' + ((fs.statSync(OUT).size / 1024) | 0) + ' KB');
})().catch(e => { console.error('FATAL', e); process.exit(1); });