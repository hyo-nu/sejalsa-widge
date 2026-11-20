import fs from 'node:fs/promises';

const token = process.env.NOTION_TOKEN;
const washId = process.env.NOTION_WASH_DB_ID;
if (!token || !washId) throw Error('Missing NOTION_TOKEN or NOTION_WASH_DB_ID');

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

const wash = await getRows(washId);
const completed = wash.filter(row =>
  (row.properties['세차 상태']?.select?.name || row.properties['세차 상태']?.status?.name) === '완료'
);
const minutes = completed.reduce((sum, row) =>
  sum + (Number(row.properties['작업 시간(분)']?.number) || 0), 0
);

// Public output intentionally excludes ALL salary/revenue data.
const data = {
  count: completed.length,
  averageMinutes: completed.length ? Math.round(minutes / completed.length * 10) / 10 : 0,
  updatedAt: new Date().toISOString()
};
await fs.writeFile('data.json', JSON.stringify(data, null, 2) + '\n');
// Never log private earnings or raw Notion responses.
console.log('Public, non-financial KPI data refreshed.');
