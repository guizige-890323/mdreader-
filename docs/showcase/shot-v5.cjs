/* v5 校验：15 卡轮播 + 三条主线 + 索引条 + 无溢出 + 控制台零错误
   跑法：NODE_PATH=/d/WorkBuddy/2026-11-15-02-46-55/sci-hud/node_modules node shot-v5.cjs
*/
const { chromium } = require('playwright-core');
const path = require('path');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const FILE = 'file:///' + path.resolve(__dirname, 'MDReader-功能展示.html').replace(/\\/g, '/');

const CASES = [
  { name: '1440', w: 1440, h: 900 },
  { name: '1280', w: 1280, h: 800 },
];

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, args: ['--hide-scrollbars'] });
  const errs = [];
  for (const c of CASES) {
    const p = await b.newPage({ viewport: { width: c.w, height: c.h }, deviceScaleFactor: 1 });
    p.on('console', m => { if (m.type() === 'error') errs.push(c.name + ': ' + m.text()); });
    p.on('pageerror', e => errs.push(c.name + ' pageerror: ' + e.message));
    await p.goto(FILE);
    await p.waitForTimeout(2200);

    const geo = await p.evaluate(() => {
      const card = document.querySelector('.card');
      const img = card.querySelector('.card-media img');
      const media = card.querySelector('.card-media');
      const info = card.querySelector('.card-info');
      const cb = card.getBoundingClientRect();
      const ib = img.getBoundingClientRect();
      const mb = media.getBoundingClientRect();
      const nf = img.naturalWidth / img.naturalHeight;
      // 截图在可用框里的填充率：1.0 = 完全铺满，<0.9 说明白边过多
      const boxRatio = ib.width / ib.height;
      const fill = boxRatio > nf ? (nf / boxRatio) : (boxRatio / nf);
      return {
        cards: document.querySelectorAll('.card').length,
        chips: document.querySelectorAll('.chip').length,
        dots: document.querySelectorAll('.dot').length,
        cardW: Math.round(cb.width), cardH: Math.round(cb.height),
        mediaH: Math.round(mb.height),
        imgBoxRatio: +boxRatio.toFixed(3),
        naturalRatio: +nf.toFixed(3),
        fill: +fill.toFixed(3),
        infoH: Math.round(info.getBoundingClientRect().height),
        // 文案是否溢出卡片
        infoOverflow: info.scrollHeight - info.clientHeight,
        docOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        // 舞台是否裁到卡片：卡片上下边须落在舞台内
        cardInStage: (() => {
          const s = document.getElementById('stage').getBoundingClientRect();
          return cb.top >= s.top - 1 && cb.bottom <= s.bottom + 1;
        })(),
        // 索引条与卡片标题是否一一对应（用 span 取文本，避开序号数字）
        chipMatches: [...document.querySelectorAll('.chip span')]
          .every((sp, i) => sp.textContent === document.querySelectorAll('.card h2')[i].textContent),
      };
    });

    // 切到第 8 张，确认高亮联动
    await p.evaluate(() => document.querySelectorAll('.chip')[7].click());
    await p.waitForTimeout(900);
    const link = await p.evaluate(() => ({
      curNo: document.querySelector('.card.active .num').textContent,
      chipOn: [...document.querySelectorAll('.chip')].findIndex(d => d.classList.contains('on')),
      chipName: document.querySelector('.chip.on span').textContent,
    }));

    await p.evaluate(() => document.getElementById('showcase').scrollIntoView());
    await p.waitForTimeout(800);
    await p.screenshot({ path: path.resolve(__dirname, `_v5-stage-${c.name}.png`) });

    await p.evaluate(() => document.getElementById('tracks').scrollIntoView());
    await p.waitForTimeout(600);
    await p.screenshot({ path: path.resolve(__dirname, `_v5-tracks-${c.name}.png`) });

    await p.evaluate(() => window.scrollTo(0, 0));
    await p.waitForTimeout(500);
    await p.screenshot({ path: path.resolve(__dirname, `_v5-hero-${c.name}.png`) });

    console.log(`\n=== ${c.name} ===`);
    console.log(JSON.stringify(geo, null, 1));
    console.log('link:', JSON.stringify(link));
    await p.close();
  }
  console.log('\nerrors:', errs.length ? errs : 'none');
  await b.close();
})();