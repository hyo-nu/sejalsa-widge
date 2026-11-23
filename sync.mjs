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
// Practical cleaning-size groups, independent of legal vehicle class.
// Match model names only in memory. Never export model names or registration numbers.
const classes = ['경차', '소형·준중형', '중형', '대형', '소형·준중형 SUV', '중형·대형 SUV'];
const types = ['내부만', '외부만', '내부+외부'];
const modelGroups = [
  ['경차', ['모닝', '기아 레이', 'KIA RAY', '캐스퍼', '스파크', '마티즈']],
  ['소형·준중형 SUV', ['티볼리', '투싼', '코나', '셀토스', '스포티지', '니로', '트랙스', '트레일블레이저', 'XM3', 'QM3', '베뉴', 'XC40', '렉서스 NX', 'NX350', 'NX300', 'GLA', 'GLB', 'Q3']],
  ['중형·대형 SUV', ['팰리세이드', '쏘렌토', '싼타페', 'XC60', 'XC90', 'BMW X4', 'BMW X5', 'BMW X6', '벤츠 GLE', '벤츠 GLS', 'EQS SUV', '모델 Y', '모델 X', '폴스타 4', 'EV9', 'GV70', 'GV80', '카이엔', '마칸']],
  ['소형·준중형', ['아반떼', 'K3', '엑센트', '베르나', '아이오닉 5', '아이오닉 6', '골프', 'A3']],
  ['대형', ['K8', 'K9', '그랜저', 'G80', 'G90', 'BMW 5시리즈', 'BMW 7시리즈', '벤츠 E-클래스', '벤츠 S-클래스', 'E클래스', 'S클래스']],
  ['중형', ['K5', '쏘나타', '모델 3', '머스탱', 'SM6', '말리부', 'BMW 3시리즈', '벤츠 C-클래스', 'A4']]
];
function cleaningSize(p) {
  const model = (p['차량명']?.rich_text ?? []).map(t => t.plain_text || '').join('').toUpperCase();
  for (const [cls, names] of modelGroups) {
    if (names.some(name => model.includes(name.toUpperCase()))) return cls;
  }
  const oldClass = p['차급']?.select?.name;
  if (oldClass === '경차') return '경차';
  if (oldClass === '소형') return '소형·준중형';
  if (oldClass === '중형' || oldClass === '대형') return oldClass;
  // SUV with an unknown model is excluded until its size can be identified.
  return null;
}
const grouped = new Map();
for (const row of completed) {
  const p = row.properties;
  const cls = cleaningSize(p);
  const inside = p['내부 세차']?.checkbox === true;
  const outside = p['외부 세차']?.checkbox === true;
  const type = inside && outside ? '내부+외부' : inside ? '내부만' : outside ? '외부만' : null;
  const duration = p['작업 시간(분)']?.number;
  if (!type || !Number.isFinite(duration) || duration <= 0 || !cls) continue;
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
const plainDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') ? value : null;
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
