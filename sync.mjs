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
const timed = completed.filter(row => {
  const value = row.properties['작업 시간(분)']?.number;
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
});
const minutes = timed.reduce((sum, row) => sum + row.properties['작업 시간(분)'].number, 0);
const gross = timed.reduce((sum, row) =>
  sum + (Number(row.properties['세차 보수(원)']?.number ?? row.properties['세차 보수(원)']?.formula?.number) || 0), 0);
const deposit = payroll.reduce((sum, row) => sum + (Number(row.properties['실제 입금액(원)']?.number) || 0), 0);
const classes = ['경차', '소형', '중형', '대형', 'SUV', '기타'];
const types = ['내부만', '외부만', '내부+외부'];
const grouped = new Map();
for (const row of completed) {
  const p = row.properties;
  const cls = p['차급']?.select?.name ?? '기타';
  const inside = p['내부 세차']?.checkbox === true;
  const outside = p['외부 세차']?.checkbox === true;
  const type = inside && outside ? '내부+외부' : inside ? '내부만' : outside ? '외부만' : null;
  const duration = p['작업 시간(분)']?.number;
  if (!type || !Number.isFinite(duration) || !classes.includes(cls)) continue;
  const key = cls + '/' + type;
  const current = grouped.get(key) ?? { total: 0, count: 0 };
  current.total += duration;
  current.count++;
  grouped.set(key, current);
}
const byCarClass = classes.map(cls => ({
  class: cls,
  ...Object.fromEntries(types.map(type => {
    const value = grouped.get(cls + '/' + type);
    return [type, value ? { average: Math.round(value.total / value.count * 10) / 10, count: value.count } : null];
  }))
})).filter(row => types.some(type => row[type] !== null));
const data = {
  byCarClass,
  count: completed.length,
  deposit,
  averageMinutes: timed.length ? Math.round(minutes / timed.length * 10) / 10 : 0,
  hourly: minutes ? Math.round(gross * 60 / minutes) : 0,
  updatedAt: new Date().toISOString()
};
await fs.writeFile('data.json', JSON.stringify(data, null, 2) + '\n');
console.log('KPI data refreshed.');
