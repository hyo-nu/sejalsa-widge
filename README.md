# 세잘사 Notion KPI 위젯

GitHub Actions가 Notion 데이터를 매시간 집계하고 GitHub Pages에서 KPI 카드 4개를 표시합니다.

1. Notion Internal integration을 생성하고 세차 기록 및 급여 기록 DB에 읽기 권한을 부여하세요.
2. GitHub Settings → Secrets and variables → Actions에 NOTION_TOKEN, NOTION_WASH_DB_ID, NOTION_PAYROLL_DB_ID를 추가하세요.
3. Actions → Refresh Notion KPI → Run workflow를 실행하세요.
4. Settings → Pages → Deploy from a branch에서 master / (root)를 선택하세요.
5. 발급된 Pages URL을 Notion /embed 블록에 추가하세요.

주의: GitHub Pages에서 배포되는 data.json의 집계 금액은 공개됩니다. 개인 급여 정보가 공개되어도 되는지 먼저 확인하세요. Private 저장소의 Pages 사용 가능 여부는 GitHub 플랜에 따라 다릅니다.
