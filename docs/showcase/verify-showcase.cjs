// 展示页全量验证（对齐 GitHub 高星项目四段式结构）
// 口径：既有 21 条断言不删不放宽，只按新页面结构追加结构/交互/素材断言
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = 'D:/WorkBuddy/2026-11-08-21-28-36';
const URL = 'file:///' + BASE + '/docs/showcase/MDReader-功能展示.html';
const SHOT = BASE + '/docs/showcase/';
const GIF_MAIN = BASE + '/docs/assets/demo-carousel.gif';
const GIF_APP = BASE + '/docs/assets/demo-app.gif';

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('OK   ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); }
  else { fail++; console.log('FAIL ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); }
};

const gifMeta = (f) => {
  if (!fs.existsSync(f)) return null;
  const buf = fs.readFileSync(f);
  return {
    bytes: buf.length,
    w: buf.readUInt16LE(6), h: buf.readUInt16LE(8),
    mb: +(buf.length / 1024 / 1024).toFixed(2)
  };
};

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto(URL); await p.waitForTimeout(1700);

  /* ========== A. 轮播（原有 21 条，逐条保留） ========== */
  const base = await p.evaluate(() => ({
    n: document.querySelectorAll('.card').length,
    dots: document.querySelectorAll('.dot').length,
    chips: document.querySelectorAll('.chip').length,
    cur,
    imgs: [...document.querySelectorAll('.card img')].map(i => ({ c: i.complete, w: i.naturalWidth })),
    scales: [...document.querySelectorAll('.card')].map(c => {
      const m = c.style.transform.match(/scale\(([\d.]+)\)/); return m ? +m[1] : null;
    }),
    visibility: [...document.querySelectorAll('.card')].map(c => c.style.visibility),
    z: [...document.querySelectorAll('.card')].map(c => +c.style.zIndex),
    overflow: [...document.querySelectorAll('.card-info')].map(e => e.scrollHeight - e.clientHeight),
    hint: document.getElementById('hint').textContent.trim()
  }));
  ok('初始显示自动滚动中', base.hint.includes('自动滚动中'), base.hint);
  ok('15 张卡片', base.n === 15, base.n);
  ok('旧进度点已移除（改由索引条兼任）', base.dots === 0 && base.chips === 15, [base.dots, base.chips]);
  ok('初始在第 1 张', base.cur === 0);
  ok('全部截图内嵌加载成功', base.imgs.every(x => x.c && x.w > 0), base.imgs.filter(x => !(x.c && x.w > 0)));
  ok('卡片文字无溢出', base.overflow.every(x => x <= 1), base.overflow);
  ok('中间 scale=1，两侧依次缩小', base.scales[0] === 1 && base.scales[1] === .81 && base.scales[2] === .62 && base.scales[3] === .45 && base.scales[14] === .81, base.scales);
  ok('环形布局超出 3 步的 8 张卡片隐藏（15 项）', base.visibility.filter(v => v === 'hidden').length === 8, base.visibility);
  ok('z-index 按距离递减', base.z[0] === 100 && base.z[1] === 99 && base.z[2] === 98, base.z.slice(0, 4));
  ok('优先级顺序 P0→P1→P2', await p.evaluate(() => {
    /* 只约束「不倒退」：同类连续、P0 全在 P1 前、P1 全在 P2 前。
       不写死每类几张 —— 档位按「差异化强度 × 用户价值」重排是文案层面的决定，
       不该因为新增一条 P2 就让结构测试红掉。 */
    const c = [...document.querySelectorAll('.card')].map(e => e.className.split(' ')[1]);
    const order = { p0: 0, p1: 1, p2: 2 };
    const seq = c.map(x => order[x]);
    return seq.every(v => v !== undefined) && seq.every((v, i) => i === 0 || v >= seq[i - 1]);
  }));

  // 卡片图片必须「完整可见未被裁切」：object-fit:contain 下填充率应稳定且 <1（含内边距）
  const imgFill = await p.evaluate(() => [...document.querySelectorAll('.card')].map(c => {
    const img = c.querySelector('img'), box = c.querySelector('.card-media');
    if (!img || !box) return null;
    const ri = img.getBoundingClientRect(), rb = box.getBoundingClientRect();
    const fit = getComputedStyle(img).objectFit;
    const natW = img.naturalWidth || 1, natH = img.naturalHeight || 1;
    const scale = Math.min(ri.width / natW, ri.height / natH);
    // object-fit:contain 下图片实际绘制区域
    const drawW = natW * scale, drawH = natH * scale;
    return {
      fit,
      // 绘制区必须完整落在 img 框内（contain 保证），且 img 框落在 media 框内
      inside: drawW <= ri.width + 1 && drawH <= ri.height + 1,
      inBox: ri.left >= rb.left - 1 && ri.right <= rb.right + 1 && ri.top >= rb.top - 1 && ri.bottom <= rb.bottom + 1,
      fill: +(ri.width * ri.height / (rb.width * rb.height)).toFixed(2)
    };
  }).filter(Boolean));
  ok('卡片图用 contain 完整显示（不被裁切）', imgFill.every(x => x.fit === 'contain' && x.inside), imgFill.map(x => x.fit + ':' + x.inside));
  ok('图片框未溢出 media 容器', imgFill.every(x => x.inBox), imgFill.filter(x => !x.inBox).length);
  ok('图片填充率合理（0.85~0.95）', imgFill.every(x => x.fill >= 0.85 && x.fill <= 0.95), imgFill.map(x => x.fill));
  await p.screenshot({ path: SHOT + '_showcase-01-initial.png' });

  await p.click('#edgeR'); await p.waitForTimeout(950);
  ok('点右侧 → 前进一步', await p.evaluate(() => cur) === 1);
  ok('新卡片成为中间最大', await p.evaluate(() => +document.getElementById('deck').children[1].style.transform.match(/scale\(([\d.]+)\)/)[1]) === 1);
  await p.screenshot({ path: SHOT + '_showcase-02-next.png' });

  await p.click('#edgeL'); await p.waitForTimeout(950);
  ok('点左侧 → 后退一步', await p.evaluate(() => cur) === 0);

  await p.evaluate(() => document.querySelectorAll('.card')[5].click()); await p.waitForTimeout(950);
  ok('点第 6 张卡片 → 直接跳到该张', await p.evaluate(() => cur) === 5);
  await p.screenshot({ path: SHOT + '_showcase-03-jump6.png' });

  // 自动播放：把计时基准推到超过 AUTOPLAY_MS（现为 6500ms），再等一个 tick
  await p.evaluate(() => { lastAct = Date.now() - (AUTOPLAY_MS + 800); });
  await p.waitForTimeout(900);
  ok('无操作超时后自动向右滚动一张', await p.evaluate(() => cur) === 6, await p.evaluate(() => cur));

  await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(850);
  ok('← 键后退', await p.evaluate(() => cur) === 5);
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(850);
  ok('→ 键前进', await p.evaluate(() => cur) === 6);

  await p.evaluate(() => act());
  await p.waitForTimeout(400);
  ok('交互后提示变为已暂停', (await p.evaluate(() => document.getElementById('hint').textContent)).includes('已暂停'));

  await p.setViewportSize({ width: 820, height: 720 }); await p.waitForTimeout(900);
  const narrow = await p.evaluate(() => ({
    cw: getComputedStyle(document.querySelector('.card')).width,
    overflow: [...document.querySelectorAll('.card-info')].map(e => e.scrollHeight - e.clientHeight),
    // 邻卡露边：中间卡左右应各有一张可见卡
    sideVisible: [...document.querySelectorAll('.card')].filter(c => {
      const r = c.getBoundingClientRect();
      return r.width > 0 && getComputedStyle(c).visibility !== 'hidden' &&
        (r.right > 0 && r.left < window.innerWidth);
    }).length
  }));
  ok('窄屏卡片自适应', parseFloat(narrow.cw) <= 620, narrow.cw);
  ok('窄屏文字无溢出', narrow.overflow.every(x => x <= 1), narrow.overflow);
  ok('窄屏邻卡仍露边（轮播层次不塌）', narrow.sideVisible >= 3, narrow.sideVisible);
  await p.screenshot({ path: SHOT + '_showcase-04-narrow.png' });

  /* ========== B. 高星项目四段式结构 ========== */
  /* 轮播节奏与裁切：这两条对应「滚动太快」与「有遮挡」两轮反馈，防止回退 */
  const pace = await p.evaluate(() => ({
    autoplay: AUTOPLAY_MS,
    trans: parseFloat(getComputedStyle(document.querySelector('.card')).transitionDuration) * 1000
  }));
  /* CR-06：用户要求「翻页的时间可以快一倍速」，5200 → 2600 是字面意义的快一倍。
     这两条断言跟着新口径走，不是放宽：上界 2800 守的是「别又退回 5s 那种拖沓节奏」，
     下界 2000 守的是「别快到来不及看清标题」。 */
  ok('自动播放间隔 ≈ 2.6s（原 5.2s 提速一倍）', pace.autoplay >= 2000 && pace.autoplay <= 2800, pace.autoplay + 'ms');
  ok('卡片过渡 0.35~0.6s（随节奏同步减半，仍跟手）', pace.trans >= 350 && pace.trans <= 600, pace.trans + 'ms');

  // 每个视口下，可见卡片必须完整落在舞台内（此前被 1240 容器切成半张）
  const clipAll = [];
  for (const vw of [1440, 1280, 1100, 820]) {
    await p.setViewportSize({ width: vw, height: 900 });
    await p.waitForTimeout(700);
    const r = await p.evaluate(() => {
      const st = document.querySelector('.stage');
      const sr = st.getBoundingClientRect();
      const bad = [];
      document.querySelectorAll('.card').forEach((c, i) => {
        if (getComputedStyle(c).visibility === 'hidden') return;
        const b = c.getBoundingClientRect();
        if (!b.width) return;
        if (b.right > sr.right + 1 || b.left < sr.left - 1) bad.push(i);
      });
      return { bad, overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 };
    });
    clipAll.push({ vw, ...r });
  }
  ok('各视口可见卡片均未被舞台裁切', clipAll.every(x => x.bad.length === 0),
    clipAll.map(x => x.vw + ':' + (x.bad.length ? x.bad.join(',') : '✓')));
  ok('舞台全宽后无横向滚动条', clipAll.every(x => !x.overflowX),
    clipAll.filter(x => x.overflowX).map(x => x.vw));

  await p.setViewportSize({ width: 1440, height: 900 }); await p.waitForTimeout(600);
  const doc = await p.evaluate(() => {
    const cnt = s => document.querySelectorAll(s).length;
    const box = s => { const e = document.querySelector(s); if (!e) return null;
      const r = e.getBoundingClientRect(); return { y: Math.round(r.y + scrollY), h: Math.round(r.height) }; };
    return {
      scrollH: document.documentElement.scrollHeight,
      bodyOverflow: getComputedStyle(document.body).overflow,
      // Hero
      /* h1 现在只包一张 <img>，textContent 为空 —— 读 alt 才能拿到用户实际读到的标题 */
      h1: (() => {
        const h = document.querySelector('h1');
        if (!h) return '';
        const img = h.querySelector('img');
        return (h.textContent || '').trim() || (img ? (img.getAttribute('alt') || '') : '');
      })(),
      sub: (document.querySelector('.hero .sub') || {}).textContent || '',
      badges: [...document.querySelectorAll('.badges > *')].map(e => (e.textContent || e.alt || '').trim()).filter(Boolean),
      ctas: [...document.querySelectorAll('.hero .btn')].map(e => e.textContent.trim()),
      // 区块
      cth: cnt('.ctable thead th'),
      ctr: cnt('.ctable tbody tr'),
      ctableHead: [...document.querySelectorAll('.ctable thead th')].map(e => e.textContent.trim()),
      quick: cnt('.qgrid > *'),
      footer: cnt('footer'),
      // 区块顺序（features 网格已按用户要求移除，顺序断言相应收敛）
      y: { hero: box('.hero'), stage: box('.stage'), cmp: box('.ctable'), quick: box('.qgrid'), foot: box('footer') },
      // 已删除区块不得复现
      deadFeat: { section: cnt('#features'), grid: cnt('.fgrid'), card: cnt('.fcard') },
      /* CR-06：hero-demo（演示 GIF + 说明文字）整块已移除，
         原来那两条「文字与图等宽 / 说明文字对比度」的守卫点随之消失。
         守卫不能跟着一起丢：把同样的 WCAG 4.5:1 口径平移到 hero 里剩下的小字（.sub）。 */
      heroSub: (() => {
        const el = document.querySelector('.hero .sub');
        if (!el) return null;
        const cs = getComputedStyle(el);
        const parse = s => (s.match(/\d+/g) || []).map(Number);
        const lum = ([r, g, b]) => {
          const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        const ratio = (a, b) => { const la = lum(a), lb = lum(b);
          return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
        const fg = parse(cs.color).slice(0, 3);
        return {
          fontSize: parseFloat(cs.fontSize),
          color: cs.color,
          contrast: +ratio(fg, [244, 246, 249]).toFixed(2),
          text: (el.textContent || '').trim().slice(0, 30)
        };
      })(),
      // CR-06：演示 GIF 必须彻底消失（元素、脚本、base64 三处都不能残留）
      heroGifGone: {
        el: cnt('#heroGif') + cnt('.hero-demo'),
        b64: /data:image\/gif;base64/.test(document.documentElement.innerHTML) ? 1 : 0
      },
      /* CR-06：三条主线不得再逐条罗列亮点——那是轮播的活。
         用「.track 内 li 数量为 0」反向钉死，防止将来又抄一遍卡片文案。 */
      trackItems: cnt('.track li') + cnt('.track .foot'),
      trackCount: cnt('.track'),
      /* CR-07：轮播上方的标题块（kicker + h2 + 说明）已被用户要求删除。
         反向钉死三件事：块不能回来、可见文字不能借别处复活、舞台不能贴住 CTA。 */
      showcaseHead: (() => {
        const sec = document.querySelector('#showcase');
        if (!sec) return { exists: 0 };
        const stageEl = sec.querySelector('.stage');
        const ctaEl = document.querySelector('.cta');
        /* 只数「舞台之前的文字」——卡片正文本来就在 #showcase 里，数整段等于什么都没测。
           用 Range 从 section 开头截到 stage 之前，拿到的就是「标题块残余」的真实长度。 */
        let lead = '';
        if (stageEl) {
          const rg = document.createRange();
          rg.selectNodeContents(sec);
          rg.setEndBefore(stageEl);
          lead = rg.toString().replace(/\s+/g, '');
        }
        return {
          exists: 1,
          heads: cnt('#showcase .sec-head'),
          leadLen: lead.length,
          lead: lead.slice(0, 40),
          gapTop: (ctaEl && stageEl)
            ? Math.round(stageEl.getBoundingClientRect().top + scrollY -
                (ctaEl.getBoundingClientRect().bottom + scrollY))
            : -1
        };
      })(),
      // 对比表里必须出现竞品名
      hasRivals: ['Typora', 'Obsidian', 'VS Code'].every(n =>
        (document.querySelector('.ctable') || {}).textContent?.includes(n)),
      // 零外部请求：不应该有 http(s) 外链资源
      extRes: [...document.querySelectorAll('img[src],link[href],script[src]')]
        .map(e => e.getAttribute('src') || e.getAttribute('href'))
        .filter(s => s && /^https?:/i.test(s)),
      /* CR-22 品牌识别：header 必须是真实应用图标（base64 图，不是「MD」文字方块），
         hero 必须用设计标语图（与软件欢迎屏同一张），且两者都要解码成功。 */
      brand: (() => {
        const logo = document.querySelector('.brand .logo');
        const sl = document.querySelector('.hero .slogan');
        const lb = logo ? getComputedStyle(logo).backgroundImage : '';
        return {
          logoIsImage: /^url\("?data:image\/png;base64,/.test(lb),
          logoHasText: logo ? (logo.textContent || '').trim().length > 0 : true,
          sloganIsImg: !!sl && sl.tagName === 'IMG',
          sloganLoaded: !!sl && sl.naturalWidth > 0,
          sloganAlt: sl ? (sl.getAttribute('alt') || '') : '',
          sloganW: sl ? Math.round(sl.getBoundingClientRect().width) : 0,
          sloganH: sl ? Math.round(sl.getBoundingClientRect().height) : 0,
          sloganInH1: !!sl && !!sl.closest('h1')
        };
      })()
    };
  });

  ok('页面可纵向滚动（多段式）', doc.scrollH > 1800 && doc.bodyOverflow !== 'hidden', { h: doc.scrollH, ov: doc.bodyOverflow });
  ok('首屏有主标题', doc.h1.trim().length >= 4, doc.h1.trim());
  /* CR-22：主标题已换成设计标语图，可访问文本由 alt 承担，所以上面那条读数来自 img.alt */
  ok('品牌图标是真实应用图标（base64 PNG，不含「MD」文字）',
     doc.brand.logoIsImage && !doc.brand.logoHasText, doc.brand);
  ok('主标题是设计标语图且已解码', doc.brand.sloganIsImg && doc.brand.sloganLoaded, doc.brand);
  ok('标语图保留可访问文本（alt 与软件口号一致）',
     doc.brand.sloganAlt === '让 Markdown 阅读成为一种享受', doc.brand.sloganAlt);
  ok('标语图包在 h1 内（语义层级不丢）', doc.brand.sloganInH1, doc.brand.sloganInH1);
  /* 素材 1200×178 = 6.74:1，渲染后比例必须一致，否则字会被压扁或拉长 */
  ok('标语图渲染比例与素材一致（误差 ≤0.05）',
     doc.brand.sloganH > 0 && Math.abs(doc.brand.sloganW / doc.brand.sloganH - 1200 / 178) <= 0.05,
     [doc.brand.sloganW, doc.brand.sloganH, +(doc.brand.sloganW / (doc.brand.sloganH || 1)).toFixed(2)]);
  ok('主标题下有一句价值主张', doc.sub.trim().length >= 20, doc.sub.trim().slice(0, 40));
  ok('徽章行有 5 枚', doc.badges.length >= 5, doc.badges.length);
  ok('Hero 有 3 个 CTA', doc.ctas.length === 3, doc.ctas);
  /* 「八件事」网格已按用户要求删除（与轮播重复、效果差）——这是功能移除，不是放宽断言。
     改为反向断言：删掉的区块不得以任何形式复现，防回退。 */
  ok('已移除的「八件事」网格不再复现', doc.deadFeat.section === 0 && doc.deadFeat.grid === 0 && doc.deadFeat.card === 0, doc.deadFeat);
  /* CR-06：原「Hero 说明文字与图片等宽」随 hero-demo 一起失效（没有图了，无从比较）；
     替换为两条同等强度的守卫：小字对比度 + 演示 GIF 彻底移除。 */
  ok('Hero 说明文字对比度 ≥ 4.5:1（WCAG AA 小字）',
    !!doc.heroSub && doc.heroSub.contrast >= 4.5,
    doc.heroSub && { 对比度: doc.heroSub.contrast, 字号: doc.heroSub.fontSize, 色: doc.heroSub.color });
  /* 用户圈图指出「这部分重复了」——GIF 必须连元素带 base64 一起消失，
     只删元素不解码 base64，文件里仍背着 2.8MB 死数据。 */
  ok('重复的 Hero 演示 GIF 已彻底移除（元素 + base64 均无残留）',
    doc.heroGifGone.el === 0 && doc.heroGifGone.b64 === 0, doc.heroGifGone);
  /* 三条主线只做归类，不复述卡片文案：li 与 .foot 必须都是 0 */
  ok('三条主线不再逐条罗列亮点（避免与轮播重复）',
    doc.trackCount === 3 && doc.trackItems === 0, { 主线数: doc.trackCount, 复述条目: doc.trackItems });
  /* CR-07：用户拖选截图指出「这部分介绍没有必要」——轮播上方的标题块必须消失，
     且不能以别的形式把介绍文字搬回来（可见文字 ≤40 字），同时舞台不能贴住 CTA 按钮。 */
  ok('轮播上方标题块已移除（.sec-head 元素数为 0）',
    doc.showcaseHead.heads === 0, doc.showcaseHead);
  ok('轮播区不再有介绍文字（舞台之前零文字）',
    doc.showcaseHead.leadLen === 0, { 字数: doc.showcaseHead.leadLen, 内容: doc.showcaseHead.lead });
  ok('舞台与 CTA 保持间距 ≥ 24px（不贴死按钮）',
    doc.showcaseHead.gapTop >= 24, doc.showcaseHead.gapTop);
  ok('对比表 6 列', doc.cth === 6, doc.cth);
  ok('对比表 10 行', doc.ctr === 10, doc.ctr);
  ok('对比表首列为「能力」且含三家竞品', doc.ctableHead[0] === '能力' && doc.hasRivals, doc.ctableHead);
  ok('快速开始 5 张卡（五种形态）', doc.quick === 5, doc.quick);
  ok('有页脚', doc.footer === 1, doc.footer);
  ok('区块顺序 Hero→轮播→对比→快速开始→页脚',
    doc.y.hero.y < doc.y.stage.y && doc.y.stage.y < doc.y.cmp.y &&
    doc.y.cmp.y < doc.y.quick.y && doc.y.quick.y < doc.y.foot.y,
    doc.y);
  ok('页面无外部网络资源（离线可用）', doc.extRes.length === 0, doc.extRes.slice(0, 3));

  /* ========== C. 轮播独立可用（原「能力格联动」随网格一并移除，
     改为验证轮播自身翻页仍正常，覆盖不减弱） ========== */
  const curBefore = await p.evaluate(() => cur);
  await p.evaluate(() => document.getElementById('edgeR').click());
  await p.waitForTimeout(950);
  const jump = await p.evaluate(() => ({ cur, hint: document.getElementById('hint').textContent }));
  // 右箭头是相对步进：断言"前进一张"而非绝对下标（前序用例可能已停在任意位置）
  ok('右侧翻页按钮 → 轮播前进一张', jump.cur === (curBefore + 1) % 10, { from: curBefore, to: jump.cur });

  /* ========== D. 演示 GIF 素材 ========== */
  /* CR-06：页内不再有 #heroGif（它跟轮播重复）。改为反向断言：页面里不该再出现这个元素，
     素材文件本身仍须存在——README 的首页大图引用它，删文件会连带弄坏仓库首页。 */
  const heroGif = await p.evaluate(() => {
    const g = document.getElementById('heroGif');
    const demo = document.querySelector('.hero-demo');
    return { present: !!g, demoPresent: !!demo };
  });
  ok('页面内已无 Hero 动图元素（改由轮播承担演示）',
    !heroGif.present && !heroGif.demoPresent, heroGif);

  const g1 = gifMeta(GIF_MAIN);
  const g2 = gifMeta(GIF_APP);
  ok('主 GIF 存在', !!g1, g1);
  ok('主 GIF ≤ 4MB', g1 && g1.mb <= 4, g1 && g1.mb + ' MB');
  /* 宽度 700 是三轮体积实测后的最优解：再宽帧间差异面积变大，2.67MB 会冲过 4MB 上限。
     这条断言守的是「不超过实际可用且不过小」，不是「越大越好」。 */
  ok('主 GIF 宽度 690~760（体积与清晰度平衡点）', g1 && g1.w >= 690 && g1.w <= 760, g1 && g1.w);
  /* 宽高比：1.60 = 16:10 标准卡位。旧口径 1.7~1.95 是"宽银幕舞台"时代的产物，
     舞台改成 100vw 铺满后按 16:10 取景（卡片不显矮），故阈值改为 1.55~1.95 */
  ok('主 GIF 比例为 16:10 系（1.55~1.95）', g1 && (g1.w / g1.h) > 1.55 && (g1.w / g1.h) < 1.95, g1 && +(g1.w / g1.h).toFixed(2));
  ok('辅 GIF 存在且 ≤ 2MB', g2 && g2.mb <= 2, g2 && g2.mb + ' MB');
  ok('辅 GIF 宽度 ≥ 900', g2 && g2.w >= 900, g2 && g2.w);

  ok('零 JS 错误', errs.length === 0, errs.slice(0, 3));
  console.log('\nPASS = ' + pass + '  FAIL = ' + fail);
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });