const { chromium } = require('playwright-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const F = 'file:///D:/WorkBuddy/2026-11-08-21-28-36/MDReader/dist/MDReader.html';
const probe = () => {
  const fr = document.getElementById('focusRender');
  if (!fr) return { missing: true };
  const rc = fr.getBoundingClientRect();
  const el = document.elementFromPoint(rc.left + 20, rc.top + 100);
  return {
    cls: fr.className, disp: getComputedStyle(fr).display,
    rect: [Math.round(rc.x), Math.round(rc.y), Math.round(rc.width), Math.round(rc.height)],
    hit: el ? (el.id || el.className || el.tagName) : 'NULL',
    app: document.getElementById('app').className,
    min: fr.classList.contains('fr-min'), open: fr.classList.contains('fr-open'),
  };
};
(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });

  // 路径1：欢迎页 Ctrl+O（无文档）
  let p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(F); await p.waitForTimeout(1400);
  await p.keyboard.press('Control+o'); await p.waitForTimeout(900);
  console.log('P1 Ctrl+O 欢迎页:', JSON.stringify(await p.evaluate(probe)));
  await p.close();

  // 路径2：点「专注阅读」功能卡（自动打开示例）
  p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(F); await p.waitForTimeout(1400);
  await p.evaluate(() => document.getElementById('wFocusCard').click());
  await p.waitForTimeout(2000);
  console.log('P2 功能卡:', JSON.stringify(await p.evaluate(probe)));
  await p.close();

  // 路径3：点过一次收起（frMin=1）后重载再进专注
  p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(F); await p.waitForTimeout(1400);
  await p.evaluate(() => localStorage.setItem('mdreader.frMin', '1'));
  await p.reload(); await p.waitForTimeout(1400);
  await p.evaluate(() => document.getElementById('app').classList.add('focus'));
  await p.waitForTimeout(700);
  console.log('P3 frMin=1:', JSON.stringify(await p.evaluate(probe)));
  console.log('   toggle rect:', JSON.stringify(await p.evaluate(() => {
    const t = document.getElementById('frToggle'); const r = t.getBoundingClientRect();
    return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
  })));
  await p.close();

  // 路径4：进出专注数次
  p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(F); await p.waitForTimeout(1400);
  await p.click('#wDemo'); await p.waitForTimeout(1200);
  for (let i = 0; i < 3; i++) {
    await p.click('#btnFocus'); await p.waitForTimeout(400);
    console.log('  cycle'+i+' in :', JSON.stringify(await p.evaluate(probe)));
    await p.click('#btnFocus'); await p.waitForTimeout(300);
  }
  await p.close();
  await b.close();
})();
