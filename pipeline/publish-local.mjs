// API 크레딧 없이 발행하기 — 글은 이 PC의 Claude Code가 쓰고, 나머지는 기존 파이프라인을 그대로 씁니다.
//
//   node publish-local.mjs next                 다음 주제 + 글쓰기 기준 + JSON 형식을 출력
//   node publish-local.mjs render <article.json> 글 JSON을 site/posts/<slug>.html 로 만들고 topics.json 갱신
//
// 그다음 순서(LOCAL_PUBLISH.md):
//   node validate.mjs --only <slug> --quarantine  → node build.mjs → git commit/push
//   → (사용자 계정 푸시라 pages.yml·indexnow.yml 이 push 트리거로 돈다) → node health.mjs --expect <slug> --wait 600
//
// generate.mjs 와 같은 글쓰기 기준(lib/writing-guide.mjs)과 같은 렌더러(lib/render.mjs)를 씁니다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPost } from './lib/render.mjs';
import { readJson, writeJson } from './lib/json.mjs';
import { ARTICLE_SCHEMA, buildSystem } from './lib/writing-guide.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const config = readJson(path.join(HERE, 'site.config.json'));
const FACTS = readJson(path.join(HERE, 'facts.json'));
const topicsPath = path.join(HERE, 'topics.json');
const topics = readJson(topicsPath);

const [cmd, arg] = process.argv.slice(2);

if (cmd === 'next') {
  const pending = topics.filter((t) => !t.published);
  if (!pending.length) {
    console.log('남은 주제 0개 — topics.json 에 주제를 먼저 추가하세요(LOCAL_PUBLISH.md 「주제 보충」).');
    process.exit(2);
  }
  const t = pending[0];
  const done = topics.filter((x) => x.published).map((x) => `- ${x.slug}: ${x.h1 ?? x.title}`);
  console.log(`# 남은 주제 ${pending.length}개\n`);
  console.log('# 이번 주제\n' + JSON.stringify(t, null, 2));
  console.log('\n# 글쓰기 기준 (generate.mjs 와 동일)\n' + buildSystem(FACTS));
  console.log(`
# 로컬 작성 추가 규칙
- 웹 검색으로 공식 자료(go.kr·or.kr 등)를 실제로 열어 확인하고, sources 에는 그 URL 만 넣는다. 2~4개.
- 계산 예시는 직접 계산해 맞는지 확인한다. 4대보험·세율은 위 「반드시 이 값」 만 쓴다.
- 섹션은 paragraphs/bullets/note 대신 blocks 를 써도 된다(표·강조 숫자를 넣을 때):
  blocks: [{type:'p',text}, {type:'ul',items:[...]}, {type:'note',text},
           {type:'table',head:[...],rows:[[...],...]}, {type:'figure',label,value}]
- 이미 발행된 글과 겹치는 내용을 길게 반복하지 않는다.

# 출력 JSON 형식 (slug 는 이번 주제 slug 그대로)
${JSON.stringify({ slug: t.slug, ...Object.fromEntries(ARTICLE_SCHEMA.required.map((k) => [k, ARTICLE_SCHEMA.properties[k].type === 'array' ? [] : ''])) }, null, 2)}

# 이미 발행된 글 (${done.length})
${done.join('\n')}`);
  process.exit(0);
}

if (cmd === 'render') {
  if (!arg) {
    console.error('사용법: node publish-local.mjs render <article.json>');
    process.exit(1);
  }
  const article = JSON.parse(fs.readFileSync(arg, 'utf8'));
  const problems = [];
  for (const k of ARTICLE_SCHEMA.required) if (article[k] == null) problems.push(`${k} 없음`);
  if (!article.slug) problems.push('slug 없음');
  if (!Array.isArray(article.sections) || article.sections.length < 4) problems.push('sections 4개 미만');
  if (!Array.isArray(article.sources) || article.sources.length < 1) problems.push('sources 비어 있음');
  for (const [i, s] of (article.sections ?? []).entries()) {
    if (!s.heading) problems.push(`sections[${i}].heading 없음`);
    if (!s.blocks?.length && !s.paragraphs?.length) problems.push(`sections[${i}] 본문 없음`);
  }
  const topic = topics.find((t) => t.slug === article.slug);
  if (!topic) problems.push(`topics.json 에 slug "${article.slug}" 가 없음`);
  else if (topic.published) problems.push(`"${article.slug}" 는 이미 ${topic.published} 에 발행됨`);
  if (problems.length) {
    console.error('✗ 렌더 중단:\n  - ' + problems.join('\n  - '));
    process.exit(1);
  }

  // KST 기준 날짜 (generate.mjs 는 UTC 를 쓰지만, 로컬 PC는 월요일 아침 KST 에 돈다)
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const others = topics.filter((t) => t.published && t.slug !== topic.slug);
  const { slug, ...body } = article;
  const html = renderPost(body, topic, config, today, others);
  const out = path.join(ROOT, 'site', 'posts', `${slug}.html`);
  fs.writeFileSync(out, html, 'utf8');

  topic.published = today;
  topic.h1 = article.h1;
  topic.description = article.description;
  writeJson(topicsPath, topics);

  const chars = html.replace(/<[^>]+>/g, '').replace(/\s+/g, '').length;
  console.log(`✓ ${path.relative(ROOT, out)} (${today}, 본문 약 ${chars}자)`);
  console.log(`다음: node validate.mjs --only ${slug} --quarantine`);
  process.exit(0);
}

console.error('사용법: node publish-local.mjs next | render <article.json>');
process.exit(1);
