/**
 * 발행 전 자동 검수
 *
 * 사람이 글을 읽지 않고 바로 발행하기 때문에, 사람이 하던 검토를 여기서 대신합니다.
 * 하나라도 치명(FAIL)이 나오면 그 글은 발행하지 않고 초안으로 격리합니다.
 *
 *   node validate.mjs                 검사만 (site/posts 전체)
 *   node validate.mjs --only a,b      특정 슬러그만
 *   node validate.mjs --quarantine    FAIL 난 글을 _drafts로 옮기고 published 해제
 *   node validate.mjs --no-network    출처 링크 확인 건너뛰기
 *
 * 종료 코드: 0 = 발행 가능, 1 = 발행할 글이 하나도 없음
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const POSTS = path.join(ROOT, 'site', 'posts');
const DRAFTS = path.join(ROOT, 'site', '_drafts');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };

const QUARANTINE = has('--quarantine');
const NETWORK = !has('--no-network');
const ONLY = val('--only')?.split(',').map((s) => s.trim()).filter(Boolean) ?? null;

const facts = JSON.parse(fs.readFileSync(path.join(HERE, 'facts.json'), 'utf8'));
const topicsPath = path.join(HERE, 'topics.json');
const topics = JSON.parse(fs.readFileSync(topicsPath, 'utf8'));

// ── HTML에서 사람이 읽는 글만 뽑아냅니다 ──────────────────
function articleText(html) {
  const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? html;
  return main
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── 검사 결과 모음 ────────────────────────────────────────
class Report {
  constructor(slug) { this.slug = slug; this.items = []; }
  fail(check, msg) { this.items.push({ level: 'FAIL', check, msg }); }
  warn(check, msg) { this.items.push({ level: 'WARN', check, msg }); }
  get failed() { return this.items.some((i) => i.level === 'FAIL'); }
  get fails() { return this.items.filter((i) => i.level === 'FAIL'); }
  get warns() { return this.items.filter((i) => i.level === 'WARN'); }
}

// ── 1. 철 지난 수치 ───────────────────────────────────────
// 같은 문장 안에 과거를 가리키는 표현이 있으면 "옛날엔 이랬다"는 정상적인 서술로 보고
// 경고로만 남깁니다. 그런 표현 없이 단독으로 쓰였다면 현재 사실을 잘못 쓴 것이므로 치명입니다.
function checkStaleNumbers(text, rep) {
  for (const rule of facts.규칙) {
    const near = new RegExp(rule.주변단어, 'g');
    const stale = new RegExp(rule.낡은값);
    let m;
    while ((m = near.exec(text)) !== null) {
      const from = Math.max(0, m.index - rule.창);
      const win = text.slice(from, m.index + rule.창);
      if (!stale.test(win)) continue;
      const historical = facts.과거형표현.some((k) => win.includes(k));
      const quote = win.trim().replace(/\s+/g, ' ');
      const msg = `${rule.항목}: 낡은 수치가 보입니다 (정답 ${rule.올바른값}) — "…${quote}…"`;
      if (historical) rep.warn(rule.id, `${msg} · 과거 서술로 보여 통과시킵니다`);
      else rep.fail(rule.id, msg);
      break; // 같은 규칙은 한 번만 보고
    }
  }
}

// ── 2. 분량과 형태 ────────────────────────────────────────
function checkShape(html, text, rep) {
  const chars = text.length;
  if (chars < 1500) rep.fail('분량', `본문이 ${chars}자뿐입니다. 최소 1500자가 필요합니다 (얇은 글은 검색·애드센스 모두 불리)`);
  else if (chars < 2200) rep.warn('분량', `본문 ${chars}자. 2200자 이상을 권합니다`);

  const h2 = (html.match(/<h2[\s>]/g) ?? []).length;
  if (h2 < 4) rep.fail('구성', `본문 소제목이 ${h2}개입니다. 4개 이상이어야 합니다`);

  const faq = (html.match(/<summary[\s>]/g) ?? []).length;
  if (faq < 3) rep.fail('FAQ', `자주 묻는 질문이 ${faq}개입니다. 3개 이상이어야 합니다`);

  const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? '';
  const bare = title.replace(/\s*[-|·–]\s*[^-|·–]{1,20}$/, '').trim(); // 뒤에 붙는 " - 계산기랩" 제거
  if (!title) rep.fail('제목', '<title>이 비어 있습니다');
  else if (bare.length > 45) rep.fail('제목', `제목이 ${bare.length}자로 너무 깁니다: "${bare}"`);
  else if (bare.length > 32) rep.warn('제목', `제목 ${bare.length}자. 모바일 검색결과에서 잘릴 수 있습니다: "${bare}"`);

  const desc = html.match(/<meta name="description" content="([^"]*)"/i)?.[1] ?? '';
  if (!desc) rep.fail('설명', 'meta description이 없습니다');
  else if (desc.length < 60 || desc.length > 170) rep.warn('설명', `meta description ${desc.length}자 (권장 90~150자)`);

  if (!/<h1[\s>]/.test(html)) rep.fail('구성', '<h1>이 없습니다');
}

// ── 3. 남아 있으면 안 되는 표현 ───────────────────────────
function checkForbidden(text, rep) {
  for (const word of facts.금칙어) {
    if (text.includes(word)) rep.fail('금칙어', `초안 흔적이 남아 있습니다: "${word}"`);
  }
}

// ── 4. 구조화 데이터 ──────────────────────────────────────
function checkJsonLd(html, rep) {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
  if (blocks.length === 0) { rep.fail('구조화데이터', 'JSON-LD가 없습니다 (검색결과 노출에 불리)'); return; }
  for (const [, body] of blocks) {
    try { JSON.parse(body); }
    catch (e) { rep.fail('구조화데이터', `JSON-LD를 읽을 수 없습니다: ${e.message}`); }
  }
}

// ── 5. 내부 링크가 실제 파일을 가리키는지 ─────────────────
function checkInternalLinks(html, file, rep) {
  const dir = path.dirname(file);
  for (const [, href] of html.matchAll(/href="([^"#?]+)"/g)) {
    if (/^(https?:|mailto:|tel:|data:|javascript:|\/\/)/.test(href)) continue;
    const target = path.resolve(dir, href);
    if (!fs.existsSync(target)) rep.fail('내부링크', `깨진 링크: ${href}`);
  }
}

// ── 6. 출처 ───────────────────────────────────────────────
function collectSources(html) {
  const sec = html.match(/<ul[^>]*class="sources"[\s\S]*?<\/ul>/i)?.[0] ?? '';
  const pool = sec || html;
  return [...pool.matchAll(/href="(https?:\/\/[^"]+)"/g)]
    .map((m) => m[1])
    .filter((u) => !u.includes('qi777xt0925-hue.github.io'));
}

async function checkSources(html, rep) {
  const urls = [...new Set(collectSources(html))];
  if (urls.length === 0) {
    rep.fail('출처', '외부 출처 링크가 하나도 없습니다. 돈·세금 글은 근거 표시가 필요합니다');
    return;
  }
  const official = urls.filter((u) => facts.공식도메인.some((d) => new URL(u).hostname.endsWith(d)));
  if (official.length === 0) {
    rep.warn('출처', `공식 기관(go.kr·or.kr) 출처가 없습니다. 현재 출처: ${urls.map((u) => new URL(u).hostname).join(', ')}`);
  }
  for (const u of urls) {
    if (/example\.(com|org)|localhost|127\.0\.0\.1|your-|TODO/i.test(u)) {
      rep.fail('출처', `실제 주소가 아닌 링크입니다: ${u}`);
    }
  }
  if (!NETWORK) return;

  const dead = [];
  await Promise.all(urls.map(async (u) => {
    try {
      const ctl = AbortSignal.timeout(12000);
      let res = await fetch(u, { method: 'HEAD', redirect: 'follow', signal: ctl });
      if (res.status === 405 || res.status === 403 || res.status === 501) {
        res = await fetch(u, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(12000) });
      }
      if (res.status >= 400) dead.push(`${u} (HTTP ${res.status})`);
    } catch (e) {
      dead.push(`${u} (${e.name === 'TimeoutError' ? '응답 없음' : e.message})`);
    }
  }));

  if (dead.length === 0) return;
  // 공공기관 사이트는 해외 서버(GitHub 러너)의 요청을 막는 경우가 흔해서
  // 몇 개 실패하는 것만으로는 글을 막지 않습니다. 전부 죽었을 때만 치명으로 봅니다.
  const msg = dead.map((d) => `\n      - ${d}`).join('');
  if (dead.length === urls.length) rep.fail('출처', `출처 링크가 전부 열리지 않습니다:${msg}`);
  else rep.warn('출처', `열리지 않는 출처가 있습니다 (${dead.length}/${urls.length}):${msg}`);
}

// ── 7. 다른 글과 겹치는지 ─────────────────────────────────
function checkDuplicates(entries, rep, self) {
  const norm = (s) => s.replace(/\s+/g, '');
  const mine = norm(self.text).slice(0, 4000);
  for (const other of entries) {
    if (other.slug === self.slug) continue;
    if (norm(other.title) === norm(self.title)) rep.fail('중복', `"${other.slug}" 와 제목이 같습니다`);
    // 앞부분 1200자가 통째로 같으면 사실상 같은 글입니다.
    const head = norm(other.text).slice(0, 1200);
    if (head.length > 400 && mine.includes(head)) rep.fail('중복', `"${other.slug}" 와 본문이 거의 같습니다`);
  }
}

// ── 실행 ──────────────────────────────────────────────────
if (!fs.existsSync(POSTS)) {
  console.log('site/posts 가 없습니다. 검사할 글이 없습니다.');
  process.exit(0);
}

let files = fs.readdirSync(POSTS).filter((f) => f.endsWith('.html'));
if (ONLY) files = files.filter((f) => ONLY.includes(f.replace(/\.html$/, '')));

const entries = files.map((f) => {
  const file = path.join(POSTS, f);
  const html = fs.readFileSync(file, 'utf8');
  return {
    slug: f.replace(/\.html$/, ''),
    file,
    html,
    text: articleText(html),
    title: html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? '',
  };
});

if (entries.length === 0) {
  console.log('검사할 글이 없습니다.');
  process.exit(0);
}

console.log(`검수 대상 ${entries.length}편${NETWORK ? '' : ' (출처 링크 확인 생략)'}\n`);

const reports = [];
for (const e of entries) {
  const rep = new Report(e.slug);
  checkStaleNumbers(e.text, rep);
  checkShape(e.html, e.text, rep);
  checkForbidden(e.text, rep);
  checkJsonLd(e.html, rep);
  checkInternalLinks(e.html, e.file, rep);
  checkDuplicates(entries, rep, e);
  await checkSources(e.html, rep);
  reports.push(rep);

  const mark = rep.failed ? '✗' : rep.warns.length ? '△' : '✓';
  console.log(`${mark} ${e.slug}`);
  for (const i of rep.items) console.log(`    [${i.level}] ${i.check} — ${i.msg}`);
  if (rep.items.length === 0) console.log('    이상 없음');
  console.log();
}

const bad = reports.filter((r) => r.failed);
const good = reports.filter((r) => !r.failed);

// ── 격리 ──────────────────────────────────────────────────
if (QUARANTINE && bad.length) {
  fs.mkdirSync(DRAFTS, { recursive: true });
  for (const r of bad) {
    const from = path.join(POSTS, `${r.slug}.html`);
    fs.renameSync(from, path.join(DRAFTS, `${r.slug}.html`));
    // published는 지우지 말고 null로 되돌립니다. 키를 없애면 미발행 주제의 형식이 달라져
    // topics.json에 불필요한 차이가 남습니다.
    const t = topics.find((t) => t.slug === r.slug);
    if (t) { t.published = null; delete t.h1; delete t.description; }
    console.log(`격리: ${r.slug} → site/_drafts/ (주제는 대기 상태로 되돌림)`);
  }
  fs.writeFileSync(topicsPath, JSON.stringify(topics, null, 2) + '\n');
  console.log();
}

// ── 요약 ──────────────────────────────────────────────────
const totalWarn = reports.reduce((n, r) => n + r.warns.length, 0);
console.log(`결과: 통과 ${good.length}편 · 탈락 ${bad.length}편 · 경고 ${totalWarn}건`);

if (process.env.GITHUB_STEP_SUMMARY) {
  const L = ['### 발행 전 자동 검수', '', `- 통과 **${good.length}편** · 탈락 **${bad.length}편** · 경고 ${totalWarn}건`, ''];
  for (const r of reports) {
    if (!r.items.length) continue;
    L.push(`<details><summary>${r.failed ? '✗' : '△'} ${r.slug}</summary>`, '');
    for (const i of r.items) L.push(`- \`${i.level}\` **${i.check}** — ${i.msg.replace(/\n\s+/g, ' ')}`);
    L.push('', '</details>', '');
  }
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, L.join('\n') + '\n');
}

// 한 편이라도 탈락하면 0이 아닌 값으로 끝냅니다.
// 워크플로는 이 단계를 continue-on-error 로 두고 있어서 발행 자체가 멈추지는 않고,
// 통과한 글은 그대로 올라갑니다. 이 종료 코드는 "사람에게 알려야 한다"는 신호입니다.
if (bad.length > 0) {
  console.log(
    good.length === 0
      ? '\n발행할 수 있는 글이 없습니다.'
      : `\n${bad.length}편이 탈락했습니다. 통과한 ${good.length}편만 발행합니다.`
  );
  process.exit(1);
}
