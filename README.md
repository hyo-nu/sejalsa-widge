# 세잘사 Notion KPI 위젯

Notion 세차/급여 데이터를 GitHub Actions에서 매시간 집계하고 GitHub Pages에서 KPI 카드 네 개를 표시합니다.

- 총 세차 대수
- 실제 입금액
- 평균 작업 시간
- 시간당 수익

## 연동

- Notion Integration은 세차 작업 기록 및 급여 정산 기록에 읽기 권한이 있어야 합니다.
- GitHub Actions Secret: `NOTION_TOKEN`
- `.github/workflows/update.yml`의 Notion 데이터베이스 ID가 올바른지 확인합니다.
- 수동 갱신은 Actions → Refresh Notion KPI → Run workflow에서 수행합니다.
- 위젯 URL: https://hyo-nu.github.io/sejalsa-widge/

## 주의: 공개 데이터

**이 저장소와 GitHub Pages는 Public이며 금액과 수익 통계가 외부에 공개됩니다.**
자동 갱신된 `data.json`뿐 아니라 Git 커밋 기록과 Actions 로그의 과거 집계 값도 열람 가능할 수 있습니다.
Notion API 토큰은 GitHub Secrets에서만 관리하세요.
