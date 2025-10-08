# Personal Inflation Tracker — Vite + React + TypeScript (Netlify/PWA)

По-долу са **всички файлове**. Създай празна папка, копирай 1:1 структурата и съдържанието, после:

```bash
npm install
npm run build
```

В Netlify: build command = `npm run build`, publish dir = `dist`.

---

## 📁 Project tree
```
.
├── netlify.toml
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── public
│   ├── manifest.webmanifest
│   ├── service-worker.js
│   └── icons
│       ├── icon-192.png   ← постави твоя икона (може временно)
│       └── icon-512.png   ← постави твоя икона (може временно)
└── src
    ├── index.css
    ├── main.tsx
    └── App.tsx   ← пълното приложение
```

> За иконите може временно да ползваш произволни PNG 192×192 и 512×512; в противен случай PWA манифестът ще дава warning, но сайтът си работи.

---

## `netlify.toml`
```toml
[build]
  command = "npm run build"
  publish = "dist"
```

## `package.json`
```json
{
  "name": "personal-inflation",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "idb": "^7.1.1",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "recharts": "^2.10.4"
  },
  "devDependencies": {
    "@types/react": "^18.2.21",
    "@types/react-dom": "^18.2.7",
    "@vitejs/plugin-react": "^4.2.0",
    "typescript": "^5.2.2",
    "vite": "^5.0.0"
  }
}
```

## `tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ESNext",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ESNext"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "Node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true
  },
  "include": ["src"]
}
```

## `vite.config.ts`
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist" }
});
```

## `index.html`
```html
<!DOCTYPE html>
<html lang="bg">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Personal Inflation Tracker</title>
    <link rel="manifest" href="/manifest.webmanifest" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

## `public/manifest.webmanifest`
```json
{
  "name": "Personal Inflation Tracker",
  "short_name": "Inflation",
  "start_url": ".",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#0ea5e9",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

## `public/service-worker.js`
```js
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => clients.claim());
```

## `src/index.css`
```css
body{font-family:system-ui,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;background:#f6f7fb;margin:0}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:16px;box-shadow:0 1px 1px rgba(0,0,0,.02)}
.table-scroll{max-height:260px;overflow:auto;border:1px solid #e5e7eb;border-radius:12px}
.table-scroll table{width:100%;border-collapse:collapse;font-size:14px}
.table-scroll th,.table-scroll td{padding:8px;border-top:1px solid #eef2f7;text-align:left}
.badge{display:inline-block;padding:2px 8px;border-radius:10px;background:#eff6ff;color:#1d4ed8;font-size:12px}
```

## `src/main.tsx`
```ts
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

---

## `src/App.tsx`
> Пълното приложение с: IndexedDB, импорт CSV/Google Sheets, HICP от Евростат, личен индекс по категории, tooltip с обяснения, date picker, скрол в таблиците, min/max покупателна способност, устойчиви изчисления при редки данни.

```tsx
import React, { useMemo, useState, useEffect, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { openDB, type IDBPDatabase, type DBSchema } from "idb";

// =============================================================
// Personal Inflation Tracker — PWA UI (Enhanced)
// - Typed IndexedDB stores (no any)
// - CSV/Google Sheets import for wages & expenses
// - BG labels for categories; URL normalizer for Sheets
// - JSON-stat parser for Eurostat; category fetch
// - UX: period=month pickers, Y axis & tooltip with 2 decimals
// - Extrema cards for real purchasing power; scrollable tables
// - Robust change% (nearest points), personal index fallback weights
// =============================================================

// ------------------ Types ------------------
export type Row = { date: string; value: number };
export type Expense = { date: string; category: string; amount: number };

// IDB store names
export type RowStore = "wages" | "hicp";
export type MetaStore = "meta";
export type ExpenseStore = "expenses";
export type StoreName = RowStore | MetaStore | ExpenseStore;

// ------------------ COICOP map & BG labels ------------------
const COICOP_MAP: Record<string, string> = {
  Food: "CP01",
  AlcoholTobacco: "CP02",
  Clothing: "CP03",
  HousingEnergy: "CP04",
  Furnishings: "CP05",
  Health: "CP06",
  Transport: "CP07",
  Communications: "CP08",
  Recreation: "CP09",
  Education: "CP10",
  Restaurants: "CP11",
  Misc: "CP12",
};
const CATEGORY_BG: Record<keyof typeof COICOP_MAP, string> = {
  Food: "Храна",
  AlcoholTobacco: "Алкохол и тютюневи изделия",
  Clothing: "Облекло и обувки",
  HousingEnergy: "Жилище, вода, електроенергия",
  Furnishings: "Домашно обзавеждане",
  Health: "Здравеопазване",
  Transport: "Транспорт",
  Communications: "Съобщения",
  Recreation: "Отдих и култура",
  Education: "Образование",
  Restaurants: "Ресторанти и хотели",
  Misc: "Разни стоки и услуги",
};
const CATEGORY_KEYS = Object.keys(COICOP_MAP) as (keyof typeof COICOP_MAP)[];
const BG_TO_KEY: Record<string, keyof typeof COICOP_MAP> = Object.fromEntries(
  CATEGORY_KEYS.map(k => [CATEGORY_BG[k].toLowerCase(), k])
) as Record<string, keyof typeof COICOP_MAP>;
const EN_TO_KEY: Record<string, keyof typeof COICOP_MAP> = Object.fromEntries(
  CATEGORY_KEYS.map(k => [String(k).toLowerCase(), k])
) as Record<string, keyof typeof COICOP_MAP>;
function parseCategoryToKey(input: string){ const s=(input||'').toLowerCase().trim(); return BG_TO_KEY[s] || EN_TO_KEY[s] || null; }
function displayCategory(key: keyof typeof COICOP_MAP){ return CATEGORY_BG[key] || String(key); }

// ------------------ IndexedDB ------------------
interface MyDB extends DBSchema {
  wages: { key: string; value: Row[] };
  hicp: { key: string; value: Row[] };
  expenses: { key: string; value: Expense[] };
  meta: { key: string; value: unknown };
}
const DB_NAME = "personal-inflation"; const DB_VERSION = 6;
let _dbPromise: Promise<IDBPDatabase<MyDB>> | null = null;
async function getDB(){
  if(!_dbPromise){
    _dbPromise = openDB<MyDB>(DB_NAME, DB_VERSION, {
      upgrade(db){
        if(!db.objectStoreNames.contains('wages')) db.createObjectStore('wages');
        if(!db.objectStoreNames.contains('hicp')) db.createObjectStore('hicp');
        if(!db.objectStoreNames.contains('expenses')) db.createObjectStore('expenses');
        if(!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      }
    });
  }
  return _dbPromise!;
}
async function saveRows(store: RowStore, rows: Row[]){ const db=await getDB(); await db.put(store, rows, 'data'); }
async function loadRows(store: RowStore){ const db=await getDB(); return (await db.get(store,'data')) || []; }
async function saveExpenses(rows: Expense[]){ const norm = rows.map(r => ({...r, category:(parseCategoryToKey(String(r.category))||r.category)})); const db=await getDB(); await db.put('expenses', norm, 'data'); }
async function loadExpenses(){ const db=await getDB(); const got=(await db.get('expenses','data')) || []; return got.map((r:any)=>({...r, category:(parseCategoryToKey(String(r.category))||r.category)})); }
async function setMeta<T=unknown>(key: string, value: T){ const db=await getDB(); await db.put('meta', value, key); }
async function getMeta<T=unknown>(key: string){ const db=await getDB(); return (await db.get('meta', key)) as T | undefined; }

// ------------------ Utils ------------------
function toMonthlySeries(rows: Row[]): Row[]{ const m=new Map<string,number>(); rows.forEach(r=>m.set(r.date,r.value)); return [...m.entries()].map(([date,value])=>({date,value})).sort((a,b)=>a.date.localeCompare(b.date)); }
function rebaseTo100(series: Row[], base: string){ const p=series.find(r=>r.date===base); if(!p) return series.map(r=>({...r})); const k=100/p.value; return series.map(r=>({date:r.date,value:r.value*k})); }
function rangeSlice(series: Row[], s: string, e: string){ return series.filter(r=>r.date>=s && r.date<=e); }
function findNearest(series: Row[], target: string): Row | null{
  if(!series.length) return null;
  let best: Row | null = null;
  for(const r of series){
    if(r.date===target) return r;
    if(r.date<target) best = r;
    if(r.date>target && !best) return r; // first after, if nothing before
  }
  return best || series[series.length-1];
}
function changePctNearest(series: Row[], s: string, e: string): number | null{
  const start = findNearest(series, s); const end = findNearest(series, e);
  if(!start || !end) return null; return end.value / start.value - 1;
}
function monthRange(s: string, e: string){ const [sy,sm]=s.split('-').map(Number), [ey,em]=e.split('-').map(Number); if(!sy||!sm||!ey||!em) return []; const out:string[]=[]; let y=sy,m=sm; while(y<ey || (y===ey && m<=em)){ out.push(`${y}-${String(m).padStart(2,'0')}`); m++; if(m===13){ m=1; y++; } } return out; }

// ------------------ CSV parsers & URL helpers ------------------
function parseWagesCSV(text: string): Row[]{ const lines=text.trim().split(/\r?\n/); if(!lines.length) return []; const header=lines[0].replace(/^\uFEFF/,'').toLowerCase(); const delim=header.includes(';')&&!header.includes(',')?';':','; const cols=header.split(delim).map(s=>s.trim()); const dateIdx=cols.findIndex(c=>['date','дата','месец','month'].includes(c)); const valIdx=cols.findIndex(c=>['value','salary','заплата'].includes(c)); return lines.slice(1).map(line=>{ const p=line.split(delim); const rawDate=((dateIdx>=0?p[dateIdx]:p[0])||'').trim(); const date=rawDate.replace(/\./g,'-'); let vStr=((valIdx>=0?p[valIdx]:p[1])||'').trim(); vStr=vStr.replace(/\u00A0/g,'').replace(/\s+/g,'').replace(/,(\d+)$/,'.$1'); const value=Number(vStr); return { date, value }; }).filter(r=>/^\d{4}-\d{2}$/.test(r.date) && Number.isFinite(r.value)); }
function parseExpensesCSV(text: string): Expense[]{ const lines=text.trim().split(/\r?\n/); if(lines.length<2) return []; const header=lines[0].replace(/^\uFEFF/,'').toLowerCase(); const delim=header.includes(';')&&!header.includes(',')?';':','; const cols=header.split(delim).map(s=>s.trim()); const dateIdx=cols.findIndex(c=>['date','месец','month','дата'].includes(c)); const catIdx=cols.findIndex(c=>['category','категория'].includes(c)); const amtIdx=cols.findIndex(c=>['amount','сума','разход'].includes(c)); return lines.slice(1).map(line=>{ const p=line.split(delim); const date=((dateIdx>=0?p[dateIdx]:p[0])||'').trim().replace(/\./g,'-'); const catRaw=((catIdx>=0?p[catIdx]:p[1])||'').trim(); const key=parseCategoryToKey(catRaw); let vStr=((amtIdx>=0?p[amtIdx]:p[2])||'').trim(); vStr=vStr.replace(/\u00A0/g,'').replace(/\s+/g,'').replace(/,(\d+)$/,'.$1'); const amount=Number(vStr); return { date, category:(key||catRaw), amount }; }).filter(r=>/^\d{4}-\d{2}$/.test(r.date) && !!r.category && Number.isFinite(r.amount)); }
function toCsvUrl(input: string){ try{ const u=new URL(input.trim()); if(!u.hostname.includes('docs.google.com')) return input; if(u.pathname.endswith?.('/export') || u.pathname.endsWith('/export')){ u.searchParams.set('format','csv'); return u.toString(); } if(u.pathname.includes('/pub')){ u.searchParams.set('output','csv'); u.pathname=u.pathname.replace(/\/pub(?:html)?$/, '/pub'); return u.toString(); } const parts=u.pathname.split('/'); const i=parts.indexOf('d'); if(i>=0 && parts[i+1]){ const id=parts[i+1]; const gid=u.searchParams.get('gid')||'0'; return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`; } return input; }catch{ return input; } }

// ------------------ Eurostat fetch & parser ------------------
const EUROSTAT_URL = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_midx?format=JSON&lang=en&coicop=CP00&geo=BG&unit=I15&freq=M";
function parseEurostatJsonStat(js: any): Row[]{ const dim=js?.dimension||js?.dataset?.dimension||{}; const timeCat=(dim.time||dim.TIME||{}).category||{}; const indexMap:Record<string,number>=timeCat.index||{}; const values=js.value??js.dataset?.value??[]; return Object.entries(indexMap).sort((a:any,b:any)=>a[1]-b[1]).map(([tKey,i]:any)=>{ const raw=Array.isArray(values)? values[i]: values[i]; const m=String(tKey).match(/(\d{4})M(\d{2})/); const date=m?`${m[1]}-${m[2]}`:String(tKey); return { date, value:Number(raw) }; }).filter(r=>r.date && !Number.isNaN(r.value)); }
async function fetchEurostatHICP(): Promise<Row[]>{ const res=await fetch(EUROSTAT_URL+`&_=${Date.now()}`,{method:'GET',credentials:'omit'}); if(!res.ok){ await setMeta('lastEurostatError',{status:res.status,statusText:res.statusText,when:new Date().toISOString()}); throw new Error('Eurostat error '+res.status); } const js=await res.json(); return parseEurostatJsonStat(js); }
async function fetchEurostatHICPFor(categories: string[]): Promise<Record<string, Row[]>>{ if(!categories.length) return {}; const params=new URLSearchParams({format:'JSON',lang:'en',geo:'BG',unit:'I15',freq:'M',coicop:categories.join(',')}); const url=`https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_midx?${params.toString()}&_=${Date.now()}`; const res=await fetch(url,{method:'GET',credentials:'omit'}); if(!res.ok) throw new Error('Eurostat error '+res.status); const js=await res.json(); const ds=js.dataset || js; const dim=ds.dimension || {}; const id: string[] = (ds.id || Object.keys(dim)) as string[]; const size: number[] = (ds.size || id.map((k) => Object.keys((dim as any)[k]?.category?.index || {}).length)) as number[]; const indexOf=(name:string)=> id.findIndex(d=>d.toLowerCase()===name.toLowerCase()); const ci=indexOf('coicop'); const ti=indexOf('time'); const coicopIndex=(dim.coicop || (dim as any).COICOP).category.index as Record<string, number>; const timeIndex=(dim.time || (dim as any).TIME).category.index as Record<string, number>; const strides:number[] = new Array(size.length).fill(0); let acc=1; for(let i=size.length-1;i>=0;i--){ strides[i]=acc; acc*=size[i]; } const values:any = ds.value ?? js.value ?? []; const out:Record<string, Row[]> = {}; for(const [code,cIdx] of Object.entries(coicopIndex)){ if(!categories.includes(code)) continue; const rows:Row[]=[]; for(const [tKey,tIdx] of Object.entries(timeIndex).sort((a:any,b:any)=>a[1]-b[1])){ const coord=new Array(size.length).fill(0); if(ci>=0) coord[ci]=cIdx as number; if(ti>=0) coord[ti]=tIdx as number; const flat=coord.reduce((sum,v,k)=> sum + v*strides[k], 0); const raw=Array.isArray(values)? values[flat] : values[flat]; if(raw==null) continue; const m=String(tKey).match(/(\d{4})M(\d{2})/); const date=m?`${m[1]}-${m[2]}`:String(tKey); rows.push({ date, value:Number(raw) }); }
  out[code]=rows; }
  return out; }

// ------------------ UI atoms ------------------
function Card({ title, value, note }: { title: string; value: string; note?: string }){ return (<div className="card"><div className="text-xs text-slate-500">{title}</div><div className="text-2xl">{value}</div>{note && <div className="text-xs text-slate-500 mt-1">{note}</div>}</div>); }
function PeriodPickerMonth({ min, max, start, end, onChange }:{min:string; max:string; start:string; end:string; onChange:(s:string,e:string)=>void}){ return (<div className="flex gap-3 items-end"><div><label className="block text-sm text-slate-600">Начало</label><input type="month" min={min} max={max} value={start} onChange={e=>onChange(e.target.value, end)} className="border rounded-lg px-3 py-2"/></div><div><label className="block text-sm text-slate-600">Край</label><input type="month" min={min} max={max} value={end} onChange={e=>onChange(start, e.target.value)} className="border rounded-lg px-3 py-2"/></div></div>); }

// Tooltip with explanations
function InfoTooltip({ active, payload, label }: any){ if(!active || !payload || !payload.length) return null; const rows = payload.filter((p:any)=>p.value!=null); const explain: Record<string,string> = { wage: "Заплата ребазирана (=100 в началния месец).", hicp: "Официален индекс на потребителските цени (HICP).", real: "Покупателна способност = заплата/цени.", personal: "Личен индекс според твоите разходи и HICP по категории." }; return (<div style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:12,padding:'8px 10px',boxShadow:'0 2px 6px rgba(0,0,0,.05)'}}><div style={{fontSize:12, color:'#475569', marginBottom:4}}>{label}</div>{rows.map((r:any)=> (<div key={r.dataKey} style={{fontSize:13}}><strong>{r.name}:</strong> {Number(r.value).toFixed(2)} <div style={{fontSize:11,color:'#64748b'}}>{explain[r.dataKey]||''}</div></div>))}</div>); }

// ------------------ Personal index helpers ------------------
function monthlyCategoryTotals(expenses: Expense[]): Record<string, Record<string, number>> { const totals: Record<string, Record<string, number>> = {}; for(const e of expenses){ const key=(parseCategoryToKey(String(e.category)) || (e.category as any)) as any; totals[e.date] ??= {}; totals[e.date][key] = (totals[e.date][key]||0) + e.amount; } return totals; }
function pickBaseMonthForWeights(expenses: Expense[], base: string): { baseUsed: string | null, weights: Record<string, number> }{ const totalsByMonth = monthlyCategoryTotals(expenses); const build=(month:string)=>{ const obj=totalsByMonth[month]; if(!obj) return null; const total = Object.values(obj).reduce((a,b)=>a+b,0); if(!total) return null; const w:Record<string,number>={}; for(const [cat,sum] of Object.entries(obj)){ const k=(parseCategoryToKey(String(cat)) || (cat as any)) as any; w[k] = (w[k]||0) + (sum as number)/total; } return w; };
  let w = build(base); if(w) return { baseUsed: base, weights: w };
  const months = Object.keys(totalsByMonth).sort();
  const before = months.filter(m=>m<=base).pop(); if(before){ w=build(before); if(w) return { baseUsed: before, weights: w }; }
  const after = months.find(m=>m>base); if(after){ w=build(after); if(w) return { baseUsed: after, weights: w }; }
  return { baseUsed: null, weights: {} };
}
function computePersonalIndex(weights: Record<string, number>, seriesByCoicop: Record<string, Row[]>, dates: string[], base: string, catToCoicop: Record<string, string>){ const rebased: Record<string, Record<string, number>> = {}; for(const cat of Object.keys(weights)){ const code=catToCoicop[cat]; const raw=seriesByCoicop[code]||[]; const r=rebaseTo100(raw, base); rebased[cat]=Object.fromEntries(r.map(p=>[p.date,p.value])); } return dates.map(d=>{ let val=0,wsum=0; for(const [cat,w] of Object.entries(weights)){ const v=rebased[cat]?.[d]; if(typeof v==='number'&&Number.isFinite(v)){ val+=w*v; wsum+=w; } } return {date:d, value: wsum?val:undefined as any}; }).filter(p=>typeof p.value==='number'); }

// ------------------ Tables (with scroll) ------------------
function SalaryTable({ onChange }:{onChange:(rows:Row[])=>void}){ const [rows,setRows]=useState<Row[]>([]); const [date,setDate]=useState('2020-01'); const [value,setValue]=useState<number>(1500); useEffect(()=>{ loadRows('wages').then(d=>{ setRows(d); onChange(d); }); },[onChange]); const upsert=async()=>{ const next=rows.filter(r=>r.date!==date).concat({date,value:Number(value)}); setRows(next); await saveRows('wages',next); onChange(next); }; const del=async(d:string)=>{ const next=rows.filter(r=>r.date!==d); setRows(next); await saveRows('wages',next); onChange(next); }; return (<div className="space-y-3"><div className="flex gap-2"><input value={date} onChange={e=>setDate(e.target.value)} className="border rounded px-3 py-2" placeholder="YYYY-MM"/><input type="number" value={value} onChange={e=>setValue(Number(e.target.value))} className="border rounded px-3 py-2" placeholder="Заплата (лв.)"/><button onClick={upsert} className="px-3 py-2 rounded-xl" style={{background:'#0ea5e9',color:'#fff'}}>Запази</button></div><div className="table-scroll"><table><thead><tr><th>Дата</th><th>Заплата (лв.)</th><th/></tr></thead><tbody>{[...rows].sort((a,b)=>a.date.localeCompare(b.date)).map(r=>(<tr key={r.date}><td>{r.date}</td><td>{r.value}</td><td className="text-right"><button onClick={()=>del(r.date)} style={{color:'#dc2626'}}>Изтрий</button></td></tr>))}</tbody></table></div></div>); }
function WagesUploader({ onRows }:{onRows:(rows:Row[])=>void}){ const [status,setStatus]=useState(''); const [url,setUrl]=useState(''); const [paste,setPaste]=useState(''); const handleParsed=async(rows:Row[],src:string)=>{ await saveRows('wages',rows); onRows(rows); setStatus(`${src}: ${rows.length} реда`); }; return (<div className="space-y-2 mt-3"><div className="text-sm font-medium">Импорт на заплати (CSV / Google Sheets)</div><div className="flex flex-wrap gap-2 items-center"><input type="file" accept=".csv" onChange={async e=>{ const f=e.target.files?.[0]; if(!f) return; const txt=await f.text(); const rows=parseWagesCSV(txt); await handleParsed(rows,'CSV файл'); }} /><input className="border rounded px-3 py-2 flex-1 min-w-[240px]" placeholder="CSV URL" value={url} onChange={e=>setUrl(e.target.value)} /><button className="px-3 py-2 border rounded" onClick={async()=>{ try{ const res=await fetch(toCsvUrl(url)); if(!res.ok) throw new Error(String(res.status)); const txt=await res.text(); const rows=parseWagesCSV(txt); if(!rows.length) throw new Error('Празни/неразпознати данни'); await handleParsed(rows,'CSV от URL'); }catch(e:any){ setStatus('Грешка: '+(e?.message||e)); } }}>Импорт от URL</button></div><textarea className="border rounded w-full p-2 text-sm" rows={4} placeholder="date,value" value={paste} onChange={e=>setPaste(e.target.value)} /><button className="px-3 py-2 border rounded" onClick={async()=>{ const rows=parseWagesCSV(paste); await handleParsed(rows,'Поставен CSV'); }}>Импорт от текст</button>{status && <div className="text-sm" style={{color:'#475569'}}>{status}</div>}</div>); }
function InflationUploader({ onChange }:{onChange:(rows:Row[])=>void}){ const [count,setCount]=useState(0); const [status,setStatus]=useState(''); const onFile=async(f:File)=>{ const txt=await f.text(); const rows:Row[]=txt.trim().split(/\r?\n/).slice(1).map(line=>{const [date,v]=line.split(','); return {date:date.trim(),value:Number(v)};}).filter(r=>r.date&&!Number.isNaN(r.value)); await saveRows('hicp',rows); setCount(rows.length); setStatus(`CSV импорт: ${rows.length} реда.`); onChange(rows); }; const autoFetch=async()=>{ setStatus('Изтегляне от Евростат...'); try{ const rows=await fetchEurostatHICP(); await saveRows('hicp',rows); setCount(rows.length); setStatus(`Евростат: ${rows.length} месеца.`); onChange(rows); }catch(e:any){ const last=await getMeta('lastEurostatError'); setStatus(last?`Грешка ${last.status} (${last.statusText||''})`:`Грешка: ${String(e?.message||e)}`); } }; return (<div className="space-y-2"><div className="flex gap-2 items-center flex-wrap"><input type="file" accept=".csv" onChange={e=>{ const f=e.target.files?.[0]; if(f) onFile(f); }} /><button className="px-3 py-2 border rounded" onClick={autoFetch}>Автоматично изтегли от Евростат</button></div>{status && <div className="text-sm" style={{color:'#475569'}}>{status}</div>}{count>0 && <div className="badge">Заредени: {count}</div>}</div>); }
function ExpensesUploader({ onRows }:{onRows:(rows:Expense[])=>void}){ const [status,setStatus]=useState(''); const [url,setUrl]=useState(''); const [paste,setPaste]=useState(''); const handleParsed=async(rows:Expense[],src:string)=>{ await saveExpenses(rows); onRows(rows); setStatus(`${src}: ${rows.length} реда`); }; return (<div className="space-y-2 mt-2"><div className="text-sm font-medium">Импорт на разходи (CSV/Google Sheets)</div><div className="flex flex-wrap gap-2 items-center"><input type="file" accept=".csv" onChange={async e=>{ const f=e.target.files?.[0]; if(!f)return; const txt=await f.text(); const rows=parseExpensesCSV(txt); await handleParsed(rows,'CSV файл'); }} /><input className="border rounded px-3 py-2 flex-1 min-w-[240px]" placeholder="CSV URL" value={url} onChange={e=>setUrl(e.target.value)} /><button className="px-3 py-2 border rounded" onClick={async()=>{ try{ const res=await fetch(toCsvUrl(url)); if(!res.ok) throw new Error(String(res.status)); const txt=await res.text(); const rows=parseExpensesCSV(txt); await handleParsed(rows,'CSV от URL'); }catch(e:any){ setStatus('Грешка: '+(e?.message||e)); } }}>Импорт от URL</button></div><textarea className="border rounded w-full p-2 text-sm" rows={4} placeholder="date,category,amount" value={paste} onChange={e=>setPaste(e.target.value)} /><button className="px-3 py-2 border rounded" onClick={async()=>{ const rows=parseExpensesCSV(paste); await handleParsed(rows,'Поставен CSV'); }}>Импорт от текст</button>{status && <div className="text-sm" style={{color:'#475569'}}>{status}</div>}</div>); }
function ExpensesTable({ onChange }:{onChange:(rows:Expense[])=>void}){ const [rows,setRows]=useState<Expense[]>([]); const [date,setDate]=useState('2024-01'); const [category,setCategory]=useState<keyof typeof COICOP_MAP>('Food'); const [amount,setAmount]=useState<number>(0); useEffect(()=>{ loadExpenses().then(x=>{ setRows(x); onChange(x); }); },[onChange]); const upsert=async()=>{ const next=rows.filter(r=>!(r.date===date && (parseCategoryToKey(String(r.category))||r.category)===category)).concat({date,category:category as any,amount:Number(amount)}); setRows(next); await saveExpenses(next); onChange(next); }; const del=async(d:string,c:string)=>{ const next=rows.filter(r=>!(r.date===d && String(r.category)===String(c))); setRows(next); await saveExpenses(next); onChange(next); }; return (<div className="space-y-3"><div className="flex flex-wrap gap-2"><input value={date} onChange={e=>setDate(e.target.value)} className="border rounded px-3 py-2" placeholder="YYYY-MM"/><select value={category} onChange={e=>setCategory(e.target.value as any)} className="border rounded px-3 py-2">{CATEGORY_KEYS.map(k=> <option key={k} value={k}>{displayCategory(k)}</option>)}</select><input type="number" value={amount} onChange={e=>setAmount(Number(e.target.value))} className="border rounded px-3 py-2" placeholder="Сума (лв.)"/><button onClick={upsert} className="px-3 py-2 rounded-xl" style={{background:'#0ea5e9',color:'#fff'}}>Запази</button></div><div className="table-scroll"><table><thead><tr className="text-left text-slate-600"><th className="py-2">Месец</th><th className="py-2">Категория</th><th className="py-2">Сума</th><th/></tr></thead><tbody>{[...rows].sort((a,b)=> a.date.localeCompare(b.date) || String(a.category).localeCompare(String(b.category))).map(r=> (<tr key={r.date+String(r.category)} className="border-top"><td className="py-2">{r.date}</td><td className="py-2">{displayCategory((parseCategoryToKey(String(r.category))||r.category) as any)}</td><td className="py-2">{r.amount}</td><td className="py-2 text-right"><button onClick={()=>del(r.date,String(r.category))} style={{color:'#dc2626'}}>Изтрий</button></td></tr>))}</tbody></table></div></div>); }

// ------------------ App ------------------
export default function App(){
  const [wages,setWages]=useState<Row[]>([]);
  const [hicp,setHicp]=useState<Row[]>([]);
  const [expenses,setExpenses]=useState<Expense[]>([]);
  const [hicpByCoicop,setHicpByCoicop]=useState<Record<string,Row[]>>({});
  const [catStatus,setCatStatus]=useState('');
  const [weightsBaseUsed,setWeightsBaseUsed]=useState<string|null>(null);

  useEffect(()=>{ loadRows('wages').then(setWages); loadRows('hicp').then(setHicp); loadExpenses().then(setExpenses); },[]);

  const hicpSeries = useMemo(()=> toMonthlySeries(hicp), [hicp]);
  const pickerDates = useMemo(()=>{ if(!hicpSeries.length) return []; const first='2015-01'; const last=hicpSeries[hicpSeries.length-1].date; const endBound=last<first?first:last; return monthRange(first,endBound); },[hicpSeries]);
  const [start,setStart]=useState('2015-01'); const [end,setEnd]=useState('2015-01');
  const touched=useRef(false);
  useEffect(()=>{ if(touched.current) return; if(!hicpSeries.length) return; const last=hicpSeries[hicpSeries.length-1].date; setStart('2015-01'); setEnd(last); },[hicpSeries.length]);

  const wageSeries = useMemo(()=> toMonthlySeries(wages), [wages]);
  const rebasedWage = useMemo(()=> rebaseTo100(wageSeries, start), [wageSeries,start]);
  const rebasedHicp = useMemo(()=> rebaseTo100(hicpSeries, start), [hicpSeries,start]);
  const slicedW = useMemo(()=> rangeSlice(rebasedWage,start,end), [rebasedWage,start,end]);
  const slicedC = useMemo(()=> rangeSlice(rebasedHicp,start,end), [rebasedHicp,start,end]);

  // Personal index with fallback weights
  const { baseUsed, weights } = useMemo(()=> pickBaseMonthForWeights(expenses, start), [expenses, start]);
  useEffect(()=>{ setWeightsBaseUsed(baseUsed); }, [baseUsed]);
  const merged = useMemo(()=>{
    const map = new Map<string, any>();
    slicedW.forEach(r=>map.set(r.date,{date:r.date,wage: Number.isFinite(r.value)?r.value:undefined}));
    slicedC.forEach(r=>{ const x=map.get(r.date)||{date:r.date}; x.hicp= Number.isFinite(r.value)?r.value:undefined; map.set(r.date,x); });

    const datesSorted = [...new Set([...slicedW.map(d=>d.date), ...slicedC.map(d=>d.date)])].sort();
    const personalSeries = Object.keys(weights).length ? computePersonalIndex(weights, hicpByCoicop, datesSorted, start, COICOP_MAP) : [];
    const pMap = new Map(personalSeries.map(p=>[p.date,p.value]));

    return [...map.values()].sort((a,b)=>a.date.localeCompare(b.date)).map(row=>({
      ...row,
      real: row.wage!=null && row.hicp!=null ? row.wage / (row.hicp/100) : undefined,
      personal: pMap.get(row.date)
    }));
  }, [slicedW, slicedC, weights, start, hicpByCoicop]);

  // Changes using nearest points (fix for sparse data)
  const wageChange = useMemo(()=> changePctNearest(wageSeries, start, end), [wageSeries,start,end]);
  const hicpChange = useMemo(()=> changePctNearest(hicpSeries, start, end), [hicpSeries,start,end]);
  const realChange = wageChange!=null && hicpChange!=null ? wageChange - hicpChange : null;

  // min/max real index over selected range
  const extrema = useMemo(()=>{ const rows = merged.filter(r=> typeof r.real==='number'); if(!rows.length) return null; let min=rows[0], max=rows[0]; for(const r of rows){ if(r.real<min.real) min=r; if(r.real>max.real) max=r; } return { min, max }; }, [merged]);

  const chartKey = useMemo(()=> `${start}-${end}-${wageSeries.length}-${hicpSeries.length}-${Object.keys(hicpByCoicop).length}`, [start,end,wageSeries.length,hicpSeries.length,hicpByCoicop]);

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <header className="flex items-center justify-between"><h1 className="text-2xl font-semibold">Лична инфлация — Enhanced</h1></header>

      <section className="grid md:grid-cols-2 gap-6">
        <div className="card"><h2 className="font-medium mb-2">1) Въведи/обнови заплати</h2><SalaryTable onChange={setWages}/><WagesUploader onRows={setWages}/></div>
        <div className="card"><h2 className="font-medium mb-2">2) Зареди HICP/ИПЦ</h2><InflationUploader onChange={setHicp}/></div>
      </section>

      <section className="card">
        <h2 className="font-medium mb-2">3) Лични разходи (CP01–CP12)</h2>
        <ExpensesTable onChange={setExpenses}/>
        <ExpensesUploader onRows={setExpenses}/>
        <div className="flex flex-wrap items-center gap-2 mt-2 text-sm">
          <button
            onClick={async()=>{
              const needed=[...new Set(Object.keys(weights).map(c=>COICOP_MAP[c]).filter(Boolean))];
              if(!needed.length){ setCatStatus('Няма тегла за базовия месец. Добави разходи.'); return; }
              setCatStatus('Изтегляне на HICP по категории...');
              try{ const data=await fetchEurostatHICPFor(needed); setHicpByCoicop(prev=>({...prev,...data})); setCatStatus(`Заредени ${needed.length} категории.`); }
              catch(e:any){ setCatStatus('Грешка: '+(e?.message||e)); }
            }}
            className="px-3 py-2 border rounded">Изтегли HICP по категориите ми</button>
          {weightsBaseUsed && <span className="badge">Тегла от: {weightsBaseUsed}</span>}
          {catStatus && <span className="text-slate-600">{catStatus}</span>}
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-medium">4) Период и резултати</h2>
        <PeriodPickerMonth min={pickerDates[0]||'2015-01'} max={pickerDates[pickerDates.length-1]||'2015-01'} start={start} end={end} onChange={(s,e)=>{ touched.current=true; setStart(s); setEnd(e); }}/>
        <div className="grid md:grid-cols-3 gap-4">
          <Card title="Официална инфлация" value={hicpChange!=null? (hicpChange*100).toFixed(1)+'%':'—'} note="HICP за избрания период"/>
          <Card title="Промяна на заплатата" value={wageChange!=null? (wageChange*100).toFixed(1)+'%':'—'} note="Най-близки налични месеци"/>
          <Card title="Реална промяна" value={realChange!=null? (realChange*100).toFixed(1)+'%':'—'} note="Покупателна способност"/>
        </div>
        {extrema && (
          <div className="grid md:grid-cols-2 gap-4">
            <Card title="Най-добра покупателна способност" value={`${extrema.max.real.toFixed(2)} (месец ${extrema.max.date})`} />
            <Card title="Най-лоша покупателна способност" value={`${extrema.min.real.toFixed(2)} (месец ${extrema.min.date})`} />
          </div>
        )}
      </section>

      <section className="card">
        <h2 className="font-medium mb-2">5) Визуализация</h2>
        <div className="text-sm" style={{color:'#475569'}}>Всички линии са ребазирани = 100 в началния месец. Tooltip дава описание.</div>
        <div style={{height:420,width:'100%'}}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart key={chartKey} data={merged} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
              <XAxis dataKey="date" minTickGap={24} allowDuplicatedCategory={false} />
              <YAxis allowDecimals tickMargin={4} tickFormatter={(v:number)=>Number(v).toFixed(2)} />
              <Tooltip content={<InfoTooltip />} />
              <Legend />
              <Line type="monotone" dataKey="wage" name="Индекс заплата (=100)" stroke="#2563eb" dot={false} connectNulls isAnimationActive={false} />
              <Line type="monotone" dataKey="hicp" name="Индекс цени (HICP, =100)" stroke="#16a34a" dot={false} connectNulls isAnimationActive={false} />
              <Line type="monotone" dataKey="real" name="Реален индекс (заплата/цени)" stroke="#dc2626" dot={false} connectNulls isAnimationActive={false} />
              <Line type="monotone" dataKey="personal" name="Личен индекс (=100)" stroke="#7c3aed" dot={false} connectNulls isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <footer className="text-xs" style={{color:'#64748b'}}>Данните се пазят локално (IndexedDB). Реалният индекс ≈ покупателна способност. Личният индекс ползва тегла от най-близкия месец с разходи.</footer>
    </div>
  );
}
```

---

### ✅ Готово за билд
След като копираш файловете:
```bash
npm install
npm run build
```
— и качи `dist/` в Netlify Drop или през Git (build: `npm run build`, publish: `dist`).

Ако искаш, мога да добавя и **готови тестови CSV/Google Sheets линкове** в `README` секция тук, за да пробваш веднага. 

