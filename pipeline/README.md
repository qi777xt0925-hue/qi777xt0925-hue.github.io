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

> **2026년 8월 31일까지는 도입 할인가($2 / $10)가 적용됩니다.** `pricing`에는 정가를 넣어두었으므로, 할인 기간에는 콘솔에 찍히는 금액이 실제 차감액보다 약 3분의 1 높게 나옵니다. 실제 잔액은 console.anthropic.com 결제 페이지에서 확인하세요.

실측: 웹 검색 6회 설정에서 글 한 편에 $0.61이 나갔습니다(입력 207,806 · 출력 13,236 토큰, 할인가 기준). 검색을 3회로 줄인 뒤에는 약 $0.35로 예상합니다. 주 1회 발행이면 월 $1.5 안팎입니다.

**비용은 글이 생성되는 시점에 나갑니다.** 자동 검수에서 탈락해 발행되지 않아도, 워크플로가 돌아 글이 만들어진 순간 이미 차감된 상태입니다. 검수·배포 자체는 무료입니다(GitHub Actions·Pages).

더 싸게 가려면:

- `effort`를 `"low"`로 (품질 하락은 생각보다 작습니다)
- `model`을 `"claude-haiku-4-5"`로 + `pricing`을 `1` / `5`로 (대신 세금·요율 같은 수치 정확도가 떨어집니다. 이 사이트 주제에는 권하지 않습니다)
- `--no-search`로 실행 (검색 비용은 사라지지만 최신 수치를 못 씁니다)

## 자동 실행

`.github/workflows/publish.yml`이 한 편 생성하고, 자동 검수를 통과하면 **사람의 승인 없이 main에 바로 올립니다.** 정기 실행은 크레딧을 아끼려고 2026-08-30에 껐습니다(주석 처리). 켜면 매주 월요일 오전 9시(KST)에 돕니다. 그러면 `pages.yml`이 `site/`를 GitHub Pages에 배포하고, `indexnow.yml`이 네이버·Bing에 색인을 통보합니다.

리포지터리 Settings → Secrets and variables → Actions에 `ANTHROPIC_API_KEY`를 등록해야 동작합니다.

한 편만 사람이 보고 넘기고 싶으면 Actions 탭에서 수동 실행할 때 `pr` 체크박스를 켜면 PR로 돌아갑니다.

흐름:

```
주제 큐 보충 → 글 생성 → 자동 검수 → (통과) 목록·사이트맵 재생성 → main 푸시 → 배포 → 색인 통보
                              └ (탈락) site/_drafts/ 로 격리 + 주제를 대기열로 복귀 + 이슈로 알림
```

## 자동 검수 (`validate.mjs`)

사람이 읽지 않고 발행하므로, 사람이 하던 검토를 여기서 대신합니다.

```bash
node validate.mjs                    # site/posts 전체 검사
node validate.mjs --only a,b         # 특정 글만
node validate.mjs --quarantine       # 탈락한 글을 _drafts로 격리
node validate.mjs --no-network       # 출처 링크 확인 생략 (빠름)
```

검사 항목: 낡은 요율, 분량(1,500자 이상), 구성(소제목 4개·FAQ 3개·h1), 출처 유무와 생존 여부, 내부 링크, 초안 흔적, 기존 글과의 중복, JSON-LD.

**요율이 바뀌면 `facts.json` 한 곳만 고치세요.** 이 파일이 "지금 무엇이 맞는 값인가"의 단일 기준입니다.

낡은 수치 검사는 문맥을 봅니다. "2025년에는 12.95%였다" 처럼 과거를 설명하는 문장은 통과시키고, 낡은 수치를 **현재 사실로 주장할 때만** 막습니다. 판단에 쓰는 단서는 `facts.json`의 `과거형표현` 목록입니다.

## 사람 검토 없이 발행하는 것의 위험

Google은 검색 순위만 노린 대량 생산 콘텐츠를 정책 위반(scaled content abuse)으로 봅니다. AI로 썼는지 여부가 기준이 아니라 **읽을 가치가 있는지**가 기준입니다.

자동 검수는 형식과 수치를 검사할 뿐, **글이 읽을 만한지는 판단하지 못합니다.** 검수를 통과했다고 좋은 글이라는 뜻은 아닙니다. 완화 장치는 이 정도입니다.

- 주 1회로 속도를 낮춰 대량 생산으로 보이지 않게 함
- 출처 표시를 강제해 근거를 남김
- 분량·구성 하한으로 얇은 글을 걸러냄
- `replenish.mjs`가 실제로 검색될 법한 롱테일 주제만 뽑도록 함

그래도 **가끔은 직접 읽어보는 게 좋습니다.** 특히 애드센스 신청 직전에는 20편을 훑어보세요. 이상한 글이 있으면 `site/posts/`에서 파일을 지우고 `npm run build`를 돌리면 사이트에서 사라집니다.

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
