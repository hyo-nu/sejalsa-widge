import fs from 'node:fs/promises';

const token = process.env.NOTION_TOKEN;
const washId = process.env.NOTION_WASH_DB_ID;
const payrollId = process.env.NOTION_PAYROLL_DB_ID;
const dailyPayId = process.env.NOTION_DAILY_PAY_DB_ID;
if (!token || !washId || !payrollId || !dailyPayId) throw Error('Missing Notion integration configuration');

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

const [wash, payroll, dailyPay] = await Promise.all([getRows(washId), getRows(payrollId), getRows(dailyPayId)]);
const completed = wash.filter(row =>
  (row.properties['세차 상태']?.select?.name || row.properties['세차 상태']?.status?.name) === '완료'
);
const timed = completed.filter(row => {
  const value = row.properties['작업 시간(분)']?.number;
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
});
const minutes = timed.reduce((sum, row) => sum + row.properties['작업 시간(분)'].number, 0);
const gross = timed.reduce((sum, row) =>
  sum + (Number(row.properties['세차 보수(원)']?.number ?? row.properties['세차 보수(원)']?.formula?.number) || 0) + (Number(row.properties['부가서비스 보수(원)']?.number) || 0), 0);
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
// Align both metrics to the actual 14-day payroll cycle, anchored on 2026-10-25.
// Use date-only strings and UTC arithmetic so the workflow timezone cannot shift dates.
const DAY_MS = 86400000;
const ANCHOR_MS = Date.UTC(2026, 9, 25);
const buckets = new Map();
const plainDate = value => /^\\d{4}-\\d{2}-\\d{2}$/.test(value ?? '') ? value : null;
function periodFor(dateString) {
  const date = plainDate(dateString);
  if (!date) return null;
  const day = Date.parse(date + 'T00:00:00Z');
  if (!Number.isFinite(day)) return null;
  const index = Math.floor((day - ANCHOR_MS) / (14 * DAY_MS));
  const startMs = ANCHOR_MS + index * 14 * DAY_MS;
  const endMs = startMs + 13 * DAY_MS;
  const iso = ms => new Date(ms).toISOString().slice(0, 10);
  return { key: iso(startMs), end: iso(endMs) };
}
function bucketFor(period) {
  if (!period) return null;
  if (!buckets.has(period.key)) buckets.set(period.key, { start: period.key, end: period.end, income: 0, cars: 0, incentive: 0 });
  return buckets.get(period.key);
}
for (const row of dailyPay) {
  const p = row.properties;
  const bucket = bucketFor(periodFor(p['업무일']?.date?.start?.slice(0, 10)));
  if (!bucket) continue;
  const base = Number(p['총 지급액(원)']?.number) || 0;
  const bonus = Number(p['예상 별점 인센티브(원)']?.number) || 0;
  bucket.income += base + bonus;
  bucket.incentive += bonus;
}
for (const row of completed) {
  const bucket = bucketFor(periodFor(row.properties['작업일']?.date?.start?.slice(0, 10)));
  if (bucket) bucket.cars++;
}
const byPayPeriod = [...buckets.values()].sort((a, b) => a.start.localeCompare(b.start));
const data = {
  byPayPeriod,
  byCarClass,
  count: completed.length,
  deposit,
  averageMinutes: timed.length ? Math.round(minutes / timed.length * 10) / 10 : 0,
  hourly: minutes ? Math.round(gross * 60 / minutes) : 0,
  updatedAt: new Date().toISOString()
};
await fs.writeFile('data.json', JSON.stringify(data, null, 2) + '\n');
console.log('KPI data refreshed.');
