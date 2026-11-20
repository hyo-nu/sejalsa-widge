import fs from 'node:fs/promises';
const token=process.env.NOTION_TOKEN;
const washId=process.env.NOTION_WASH_DB_ID;
const payrollId=process.env.NOTION_PAYROLL_DB_ID;
if(!token||!washId||!payrollId)throw Error('Set NOTION_TOKEN, NOTION_WASH_DB_ID, NOTION_PAYROLL_DB_ID secrets');
async function getRows(id){let results=[],cursor;do{const r=await fetch(`https://api.notion.com/v1/databases/${id}/query`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Notion-Version':'2022-06-28','Content-Type':'application/json'},body:JSON.stringify({page_size:100,...(cursor?{start_cursor:cursor}:{})})});if(!r.ok)throw Error(`Notion API ${r.status}: ${await r.text()}`);const d=await r.json();results.push(...d.results);cursor=d.has_more?d.next_cursor:null}while(cursor);return results}
function number(p){if(!p)return 0;if(p.type==='formula')return Number(p.formula?.number)||0;if(p.type==='number')return Number(p.number)||0;if(p.type==='rollup')return Number(p.rollup?.number)||0;return 0}
function select(p){return p?.select?.name||p?.status?.name||''}
const [wash,payroll]=await Promise.all([getRows(washId),getRows(payrollId)]);
const done=wash.filter(r=>select(r.properties['세차 상태'])==='완료');
const minutes=done.reduce((s,r)=>s+number(r.properties['작업 시간(분)']),0);
const gross=done.reduce((s,r)=>s+number(r.properties['세차 보수(원)']),0);
const deposit=payroll.reduce((s,r)=>s+number(r.properties['실제 입금액(원)']),0);
const data={count:done.length,deposit,averageMinutes:done.length?Math.round(minutes/done.length*10)/10:0,hourly:minutes?Math.round(gross*60/minutes):0,updatedAt:new Date().toISOString()};
await fs.writeFile('data.json',JSON.stringify(data,null,2)+'\n');console.log('KPI updated',data);