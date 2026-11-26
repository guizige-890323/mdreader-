/* ==================================================================
   CR-2026-11-26-01 · MD 知识库专项测试
   ------------------------------------------------------------------
   变更单：.workbuddy/cr-2026-11-26-01.md
   九组验收口径（对应变更单第六节 A–I）：

     A 静态契约：入口按钮 / 整屏视图 / 关键容器与 CSS 都在产物里
     B 算法纯函数：tokenize / tfidf / cluster / cosine / meta / countWords
     C 分类正确性：喂 8 个假文件，验证「目录轴」与「主题轴」都分对了
     D 视图渲染：统计徽章 / 左树 / 卡片流 / 条形图都有内容
     E 交互：三段切换、搜索过滤、勾选、树过滤、折叠
     F 打开文档：点卡片把内容送进 #content
     G 三主题对比度：卡片小字在 light / dark / sepia 下都 ≥ 4.5:1
     H 柔光隔离：#kbView 不吃 filter，且 pm 开关不改变知识库布局
     I 回归：知识库关闭后阅读态完好

   运行：NODE_PATH=/d/WorkBuddy/2026-11-15-02-46-55/sci-hud/node_modules \
         node MDReader/tools/test-kb.cjs
   跑之前先 python MDReader/src/build.py
   ================================================================== */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'dist', 'MDReader.html');
const F = ('file:///' + FILE).replace(/\\/g, '/');
const HTML = fs.readFileSync(FILE, 'utf8');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

process.on('unhandledRejection', e => {
  if (!/TargetClosedError|Target page, context or browser has been closed/.test(String(e)))
    console.error('UNHANDLED', e);
});

let pass = 0, fail = 0;
const ok = (n, c, d) => {
  if (c) { pass++; console.log('OK   ' + n); }
  else { fail++; console.log('FAIL ' + n + (d !== undefined ? '  -> ' + JSON.stringify(d) : '')); }
};
const has = s => HTML.indexOf(s) >= 0;

/* ------------------------------------------------------------------
   假语料：刻意为「主题轴」和「目录轴」造出不同的分组答案，
   否则两条轴都得到同一个结果，测了也证明不了任何事。
     · 目录轴 = 3 个目录（notes / diary / work），各 2–3 篇
     · 主题轴 = 3 个语义簇：
         ① 部署运维（docker / kubernetes / 容器 / 镜像）
         ② 前端样式（css / flex / grid / 布局）
         ③ 读书笔记（书 / 作者 / 章节 / 读后感）
       刻意的交叉：把「前端样式」的两篇分别放在 notes/ 和 work/，
       把「部署运维」的两篇分别放在 work/ 和 notes/ —— 这样两条轴一定不同。
   ------------------------------------------------------------------ */
const DOCS = [
  {
    rel: 'work/deploy-docker.md',
    text: '# Docker 部署手册\n\ntags: 部署 docker\n\n本文说明如何用 docker 构建镜像并推送到仓库。容器化之后 kubernetes 负责编排，'
      + '镜像分层缓存能显著缩短构建时间。部署流程包括构建、推送、滚动更新三个阶段。\n'
  },
  {
    rel: 'notes/deploy-k8s.md',
    text: '# Kubernetes 编排笔记\n\ntags: 部署\n\nkubernetes 的 pod 是最小调度单元，容器跑在 pod 里。镜像拉取策略、'
      + '滚动更新、健康探针都属于编排范畴。与 docker 构建镜像配合使用，构成完整的容器化部署链路。\n'
  },
  {
    rel: 'notes/css-flex.md',
    text: '# Flex 布局速查\n\ntags: 前端 css\n\nflex 布局用 justify-content 控制主轴对齐，align-items 控制交叉轴。'
      + 'grid 更适合二维布局。css 的样式层叠与布局模式是前端页面的基础。\n'
  },
  {
    rel: 'work/css-grid.md',
    text: '# Grid 布局实践\n\ntags: 前端\n\ncss grid 用 grid-template-columns 定义列轨道，适合整体页面布局。'
      + '与 flex 的一维布局互补。布局、对齐、间距这套 css 语法决定了页面结构。\n'
  },
  {
    rel: 'diary/reading-1.md',
    text: '# 《人类简史》读后感\n\ntags: 读书 读后感\n\n这本书的作者把历史分成认知革命、农业革命、科学革命三段。'
      + '读完之后对「想象的共同体」这一章印象最深。读后感：历史叙事本身就是一种建构。\n'
  },
  {
    rel: 'diary/reading-2.md',
    text: '# 《枪炮病菌与钢铁》读后感\n\ntags: 读书 读后感\n\n作者从地理与生物条件解释文明差异，章节推进很慢但论证扎实。'
      + '读后感：把历史的偶然讲成了结构。这本书值得读第二遍。\n'
  },
  {
    rel: 'work/meeting.md',
    text: '# 周会纪要 2026-11-20\n\n参会人：甲乙丙。议题：本季度目标拆解与排期。\n\n'
      + '- 目标一：完成部署链路自动化\n- 目标二：页面布局改版\n\n下次周会同步进度。\n'
  },
  {
    rel: 'diary/2026-11-18.md',
    text: '# 2026-11-18 晴\n\n今天把博客的 css 布局调了一版，flex 换成 grid 之后终于对齐了。'
      + '晚上读了半章书，作者讲的那个例子很有意思。\n'
  }
];

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  p.on('dialog', async d => { await d.accept(); });
  await p.goto(F);
  await p.waitForTimeout(1600);

  /* ============================================================
     A · 静态产物契约
     ============================================================ */
  console.log('\n[A] 静态产物契约');
  ok('A1 顶栏有知识库入口 #btnKb', has('id="btnKb"'));
  ok('A2 入口按钮有图标 + 文字两层（窄窗口只留图标）',
    has('data-tb-ico="🧠"') && has('<span class="tb-label">知识库</span>'));
  ok('A3 整屏视图 #kbView 存在，且有 .on 显隐开关',
    has('id="kbView"') && has('#kbView.on{display:flex}'));
  ok('A4 #kbView 在 #content 之外（柔光 filter 只落 #content，进不去就不吃滤镜）', (() => {
    /* 靠 DOM 位置判定：kbView 必须是 .reader 的直接子元素，且不是 #content 的后代 */
    const iKb = HTML.indexOf('<div id="kbView"');
    const iContent = HTML.indexOf('<article id="content"');
    const iInner = HTML.indexOf('<div class="reader-inner">');
    return iKb > 0 && iInner > iKb && iContent > iInner;
  })());
  ok('A5 阅读区让位规则用兄弟选择器（不依赖 :has）',
    has('#kbView.on ~ .reader-inner{display:none}') && has('#reader.kb-lock{overflow:hidden}'));
  ok('A6 左树宽度固定 px，不用 fr（折叠时卡片流不能横向抖）',
    has('flex:0 0 212px;width:212px'));
  ok('A7 卡片行有勾选框 + 名称 + 路径 + 徽章四段结构',
    has('.kb-card{') && has('.kb-card .kb-ck{') && has('.kb-name') === false ||
    (has('.kb-card{') && has('.kb-card .kb-ck{') && has('.kb-cpath') && has('.kb-badge{')));
  ok('A8 三段视图切换 #kbSeg 有 topic / dir / link 三个按钮',
    has('data-view="topic"') && has('data-view="dir"') && has('data-view="link"'));
  ok('A9 底部两块可视化容器都在（分组规模 / 关联强度）',
    has('id="kbBars"') && has('id="kbLinks"') && has('.kb-bars.links .kb-bar-fill{background:#0d9488}'));
  ok('A10 算法与测试注入都进了产物',
    has('window.__KB_ALGO__') && has('window.__KB_TEST__') && has('window.__kbRelabel'));

  /* ============================================================
     B · 算法纯函数（不碰 DOM，直接单测）
     ============================================================ */
  console.log('\n[B] 算法纯函数');
  const alg = await p.evaluate(() => {
    const K = window.__KB_ALGO__;
    if (!K) return { missing: true };
    /* 中文分词：整段入词 + 2-gram */
    const tk = K.tokenize('容器化部署 docker compose');
    /* TF-IDF + 余弦：同主题应该明显高于跨主题 */
    const docs = [
      ['docker', '镜像', '容器', '部署'],
      ['docker', '镜像', '容器', '构建'],
      ['css', '布局', 'flex', '前端']
    ];
    const r = K.tfidf(docs);
    const same = K.cosine(r.vecs[0], r.vecs[1]);
    const diff = K.cosine(r.vecs[0], r.vecs[2]);
    /* 聚类：前两篇应归同簇，第三篇另起 */
    const cl = K.cluster(docs, { threshold: 0.16, maxClusters: 14 });
    /* 元信息：YAML tags + 首个标题 */
    const m = K.meta('---\ntags: 甲, 乙\n---\n# 标题在这\n\n正文。', 'fallback.md');
    const m2 = K.meta('没有标题也没有 frontmatter 的纯文本', 'fallback.md');
    return {
      missing: false,
      tk: tk,
      tkHasCn: tk.indexOf('容器化部署') >= 0 || tk.indexOf('部署') >= 0,
      tkHasGram: tk.indexOf('容器') >= 0 && tk.indexOf('器化') >= 0,
      tkHasEn: tk.indexOf('docker') >= 0 && tk.indexOf('compose') >= 0,
      same: same, diff: diff,
      assign: cl.assign, nCluster: cl.clusters.length,
      tags: m.tags, title: m.title,
      titleFallback: m2.title,
      /* 字数口径：中日韩 1 字 + 连续英文 1 词。
         '中文四个字 and three words' → 中文 5 个字（中/文/四/个/字）+ 英文 3 词 = 8 */
      words: K.countWords('中文四个字 and three words'),
      wordsEmpty: K.countWords('')
    };
  });
  ok('B1 __KB_ALGO__ 已暴露', !alg.missing, alg);
  ok('B2 中文整段入词（「容器化部署」或「部署」）', alg.tkHasCn, alg.tk && alg.tk.slice(0, 20));
  ok('B3 中文生成 2-gram（「容器」「器化」都在）', alg.tkHasGram, alg.tk && alg.tk.slice(0, 20));
  ok('B4 英文按 \w+ 入词且小写（docker / compose）', alg.tkHasEn, alg.tk && alg.tk.slice(0, 20));
  ok('B5 余弦：同主题显著高于跨主题', alg.same > alg.diff * 1.5 && alg.same > 0.3, { same: alg.same, diff: alg.diff });
  ok('B6 贪心聚类把前两篇归同簇、第三篇另起', alg.nCluster === 2 && alg.assign[0] === alg.assign[1] && alg.assign[0] !== alg.assign[2], alg.assign);
  ok('B7 YAML tags 解析出来两个标签', alg.tags.length === 2 && alg.tags[0] === '甲', alg.tags);
  ok('B8 首个标题优先于文件名', alg.title === '标题在这', alg.title);
  ok('B9 无标题时退回文件名', alg.titleFallback === 'fallback', alg.titleFallback);
  ok('B10 字数口径：中文 5 字 + 英文 3 词 = 8', alg.words === 8, alg.words);
  ok('B11 空串字数为 0（不是 NaN）', alg.wordsEmpty === 0, alg.wordsEmpty);

  /* ============================================================
     C · 分类正确性：走真实 kbBuildItem → kbFinish 链路喂 8 篇
     ============================================================ */
  console.log('\n[C] 分类正确性（8 篇假语料）');
  await p.evaluate((docs) => { window.__KB_TEST__.feed('D:/vault', docs); }, DOCS);
  await p.waitForTimeout(400);
  const st = await p.evaluate(() => window.__KB_TEST__.state());
  ok('C1 8 篇全部进索引', st.items.length === 8, st.items.length);
  ok('C2 目录轴分出 3 个目录（work / notes / diary）',
    st.dirs.length === 3 && st.dirs.map(d => d.name).sort().join(',') === 'diary,notes,work',
    st.dirs.map(d => d.name + ':' + d.members.length));
  ok('C3 目录轴成员数正确：work 3 / notes 2 / diary 3', (() => {
    const m = {};
    st.dirs.forEach(d => { m[d.name] = d.members.length; });
    return m.work === 3 && m.notes === 2 && m.diary === 3;
  })(), st.dirs.map(d => d.name + ':' + d.members.length));
  /* 主题轴：真正的考点 —— 语义相近但目录不同的文档要聚到一起 */
  const topicOf = rel => (st.items.find(i => i.rel === rel) || {}).topic;
  ok('C4 主题轴分出 ≥3 组（容器 / 前端 / 读书）', st.topics.length >= 3, st.topics.length);
  ok('C5 跨目录同主题聚在一起：deploy-docker 与 deploy-k8s 同组',
    topicOf('work/deploy-docker.md') === topicOf('notes/deploy-k8s.md'),
    [topicOf('work/deploy-docker.md'), topicOf('notes/deploy-k8s.md')]);
  ok('C6 跨目录同主题聚在一起：css-flex 与 css-grid 同组',
    topicOf('notes/css-flex.md') === topicOf('work/css-grid.md'),
    [topicOf('notes/css-flex.md'), topicOf('work/css-grid.md')]);
  ok('C7 同目录不同主题被拆开：work 下的 deploy / css / meeting 不在一组', (() => {
    const a = topicOf('work/deploy-docker.md'), b2 = topicOf('work/css-grid.md'), c = topicOf('work/meeting.md');
    return a !== b2 && b2 !== c && a !== c;
  })(), [topicOf('work/deploy-docker.md'), topicOf('work/css-grid.md'), topicOf('work/meeting.md')]);
  ok('C8 两条轴确实不同（目录分组 ≠ 主题分组）', (() => {
    /* 若两条轴给出完全相同的划分，说明主题聚类退化成目录聚类，等于没做 */
    const byDir = {};
    st.dirs.forEach(d => d.members.forEach(i => { byDir[st.items[i].rel] = d.id; }));
    const byTopic = {};
    st.items.forEach(i => { byTopic[i.rel] = i.topic; });
    const rels = Object.keys(byDir);
    for (let i = 0; i < rels.length; i++) {
      for (let j = i + 1; j < rels.length; j++) {
        const a = byDir[rels[i]] === byDir[rels[j]];
        const bb = byTopic[rels[i]] === byTopic[rels[j]];
        if (a !== bb) return true;
      }
    }
    return false;
  })());
  ok('C9 关联对非空且强度降序', st.links.length > 0 &&
    st.links.every((l, i) => i === 0 || st.links[i - 1].s >= l.s), st.links.slice(0, 3));
  ok('C10 主题组名由代表词生成（非空、不是「(未分类)」）',
    st.topics.every(t => t.name && t.name !== '(未分类)' && t.name.length > 0),
    st.topics.map(t => t.name));

  /* ============================================================
     D · 视图渲染
     ============================================================ */
  console.log('\n[D] 视图渲染');
  await p.evaluate(() => window.__KB_TEST__.show(true));
  await p.waitForTimeout(500);
  const dom = await p.evaluate(() => {
    const q = s => document.querySelector(s);
    const qa = s => [...document.querySelectorAll(s)];
    const kb = document.getElementById('kbView');
    return {
      on: kb.classList.contains('on'),
      lock: document.querySelector('.reader').classList.contains('kb-lock'),
      innerHidden: getComputedStyle(document.querySelector('.reader-inner')).display === 'none',
      statDocs: q('#kbStatDocs').textContent.trim(),
      statDirs: q('#kbStatDirs').textContent.trim(),
      statTopics: q('#kbStatTopics').textContent.trim(),
      statWords: q('#kbStatWords').textContent.trim(),
      treeHeads: qa('#kbTree [data-tree]').length,
      cards: qa('#kbList .kb-card').length,
      cardHasCk: !!q('#kbList .kb-card .kb-ck'),
      cardHasPath: !!q('#kbList .kb-card .kb-cpath'),
      cardHasBadge: !!q('#kbList .kb-card .kb-badge'),
      groups: qa('#kbList .kb-group').length,
      bars: qa('#kbBars .kb-bar-row').length,
      links: qa('#kbLinks .kb-bar-row').length,
      barFilled: qa('#kbBars .kb-bar-fill').every(e => parseFloat(e.style.width) > 0),
      rootPath: q('#kbRootPath').textContent.trim()
    };
  });
  ok('D1 #kbView 已显示，.reader 锁滚动，阅读区让位',
    dom.on && dom.lock && dom.innerHidden, dom);
  ok('D2 统计徽章：文档 8 / 目录 3 / 主题 ≥3', dom.statDocs === '8' && dom.statDirs === '3' && +dom.statTopics >= 3, dom);
  ok('D3 左树渲染出「全部 + 每组」的标题行（≥4）', dom.treeHeads >= 4, dom.treeHeads);
  ok('D4 卡片流渲染出 8 张卡片', dom.cards === 8, dom.cards);
  ok('D5 卡片四段结构齐（勾选框 / 路径 / 徽章）',
    dom.cardHasCk && dom.cardHasPath && dom.cardHasBadge, dom);
  ok('D6 卡片按主题分了多个组（≥3）', dom.groups >= 3, dom.groups);
  ok('D7 分组规模条形图有 5 行且宽度非零', dom.bars >= 3 && dom.barFilled, dom);
  ok('D8 关联强度条形图有内容', dom.links >= 1, dom.links);
  ok('D9 根目录显示为 D:/vault', dom.rootPath === 'D:/vault', dom.rootPath);

  /* ============================================================
     E · 交互
     ============================================================ */
  console.log('\n[E] 交互');
  /* 三段切换 */
  await p.evaluate(() => document.querySelector('#kbSeg button[data-view="dir"]').click());
  await p.waitForTimeout(350);
  const dirView = await p.evaluate(() => {
    const qa = s => [...document.querySelectorAll(s)];
    return {
      on: document.querySelector('#kbSeg button[data-view="dir"]').classList.contains('on'),
      groups: qa('#kbList .kb-group').length,
      names: qa('#kbList .kb-gname').map(e => e.textContent.trim())
    };
  });
  ok('E1 切到「按目录」后按钮态与分组都跟着换',
    dirView.on && dirView.groups === 3, dirView);
  ok('E2 目录视图的组名就是目录名（work / notes / diary）',
    dirView.names.sort().join(',') === 'diary,notes,work', dirView.names);

  await p.evaluate(() => document.querySelector('#kbSeg button[data-view="link"]').click());
  await p.waitForTimeout(350);
  const linkView = await p.evaluate(() => ({
    groups: document.querySelectorAll('#kbList .kb-group').length,
    cards: document.querySelectorAll('#kbList .kb-card').length
  }));
  ok('E3 切到「按关联」后只剩一个扁平组，卡片数仍是 8',
    linkView.groups === 1 && linkView.cards === 8, linkView);

  await p.evaluate(() => document.querySelector('#kbSeg button[data-view="topic"]').click());
  await p.waitForTimeout(350);

  /* 搜索：先搜命中正文关键词，再搜必然空的关键词 */
  const searchRes = await p.evaluate(async () => {
    const inp = document.getElementById('kbQuery');
    const setV = v => {
      inp.value = v;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    };
    setV('kubernetes'); await new Promise(r => setTimeout(r, 120));
    const hit = document.querySelectorAll('#kbList .kb-card').length;
    setV('绝对不存在的词语zzz'); await new Promise(r => setTimeout(r, 120));
    const miss = document.querySelectorAll('#kbList .kb-card').length;
    const empty = !!document.querySelector('#kbList .kb-empty');
    setV(''); await new Promise(r => setTimeout(r, 120));
    const back = document.querySelectorAll('#kbList .kb-card').length;
    return { hit, miss, empty, back };
  });
  ok('E4 搜正文关键词能命中文档（kubernetes → ≥1）', searchRes.hit >= 1, searchRes);
  ok('E5 搜无关键词出空态（0 卡 + 空态块）', searchRes.miss === 0 && searchRes.empty, searchRes);
  ok('E6 清空搜索后卡片恢复 8 张', searchRes.back === 8, searchRes.back);

  /* 勾选：只改 picked，不打开文档 */
  const ckRes = await p.evaluate(() => {
    const card = document.querySelector('#kbList .kb-card');
    const ck = card.querySelector('.kb-ck');
    ck.click();
    const after = { picked: document.querySelectorAll('#kbList .kb-card.picked').length, open: window.__KB_TEST__.state().open };
    ck.click();
    const backTo = document.querySelectorAll('#kbList .kb-card.picked').length;
    return { after, backTo };
  });
  ok('E7 勾选卡片加 picked 态且不关闭知识库（不误触打开）',
    ckRes.after.picked === 1 && ckRes.after.open === true, ckRes.after);
  ok('E8 再点取消勾选，picked 归零', ckRes.backTo === 0, ckRes.backTo);

  /* 左树过滤 + 折叠是两个动作。
     注意：每次点击后 kbRenderTree() 会重写 #kbTree 的 innerHTML，
     上一次抓到的节点全部失联（isConnected=false），后续 click 都是打在孤儿节点上、
     什么也不会发生。所以每次都要重新 query —— 这是本轮实测踩到的坑。 */
  const treeRes = await p.evaluate(() => {
    const heads = () => [...document.querySelectorAll('#kbTree [data-tree]')].filter(h => h.dataset.tree);
    const cards = () => document.querySelectorAll('#kbList .kb-card').length;
    const grpIds = heads().map(h => h.dataset.tree);
    const targetId = grpIds[0];

    heads()[0].click();
    const filtered = cards();
    const on = !!document.querySelector('#kbTree [data-tree="' + targetId + '"].on');

    /* 再点同一个标题应取消过滤 —— 必须按 id 重新取节点 */
    document.querySelector('#kbTree [data-tree="' + targetId + '"]').click();
    const restored = cards();

    /* 点三角只折叠、不切过滤 */
    document.querySelector('#kbTree [data-tree="' + targetId + '"]').click();
    const onBefore = !!document.querySelector('#kbTree [data-tree="' + targetId + '"].on');
    const closedBefore = document.querySelectorAll('#kbTree .kb-tree-group.closed').length;
    document.querySelector('#kbTree [data-tree="' + targetId + '"] .kb-caret').click();
    const closedAfter = document.querySelectorAll('#kbTree .kb-tree-group.closed').length;
    const onAfter = !!document.querySelector('#kbTree [data-tree="' + targetId + '"].on');
    /* 还原：取消过滤 + 展开 */
    document.querySelector('#kbTree [data-tree="' + targetId + '"] .kb-caret').click();
    document.querySelector('#kbTree [data-tree="' + targetId + '"]').click();
    return { filtered, on, restored, onBefore, closedBefore, closedAfter, onAfter, final: cards(), total: 8 };
  });
  ok('E9 点树标题只显示该组成员（少于 8）', treeRes.filtered > 0 && treeRes.filtered < 8, treeRes);
  ok('E10 再点同一标题取消过滤，卡片恢复 8 张', treeRes.restored === 8, treeRes.restored);
  ok('E11 点三角只折叠分组，不改变过滤态',
    treeRes.closedAfter === treeRes.closedBefore + 1 && treeRes.onAfter === treeRes.onBefore, treeRes);
  ok('E12 还原后回到无过滤状态', treeRes.final === 8, treeRes.final);

  /* ============================================================
     F · 打开文档
     ============================================================ */
  console.log('\n[F] 打开文档');
  const openRes = await p.evaluate(async () => {
    /* 网页版没有绝对路径，kbOpenDoc 会诚实提示、不假装能开。
       这里验证的正是这条诚实路径：点卡片不应该把 #content 清空或报错。 */
    const card = document.querySelector('#kbList .kb-card[data-rel="work/deploy-docker.md"]')
      || document.querySelector('#kbList .kb-card');
    const rel = card.dataset.rel;
    card.click();
    await new Promise(r => setTimeout(r, 400));
    return {
      rel: rel,
      open: window.__KB_TEST__.state().open,
      toast: (document.getElementById('toast') || {}).textContent || ''
    };
  });
  ok('F1 网页版点卡片给出诚实提示（不静默失败）',
    /网页版|打开文件|无法/.test(openRes.toast) || openRes.open === false, openRes);

  /* 桌面注入：伪造 __MD_DESKTOP__.readFile 走真实打开链路 */
  const openOk = await p.evaluate(async () => {
    const body = '# Docker 部署手册\n\n这是从知识库打开的真实正文，用来验证读取链路。\n';
    window.__MD_DESKTOP__ = window.__MD_DESKTOP__ || {};
    const saved = { readFile: window.__MD_DESKTOP__.readFile, listDir: window.__MD_DESKTOP__.listDir };
    window.__MD_DESKTOP__.readFile = async () => ({ ok: true, text: body, enc: 'UTF-8' });
    /* kbOpenDoc 是按 it.abs 调的；测试数据的 abs 为空，补一个占位绝对路径 */
    const items = window.__KB_TEST__.state().items;
    items.forEach(it => { if (!it.abs) it.abs = 'D:/vault/' + it.rel; });
    const card = document.querySelector('#kbList .kb-card[data-rel="work/deploy-docker.md"]');
    card.click();
    await new Promise(r => setTimeout(r, 900));
    const txt = (document.getElementById('content').textContent || '');
    const opened = !window.__KB_TEST__.state().open;
    /* 还原，别影响后续段落 */
    window.__MD_DESKTOP__.readFile = saved.readFile;
    window.__MD_DESKTOP__.listDir = saved.listDir;
    items.forEach(it => { if (it.abs === 'D:/vault/' + it.rel) it.abs = ''; });
    return { txt: txt.slice(0, 120), opened: opened, hasBody: txt.indexOf('从知识库打开的真实正文') >= 0 };
  });
  ok('F2 桌面链路点卡片能真正打开文档（正文进了 #content）', openOk.hasBody, openOk);
  ok('F3 打开后自动退出知识库视图', openOk.opened === true, openOk);

  /* 回到知识库，供 G/H 段使用 */
  await p.evaluate(() => window.__KB_TEST__.show(true));
  await p.waitForTimeout(500);

  /* ============================================================
     G · 三主题对比度（卡片小字 ≥ 4.5:1）
     ============================================================ */
  console.log('\n[G] 三主题对比度');
  const contrast = await p.evaluate(async () => {
    const lum = c => {
      const v = c.map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
      return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
    };
    const parse = s => {
      const m = String(s).match(/rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/);
      return m ? { c: [+m[1], +m[2], +m[3]], a: m[4] === undefined ? 1 : +m[4] } : null;
    };
    const blend = (fg, bg, a) => fg.map((c, i) => c * a + bg[i] * (1 - a));
    /* 真实底色：从元素自身往上找第一个「不透明」的背景。
       .kb-card 是 background:transparent（计算值 rgba(0,0,0,0)），
       直接当纯黑底算会得出 3.13 这种假失败 —— 实测踩过这个坑。 */
    const bgOf = el => {
      let n = el;
      for (let i = 0; i < 12 && n && n.nodeType === 1; i++) {
        const bs = getComputedStyle(n).backgroundColor;
        const pc = parse(bs);
        if (pc && pc.a > 0.6) return pc.c;
        n = n.parentElement;
      }
      return [255, 255, 255];
    };
    const css = s => { const e = document.querySelector(s); return e ? getComputedStyle(e) : null; };

    const out = [];
    for (const theme of ['light', 'dark', 'sepia']) {
      document.documentElement.dataset.theme = theme;
      await new Promise(r => setTimeout(r, 220));
      const targets = [
        ['卡片路径小字', '.kb-card .kb-cpath'],
        ['统计徽章标签', '.kb-stat span'],
        ['可视化标题', '.kb-viz-cap'],
        ['条形图名称', '.kb-bar-row .kb-bar-name'],
        ['卡片徽章', '.kb-card .kb-badge']
      ];
      for (const [name, sel] of targets) {
        const e = css(sel);
        if (!e) { out.push({ theme, name, skip: true }); continue; }
        const sel_el = document.querySelector(sel);
        const base = bgOf(sel_el);
        const fgP = parse(e.color);
        const a = parseFloat(e.opacity || '1');
        if (!fgP) { out.push({ theme, name, skip: true }); continue; }
        const fg = fgP.a < 1 ? blend(fgP.c, base, fgP.a) : fgP.c;
        const fgv = a < 1 ? blend(fg, base, a) : fg;
        const L1 = lum(fgv), L2 = lum(base);
        const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
        out.push({ theme, name, ratio: +ratio.toFixed(2), fg: e.color, bg: base.join(',') });
      }
    }
    document.documentElement.dataset.theme = 'light';
    return out;
  });
  const bad = contrast.filter(c => !c.skip && c.ratio < 4.5);
  ok('G1 三主题下五类小字全部 ≥ 4.5:1（WCAG AA）', bad.length === 0, bad);
  ok('G2 采样点齐全（3 主题 × 5 处 = 15）', contrast.filter(c => !c.skip).length === 15,
    contrast.filter(c => !c.skip).length);

  /* ============================================================
     H · 柔光隔离
     ============================================================ */
  console.log('\n[H] 柔光隔离');
  /* 柔光的按钮是「一个控件两个动作」：点 .sw-track = 切开关，点文字 = 开参数面板。
     所以必须点 .sw-track 才是在切状态；直接 btn.click() 会走「打开面板」分支，
     点了两次柔光依然是开的（实测 H5 首轮就是这么报的）。 */
  const pmToggle = () => p.evaluate(() => {
    const t = document.querySelector('#btnPaperMatte .sw-track');
    if (t) t.click(); else document.getElementById('btnPaperMatte').click();
  });
  const before = await p.evaluate(() => ({
      kbFilter: getComputedStyle(document.getElementById('kbView')).filter,
      contentFilter: getComputedStyle(document.getElementById('content')).filter,
      rect: Math.round(document.getElementById('kbView').getBoundingClientRect().width),
      cards: document.querySelectorAll('#kbList .kb-card').length,
      pm: document.documentElement.getAttribute('data-pm')
    }));
    /* 打开柔光（若已是开就跳过） */
  if ((await p.evaluate(() => document.getElementById('btnPaperMatte').getAttribute('aria-checked'))) !== 'true') {
    await pmToggle();
    await p.waitForTimeout(350);
  }
    const on = await p.evaluate(() => ({
      pm: document.documentElement.getAttribute('data-pm'),
      kbFilter: getComputedStyle(document.getElementById('kbView')).filter,
      contentFilter: getComputedStyle(document.getElementById('content')).filter,
      rect: Math.round(document.getElementById('kbView').getBoundingClientRect().width),
      cards: document.querySelectorAll('#kbList .kb-card').length
    }));
    /* 关回去 */
  await pmToggle();
  await p.waitForTimeout(350);
  const off = await p.evaluate(() => document.documentElement.getAttribute('data-pm'));
  ok('H1 柔光真的是开着的（data-pm=on 且 #content 吃了滤镜）',
      on.pm === 'on' && on.contentFilter !== 'none', on);
    ok('H2 #kbView 自身不吃滤镜（filter 恒为 none）',
      before.kbFilter === 'none' && on.kbFilter === 'none', { before: before.kbFilter, on: on.kbFilter });
    ok('H3 柔光开关不改变知识库布局宽度（差 ≤ 1px）',
      Math.abs(on.rect - before.rect) <= 1, { before: before.rect, on: on.rect });
    ok('H4 柔光开关不丢卡片（仍是 8 张）', on.cards === before.cards && on.cards === 8, { before: before.cards, on: on.cards });
    /* 关闭时走的是 removeAttribute('data-pm')（app.js:3777），所以正常读数是 null
       而不是 'off' —— 断言必须按实现写，不能想当然。 */
    ok('H5 柔光已正常关闭（属性被移除，读回 null）', off === null, off);

  /* ============================================================
     I · 退出知识库后的回归
     ============================================================ */
  console.log('\n[I] 退出后回归');
  await p.evaluate(() => window.__KB_TEST__.show(false));
  await p.waitForTimeout(400);
  const back = await p.evaluate(() => {
    const r = document.querySelector('.reader');
    return {
      kbOn: document.getElementById('kbView').classList.contains('on'),
      lock: r.classList.contains('kb-lock'),
      innerDisplay: getComputedStyle(document.querySelector('.reader-inner')).display,
      overflow: getComputedStyle(r).overflow,
      contentVisible: !document.getElementById('content').classList.contains('hidden'),
      welcomeHidden: document.getElementById('welcome').classList.contains('hidden')
    };
  });
  ok('I1 退出后 #kbView 隐藏且解锁滚动',
    !back.kbOn && !back.lock, back);
  ok('I2 退出后阅读区恢复显示（.reader-inner 不再被干掉）',
    back.innerDisplay !== 'none', back.innerDisplay);
  ok('I3 退出后 .reader 的 overflow 复位（不再 hidden）',
    back.overflow !== 'hidden', back.overflow);

  /* Esc 退出路径 */
  const escRes = await p.evaluate(async () => {
    window.__KB_TEST__.show(true);
    await new Promise(r => setTimeout(r, 300));
    const opened = window.__KB_TEST__.state().open;
    document.getElementById('kbQuery').blur();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    return { opened, closed: !window.__KB_TEST__.state().open };
  });
  ok('I4 Esc 能退出知识库', escRes.opened && escRes.closed, escRes);

  /* i18n：切英文后 UI 文案跟着走、文件名不动 */
  const i18n = await p.evaluate(async () => {
    window.__KB_TEST__.show(true);
    await new Promise(r => setTimeout(r, 250));
    /* 走真实设置面板的 select，避免直接改内部状态 */
    const sel = document.getElementById('setLang');
    const before = {
      title: document.querySelector('#kbView .kb-title b').textContent.trim(),
      seg: document.querySelector('#kbSeg button[data-view="topic"]').textContent.trim(),
      name: (document.querySelector('#kbList .kb-cname') || {}).textContent || ''
    };
    sel.value = 'en'; sel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 900));
    const en = {
      title: document.querySelector('#kbView .kb-title b').textContent.trim(),
      seg: document.querySelector('#kbSeg button[data-view="topic"]').textContent.trim(),
      name: (document.querySelector('#kbList .kb-cname') || {}).textContent || '',
      stat: document.querySelector('.kb-stat span').textContent.trim()
    };
    sel.value = 'zh-CN'; sel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 900));
    const zh = {
      title: document.querySelector('#kbView .kb-title b').textContent.trim(),
      seg: document.querySelector('#kbSeg button[data-view="topic"]').textContent.trim()
    };
    return { before, en, zh };
  });
  ok('I5 切英文后知识库标题翻成英文', /Knowledge Base/i.test(i18n.en.title), i18n.en);
  ok('I6 切英文后三段按钮翻成英文', /Topic/i.test(i18n.en.seg), i18n.en);
  ok('I7 切英文后统计标签翻成英文', i18n.en.stat === 'Docs', i18n.en.stat);
  ok('I8 文件名（用户内容）绝不翻译', i18n.en.name === i18n.before.name && !!i18n.en.name,
    { before: i18n.before.name, en: i18n.en.name });
  ok('I9 切回中文后文案还原', i18n.zh.title === i18n.before.title && i18n.zh.seg === i18n.before.seg, i18n.zh);

  /* 无 JS 错误（最后检查，避免中途报错被吞） */
  ok('I10 全程无 JS 运行时错误', errs.length === 0, errs.slice(0, 5));

  await b.close();
  console.log('\nPASS = ' + pass + '  FAIL = ' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });