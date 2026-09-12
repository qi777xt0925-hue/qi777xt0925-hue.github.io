// 이미 써 둔 네이버 블로그용 원고(Downloads\숏폼\blog\*.txt)를
// 계산기랩 사이트 포스트 HTML로 변환합니다. 모델 호출이 없으므로 비용은 0원입니다.
//
//   node import-blog.mjs           변환 후 파일 기록
//   node import-blog.mjs --dry     기록하지 않고 파싱 결과만 확인

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { renderPost } from './lib/render.mjs';
import { readJson } from './lib/json.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const SITE = path.join(ROOT, 'site');
const SRC = path.join(os.homedir(), 'Downloads', '숏폼', 'blog');

const DRY = process.argv.includes('--dry');
const DATE = new Date().toISOString().slice(0, 10);

const config = readJson(path.join(HERE, 'site.config.json'));

// ── 원고별 메타 ─────────────────────────────────────────────
// slug: topics.json에 이미 있는 항목은 그 slug를 그대로 써서 중복 주제 생성을 막습니다.
const META = {
  '01': {
    slug: 'yeonbong-5000-silsuryeong',
    description:
      '연봉 5,000만원 계약 시 월 실수령액이 얼마인지 4대보험·소득세 항목별로 끝까지 계산했다. 연봉 3,000만원부터 1억원까지 구간별 실수령액 표도 함께 정리했다.',
    sources: ['nps', 'nhis', 'nts'],
  },
  '02': {
    slug: 'sikdae-bigwase-20',
    description:
      '비과세 식대 20만원이 실수령액을 얼마나 늘리는지 같은 연봉으로 비교했다. 20만원보다 큰 효과가 나는 이유와 한도를 넘겼을 때의 처리까지 정리했다.',
    sources: ['nts', 'nhis'],
  },
  '03': {
    slug: 'yeonbong-hyeopsang',
    description:
      '연봉이 500만원 올라도 월급은 41만원이 오르지 않는 이유를 항목별로 나눠 계산했다. 세율 구간을 넘으면 손해라는 오해도 함께 정리했다.',
    sources: ['nts'],
  },
  '04': {
    slug: 'gukmin-yeongeum-sangan',
    description:
      '국민연금 기준소득월액 상한 때문에 고연봉 구간에서 공제율 상승이 완만해지는 구조를 숫자로 확인했다. 상한이 조정되는 시점과 연금 수령액에 미치는 영향도 짚었다.',
    sources: ['nps'],
  },
  '05': {
    slug: 'juhyu-sudang',
    description:
      '주휴수당 계산식과 주 15시간 기준의 의미를 정리했다. 근로시간별 주휴수당 표와, 급여명세서에 항목이 없을 때 확인할 지점까지 담았다.',
    sources: ['moel', 'minwage'],
  },
  '06': {
    slug: 'juhyu-sudang-mibulip',
    description:
      '주휴수당을 받지 못했을 때 증빙 수집부터 고용노동부 진정까지의 절차를 순서대로 정리했다. 임금채권 시효와 퇴사 후 청구 가능 여부도 함께 다뤘다.',
    sources: ['moel', 'law'],
  },
  '07': {
    slug: 'choejeoimgeum-2026',
    description:
      '2026년 최저임금 시급 10,320원을 월급으로 환산하면 얼마인지, 209시간 기준이 어떻게 나오는지 정리했다. 근로시간별 월 최저임금 표도 함께 담았다.',
    sources: ['minwage', 'moel'],
  },
  '08': {
    slug: 'toejikgeum-gyesan',
    description:
      '퇴직금 계산식과 1일 평균임금 산정 기준을 월급 300만원 사례로 계산했다. 근속연수별 퇴직금 표와 평균임금에 포함되는 항목까지 정리했다.',
    sources: ['moel', 'law'],
  },
  '09': {
    slug: 'toejikgeum-1nyeon',
    description:
      '근속 1년을 하루 차이로 채우지 못하면 퇴직금이 어떻게 되는지, 재직일수를 세는 정확한 방법을 정리했다. 1년 시점이 다가올 때 확인할 것도 함께 담았다.',
    sources: ['moel', 'law'],
  },
  '10': {
    slug: 'toejik-sodeukse',
    description:
      '퇴직소득세가 근속연수에 따라 달라지는 구조를 계산 순서대로 풀었다. 오래 다닐수록 세부담이 줄어드는 이유를 실제 숫자로 확인했다.',
    sources: ['nts'],
  },
  '11': {
    slug: 'wonrigeum-gyundeung',
    description:
      '3억원 30년 대출을 원리금균등·원금균등·만기일시로 나눠 월 납입액과 총이자를 비교했다. 금리와 기간에 따른 차이 표도 함께 정리했다.',
    sources: ['hf'],
  },
  '12': {
    slug: 'daechul-geochi-gigan',
    description:
      '거치기간을 두면 총이자가 얼마나 늘어나는지 3억원·연 4%·30년 조건으로 비교했다. 거치가 유리한 경우와 거치 종료 시점의 부담도 함께 짚었다.',
    sources: ['hf'],
  },
  '13': {
    slug: 'wollise-jeonhwanyul',
    description:
      '전세를 월세로 돌리자는 제안이 적정한지 전월세 전환율로 판단하는 방법을 정리했다. 법정 상한과 실제 적용 범위, 전환율별 월세 표까지 담았다.',
    sources: ['law', 'molit'],
  },
  '14': {
    slug: 'pyeongsu-jegopmiteo',
    description:
      '84제곱미터가 34평으로 불리는 이유를 전용면적과 공급면적의 차이로 설명했다. 자주 쓰는 면적의 평 환산 표도 함께 정리했다.',
    sources: ['molit'],
  },
};

const SOURCE_BOOK = {
  nps: { name: '국민연금공단', url: 'https://www.nps.or.kr' },
  nhis: { name: '국민건강보험공단', url: 'https://www.nhis.or.kr' },
  nts: { name: '국세청', url: 'https://www.nts.go.kr' },
  moel: { name: '고용노동부', url: 'https://www.moel.go.kr' },
  minwage: { name: '최저임금위원회', url: 'https://www.minimumwage.go.kr' },
  law: { name: '국가법령정보센터', url: 'https://www.law.go.kr' },
  hf: { name: '한국주택금융공사', url: 'https://www.hf.go.kr' },
  molit: { name: '국토교통부', url: 'https://www.molit.go.kr' },
};

// ── 파싱 ────────────────────────────────────────────────────

/** 본문 시작~본문 끝 사이만 잘라냅니다. */
function extractBody(raw) {
  const lines = raw.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === '본문 시작');
  const end = lines.findIndex((l) => l.trim() === '본문 끝');
  if (start < 0 || end < 0) throw new Error('본문 경계를 찾지 못했습니다');
  // 경계선(───) 한 줄씩을 건너뜁니다.
  return lines.slice(start + 2, end - 1);
}

const isDivider = (l) => /^[─═]+$/.test(l.trim());
const isNoise = (l) => {
  const t = l.trim();
  return (
    !t ||
    isDivider(l) ||
    t.startsWith('★') ||
    t.startsWith('▶') ||
    t.startsWith('http') ||
    t.startsWith('(에디터')
  );
};

function parse(raw) {
  const lines = extractBody(raw);

  const intro = [];
  const sections = [];
  const faq = [];
  let cur = null; // 현재 섹션
  let pendingQ = null;

  /** 지금 위치에 블록 하나를 넣습니다. 첫 소제목 전이면 도입부로 갑니다. */
  const push = (block) => {
    if (!cur) {
      if (block.type === 'p') intro.push(block.text);
      return; // 도입부에는 표·목록을 두지 않습니다.
    }
    cur.blocks.push(block);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    if (isNoise(line)) continue;

    // 소제목
    if (t.startsWith('■')) {
      const heading = t.replace(/^■\s*/, '').replace(/^\d+\.\s*/, '');
      // 원고에 같은 소제목이 연달아 두 번 나오는 경우가 있어 하나로 합칩니다.
      const prev = sections[sections.length - 1];
      if (prev && prev.heading === heading) {
        cur = prev;
        continue;
      }
      cur = { heading, blocks: [] };
      sections.push(cur);
      continue;
    }

    // 강조 숫자
    const fig = t.match(/^\[이미지\s*\d*\]\s*(.+?)\s*[—–-]\s*(.+)$/);
    if (fig) {
      push({ type: 'figure', label: fig[1], value: fig[2] });
      continue;
    }

    // 표
    if (t.startsWith('[표]')) {
      const head = t
        .replace(/^\[표\]\s*/, '')
        .split('/')
        .map((s) => s.trim());
      const rows = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        const r = lines[j].trim();
        if (!r) continue;
        if (!r.includes('|')) break;
        const cells = r.split('|').map((s) => s.trim());
        // 표 안에 다시 들어 있는 머리글 줄은 건너뜁니다.
        if (cells.join('|') === head.join('|')) continue;
        rows.push(cells);
      }
      i = j - 1;
      if (rows.length) push({ type: 'table', head, rows });
      continue;
    }

    // 목록
    if (t.startsWith('·')) {
      const item = t.replace(/^·\s*/, '');
      const last = cur?.blocks[cur.blocks.length - 1];
      if (last?.type === 'ul') last.items.push(item);
      else push({ type: 'ul', items: [item] });
      continue;
    }

    // 참고 상자
    if (t.startsWith('※')) {
      push({ type: 'note', text: t.replace(/^※\s*/, '') });
      continue;
    }

    // 질문·답변은 본문에서 빼서 FAQ로 모읍니다.
    if (/^Q\.\s*/.test(t)) {
      pendingQ = t.replace(/^Q\.\s*/, '');
      continue;
    }
    if (/^A\.\s*/.test(t)) {
      if (pendingQ) faq.push({ q: pendingQ, a: t.replace(/^A\.\s*/, '') });
      pendingQ = null;
      continue;
    }

    push({ type: 'p', text: t });
  }

  // Q·A만 있던 섹션은 비게 되므로 버립니다.
  const kept = sections.filter((s) => s.blocks.length);
  return { intro, sections: kept, faq };
}

// ── 실행 ────────────────────────────────────────────────────

const files = fs
  .readdirSync(SRC)
  .filter((f) => f.endsWith('.txt'))
  .sort();

const topics = readJson(path.join(HERE, 'topics.json'));
const byslug = new Map(topics.map((t) => [t.slug, t]));

// 1단계 — 전부 읽어서 파싱만 합니다. 내부 링크를 서로 걸려면
// 어떤 글이 있는지 먼저 다 알아야 하기 때문입니다.
const parsed = [];

for (const file of files) {
  const id = file.slice(0, 2);
  const meta = META[id];
  if (!meta) {
    console.warn(`건너뜀 — 메타 없음: ${file}`);
    continue;
  }

  const raw = fs.readFileSync(path.join(SRC, file), 'utf8');
  const info = readJson(path.join(SRC, `${id}.json`));
  const { intro, sections, faq } = parse(raw);

  // 절대 URL로 적힌 계산기 링크를 사이트 내부 상대 경로로 바꿉니다.
  const related = info.calc
    ? {
        href: '../' + info.calc.href.replace(/^https?:\/\/[^/]+\//, ''),
        label: info.calc.label,
      }
    : null;

  parsed.push({
    id,
    meta,
    info,
    related,
    article: {
      title: info.title,
      h1: info.title,
      description: meta.description,
      lead: intro[0] ?? '',
      intro: intro.slice(1),
      sections,
      faq,
      sources: (meta.sources ?? []).map((k) => SOURCE_BOOK[k]).filter(Boolean),
    },
  });
}

// 이미 사이트에 있던 글도 링크 대상에 넣습니다.
const all = [
  ...topics
    .filter((t) => t.published && !parsed.some((p) => p.meta.slug === t.slug))
    .map((t) => ({ slug: t.slug, h1: t.h1 ?? t.title, description: t.description ?? '' })),
  ...parsed.map((p) => ({
    slug: p.meta.slug,
    h1: p.info.title,
    description: p.meta.description,
  })),
];

// 2단계 — 렌더링과 기록.
let written = 0;

for (const { id, meta, info, related, article } of parsed) {
  const others = all.filter((p) => p.slug !== meta.slug);
  const html = renderPost(article, { slug: meta.slug, related }, config, DATE, others);

  const chars = article.sections
    .flatMap((s) => s.blocks)
    .filter((b) => b.type === 'p')
    .reduce((n, b) => n + b.text.length, 0);

  console.log(
    `${id} ${meta.slug}  섹션 ${article.sections.length} · FAQ ${article.faq.length} · 본문 ${chars}자`
  );

  if (!DRY) {
    fs.writeFileSync(path.join(SITE, 'posts', `${meta.slug}.html`), html, 'utf8');
    written++;

    // topics.json 갱신 — 있으면 발행 표시, 없으면 새로 추가합니다.
    const existing = byslug.get(meta.slug);
    if (existing) {
      existing.published = DATE;
      existing.h1 = info.title;
      existing.description = meta.description;
      if (related) existing.related = related;
    } else {
      const entry = {
        slug: meta.slug,
        title: info.title,
        angle: '',
        keywords: info.tags ?? [],
        related,
        published: DATE,
        h1: info.title,
        description: meta.description,
      };
      topics.push(entry);
      byslug.set(meta.slug, entry);
    }
  }
}

if (!DRY) {
  fs.writeFileSync(
    path.join(HERE, 'topics.json'),
    JSON.stringify(topics, null, 2) + '\n',
    'utf8'
  );
  console.log(`\n포스트 ${written}편 기록 · topics.json 갱신 완료`);
  console.log('이어서 `node build.mjs`를 실행하세요.');
} else {
  console.log('\n--dry 모드였습니다. 기록하지 않았습니다.');
}
