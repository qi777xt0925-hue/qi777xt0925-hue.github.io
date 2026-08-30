// 발행된 글을 훑어 목록 페이지·사이트맵·robots.txt를 다시 만들고
// index.html의 최신 글 영역을 갱신합니다. 모델 호출이 없으므로 비용은 0원입니다.
//
//   node build.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderIndexPage, renderSitemap, esc } from './lib/render.mjs';
import { readJson } from './lib/json.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const SITE = path.join(ROOT, 'site');

const config = readJson(path.join(HERE, 'site.config.json'));
const topics = readJson(path.join(HERE, 'topics.json'));

// 실제로 파일이 존재하는 발행 글만 대상으로 합니다.
const posts = topics
  .filter((t) => t.published && fs.existsSync(path.join(SITE, 'posts', `${t.slug}.html`)))
  .map((t) => ({
    slug: t.slug,
    h1: t.h1 ?? t.title,
    description: t.description ?? '',
    date: t.published,
  }))
  .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)); // 최신순

// ── guides.html ─────────────────────────────────────────────
fs.writeFileSync(path.join(SITE, 'guides.html'), renderIndexPage(posts, config), 'utf8');

// ── sitemap.xml ─────────────────────────────────────────────
// site/ 바로 아래의 .html을 훑어 넣습니다. 계산기를 새로 만들어도 자동으로 잡힙니다.
const pages = fs.readdirSync(SITE).filter((f) => f.endsWith('.html'));
fs.writeFileSync(path.join(SITE, 'sitemap.xml'), renderSitemap(posts, config, pages), 'utf8');

// ── robots.txt ──────────────────────────────────────────────
fs.writeFileSync(
  path.join(SITE, 'robots.txt'),
  `User-agent: *\nAllow: /\n\nSitemap: ${config.origin}/sitemap.xml\n`,
  'utf8'
);

// ── index.html의 최신 글 영역 ───────────────────────────────
const indexPath = path.join(SITE, 'index.html');
let index = fs.readFileSync(indexPath, 'utf8');

const START = '<!-- LATEST:START -->';
const END = '<!-- LATEST:END -->';

if (index.includes(START) && index.includes(END)) {
  const latest = posts.slice(0, 5);
  const block = latest.length
    ? `
  <h2>생활 금융 가이드</h2>
  <div class="list">
${latest
  .map(
    (p) => `    <a class="item" href="posts/${esc(p.slug)}.html">
      <div class="t">${esc(p.h1)}</div>
      <div class="d">${esc(p.description)}</div>
    </a>`
  )
  .join('\n')}
  </div>
  <p class="lead"><a href="guides.html">가이드 전체 보기 →</a></p>
`
    : '\n';

  index =
    index.slice(0, index.indexOf(START) + START.length) +
    block +
    index.slice(index.indexOf(END));
  fs.writeFileSync(indexPath, index, 'utf8');
} else {
  console.warn(`! index.html에 ${START} / ${END} 주석이 없어 최신 글 영역을 건너뛰었습니다.`);
}

const sitemapCount = (fs.readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8').match(/<loc>/g) || []).length;
console.log(`빌드 완료 — 글 ${posts.length}편, sitemap ${sitemapCount}개 URL`);
if (config.origin.includes('example.com')) {
  console.warn('! site.config.json의 origin이 아직 example.com입니다. 실제 도메인으로 바꾸세요.');
}
