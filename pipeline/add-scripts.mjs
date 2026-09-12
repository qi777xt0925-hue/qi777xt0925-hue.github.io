// 사이트의 모든 페이지 <head>에 애널리틱스·애드센스 스크립트를 심습니다.
// 마커 사이만 갈아끼우므로 몇 번을 다시 돌려도 중복되지 않습니다.
//
//   node add-scripts.mjs --ga G-XXXXXXXXXX
//   node add-scripts.mjs --adsense ca-pub-0000000000000000
//   node add-scripts.mjs --ga G-XXXXXXXXXX --adsense ca-pub-0000000000000000
//   node add-scripts.mjs --remove
//
// build.mjs가 guides.html을 다시 만들면 그 페이지의 스크립트는 지워지므로
// 순서는 항상 build.mjs → add-scripts.mjs 입니다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(HERE, '..', 'site');

const START = '<!-- SCRIPTS:START -->';
const END = '<!-- SCRIPTS:END -->';

// 소유권 확인용 파일은 내용이 바뀌면 인증이 깨질 수 있어 건드리지 않습니다.
const SKIP = /^(google[0-9a-f]+|naver[0-9a-f]+)\.html$/;

const argOf = (name) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : null;
};

const ga = argOf('--ga');
const adsense = argOf('--adsense');
const remove = process.argv.includes('--remove');

if (!ga && !adsense && !remove) {
  console.error('사용법: node add-scripts.mjs --ga G-XXXXXXXXXX [--adsense ca-pub-...]');
  process.exit(1);
}
if (ga && !/^G-[A-Z0-9]{6,}$/i.test(ga)) {
  console.error(`측정 ID 형식이 아닙니다: ${ga} (G-로 시작해야 합니다)`);
  process.exit(1);
}
if (adsense && !/^ca-pub-\d{10,}$/.test(adsense)) {
  console.error(`애드센스 게시자 ID 형식이 아닙니다: ${adsense} (ca-pub-숫자)`);
  process.exit(1);
}

function block() {
  if (remove) return '';
  const parts = [];
  if (ga) {
    parts.push(`<script async src="https://www.googletagmanager.com/gtag/js?id=${ga}"></script>
<script>
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${ga}');
</script>`);
  }
  if (adsense) {
    parts.push(
      `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsense}" crossorigin="anonymous"></script>`
    );
  }
  return parts.join('\n');
}

const payload = block();

// site/ 아래 모든 html을 모읍니다(하위 폴더 포함).
function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith('.html') && !SKIP.test(e.name)) out.push(p);
  }
  return out;
}

let touched = 0;
let skipped = 0;

for (const file of walk(SITE)) {
  let html = fs.readFileSync(file, 'utf8');
  const wrapped = payload ? `${START}\n${payload}\n${END}` : `${START}${END}`;

  if (html.includes(START) && html.includes(END)) {
    const before = html.slice(0, html.indexOf(START));
    const after = html.slice(html.indexOf(END) + END.length);
    const next = before + wrapped + after;
    if (next === html) {
      skipped++;
      continue;
    }
    html = next;
  } else {
    if (!html.includes('</head>')) {
      console.warn(`! </head>가 없어 건너뜁니다: ${path.relative(SITE, file)}`);
      continue;
    }
    html = html.replace('</head>', `${wrapped}\n</head>`);
  }

  fs.writeFileSync(file, html, 'utf8');
  touched++;
}

const what = remove ? '제거' : [ga && 'GA4', adsense && '애드센스'].filter(Boolean).join('·');
console.log(`${what} — ${touched}개 페이지 반영, ${skipped}개는 이미 동일`);
