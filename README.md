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
.github/workflows/
  publish.yml             월·수·금 오전 9시(KST) 글 생성 → PR
  pages.yml               site/ 변경 시 자동 배포
serve.ps1                 로컬 미리보기 서버 (http://localhost:8787)
```

## 로컬에서 보기

```powershell
powershell -ExecutionPolicy Bypass -File serve.ps1
```

브라우저에서 http://localhost:8787 접속.

## 어떻게 돌아가나

1. `publish.yml`이 월·수·금 오전 9시에 실행됩니다 (GitHub 서버에서 — 내 컴퓨터는 꺼져 있어도 됩니다)
2. 대기 주제가 8개 미만이면 `replenish.mjs`가 새 주제를 채웁니다
3. `generate.mjs`가 글 한 편을 쓰고, `build.mjs`가 목록·사이트맵을 갱신합니다
4. Pull Request가 하나 올라옵니다
5. **내용을 확인하고 머지하면** `pages.yml`이 사이트를 다시 배포합니다

4~5단계에 사람이 한 번 개입하는 건 의도된 설계입니다. 이유는 `pipeline/README.md`의 "왜 PR을 거치나"를 보세요.

## 필요한 설정

저장소 Settings → Secrets and variables → Actions에 `ANTHROPIC_API_KEY`를 등록해야 글이 생성됩니다. 없으면 워크플로가 실패합니다.

## 크몽 상품은 여기 없습니다

가계부·자영업 장부 엑셀 상품과 그 생성 스크립트는 비공개 저장소 `gyesangilab`에 있습니다. 이 저장소에는 사이트와 글 생성 코드만 있습니다.
