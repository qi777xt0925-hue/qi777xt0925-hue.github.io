// 모든 페이지 <head>의 SCRIPTS 마커 사이에 들어가는 애널리틱스·애드센스 스크립트.
// render.mjs(글·목록 생성)와 add-scripts.mjs(기존 페이지 일괄 반영)가 같은 결과를 내도록 한곳에 둡니다.

export const START = '<!-- SCRIPTS:START -->';
export const END = '<!-- SCRIPTS:END -->';

/** 마커 사이에 들어갈 내용. ID가 없으면 빈 문자열입니다. */
export function scriptsPayload({ ga, adsense } = {}) {
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

/** 마커까지 포함한 블록. */
export function scriptsBlock(ids) {
  const payload = scriptsPayload(ids);
  return payload ? `${START}\n${payload}\n${END}` : `${START}${END}`;
}
