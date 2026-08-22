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

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

const config = readJson(path.join(HERE, 'site.config.json'));

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

// ── 출력 스키마 ──────────────────────────────────────────────
// 구조화 출력(structured outputs)은 모든 객체에 additionalProperties:false 와
// required 전체 나열을 요구합니다. 선택 필드 대신 빈 배열/빈 문자열을 씁니다.
const ARTICLE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'h1', 'description', 'lead', 'sections', 'faq'],
  properties: {
    title: { type: 'string', description: '<title> 태그용. 사이트명 제외 45자 이내.' },
    h1: { type: 'string', description: '본문 대제목. title과 달라도 됨.' },
    description: { type: 'string', description: 'meta description. 90~150자.' },
    lead: { type: 'string', description: '도입 한두 문장. 이 글이 무엇을 알려주는지.' },
    sections: {
      type: 'array',
      description: '본문 섹션 4~7개.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['heading', 'paragraphs', 'bullets', 'note'],
        properties: {
          heading: { type: 'string' },
          paragraphs: { type: 'array', items: { type: 'string' } },
          bullets: {
            type: 'array',
            description: '나열이 자연스러운 곳에만. 필요 없으면 빈 배열.',
            items: { type: 'string' },
          },
          note: {
            type: 'string',
            description: '주의사항 박스. 필요 없으면 빈 문자열.',
          },
        },
      },
    },
    faq: {
      type: 'array',
      description: '실제로 검색될 법한 질문 3~5개.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['q', 'a'],
        properties: { q: { type: 'string' }, a: { type: 'string' } },
      },
    },
  },
};

const SYSTEM = `당신은 한국 생활 금융 정보 사이트의 필자입니다. 독자는 세금·급여·부동산 계산을 직접 해보려는 일반인입니다.

작성 원칙:
- 제도가 "어떻게 작동하는지"를 설명하세요. 숫자를 나열하는 글이 아니라, 읽고 나면 스스로 판단할 수 있게 되는 글입니다.
- 구체적인 요율·금액·기준은 확인된 것만 쓰세요. 확실하지 않으면 수치를 지어내지 말고 "기준이 매년 조정되므로 공식 자료에서 확인하라"는 식으로 안내하세요. 틀린 숫자는 없는 숫자보다 나쁩니다.
- 실제로 헷갈리는 지점을 다루세요. 검색하면 바로 나오는 정의를 반복하지 마세요.
- 문장은 평서문으로 짧게. 마케팅 표현, 감탄사, 이모지, "~하시길 바랍니다" 같은 상투어를 쓰지 마세요.
- 독자를 "여러분"이라고 부르지 말고, 필요하면 그냥 주어를 생략하세요.
- 과장하거나 단정하지 마세요. 예외가 있는 규칙은 예외가 있다고 쓰세요.
- 세무·법률 판단이 필요한 대목에서는 전문가 상담이 필요하다고 명시하세요.

분량: 섹션 4~7개, 전체 1,500~2,500자 정도. 채우기 위한 문단을 넣지 마세요.`;

// ── 모델 호출 ────────────────────────────────────────────────
const client = new Anthropic(); // ANTHROPIC_API_KEY 환경변수에서 자동으로 읽습니다

async function writeArticle(topic) {
  const userPrompt = `아래 주제로 글을 써주세요.

제목(가안): ${topic.title}
다뤄야 할 각도: ${topic.angle}
독자가 검색할 만한 표현: ${topic.keywords.join(', ')}

이 글은 계산기 사이트에 실립니다. 독자는 계산 결과의 근거를 알고 싶어서 들어옵니다.${
    USE_SEARCH
      ? '\n\n수치나 제도 기준이 필요한 부분은 웹 검색으로 현재 기준을 확인한 뒤 쓰세요. 검색해도 확실하지 않으면 수치를 쓰지 말고 확인 방법을 안내하세요.'
      : ''
  }`;

  const tools = USE_SEARCH
    ? [{ type: 'web_search_20260209', name: 'web_search', max_uses: 6 }]
    : undefined;

  const messages = [{ role: 'user', content: userPrompt }];
  let response;

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

  const usage = response.usage;
  const cost =
    (usage.input_tokens / 1e6) * 5 + (usage.output_tokens / 1e6) * 25; // Opus 5 기준 $5 / $25 per MTok
  console.log(
    `    토큰 ${usage.input_tokens} in / ${usage.output_tokens} out · 약 $${cost.toFixed(3)}`
  );

  return JSON.parse(raw);
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

  const html = renderPost(article, topic, config, today);
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
