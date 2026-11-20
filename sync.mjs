import fs from 'node:fs/promises';

const token = process.env.NOTION_TOKEN;
const washId = process.env.NOTION_WASH_DB_ID;
const payrollId = process.env.NOTION_PAYROLL_DB_ID;
if (!token || !washId || !payrollId) throw Error('Missing Notion integration configuration');

async function getRows(id) {
  const results = [];
  let cursor;
  do {
    const response = await fetch(`https://api.notion.com/v1/databases/${id}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) })
    });
    if (!response.ok) throw Error(`Notion query failed (HTTP ${response.status})`);
    const data = await response.json();
    results.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return results;
}

const [wash, payroll] = await Promise.all([getRows(washId), getRows(payrollId)]);
const completed = wash.filter(row =>
  (row.properties['세차 상태']?.select?.name || row.properties['세차 상태']?.status?.name) === '완료'
);
const minutes = completed.reduce((sum, row) =>
  sum + (Number(row.properties['작업 시간(분)']?.number) || 0), 0
);

const gross = completed.reduce((sum, row) => sum + (Number(row.properties['세차 보수(원)']?.number ?? row.properties['세차 보수(원)']?.formula?.number) || 0), 0);
const deposit = payroll.reduce((sum, row) => sum + (Number(row.properties['실제 입금액(원)']?.number) || 0), 0);
const data = {
  count: completed.length,
  deposit,
  averageMinutes: completed.length ? Math.round(minutes / completed.length * 10) / 10 : 0,
  hourly: minutes ? Math.round(gross * 60 / minutes) : 0,
  updatedAt: new Date().toISOString()
};
await fs.writeFile('data.json', JSON.stringify(data, null, 2) + '\n');
console.log('KPI data refreshed.');
