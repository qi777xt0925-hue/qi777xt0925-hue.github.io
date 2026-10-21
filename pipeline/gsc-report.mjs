// 서치콘솔 숫자를 읽어 gsc-report.md 로 정리합니다. 읽기만 하고 아무것도 바꾸지 않습니다.
//
// 서치콘솔 화면을 사람이 캡처해 오던 일을 대신합니다. 2026-10-21에 확인해 보니
// 클릭 0, 색인 7/37, 사이트맵 "가져올 수 없음"이었는데 그동안 아무도 보지 않았습니다.
//
// 인증은 서비스 계정 열쇠(JSON)를 환경변수 GSC_SA_KEY 로 받습니다.
// 그 계정은 서치콘솔에 "제한됨"(보기 전용) 사용자로만 추가돼 있어야 합니다.
// 열쇠는 GitHub Secrets 에만 두고 저장소·대화에 붙여넣지 않습니다.
//
// 사용법:
//   GSC_SA_KEY="$(cat key.json)" node gsc-report.mjs
//
// 보고서 내용:
//   1. 지난 28일·발행 이후 전체의 클릭·노출·CTR·평균 순위
//   2. 많이 노출된 검색어, 페이지
//   3. 제출한 사이트맵의 상태 (구글이 마지막으로 읽은 날짜)
//   4. sitemap.xml 의 주소마다 색인 여부 (URL 검사 API)
//
// 외부 패키지 없이 node 내장 모듈만 씁니다.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(HERE, '..', 'site');
const REPORT = path.join(HERE, 'gsc-report.md');
const config = JSON.parse(fs.readFileSync(path.join(HERE, 'site.config.json'), 'utf8'));

// 서치콘솔 속성 이름. URL 접두어 속성이라 끝의 / 까지 포함해야 합니다.
const PROPERTY = `${config.origin}/`;
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const API = 'https://searchconsole.googleapis.com';
const SITE_START = '2026-08-22'; // 최초 배포일

const raw = process.env.GSC_SA_KEY;
if (!raw) {
  console.error('GSC_SA_KEY 가 없습니다. 서비스 계정 열쇠(JSON)를 GitHub Secrets 에 넣어 주세요.');
  process.exit(1);
}
let key;
try {
  key = JSON.parse(raw);
} catch {
  console.error('GSC_SA_KEY 가 JSON 형식이 아닙니다. 내려받은 열쇠 파일 내용을 그대로 넣어 주세요.');
  process.exit(1);
}

const b64url = (s) => Buffer.from(s).toString('base64url');

/** 서비스 계정 열쇠로 접근 토큰을 받습니다(JWT bearer, RS256). */
async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(
    JSON.stringify({ iss: key.client_email, scope: SCOPE, aud: key.token_uri, iat: now, exp: now + 3600 })
  );
  const sig = crypto.createSign('RSA-SHA256').update(`${head}.${claim}`).sign(key.private_key, 'base64url');
  const res = await fetch(key.token_uri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${head}.${claim}.${sig}`,
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`토큰 발급 실패 (${res.status}): ${body.error_description ?? body.error}`);
  return body.access_token;
}

const token = await accessToken();

async function call(method, url, body) {
  const res = await fetch(API + url, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json.error?.message ?? res.statusText;
    // 403이면 거의 항상 서치콘솔에 서비스 계정을 사용자로 추가하지 않은 경우입니다.
    const hint = res.status === 403 ? ` — 서치콘솔 설정 > 사용자 및 권한에 ${key.client_email} 이 있는지 확인하세요` : '';
    throw new Error(`${method} ${url} 실패 (${res.status}): ${msg}${hint}`);
  }
  return json;
}

const site = encodeURIComponent(PROPERTY);
const day = (d) => d.toISOString().slice(0, 10);
const today = new Date();
// 서치콘솔 실적은 2~3일 늦게 채워집니다. 마지막 사흘은 비어 보이므로 빼고 봅니다.
const end = day(new Date(today.getTime() - 3 * 86400e3));
const start28 = day(new Date(today.getTime() - 30 * 86400e3));

const query = (startDate, dimensions = [], rowLimit = 10) =>
  call('POST', `/webmasters/v3/sites/${site}/searchAnalytics/query`, { startDate, endDate: end, dimensions, rowLimit });

const total = (r) => r.rows?.[0] ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 };
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const pos = (x) => (x ? x.toFixed(1) : '–');
const short = (u) => u.replace(config.origin, '') || '/';

const lines = [`## 서치콘솔 현황 (${day(today)})`, ''];

// ── 1. 실적 ─────────────────────────────────────────────────
const [all, recent] = await Promise.all([query(SITE_START), query(start28)]);
lines.push(
  '### 실적',
  '',
  '| 기간 | 클릭 | 노출 | CTR | 평균 순위 |',
  '|---|---:|---:|---:|---:|',
  ...[
    [`지난 28일 (~${end})`, total(recent)],
    [`전체 (${SITE_START}~${end})`, total(all)],
  ].map(([label, t]) => `| ${label} | ${t.clicks} | ${t.impressions} | ${pct(t.ctr)} | ${pos(t.position)} |`),
  ''
);

// ── 2. 검색어·페이지 ────────────────────────────────────────
for (const [title, dim, fmt] of [
  ['많이 노출된 검색어', 'query', (k) => k],
  ['많이 노출된 페이지', 'page', short],
]) {
  const r = await query(SITE_START, [dim]);
  const rows = (r.rows ?? []).sort((a, b) => b.impressions - a.impressions);
  lines.push(`### ${title}`, '');
  if (!rows.length) {
    lines.push('아직 없습니다.', '');
    continue;
  }
  lines.push('| | 클릭 | 노출 | 평균 순위 |', '|---|---:|---:|---:|');
  for (const row of rows) lines.push(`| ${fmt(row.keys[0])} | ${row.clicks} | ${row.impressions} | ${pos(row.position)} |`);
  lines.push('');
}

// ── 3. 사이트맵 ─────────────────────────────────────────────
const sm = await call('GET', `/webmasters/v3/sites/${site}/sitemaps`);
lines.push('### 사이트맵', '', '| 주소 | 제출 | 구글이 마지막으로 읽음 | 오류 | 경고 |', '|---|---|---|---:|---:|');
for (const s of sm.sitemap ?? []) {
  const read = s.lastDownloaded ? s.lastDownloaded.slice(0, 10) : '**읽은 적 없음**';
  lines.push(`| ${short(s.path)} | ${s.lastSubmitted?.slice(0, 10) ?? '–'} | ${read} | ${s.errors ?? 0} | ${s.warnings ?? 0} |`);
}
lines.push('');

// ── 4. 주소별 색인 여부 ─────────────────────────────────────
// 라이브가 아니라 저장소의 sitemap.xml 을 기준으로 합니다(배포 여부는 health.mjs 가 봅니다).
const urls = [...fs.readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const inspected = [];
for (const url of urls) {
  try {
    const r = await call('POST', '/v1/urlInspection/index:inspect', { inspectionUrl: url, siteUrl: PROPERTY, languageCode: 'ko-KR' });
    const s = r.inspectionResult?.indexStatusResult ?? {};
    inspected.push({ url, verdict: s.verdict, state: s.coverageState ?? '–', crawled: s.lastCrawlTime?.slice(0, 10) ?? '–' });
  } catch (e) {
    inspected.push({ url, verdict: 'ERROR', state: e.message, crawled: '–' });
  }
}
const indexed = inspected.filter((i) => i.verdict === 'PASS');
lines.push(
  `### 색인 여부 — ${indexed.length} / ${inspected.length}개 등록됨`,
  '',
  '등록 안 된 주소부터 보여 줍니다.',
  '',
  '| 주소 | 상태 | 마지막 크롤링 |',
  '|---|---|---|'
);
for (const i of [...inspected].sort((a, b) => (a.verdict === 'PASS') - (b.verdict === 'PASS'))) {
  lines.push(`| ${short(i.url)} | ${i.verdict === 'PASS' ? '✅ ' : ''}${i.state} | ${i.crawled} |`);
}
lines.push('');

fs.writeFileSync(REPORT, lines.join('\n'), 'utf8');
console.log(lines.join('\n'));
