// 생성된 글 데이터를 사이트 디자인에 맞는 정적 HTML로 변환합니다.
// 클래스 이름은 site/assets/style.css에 이미 정의된 것만 사용합니다.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

const FAVICON =
  "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><text y='26' font-size='26'>🧮</text></svg>";

function renderSection(sec) {
  const parts = [`  <h2>${esc(sec.heading)}</h2>`];

  for (const p of sec.paragraphs ?? []) {
    if (p.trim()) parts.push(`  <p>${esc(p)}</p>`);
  }
  if (sec.bullets?.length) {
    parts.push('  <ul>');
    for (const b of sec.bullets) parts.push(`    <li>${esc(b)}</li>`);
    parts.push('  </ul>');
  }
  if (sec.note?.trim()) {
    parts.push(`  <div class="note">${esc(sec.note)}</div>`);
  }
  return parts.join('\n');
}

function renderFaq(faq) {
  if (!faq?.length) return '';
  const items = faq
    .map(
      (f) => `  <details>
    <summary>${esc(f.q)}</summary>
    <div class="body">${esc(f.a)}</div>
  </details>`
    )
    .join('\n');
  return `\n  <h2>자주 묻는 질문</h2>\n${items}\n`;
}

/** 본문 근거가 된 공식 자료. E-E-A-T 신호이자 독자가 직접 확인할 통로입니다. */
function renderSources(sources) {
  if (!sources?.length) return '';
  const items = sources
    .map(
      (s) =>
        `    <li><a href="${esc(s.url)}" rel="nofollow noopener" target="_blank">${esc(s.name)}</a></li>`
    )
    .join('\n');
  return `\n  <h2>참고한 자료</h2>\n  <ul>\n${items}\n  </ul>\n`;
}

/** 같은 폴더의 다른 글로 연결합니다. 크롤링 경로를 늘리고 체류시간을 높입니다. */
function renderMorePosts(others) {
  if (!others?.length) return '';
  const items = others
    .slice(-4)
    .reverse()
    .map(
      (p) => `    <a class="item" href="${esc(encodeURIComponent(p.slug))}.html">
      <div class="t">${esc(p.h1 ?? p.title)}</div>
      <div class="d">${esc(p.description ?? '')}</div>
    </a>`
    )
    .join('\n');
  return `\n  <h2>다른 글</h2>\n  <div class="list">\n${items}\n  </div>\n`;
}

/**
 * @param {object} article  모델이 생성한 글 데이터
 * @param {object} topic    topics.json 항목 (slug, related)
 * @param {object} config   site.config.json
 * @param {string} date     YYYY-MM-DD
 * @param {Array}  others   이미 발행된 다른 글 (내부 링크용)
 */
export function renderPost(article, topic, config, date, others = []) {
  const url = encodeURI(`${config.origin}/posts/${topic.slug}.html`);
  const rel = topic.related;

  // 검색엔진이 글쓴이·발행일·소속을 구조적으로 읽게 합니다. 금융 주제(YMYL)에서 특히 중요합니다.
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.description,
    datePublished: date,
    dateModified: date,
    inLanguage: 'ko-KR',
    author: { '@type': 'Organization', name: config.author },
    publisher: { '@type': 'Organization', name: config.siteName },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
  }).replace(/</g, '\\u003c');

  const relatedBox = rel
    ? `\n  <div class="list">
    <a class="item" href="${esc(rel.href)}">
      <div class="t">${esc(rel.label)}</div>
      <div class="d">이 글에서 설명한 기준을 그대로 적용해 바로 계산해볼 수 있습니다</div>
    </a>
  </div>\n`
    : '';

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(article.title)} - ${esc(config.siteName)}</title>
<meta name="description" content="${esc(article.description)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(article.title)}">
<meta property="og:description" content="${esc(article.description)}">
<meta property="og:locale" content="ko_KR">
<meta property="article:published_time" content="${esc(date)}">
<meta property="article:modified_time" content="${esc(date)}">
<script type="application/ld+json">${jsonLd}</script>
<link rel="stylesheet" href="../assets/style.css">
<link rel="icon" href="${FAVICON}">
<!-- 애드센스 승인 후 이 자리에 스크립트 한 줄 붙이면 됩니다 -->
</head>
<body>

<header class="site">
  <div class="wrap">
    <a class="logo" href="../index.html">계산기<span>랩</span></a>
    <nav><a href="../guides.html">생활 금융 가이드</a><a href="../index.html">전체 계산기</a></nav>
  </div>
</header>

<main class="wrap">
  <h1>${esc(article.h1)}</h1>
  <p class="lead">${esc(article.lead)}</p>
  <p class="lead" style="font-size:13px">${esc(date)} 기준</p>

  <div class="ad"><!-- 광고 슬롯 --></div>

${(article.sections ?? []).map(renderSection).join('\n\n')}
${relatedBox}
  <div class="ad"><!-- 광고 슬롯 --></div>
${renderFaq(article.faq)}
${renderSources(article.sources)}
${renderMorePosts(others)}
</main>

<footer class="site">
  <div class="wrap">
    ${esc(config.siteName)} · 참고용 자료이며 법적·세무적 판단의 근거로 사용할 수 없습니다.
    요율과 제도는 변경될 수 있으니 최종 확인은 관계 기관 공식 자료를 따르세요.
    <br>최종 수정: ${esc(date)} · <a href="../privacy.html">개인정보처리방침</a>
  </div>
</footer>
</body>
</html>
`;
}

/** 글 목록 페이지 (site/guides.html) */
export function renderIndexPage(posts, config) {
  const items = posts.length
    ? posts
        .map(
          (p) => `    <a class="item" href="posts/${esc(encodeURIComponent(p.slug))}.html">
      <div class="t">${esc(p.h1)}</div>
      <div class="d">${esc(p.description)}</div>
    </a>`
        )
        .join('\n')
    : '    <p class="lead">아직 발행된 글이 없습니다.</p>';

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>생활 금융 가이드 - ${esc(config.siteName)}</title>
<meta name="description" content="연봉·세금·대출·부동산 계산의 기준을 하나씩 정리한 글 모음입니다. 계산기가 어떤 근거로 숫자를 내는지 확인할 수 있습니다.">
<link rel="canonical" href="${esc(config.origin)}/guides.html">
<meta property="og:type" content="website">
<meta property="og:title" content="생활 금융 가이드">
<meta property="og:description" content="연봉·세금·대출·부동산 계산의 기준을 정리한 글 모음.">
<meta property="og:locale" content="ko_KR">
<link rel="stylesheet" href="assets/style.css">
<link rel="icon" href="${FAVICON}">
</head>
<body>

<header class="site">
  <div class="wrap">
    <a class="logo" href="index.html">계산기<span>랩</span></a>
    <nav><a href="salary.html">연봉 계산기</a><a href="index.html">전체 계산기</a></nav>
  </div>
</header>

<main class="wrap">
  <h1>생활 금융 가이드</h1>
  <p class="lead">계산기가 어떤 기준으로 숫자를 내는지, 그 근거가 되는 제도를 하나씩 정리합니다.</p>

  <div class="list">
${items}
  </div>

  <div class="ad"><!-- 광고 슬롯 --></div>
</main>

<footer class="site">
  <div class="wrap">
    ${esc(config.siteName)} · 참고용 자료이며 법적·세무적 판단의 근거로 사용할 수 없습니다.
    <br><a href="privacy.html">개인정보처리방침</a>
  </div>
</footer>
</body>
</html>
`;
}

/** sitemap.xml */
export function renderSitemap(posts, config) {
  const staticUrls = [
    { loc: `${config.origin}/`, priority: '1.0', changefreq: 'weekly' },
    { loc: `${config.origin}/salary.html`, priority: '0.9', changefreq: 'monthly' },
    { loc: `${config.origin}/guides.html`, priority: '0.8', changefreq: 'weekly' },
  ];
  const postUrls = posts.map((p) => ({
    loc: encodeURI(`${config.origin}/posts/${p.slug}.html`),
    priority: '0.7',
    changefreq: 'monthly',
    lastmod: p.date,
  }));

  const body = [...staticUrls, ...postUrls]
    .map(
      (u) => `  <url>
    <loc>${esc(u.loc)}</loc>${u.lastmod ? `\n    <lastmod>${esc(u.lastmod)}</lastmod>` : ''}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}
