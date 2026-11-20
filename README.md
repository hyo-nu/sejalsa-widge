# 세잘사 Notion KPI 위젯

GitHub Actions가 Notion의 세차 작업 기록을 매시간 집계하고 GitHub Pages에서 공개 가능한 지표 두 개를 보여줍니다.

- 총 세차 대수
- 평균 작업 시간

**개인 수익 및 급여 데이터는 더 이상 API에서 조회하거나 공개 파일에 출력하지 않습니다.**

## 설정

1. Notion Integration에 세차 작업 기록 데이터베이스의 읽기 권한을 부여합니다.
2. GitHub Actions Secrets에 `NOTION_TOKEN`을 등록합니다.
3. `.github/workflows/update.yml`의 `NOTION_WASH_DB_ID` 값은 기존 DB ID를 사용합니다.
4. Actions에서 `Refresh Notion KPI`를 실행하거나 매시간 자동 갱신을 사용합니다.
5. GitHub Pages의 위젯 URL을 Notion 페이지에 임베드합니다.

## 공개 및 과거 기록에 대한 주의

이 저장소와 GitHub Pages는 Public입니다. `data.json`의 세차 대수 및 작업 시간 정보는 공개됩니다.
이전에 공개된 급여와 수익 수치는 **과거 Git 커밋/Actions 로그/외부 캐시**에 남아 있을 수 있습니다. 현재 파일 수정만으로 과거 기록까지 완전히 삭제할 수는 없습니다.
