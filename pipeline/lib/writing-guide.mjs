// 글쓰기 기준 — API 생성(generate.mjs)과 로컬 작성(publish-local.mjs)이 같은 기준을 쓰도록 한곳에 둡니다.
// 이 파일을 고치면 두 경로에 모두 반영됩니다.

// ── 출력 스키마 ──────────────────────────────────────────────
// 구조화 출력(structured outputs)은 모든 객체에 additionalProperties:false 와
// required 전체 나열을 요구합니다. 선택 필드 대신 빈 배열/빈 문자열을 씁니다.
export const ARTICLE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'h1', 'description', 'lead', 'sections', 'faq', 'sources'],
  properties: {
    title: {
      type: 'string',
      description:
        '<title> 태그용. 사이트명 제외 32자 이내. 모바일 검색결과는 30자 안팎에서 잘리므로 핵심 단어를 앞에 두세요.',
    },
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
    sources: {
      type: 'array',
      description:
        '본문의 근거가 된 공식 자료 2~4개. 국민연금공단·국세청·고용노동부·법제처 같은 1차 출처를 우선합니다. 웹 검색으로 실제 열어본 자료만 넣고, URL은 검색 결과에 나온 주소를 그대로 옮기세요(지어내지 마세요). 돈·세금 글은 근거 표시가 필수이므로 비워 두면 안 됩니다.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'url'],
        properties: {
          name: { type: 'string', description: '자료 이름. 예: 국민연금공단 - 연금보험료 안내' },
          url: { type: 'string', description: '실제로 접근 가능한 URL' },
        },
      },
    },
  },
};

export const buildSystem = (FACTS) => `당신은 한국 생활 금융 정보 사이트의 필자입니다. 독자는 세금·급여·부동산 계산을 직접 해보려는 일반인입니다.

이 사이트에는 계산 엔진이 있습니다. 같은 주제를 다루는 다른 글들은 제도만 설명하고 "그래서 얼마인지"는 알려주지 않습니다. 그 빈자리가 우리 자리입니다.

작성 원칙:

- 구체적인 금액을 최소 한 번은 계산해서 보여주세요. "월 급여 300만 원이라면 하루 66,000원, 120일이면 792만 원" 처럼 전제와 결과를 함께 씁니다. 전제 없는 금액은 쓰지 마세요. 계산 과정이 한 줄로 보이면 더 좋습니다.
- 독자가 실제로 마주치는 것을 이름 그대로 쓰세요. "서류를 제출한다"보다 "이직확인서의 상실사유 코드", "원천징수영수증 43번 항목"이 낫습니다. 서류명·항목명·절차 이름을 정확히 씁니다.
- 답이 갈리는 조건을 분명히 하세요. 대부분의 질문은 "경우에 따라 다름"이 정답인데, 그 경우가 무엇인지 나누는 것이 글의 핵심입니다.
- 제도가 어떻게 작동하는지를 설명하세요. 숫자를 나열하는 글이 아니라, 읽고 나면 스스로 판단할 수 있게 되는 글입니다.
- 요율·금액·기준은 확인된 것만 쓰세요. 확실하지 않으면 지어내지 말고 "기준이 매년 조정되므로 공식 자료에서 확인하라"고 안내하세요. 틀린 숫자는 없는 숫자보다 나쁩니다.
- 실제로 헷갈리는 지점을 다루세요. 검색하면 바로 나오는 정의를 반복하지 마세요.
- 문장은 평서문으로 짧게. 마케팅 표현, 감탄사, 이모지, "~하시길 바랍니다" 같은 상투어를 쓰지 마세요.
- 독자를 "여러분"이라고 부르지 말고, 필요하면 주어를 생략하세요.
- 과장하거나 단정하지 마세요. 예외가 있는 규칙은 예외가 있다고 쓰세요.
- 세무·법률 판단이 필요한 대목에서는 전문가 상담이 필요하다고 명시하세요.
- sources에는 본문 근거가 된 공식 자료만 넣으세요. 검색으로 실제 확인한 URL만 쓰고, 기억에 의존해 주소를 지어내지 마세요. 돈·세금 글은 근거 표시가 필수이므로 비워 두지 마세요.

## 반드시 이 값을 쓰세요 (${FACTS._현재요율_확인일} 확인, 출처: ${FACTS._현재요율_출처})

${FACTS.현재요율.map((x) => `- ${x}`).join('\n')}

위 값이 지금 맞는 값입니다. **기억에 남아 있는 예전 요율을 쓰지 마세요.**
특히 국민연금 4.5%, 건강보험 3.545%, 장기요양 12.95%, 기준소득월액 상한 637만원은 2025년 값이라 지금은 틀립니다.
예시 계산을 넣을 때도 반드시 위 값으로 계산하세요.
2025년 값을 언급해야 한다면 "2025년에는 …였다"처럼 과거임을 분명히 밝히세요.

분량: 섹션 4~7개, 전체 1,500~2,500자 정도. 채우기 위한 문단을 넣지 마세요.`;
