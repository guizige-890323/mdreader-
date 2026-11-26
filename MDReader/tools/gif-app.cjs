// 应用内 GIF：真实鼠标操作 —— 展开图表 → 逐个切换图表类型 → 换配色
// 两个关键事实（已实测）：
//   1) 必须用 mouse.click(x,y) 真实点击：tw-bar 用委托 onclick，el.click() 命中不到处理逻辑
//   2) chart-box 内有多个 svg（图标 18×18 + 图表 654×252），取景/校验要按宽度 >100 过滤
const { chromium } = require('playwright-core');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ROOT = path.resolve(__dirname, '..');
const F = ('file:///' + path.join(ROOT, 'dist', 'MDReader.html')).replace(/\\/g, '/');
const BASE = 'D:/WorkBuddy/2026-11-08-21-28-36/docs/assets';
const TMP = path.join(BASE, '_frames-app');
const OUT = path.join(BASE, 'demo-app.gif');
const PAL = path.join(BASE, '_pal-app.png');
const SEQ = path.join(BASE, '_seq-app.gif');

const VW = 1240, VH = 820;
const W = 1040, COLORS = 256;
const D = 100;  // 每帧 100ms = 10fps：与主 GIF 的慢节奏对齐，动作不赶
const TAB = 2;  // 第 3 张表（季度订单/收入/回款，纯数值）

(async () => {
  fs.mkdirSync(TMP, { recursive: true });
  for (const f of fs.readdirSync(TMP)) { try { fs.unlinkSync(path.join(TMP, f)); } catch (_) {} }

  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(F); await p.waitForTimeout(1500);

  await p.evaluate(() => document.getElementById('wDemo').click());
  await p.waitForTimeout(2500);

  // 起始统一为蓝色科技（默认可能是黑白极简，蓝色更抓眼，也与收尾的粉色形成对比）
  await p.evaluate(() => {
    document.querySelectorAll('.tt-btn[data-tt="tech"]').forEach(x => { if (!x.classList.contains('on')) x.click(); });
  });
  await p.waitForTimeout(800);
  await p.mouse.move(VW - 20, VH - 20);

  // 先把表格滚到视口中上部，再算取景
  const centerTable = async () => {
    await p.evaluate((i) => {
      const rd = document.getElementById('reader');
      const t = document.querySelectorAll('.tw')[i];
      if (rd && t) rd.scrollTop = t.getBoundingClientRect().top + rd.scrollTop - 96;
    }, TAB);
    await p.waitForTimeout(600);
    await p.mouse.move(VW - 20, VH - 20);
    await p.waitForTimeout(150);
  };
  await centerTable();

  let CLIP = { x: 0, y: 0, width: 10, height: 10 };   // 占位，展开后再定
  let clipLocked = false;

  let idx = 0;
  const grab = async (n = 1) => {
    for (let i = 0; i < n; i++) {
      await p.screenshot({ path: path.join(TMP, 'p' + String(idx++).padStart(4, '0') + '.png'), clip: CLIP });
    }
  };
  const clickEl = async (sel, arg) => {
    const pos = await p.evaluate(([sel, arg]) => {
      let el;
      if (arg !== undefined) {
        const tw = document.querySelectorAll('.tw')[arg];
        el = tw && tw.querySelector(sel);
      } else el = document.querySelector(sel);
      if (!el) return null;
      // 不滚动！取景与坐标都基于当前视口，滚动会让 CLIP 与点击点全部失配
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return null;
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, [sel, arg]);
    if (!pos) return false;
    await p.mouse.click(pos.x, pos.y);
    return true;
  };

  // —— 叙事顺序：先收起图表（露出表格原貌）→ 拍表格 → 展开 → 拍柱状图 → 切类型 → 换配色 ——
  // 1) 若当前已展开，先点一次收起，拿到「表格原貌」这个起点
  let wasOpen = await p.evaluate((i) => {
    return document.querySelectorAll('.tw')[i].querySelector('.chart-box').classList.contains('show');
  }, TAB);
  console.log('initially open=' + wasOpen);
  if (wasOpen) {
    await clickEl('button[data-act="chart"]', TAB);
    await p.waitForTimeout(500);
    await p.mouse.move(VW - 20, VH - 20);
  }

  // 2) 收起态下重定位 + 一次算定 CLIP（此刻表格最矮，图表区还没出现）
  await p.evaluate((i) => {
    const rd = document.getElementById('reader');
    const t = document.querySelectorAll('.tw')[i];
    if (rd && t) rd.scrollTop = t.getBoundingClientRect().top + rd.scrollTop - 110;
  }, TAB);
  await p.waitForTimeout(550);
  await p.mouse.move(VW - 20, VH - 20);

  // 固定画框：宽度按表格，高度固定 620（能容下展开后的图表高度 ~424+表头）
  CLIP = await p.evaluate((i) => {
    const t = document.querySelectorAll('.tw')[i];
    const r = t.getBoundingClientRect();
    const x = Math.max(0, Math.round(r.x) - 16);
    const y = Math.max(0, Math.round(r.y) - 12);
    const h = Math.min(620, window.innerHeight - y);
    return { x, y, width: Math.min(Math.round(r.width) + 32, window.innerWidth - x), height: h };
  }, TAB);
  clipLocked = true;
  console.log('clip=' + JSON.stringify(CLIP));

  // 3) 表格原貌 0.85s
  await grab(10);

  // 4) 真实点击展开 → 柱状图
  await clickEl('button[data-act="chart"]', TAB);
  await p.waitForTimeout(550);
  await p.mouse.move(VW - 20, VH - 20);
  const chk = await p.evaluate((i) => {
    const box = document.querySelectorAll('.tw')[i].querySelector('.chart-box');
    const big = [...box.querySelectorAll('svg')].find(s => s.getBoundingClientRect().width > 100);
    return { show: box.classList.contains('show'), ct: box.dataset.ct,
      w: big ? Math.round(big.getBoundingClientRect().width) : 0 };
  }, TAB);
  console.log('after expand ' + JSON.stringify(chk));
  await grab(14);   // 1.19s 看柱状图

  // 3) 逐类切换（折线 / 趋势 / 环形 / 玫瑰），每个 1.2s
  for (const ct of ['line', 'trend', 'pie', 'rose']) {
    const done = await clickEl('.chart-types button[data-ct="' + ct + '"]', TAB);
    await p.waitForTimeout(520);
    await p.mouse.move(VW - 20, VH - 20);
    await p.waitForTimeout(120);
    const st = await p.evaluate((i) => {
      const box = document.querySelectorAll('.tw')[i].querySelector('.chart-box');
      const big = [...box.querySelectorAll('svg')].find(s => s.getBoundingClientRect().width > 100);
      return { ct: box.dataset.ct, w: big ? Math.round(big.getBoundingClientRect().width) : 0,
        shapes: big ? big.querySelectorAll('rect,path,circle,ellipse,polygon,line,text').length : 0 };
    }, TAB);
    console.log('  switch ' + ct + ' ok=' + done + ' -> ' + JSON.stringify(st));
    await grab(14);
  }

  // 4) 换配色 蓝 → 粉：点「当前这张表」自己的 tw-bar 里的风格按钮（.tt-btn 每张表各有一份）
  const themed = await clickEl('.tw-bar .tt-btn[data-tt="cute"]', TAB);
  await p.waitForTimeout(800);
  await p.mouse.move(VW - 20, VH - 20);
  const themeChk = await p.evaluate((i) => {
    const tw = document.querySelectorAll('.tw')[i];
    const on = tw.querySelector('.tw-bar .tt-btn.on');
    return { on: on ? on.dataset.tt : null,
      docStyle: document.documentElement.dataset.docStyle };
  }, TAB);
  console.log('theme->cute ' + themed + ' ' + JSON.stringify(themeChk));
  await grab(16);   // 1.36s 收尾

  await b.close();
  console.log('frames=' + idx + ' errs=' + JSON.stringify(errs.slice(0, 3)));

  execFileSync('ffmpeg', ['-y', '-framerate', '1', '-i', path.join(TMP, 'p%04d.png'),
    '-vf', `scale=${W}:-1:flags=area,palettegen=max_colors=${COLORS}:stats_mode=full`,
    '-frames:v', '1', PAL], { stdio: 'ignore' });
  execFileSync('ffmpeg', ['-y', '-framerate', '1', '-i', path.join(TMP, 'p%04d.png'), '-i', PAL,
    '-lavfi', `scale=${W}:-1:flags=area[x];[x][1:v]paletteuse=dither=none`,
    '-loop', '0', SEQ], { stdio: 'ignore' });

  const py = `
import sys
from PIL import Image, ImageChops
seq, out, dur = sys.argv[1], sys.argv[2], int(sys.argv[3])
im = Image.open(seq)
raw = []
try:
    while True:
        raw.append(im.copy()); im.seek(im.tell() + 1)
except EOFError:
    pass
frames, delays = [], []
for fr in raw:
    if frames and ImageChops.difference(frames[-1].convert('RGB'), fr.convert('RGB')).getbbox() is None:
        delays[-1] += dur
        continue
    frames.append(fr); delays.append(dur)
frames[0].save(out, save_all=True, append_images=frames[1:],
               duration=delays, loop=0, optimize=False, disposal=1)
print('raw=%d packed=%d total=%.2fs' % (len(raw), len(frames), sum(delays)/1000.0))
`;
  const pypath = path.join(TMP, '_pack.py');
  fs.writeFileSync(pypath, py);
  console.log(execFileSync('python', [pypath, SEQ, OUT, String(D)], { encoding: 'utf8' }).trim());
  console.log('OUT ' + ((fs.statSync(OUT).size / 1024) | 0) + ' KB');
})().catch(e => { console.error('FATAL', e); process.exit(1); });