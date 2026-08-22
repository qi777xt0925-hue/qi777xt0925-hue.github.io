// 대기 중인 주제가 부족하면 새 주제를 만들어 topics.json에 채웁니다.
//
//   node replenish.mjs               부족할 때만 채움 (기본 동작)
//   node replenish.mjs --min 10      대기 주제가 10개 미만이면 채움
//   node replenish.mjs --count 6     한 번에 6개 생성
//   node replenish.mjs --force       개수와 상관없이 무조건 채움
//   node replenish.mjs --no-search   웹 검색 없이 (더 싸지만 시의성 떨어짐)
//
// generate.mjs 앞에 두면 주제 큐가 마르지 않습니다.

import Anthropic from '@anthropic-ai/sdk';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, writeJson } from './lib/json.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const config = readJson(path.join(HERE, 'site.config.json'));

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const MIN_QUEUE = Math.max(1, parseInt(value('min', '8'), 10) || 8);
const BATCH = Math.max(1, parseInt(value('count', '8'), 10) || 8);
const FORCE = flag('force');
const USE_SEARCH = !flag('no-search');

// 글에서 링크할 수 있는 페이지. 모델은 이 중에서만 고릅니다.
const RELATED = {
  salary: { href: '../salary.html', label: '연봉 실수령액 계산기' },
  index: { href: '../index.html', label: '계산기 전체 목록' },
};

const TOPICS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['topics'],
  properties: {
    topics: {
      type: 'array',
      description: `새 주제 ${BATCH}개.`,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['slug', 'title', 'angle', 'keywords', 'related'],
        properties: {
          slug: {
            type: 'string',
            description: 'URL용 슬러그. 한글을 로마자로 옮긴 영소문자·숫자·하이픈만. 예: toejikgeum-gyesan',
            pattern: '^[a-z0-9-]+$',
          },
          title: { type: 'string', description: '제목 가안.' },
          angle: {
            type: 'string',
            description: '이 글에서 실제로 다뤄야 할 각도. 무엇을 설명할지 구체적으로.',
          },
          keywords: {
            type: 'array',
            description: '실제로 검색될 만한 표현 3~5개.',
            items: { type: 'string' },
          },
          related: {
            type: 'string',
            enum: ['salary', 'index'],
            description: '연봉·급여·세후소득 관련이면 salary, 그 외에는 index.',
          },
        },
      },
    },
  },
};

const SYSTEM = `당신은 한국 생활 금융 정보 사이트의 편집자입니다. 독자는 세금·급여·부동산 계산을 직접 해보려는 일반인입니다.

주제를 고르는 기준:
- 사람들이 실제로 검색하는 것. 검색량이 없는 주제는 쓸모가 없습니다.
- 제도가 헷갈려서 설명이 필요한 것. 한 줄로 답이 끝나는 질문은 글이 되지 않습니다.
- 계산기 사이트에 어울리는 것. 독자는 계산 결과의 근거를 알고 싶어서 들어옵니다.
- 이미 있는 주제와 겹치지 않는 것. 각도만 살짝 다른 중복 주제를 만들지 마세요.

angle에는 "무엇을 설명할지"를 구체적으로 쓰세요. 제목을 풀어 쓴 문장이 아니라, 글의 뼈대가 되어야 합니다.`;

// ── 실행 ────────────────────────────────────────────────────
const topicsPath = path.join(HERE, 'topics.json');
const topics = readJson(topicsPath);
const pending = topics.filter((t) => !t.published);

console.log(`대기 중인 주제 ${pending.length}개 (기준 ${MIN_QUEUE}개)`);

if (!FORCE && pending.length >= MIN_QUEUE) {
  console.log('충분합니다. 새로 만들지 않았습니다.');
  process.exit(0);
}

const existing = topics.map((t) => `- ${t.title} (${t.slug})`).join('\n');

const userPrompt = `아래는 이 사이트에 이미 있거나 예정된 주제 전체입니다.

${existing}

이와 겹치지 않는 새 주제 ${BATCH}개를 제안해주세요.${
  USE_SEARCH
    ? '\n\n웹 검색으로 요즘 사람들이 실제로 무엇을 찾고 있는지, 최근에 바뀐 제도가 있는지 확인한 뒤 고르세요.'
    : ''
}`;

const client = new Anthropic();
const messages = [{ role: 'user', content: userPrompt }];
const tools = USE_SEARCH
  ? [{ type: 'web_search_20260209', name: 'web_search', max_uses: config.maxSearches }]
  : undefined;

let response;
for (let attempt = 0; attempt < 6; attempt++) {
  response = await client.messages.create({
    model: config.model,
    max_tokens: config.maxTokens,
    system: SYSTEM,
    messages,
    ...(tools ? { tools } : {}),
    output_config: {
      effort: config.effort,
      format: { type: 'json_schema', schema: TOPICS_SCHEMA },
    },
  });

  if (response.stop_reason === 'refusal') {
    throw new Error(`모델이 생성을 거부했습니다 (${response.stop_details?.category ?? 'unknown'}).`);
  }
  if (response.stop_reason === 'max_tokens') {
    throw new Error('출력이 max_tokens에서 잘렸습니다. site.config.json의 maxTokens를 올리세요.');
  }
  if (response.stop_reason !== 'pause_turn') break;

  messages.push({ role: 'assistant', content: response.content });
}

if (response.stop_reason === 'pause_turn') {
  throw new Error('웹 검색이 반복 한도에 도달했습니다. --no-search로 다시 시도해보세요.');
}

const raw = response.content.filter((b) => b.type === 'text').at(-1)?.text;
if (!raw) throw new Error('응답에 텍스트 블록이 없습니다.');

const usage = response.usage;
const cost =
  (usage.input_tokens / 1e6) * config.pricing.inputPerMTok +
  (usage.output_tokens / 1e6) * config.pricing.outputPerMTok;
console.log(`토큰 ${usage.input_tokens} in / ${usage.output_tokens} out · 약 $${cost.toFixed(3)}`);

// ── 검증 후 추가 ────────────────────────────────────────────
// 모델이 슬러그나 제목을 겹치게 낼 수 있으므로 여기서 한 번 더 거릅니다.
const seenSlugs = new Set(topics.map((t) => t.slug));
const seenTitles = new Set(topics.map((t) => t.title.replace(/\s+/g, '')));

const added = [];
const skipped = [];

for (const t of JSON.parse(raw).topics) {
  if (!/^[a-z0-9-]+$/.test(t.slug)) {
    skipped.push(`${t.title} — 슬러그 형식 위반(${t.slug})`);
    continue;
  }
  if (seenSlugs.has(t.slug)) {
    skipped.push(`${t.title} — 슬러그 중복(${t.slug})`);
    continue;
  }
  if (seenTitles.has(t.title.replace(/\s+/g, ''))) {
    skipped.push(`${t.title} — 제목 중복`);
    continue;
  }

  seenSlugs.add(t.slug);
  seenTitles.add(t.title.replace(/\s+/g, ''));
  added.push({
    slug: t.slug,
    title: t.title,
    angle: t.angle,
    keywords: t.keywords,
    related: RELATED[t.related] ?? RELATED.index,
    published: null,
  });
}

for (const s of skipped) console.log(`  - 건너뜀: ${s}`);

if (added.length === 0) {
  console.log('추가할 주제가 없습니다. 전부 중복이었습니다.');
  process.exit(0);
}

topics.push(...added);
writeJson(topicsPath, topics);

for (const t of added) console.log(`  + ${t.title} (${t.slug})`);
console.log(`\n주제 ${added.length}개 추가 — 대기 ${pending.length + added.length}개가 됐습니다.`);
