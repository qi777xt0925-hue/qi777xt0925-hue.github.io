// 사이트가 실제로 살아 있는지 라이브 주소로 확인합니다.
//
// 검수기(validate.mjs)는 "있는 글이 맞는지"만 봅니다. "있어야 할 것이 없다"는
// 잡지 못합니다. 실제로 그런 일이 두 번 있었습니다.
//   - 2026-08-30 ~ 09-24: 정기 발행이 꺼진 채 3주가 지났다. 오류는 하나도 없었다.
//   - 2026-09-28: 글이 커밋됐는데 배포가 안 돌아 사흘간 사이트에 없었다.
// 둘 다 "아무 일도 안 일어난" 상태라 아무도 몰랐습니다. 이 스크립트는 그 침묵을 잡습니다.
//
// 판단은 저장소가 아니라 라이브 사이트로 합니다. 커밋됐다와 올라갔다는 다른 사실입니다.
//
// 사용법:
//   node health.mjs                         정기 점검 (아래 세 가지)
//   node health.mjs --expect a,b --wait 600 새 글 a, b가 뜰 때까지 최대 600초 기다림
//
// 정기 점검 항목:
//   1. 가장 최근 글이 MAX_AGE_DAYS일보다 오래됐다 → 발행이 멈췄다
//   2. 저장소의 글이 라이브 sitemap.xml에 없다     → 커밋됐는데 배포가 안 됐다
//   3. 라이브 sitemap의 주소가 200이 아니다        → 깨진 페이지
//
// 문제가 있으면 exit 1, 내용은 health-report.md 에 씁니다(워크플로가 이슈 본문으로 씀).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(HERE, '..', 'site');
const POSTS = path.join(SITE, 'posts');
const REPORT = path.join(HERE, 'health-report.md');
const config = JSON.parse(fs.readFileSync(path.join(HERE, 'site.config.json'), 'utf8'));

// 발행은 매주 월요일. 점검은 수요일에 돌므로, 월요일을 한 번 건너뛰면 9일이 됩니다.
const MAX_AGE_DAYS = 8;

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1];
};

// CDN이 예전 404를 기억하고 있을 수 있어 매번 다른 쿼리를 붙입니다.
// GitHub Pages는 쿼리를 무시하고 같은 파일을 줍니다.
async function status(url) {
  const bust = `${url.includes('?') ? '&' : '?'}health=${Date.now()}`;
  try {
    const res = await fetch(url + bust, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
    return res.status;
  } catch (e) {
    return `연결 실패 (${e.cause?.code ?? e.name})`;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function finish(problems, okLines) {
  const lines = problems.length
    ? ['### 문제가 있습니다', '', ...problems.map((p) => `- ${p}`), '']
    : ['### 이상 없음', ''];
  if (okLines.length) lines.push(...okLines.map((l) => `- ${l}`));
  fs.writeFileSync(REPORT, lines.join('\n') + '\n', 'utf8');
  console.log(lines.join('\n'));
  process.exit(problems.length ? 1 : 0);
}

// ── 새 글이 실제로 떴는지 기다리며 확인 ─────────────────────
const expect = opt('--expect');
if (expect !== null) {
  const slugs = expect.split(',').map((s) => s.trim()).filter(Boolean);
  const waitSec = Number(opt('--wait') ?? 600);
  const deadline = Date.now() + waitSec * 1000;
  const pending = new Map(slugs.map((s) => [s, `${config.origin}/posts/${s}.html`]));
  const last = new Map();

  while (pending.size && Date.now() < deadline) {
    for (const [slug, url] of pending) {
      const code = await status(url);
      last.set(slug, code);
      if (code === 200) pending.delete(slug);
    }
    if (pending.size) await sleep(20000);
  }

  const problems = [...pending].map(
    ([slug, url]) => `${waitSec}초를 기다렸지만 [${slug}](${url}) 가 열리지 않습니다 (마지막 응답: ${last.get(slug)}). 커밋은 됐지만 배포가 안 된 상태입니다.`,
  );
  const ok = slugs.filter((s) => !pending.has(s)).map((s) => `${config.origin}/posts/${s}.html — 200`);
  finish(problems, ok);
}

// ── 정기 점검 ─────────────────────────────────────────────
const problems = [];
const ok = [];

// 1. 발행이 멈췄는가
const posts = fs
  .readdirSync(POSTS)
  .filter((f) => f.endsWith('.html'))
  .map((f) => {
    const html = fs.readFileSync(path.join(POSTS, f), 'utf8');
    const m = html.match(/"datePublished":"(\d{4}-\d{2}-\d{2})"/);
    return { slug: f.replace(/\.html$/, ''), date: m?.[1] ?? null };
  });

const dated = posts.filter((p) => p.date).sort((a, b) => b.date.localeCompare(a.date));
if (!dated.length) {
  problems.push('글에서 발행일(datePublished)을 하나도 읽지 못했습니다. 글 템플릿이 바뀌었는지 확인하세요.');
} else {
  const newest = dated[0];
  const age = Math.floor((Date.now() - Date.parse(`${newest.date}T00:00:00+09:00`)) / 86400000);
  if (age > MAX_AGE_DAYS) {
    problems.push(
      `마지막 글이 ${age}일 전(${newest.date}, ${newest.slug})입니다. 매주 월요일 발행이 멈춘 것 같습니다. ` +
        `'가이드 글 생성' 워크플로의 최근 실행과, publish.yml 의 schedule 줄이 주석 처리되지 않았는지 확인하세요.`,
    );
  } else {
    ok.push(`마지막 글 ${newest.date} (${age}일 전) — 글 ${posts.length}편`);
  }
}

// 2·3. 라이브 사이트맵 대조
const smRes = await fetch(`${config.origin}/sitemap.xml?health=${Date.now()}`).catch((e) => e);
if (!(smRes instanceof Response) || smRes.status !== 200) {
  problems.push(`라이브 sitemap.xml 을 받지 못했습니다 (${smRes.status ?? smRes.message}). 사이트 전체가 내려갔을 수 있습니다.`);
  finish(problems, ok);
}
const liveUrls = [...(await smRes.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());

const missing = posts.filter((p) => !liveUrls.includes(`${config.origin}/posts/${p.slug}.html`));
if (missing.length) {
  problems.push(
    `저장소에는 있는데 라이브 사이트맵에 없는 글 ${missing.length}편: ${missing.map((p) => p.slug).join(', ')}. ` +
      `커밋됐지만 배포되지 않은 상태입니다. Actions 탭에서 '사이트 배포'를 수동 실행하세요.`,
  );
} else {
  ok.push(`저장소 글 ${posts.length}편 모두 라이브 사이트맵에 있음`);
}

const broken = [];
for (const url of liveUrls) {
  const code = await status(url);
  if (code !== 200) broken.push(`${url} (${code})`);
}
if (broken.length) {
  problems.push(`열리지 않는 주소 ${broken.length}개: ${broken.join(', ')}`);
} else {
  ok.push(`사이트맵 주소 ${liveUrls.length}개 모두 200`);
}

finish(problems, ok);
