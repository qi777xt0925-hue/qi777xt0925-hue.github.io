// 아직 발행되지 않은 주제 하나를 골라 글을 생성하고 site/posts/에 HTML로 씁니다.
//
//   node generate.mjs                한 편 생성 (site/posts/ 에 바로 발행)
//   node generate.mjs --count 3      세 편 생성
//   node generate.mjs --draft        site/_drafts/ 에 저장 (검토 후 수동 이동)
//   node generate.mjs --slug 주휴수당  특정 주제 지정
//   node generate.mjs --no-search     웹 검색 없이 생성 (더 싸지만 최신 수치 반영 안 됨)

import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPost } from './lib/render.mjs';
import { readJson, writeJson } from './lib/json.mjs';
import { ARTICLE_SCHEMA as _SCHEMA, buildSystem } from './lib/writing-guide.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

const config = readJson(path.join(HERE, 'site.config.json'));
// 검수기와 같은 기준을 씁니다 — 어느 도메인을 공식 출처로 볼지.
const FACTS = readJson(path.join(HERE, 'facts.json'));

// ── 인자 파싱 ────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const COUNT = Math.max(1, parseInt(value('count', '1'), 10) || 1);
const DRAFT = flag('draft');
const USE_SEARCH = !flag('no-search');
const ONLY_SLUG = value('slug', null);

const OUT_DIR = DRAFT ? path.join(ROOT, 'site', '_drafts') : path.join(ROOT, 'site', 'posts');

const ARTICLE_SCHEMA = _SCHEMA;
const SYSTEM = buildSystem(FACTS);

// ── 모델 호출 ────────────────────────────────────────────────
const client = new Anthropic(); // ANTHROPIC_API_KEY 환경변수에서 자동으로 읽습니다

async function writeArticle(topic) {
  const userPrompt = `아래 주제로 글을 써주세요.

제목(가안): ${topic.title}
다뤄야 할 각도: ${topic.angle}
독자가 검색할 만한 표현: ${topic.keywords.join(', ')}

이 글은 계산기 사이트에 실립니다. 독자는 계산 결과의 근거를 알고 싶어서 들어옵니다.${
    USE_SEARCH
      ? '\n\n4대보험 요율·비과세 한도처럼 시스템 프롬프트에 이미 적힌 값은 검색으로 다시 확인하지 말고 그대로 쓰세요. 검색은 거기 없는 것(제도 절차, 신청 기한, 서류명, 최근 개정)에 쓰세요.\n\n다만 **검색은 최소 한 번은 반드시 하세요.** sources에 넣을 공식 기관(국민연금공단·국세청·고용노동부·법제처 등) 페이지 주소를 확보해야 하는데, 기억으로 지어낸 주소는 대개 존재하지 않기 때문입니다. 검색 결과에 나온 주소를 그대로 옮기세요. 검색해도 확실하지 않으면 수치를 쓰지 말고 확인 방법을 안내하세요.'
      : ''
  }`;

  const tools = USE_SEARCH
    ? [{ type: 'web_search_20260209', name: 'web_search', max_uses: config.maxSearches }]
    : undefined;

  const messages = [{ role: 'user', content: userPrompt }];
  let response;

  // 웹 검색이 실제로 열어본 자료를 모아둡니다.
  // 모델이 sources를 비워서 돌려주는 일이 있는데, 그때 여기서 출처를 채웁니다.
  // 응답에 이미 들어 있는 값이라 추가 비용이 들지 않습니다.
  const searchHits = [];
  const harvest = (content) => {
    for (const block of content) {
      // 검색이 실패하면 content가 배열이 아니라 오류 객체로 옵니다.
      if (block.type !== 'web_search_tool_result' || !Array.isArray(block.content)) continue;
      for (const r of block.content) {
        if (r.type === 'web_search_result' && r.url) searchHits.push(r);
      }
    }
  };

  // 여러 번 이어 붙는 경우 토큰이 누적되므로 비용도 합산해야 합니다.
  let inTokens = 0;
  let outTokens = 0;

  // 서버 사이드 도구(웹 검색)는 반복 한도에 걸리면 pause_turn으로 멈춥니다.
  for (let attempt = 0; attempt < 6; attempt++) {
    response = await client.messages.create({
      model: config.model,
      max_tokens: config.maxTokens,
      system: SYSTEM,
      messages,
      ...(tools ? { tools } : {}),
      output_config: {
        effort: config.effort,
        format: { type: 'json_schema', schema: ARTICLE_SCHEMA },
      },
    });

    harvest(response.content);
    inTokens += response.usage.input_tokens;
    outTokens += response.usage.output_tokens;

    if (response.stop_reason === 'refusal') {
      throw new Error(
        `모델이 생성을 거부했습니다 (${response.stop_details?.category ?? 'unknown'}). 주제를 조정하세요.`
      );
    }
    if (response.stop_reason === 'max_tokens') {
      throw new Error('출력이 max_tokens에서 잘렸습니다. site.config.json의 maxTokens를 올리세요.');
    }
    if (response.stop_reason !== 'pause_turn') break;

    // 재전송하면 서버가 이어서 진행합니다. 추가 user 메시지를 넣으면 안 됩니다.
    messages.push({ role: 'assistant', content: response.content });
  }

  if (response.stop_reason === 'pause_turn') {
    throw new Error('웹 검색이 반복 한도에 도달했습니다. --no-search로 다시 시도해보세요.');
  }

  const textBlocks = response.content.filter((b) => b.type === 'text');
  const raw = textBlocks.at(-1)?.text;
  if (!raw) throw new Error('응답에 텍스트 블록이 없습니다.');

  const cost =
    (inTokens / 1e6) * config.pricing.inputPerMTok +
    (outTokens / 1e6) * config.pricing.outputPerMTok;
  console.log(`    토큰 ${inTokens} in / ${outTokens} out · 약 $${cost.toFixed(3)}`);

  const article = JSON.parse(raw);
  if (!article.sources?.length) {
    article.sources = fallbackSources(searchHits);
    console.log(
      article.sources.length
        ? `    ! 모델이 출처를 비워서 돌려줬습니다. 검색 기록에서 ${article.sources.length}개를 채웁니다.`
        : '    ! 출처를 채우지 못했습니다. 검수에서 걸러집니다.'
    );
  }
  return article;
}

/**
 * 웹 검색이 실제로 열어본 자료 중에서 출처로 쓸 것을 고릅니다.
 * 모델이 지어낸 URL이 아니라 검색 결과에 실재하는 주소이므로 링크가 죽어 있을 위험이 낮습니다.
 * 공식 기관(go.kr·or.kr)을 먼저 채우고, 모자라면 나머지로 채웁니다.
 */
function fallbackSources(hits, limit = 3) {
  const seen = new Set();
  const unique = [];
  for (const h of hits) {
    let host;
    try {
      host = new URL(h.url).hostname;
    } catch {
      continue; // 주소가 깨졌으면 버립니다
    }
    if (seen.has(host)) continue; // 같은 기관을 여러 줄 넣지 않습니다
    seen.add(host);
    unique.push({ name: (h.title || host).trim().slice(0, 80), url: h.url, host });
  }
  const official = (h) => FACTS.공식도메인.some((d) => h.host.endsWith(d));
  return [...unique.filter(official), ...unique.filter((h) => !official(h))]
    .slice(0, limit)
    .map(({ name, url }) => ({ name, url }));
}

// ── 실행 ────────────────────────────────────────────────────
const topicsPath = path.join(HERE, 'topics.json');
const topics = readJson(topicsPath);

let queue;
if (ONLY_SLUG) {
  const t = topics.find((t) => t.slug === ONLY_SLUG);
  if (!t) {
    console.error(`--slug "${ONLY_SLUG}" 에 해당하는 주제가 topics.json에 없습니다.`);
    process.exit(1);
  }
  queue = [t];
} else {
  queue = topics.filter((t) => !t.published).slice(0, COUNT);
}

if (queue.length === 0) {
  console.log('발행할 주제가 남아 있지 않습니다. topics.json에 주제를 추가하세요.');
  process.exit(0);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const today = new Date().toISOString().slice(0, 10);

for (const topic of queue) {
  console.log(`\n▸ ${topic.title}`);

  // 한글 슬러그도 동작하지만 URL이 퍼센트 인코딩돼 공유할 때 깨져 보입니다.
  if (!/^[a-z0-9-]+$/.test(topic.slug)) {
    console.warn(`  ! slug "${topic.slug}"에 영소문자·숫자·하이픈 외 문자가 있습니다.`);
  }
  let article;
  try {
    article = await writeArticle(topic);
  } catch (err) {
    console.error(`  ✗ 실패: ${err.message}`);
    process.exitCode = 1;
    continue;
  }

  const others = topics.filter((t) => t.published && t.slug !== topic.slug);
  const html = renderPost(article, topic, config, today, others);
  const outFile = path.join(OUT_DIR, `${topic.slug}.html`);
  fs.writeFileSync(outFile, html, 'utf8');
  console.log(`  ✓ ${path.relative(ROOT, outFile)}`);

  if (!DRAFT) {
    topic.published = today;
    topic.h1 = article.h1;
    topic.description = article.description;
    writeJson(topicsPath, topics);
  }
}

if (DRAFT) {
  console.log('\n초안으로 저장했습니다. 내용을 검토한 뒤 site/posts/ 로 옮기고');
  console.log('topics.json의 published 값을 채운 다음 build.mjs를 실행하세요.');
}
