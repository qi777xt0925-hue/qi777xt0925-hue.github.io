# 콘텐츠 파이프라인

주제 목록에서 하나를 골라 → Claude API로 글을 쓰고 → 사이트 디자인에 맞춘 정적 HTML로 저장하고 → 목록·사이트맵을 다시 만듭니다. 서버가 없고, 결과물은 전부 정적 파일입니다.

```
topics.json        주제 큐. 여기에 주제를 추가하면 다음 실행 때 하나씩 소비됩니다.
site.config.json   도메인·모델·비용 설정
replenish.mjs      주제 큐 보충 (부족할 때만 API 호출)
generate.mjs       글 생성 (API 호출 있음 = 비용 발생)
build.mjs          목록·사이트맵 재생성 (API 호출 없음 = 0원)
lib/render.mjs     HTML 템플릿
```

## 준비

Node.js 24와 의존성은 이미 설치돼 있습니다. 새로 설치할 필요 없습니다.

남은 건 API 키 하나뿐입니다. [console.anthropic.com](https://console.anthropic.com)에서 발급받아 환경변수로 넣습니다.

```powershell
$env:ANTHROPIC_API_KEY = "sk-ant-..."
```

이 방식은 현재 터미널에서만 유효합니다. 매번 넣기 번거로우면 영구 등록:

```powershell
[Environment]::SetEnvironmentVariable("ANTHROPIC_API_KEY", "sk-ant-...", "User")
```

> 새 터미널을 열었는데 `node`를 못 찾으면 PATH가 아직 안 잡힌 것입니다. 터미널을 다시 열면 됩니다.

## 사용

한 편 생성하고 목록까지 갱신:

```bash
npm run publish
```

초안으로만 뽑아서 먼저 읽어보기 (`site/_drafts/`에 저장, 사이트에는 반영 안 됨):

```bash
npm run draft
```

특정 주제 지정:

```bash
node generate.mjs --slug 주휴수당
```

웹 검색 없이 (더 싸지만 최신 수치 반영 안 됨):

```bash
node generate.mjs --no-search
```

글을 손으로 고친 뒤 목록·사이트맵만 다시 만들기:

```bash
npm run build
```

## 비용

요율은 `site.config.json`의 `pricing`에서 읽습니다. 모델을 바꾸면 이 값도 같이 바꾸세요 — 안 그러면 콘솔에 찍히는 비용이 틀립니다.

현재 설정은 Claude Sonnet 5 기준 입력 $3 / 출력 $15 per 1M 토큰. 웹 검색은 별도로 1,000회당 $10입니다(이 계산에는 안 들어갑니다).

글 한 편에 대략 **$0.1~0.2**, 주 3회 발행이면 월 $1~3 수준입니다. 실행할 때마다 실제 토큰 사용량이 콘솔에 찍힙니다.

더 싸게 가려면:

- `effort`를 `"low"`로 (품질 하락은 생각보다 작습니다)
- `model`을 `"claude-haiku-4-5"`로 + `pricing`을 `1` / `5`로 (대신 세금·요율 같은 수치 정확도가 떨어집니다. 이 사이트 주제에는 권하지 않습니다)
- `--no-search`로 실행 (검색 비용은 사라지지만 최신 수치를 못 씁니다)

## 자동 실행

`.github/workflows/publish.yml`이 월·수·금 오전 9시(KST)에 한 편씩 생성해 **Pull Request로 올립니다.** 검토하고 머지하면 `pages.yml`이 `site/`를 GitHub Pages에 배포합니다.

리포지터리 Settings → Secrets and variables → Actions에 `ANTHROPIC_API_KEY`를 등록해야 동작합니다.

PR 없이 바로 발행하고 싶으면 Actions 탭에서 수동 실행 시 `direct`를 켜거나, 워크플로의 스케줄 잡에 해당 조건을 고정하세요.

## 왜 PR을 거치나

Google은 검색 순위만 노린 대량 생산 콘텐츠를 정책 위반(scaled content abuse)으로 봅니다. AI로 썼는지 여부가 기준이 아니라 **읽을 가치가 있는지**가 기준입니다. 사람이 한 번 읽고 넘기는 단계가 있으면 이 리스크가 크게 줄고, 애드센스 심사에도 유리합니다.

특히 세금·요율 같은 수치는 모델이 틀릴 수 있습니다. 프롬프트에서 "확실하지 않으면 수치를 쓰지 말라"고 지시해두긴 했지만, 발행 전에 숫자는 직접 확인하세요.

## 주제가 떨어지면

`replenish.mjs`가 발행 직전에 대기 주제 수를 세고, 8개 미만이면 새 주제를 만들어 `topics.json`에 채웁니다. 충분하면 API를 부르지 않으므로 평소에는 0원입니다.

```bash
node replenish.mjs            # 부족할 때만
node replenish.mjs --force    # 무조건 채우기
node replenish.mjs --min 12   # 기준을 12개로
```

이미 있는 주제 전체를 모델에 보여주고 겹치지 않는 것만 받으며, 슬러그·제목 중복은 스크립트에서 한 번 더 거릅니다.

## 주제 추가

`topics.json`에 항목을 추가합니다.

```json
{
  "slug": "url-에-쓸-영문-또는-한글-슬러그",
  "title": "제목 가안",
  "angle": "이 글에서 실제로 다뤄야 할 각도. 구체적으로 쓸수록 결과가 좋습니다.",
  "keywords": ["검색될 만한", "표현들"],
  "related": { "href": "../salary.html", "label": "연봉 실수령액 계산기" },
  "published": null
}
```

`published`가 `null`인 항목만 큐에 남아 있는 것으로 봅니다. 발행되면 날짜가 자동으로 채워집니다.
