# 로컬 발행 절차 (API 크레딧 없이)

2026-11-07부터 매주 월요일 발행은 GitHub Actions(`publish.yml`, API 크레딧 필요)가 아니라
**사용자 PC의 Claude Code 예약 작업**이 한다. 글은 Claude Code가 직접 쓰고, 검수·빌드·배포는 기존 파이프라인 그대로다.
크레딧을 다시 충전하면 `publish.yml`의 `schedule` 주석만 풀면 예전 방식으로 돌아간다(둘을 동시에 켜지 말 것 — 같은 주제를 두 번 쓴다).

저장소 위치: `C:\Users\조헌구\Downloads\계산기랩-사이트` (명령은 전부 `pipeline/` 에서)

## 한 번 발행

1. `git pull --ff-only` — 원격과 맞춘다. 충돌하면 멈추고 보고.
2. `npm install` (node_modules 없을 때만)
3. `node publish-local.mjs next` — 이번 주제, 글쓰기 기준, JSON 형식, 기존 글 목록이 나온다. 종료코드 2 = 주제 없음 → 아래 「주제 보충」 먼저.
4. 웹 검색으로 공식 자료를 실제로 확인하고 글을 쓴다. 글쓰기 기준을 그대로 지킨다.
   결과를 **저장소 밖** 임시 파일(예: 스크래치 폴더 `article.json`)에 JSON으로 저장한다.
5. `node publish-local.mjs render <article.json>` → `site/posts/<slug>.html` 생성 + `topics.json` 갱신
6. `node validate.mjs --only <slug> --quarantine`
   - 종료코드 0 = 통과. WARN 은 읽고 고칠 수 있으면 JSON을 고쳐 5부터 다시(그 전에 `git checkout -- topics.json` 하고 생성된 html 삭제).
   - 1 = FAIL. 글은 `site/_drafts/` 로 격리되고 주제는 대기로 돌아간다. FAIL 사유를 고쳐 **한 번만** 다시 시도. 또 걸리면 발행하지 말고 보고.
7. `node build.mjs` — 목록·사이트맵 재생성
8. `git add -A && git commit -m "글 발행: YYYY-MM-DD (로컬)" && git push`
   - 사용자 계정으로 푸시하므로 `pages.yml`(배포)·`indexnow.yml`(색인 통보)이 push 트리거로 자동 실행된다.
9. `node health.mjs --expect <slug> --wait 600` — 실제 사이트에 떴는지 확인. 실패하면 `gh workflow run pages.yml -R qi777xt0925-hue/qi777xt0925-hue.github.io` 후 한 번 더.
10. 점검 이슈(라벨 `점검`, "마지막 글이 N일 전")가 열려 있으면 발행 성공 후 댓글 남기고 닫는다.

## 주제 보충 (남은 주제 4개 미만일 때)

`topics.json` 끝에 주제를 6개 안팎 추가한다. 형식은 기존 항목과 같다:
`{ slug(영소문자·숫자·하이픈), title, angle, keywords[3~5], related:{href,label}, published:null }`

- related.href 는 `../salary.html` `../severance.html` `../hourly.html` `../rent.html` `../loan.html` `../area.html` `../insurance.html` `../annual-leave.html` `../margin.html` `../index.html` 중 하나.
- 기준: 포털이 이미 점유한 칸보다 **규칙이 복잡해 계산으로 이길 수 있는 칸**, 자영업자·고용주 대상(크몽 손님과 같은 사람). 이미 발행된 주제와 겹치지 않게.
- 후보로 남겨둔 칸: 실업급여 모의계산, 종합소득세(프리랜서 3.3%), 배달 수수료 역산, 중도퇴사 연말정산.

## 하지 말 것

- `generate.mjs`·`replenish.mjs` 실행 금지(API 과금).
- 옛 글 수정, 계산기 페이지 수정, `facts.json` 수정 금지 — 이 절차는 새 글 한 편만 다룬다.
- 검수를 건너뛰거나 `--quarantine` 없이 FAIL 글을 푸시하지 않는다.
