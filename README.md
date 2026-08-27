# 계산기랩

연봉·퇴직금 같은 생활 금융 계산기와 해설 글을 모아둔 정적 사이트입니다.

**https://qi777xt0925-hue.github.io/**

```
site/                     배포되는 파일 전부 (이 폴더만 공개됩니다)
  index.html              허브
  salary.html             연봉 실수령액 계산기
  guides.html             글 목록          ← build.mjs가 생성
  posts/*.html            생성된 글        ← generate.mjs가 생성
  assets/style.css        공통 디자인
  assets/tax2026.js       요율·세율 계산 엔진  ← 요율 바뀌면 여기만 수정
pipeline/                 글 자동 생성 (자세한 내용은 pipeline/README.md)
  validate.mjs            발행 전 자동 검수
  facts.json              현재 맞는 요율 = 검수 기준  ← 요율 바뀌면 여기도 수정
.github/workflows/
  publish.yml             매주 금요일 오전 9시(KST) 글 생성 → 검수 → main 푸시
  indexnow.yml            배포 후 네이버·Bing에 색인 통보
  pages.yml               site/ 변경 시 자동 배포
serve.ps1                 로컬 미리보기 서버 (http://localhost:8787)
```

## 로컬에서 보기

```powershell
powershell -ExecutionPolicy Bypass -File serve.ps1
```

브라우저에서 http://localhost:8787 접속.

## 어떻게 돌아가나

1. `publish.yml`이 매주 금요일 오전 9시에 실행됩니다 (GitHub 서버에서 — 내 컴퓨터는 꺼져 있어도 됩니다)
2. 대기 주제가 8개 미만이면 `replenish.mjs`가 새 주제를 채웁니다
3. `generate.mjs`가 글 한 편을 씁니다
4. `validate.mjs`가 자동 검수합니다 — 낡은 요율·분량·출처·중복 등
5. 통과하면 `build.mjs`가 목록·사이트맵을 갱신하고 **main에 바로 푸시합니다**
6. `pages.yml`이 배포하고, `indexnow.yml`이 네이버·Bing에 색인을 통보합니다

**사람이 승인할 단계는 없습니다.** 검수에서 탈락한 글은 `site/_drafts/`로 격리되고 주제는 대기열로 돌아가며, 이슈가 열려 메일로 알려줍니다.

검수가 무엇을 보는지, 그리고 사람 검토 없이 발행하는 것의 한계는 `pipeline/README.md`에 적어두었습니다.

## 왜 주 1회인가

`guides.html`·`sitemap.xml`·`index.html`은 글이 추가될 때마다 통째로 다시 생성됩니다. 여러 발행이 동시에 돌면 서로 같은 줄을 다르게 고쳐 충돌합니다.

주 1회면 이 문제가 생기지 않고, 검색엔진 눈에도 "대량 생산"으로 보이지 않습니다. 주기를 늘리려면 워크플로의 `concurrency` 설정(이미 `group: publish`로 직렬화돼 있음)에 기대되, 그만큼 품질 위험이 커진다는 점을 감안하세요.

## 필요한 설정

저장소 Settings → Secrets and variables → Actions에 `ANTHROPIC_API_KEY`를 등록해야 글이 생성됩니다. 없으면 워크플로가 실패합니다.

## 크몽 상품은 여기 없습니다

가계부·자영업 장부 엑셀 상품과 그 생성 스크립트는 비공개 저장소 `gyesangilab`에 있습니다. 이 저장소에는 사이트와 글 생성 코드만 있습니다.
