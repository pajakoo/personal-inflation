import React, { useMemo, useState, useEffect, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from "recharts";
import { openDB, type IDBPDatabase, type DBSchema } from "idb";

// =============================================================
// Personal Inflation Tracker — PWA UI (Enhanced visuals)
// - Polished Card component & spacing
// - Unified buttons/inputs (no inline styles)
// - Clean headers and sections
// - Same logic/behaviour as before
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
function parseCategoryToKey(input: string){
  const s=(input||'').toLowerCase().trim();
  return BG_TO_KEY[s] || EN_TO_KEY[s] || null;
}
function displayCategory(key: keyof typeof COICOP_MAP){ return CATEGORY_BG[key] || String(key); }

// ------------------ IndexedDB ------------------
interface MyDB extends DBSchema {
  wages: { key: string; value: Row[] };
  hicp: { key: string; value: Row[] };
  expenses: { key: string; value: Expense[] };
  meta: { key: string; value: unknown };
}
const DB_NAME = "personal-inflation";
const DB_VERSION = 6;
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
async function saveExpenses(rows: Expense[]){
  const norm = rows.map(r => ({...r, category:(parseCategoryToKey(String(r.category))||r.category)}));
  const db=await getDB(); await db.put('expenses', norm, 'data');
}
async function loadExpenses(){
  const db=await getDB(); const got=(await db.get('expenses','data')) || [];
  return got.map((r:any)=>({...r, category:(parseCategoryToKey(String(r.category))||r.category)}));
}
async function setMeta<T=unknown>(key: string, value: T){ const db=await getDB(); await db.put('meta', value, key); }
async function getMeta<T=unknown>(key: string){ const db=await getDB(); return (await db.get('meta', key)) as T | undefined; }
// Clear all app data in IndexedDB
async function clearAllData(){
  const db = await getDB();
  await db.clear('wages');
  await db.clear('hicp');
  await db.clear('expenses');
  await db.clear('meta');
}

// ------------------ Utils ------------------
function toMonthlySeries(rows: Row[]): Row[]{ const m=new Map<string,number>(); rows.forEach(r=>m.set(r.date,r.value)); return [...m.entries()].map(([date,value])=>({date,value})).sort((a,b)=>a.date.localeCompare(b.date)); }
function rebaseTo100(series: Row[], base: string){
  const p=series.find(r=>r.date===base);
  if(!p) return series.map(r=>({...r}));
  const k=100/p.value;
  return series.map(r=>({date:r.date,value:r.value*k}));
}
function rangeSlice(series: Row[], s: string, e: string){ return series.filter(r=>r.date>=s && r.date<=e); }
function findNearest(series: Row[], target: string): Row | null{
  if(!series.length) return null;
  let best: Row | null = null;
  for(const r of series){
    if(r.date===target) return r;
    if(r.date<target) best = r;
    if(r.date>target && !best) return r;
  }
  return best || series[series.length-1];
}
function changePctNearest(series: Row[], s: string, e: string): number | null{
  const start = findNearest(series, s); const end = findNearest(series, e);
  if(!start || !end) return null; return end.value / start.value - 1;
}
function monthRange(s: string, e: string){
  const [sy,sm]=s.split('-').map(Number), [ey,em]=e.split('-').map(Number);
  if(!sy||!sm||!ey||!em) return [];
  const out:string[]=[]; let y=sy,m=sm;
  while(y<ey || (y===ey && m<=em)){ out.push(`${y}-${String(m).padStart(2,'0')}`); m++; if(m===13){ m=1; y++; } }
  return out;
}

// ------------------ CSV & URL helpers ------------------
function parseWagesCSV(text: string): Row[]{
  const lines=text.trim().split(/\r?\n/); if(!lines.length) return [];
  const header=lines[0].replace(/^\uFEFF/,'').toLowerCase();
  const delim=header.includes(';')&&!header.includes(',')?';':',';
  const cols=header.split(delim).map(s=>s.trim());
  const dateIdx=cols.findIndex(c=>['date','дата','месец','month'].includes(c));
  const valIdx=cols.findIndex(c=>['value','salary','заплата'].includes(c));
  return lines.slice(1).map(line=>{
    const p=line.split(delim);
    const rawDate=((dateIdx>=0?p[dateIdx]:p[0])||'').trim();
    const date=rawDate.replace(/\./g,'-');
    let vStr=((valIdx>=0?p[valIdx]:p[1])||'').trim();
    vStr=vStr.replace(/\u00A0/g,'').replace(/\s+/g,'').replace(/,(\d+)$/,'.$1');
    const value=Number(vStr);
    return { date, value };
  }).filter(r=>/^\d{4}-\d{2}$/.test(r.date) && Number.isFinite(r.value));
}
function parseExpensesCSV(text: string): Expense[]{
  const lines=text.trim().split(/\r?\n/); if(lines.length<2) return [];
  const header=lines[0].replace(/^\uFEFF/,'').toLowerCase();
  const delim=header.includes(';')&&!header.includes(',')?';':',';
  const cols=header.split(delim).map(s=>s.trim());
  const dateIdx=cols.findIndex(c=>['date','месец','month','дата'].includes(c));
  const catIdx=cols.findIndex(c=>['category','категория'].includes(c));
  const amtIdx=cols.findIndex(c=>['amount','сума','разход'].includes(c));
  return lines.slice(1).map(line=>{
    const p=line.split(delim);
    const date=((dateIdx>=0?p[dateIdx]:p[0])||'').trim().replace(/\./g,'-');
    const catRaw=((catIdx>=0?p[catIdx]:p[1])||'').trim();
    const key=parseCategoryToKey(catRaw);
    let vStr=((amtIdx>=0?p[amtIdx]:p[2])||'').trim();
    vStr=vStr.replace(/\u00A0/g,'').replace(/\s+/g,'').replace(/,(\d+)$/,'.$1');
    const amount=Number(vStr);
    return { date, category:(key||catRaw), amount };
  }).filter(r=>/^\d{4}-\d{2}$/.test(r.date) && !!r.category && Number.isFinite(r.amount));
}
function toCsvUrl(input: string){
  try{
    const u=new URL(input.trim());
    if(!u.hostname.includes('docs.google.com')) return input;
    if(u.pathname.endsWith?.('/export') || u.pathname.endsWith('/export')){
      u.searchParams.set('format','csv'); return u.toString();
    }
    if(u.pathname.includes('/pub')){
      u.searchParams.set('output','csv'); u.pathname=u.pathname.replace(/\/pub(?:html)?$/, '/pub'); return u.toString();
    }
    const parts=u.pathname.split('/');
    const i=parts.indexOf('d');
    if(i>=0 && parts[i+1]){
      const id=parts[i+1]; const gid=u.searchParams.get('gid')||'0';
      return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
    }
    return input;
  }catch{ return input; }
}

// ------------------ Eurostat fetch & parser ------------------
const EUROSTAT_URL = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_midx?format=JSON&lang=en&coicop=CP00&geo=BG&unit=I15&freq=M";
function parseEurostatJsonStat(js: any): Row[]{
  const dim=js?.dimension||js?.dataset?.dimension||{};
  const timeCat=(dim.time||dim.TIME||{}).category||{};
  const indexMap:Record<string,number>=timeCat.index||{};
  const values=js.value??js.dataset?.value??[];
  return Object.entries(indexMap).sort((a:any,b:any)=>a[1]-b[1]).map(([tKey,i]:any)=>{
    const raw=Array.isArray(values)? values[i]: values[i];
    const m=String(tKey).match(/(\d{4})M(\d{2})/);
    const date=m?`${m[1]}-${m[2]}`:String(tKey);
    return { date, value:Number(raw) };
  }).filter(r=>r.date && !Number.isNaN(r.value));
}
async function fetchEurostatHICP(): Promise<Row[]>{
  const res=await fetch(EUROSTAT_URL+`&_=${Date.now()}`,{method:'GET',credentials:'omit'});
  if(!res.ok){
    await setMeta('lastEurostatError',{status:res.status,statusText:res.statusText,when:new Date().toISOString()});
    throw new Error('Eurostat error '+res.status);
  }
  const js=await res.json();
  return parseEurostatJsonStat(js);
}
async function fetchEurostatHICPFor(categories: string[]): Promise<Record<string, Row[]>>{
  if(!categories.length) return {};
  const params = new URLSearchParams({
  format: 'JSON',
  lang: 'en',
  geo: 'BG',
  unit: 'I15',
  freq: 'M',
  coicop: categories.join(','),
  sinceTimePeriod: '2000-01'   // ← добавено
});
  const url=`https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_midx?${params.toString()}&_=${Date.now()}`;
  const res=await fetch(url,{method:'GET',credentials:'omit'});
  if(!res.ok) throw new Error('Eurostat error '+res.status);
  const js=await res.json();
  const ds=js.dataset || js;
  const dim=ds.dimension || {};
  const id: string[] = (ds.id || Object.keys(dim)) as string[];
  const size: number[] = (ds.size || id.map((k) => Object.keys((dim as any)[k]?.category?.index || {}).length)) as number[];
  const indexOf=(name:string)=> id.findIndex(d=>d.toLowerCase()===name.toLowerCase());
  const ci=indexOf('coicop');
  const ti=indexOf('time');
  const coicopIndex=(dim.coicop || (dim as any).COICOP).category.index as Record<string, number>;
  const timeIndex=(dim.time || (dim as any).TIME).category.index as Record<string, number>;
  const strides:number[] = new Array(size.length).fill(0);
  let acc=1;
  for(let i=size.length-1;i>=0;i--){ strides[i]=acc; acc*=size[i]; }
  const values:any = ds.value ?? js.value ?? [];
  const out:Record<string, Row[]> = {};
  for(const [code,cIdx] of Object.entries(coicopIndex)){
    if(!categories.includes(code)) continue;
    const rows:Row[]=[];
    for(const [tKey,tIdx] of Object.entries(timeIndex).sort((a:any,b:any)=>a[1]-b[1])){
      const coord=new Array(size.length).fill(0);
      if(ci>=0) coord[ci]=cIdx as number;
      if(ti>=0) coord[ti]=tIdx as number;
      const flat=coord.reduce((sum,v,k)=> sum + v*strides[k], 0);
      const raw=Array.isArray(values)? values[flat] : values[flat];
      if(raw==null) continue;
      const m=String(tKey).match(/(\d{4})M(\d{2})/);
      const date=m?`${m[1]}-${m[2]}`:String(tKey);
      rows.push({ date, value:Number(raw) });
    }
    out[code]=rows;
  }
  return out;
}



// ------------------ Eurostat SDMX 2.1 ------------------
// Използвай директно официалния URL или сложи свой proxy (напр. /eurostat/…)
// Вариант А: директно към Eurostat
const SDMX_BASE = "https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/data/PRC_HICP_MIDX";
// Вариант Б (ако имаш proxy/CORS): const SDMX_BASE = "/eurostat/api/dissemination/sdmx/2.1/data/PRC_HICP_MIDX";

// Общ парсър за SDMX 2.1 JSON → { "CPxx": Row[] }
function parseSDMXSeriesToRows(js: any, wantedCoicop: string[] | null = null): Record<string, Row[]> {
  const dataSet = js?.dataSets?.[0];
  const seriesDims = js?.structure?.dimensions?.series || [];
  const obsDims = js?.structure?.dimensions?.observation || [];
  const timeDim = obsDims.find((d: any) => (d.id || "").toLowerCase() === "time");
  const timeValues: string[] = (timeDim?.values || []).map((v: any) => v?.id);

  // Позиции: 0=freq, 1=unit, 2=coicop, 3=geo  (за този датасет)
  const coicopDim = seriesDims[2];
  const coicopIndexToId: Record<string, string> = Object.fromEntries(
    (coicopDim?.values || []).map((v: any, i: number) => [String(i), v?.id])
  );

  const out: Record<string, Row[]> = {};
  const seriesObj = dataSet?.series || {};

  for (const sKey of Object.keys(seriesObj)) {
    const parts = sKey.split(":");
    const coicopIdx = parts[2];
    const coicopCode = coicopIndexToId[coicopIdx];
    if (!coicopCode) continue;
    if (wantedCoicop && !wantedCoicop.includes(coicopCode)) continue;

    const observations = seriesObj[sKey]?.observations || {};
    const rows: Row[] = [];

    for (const tIndexStr of Object.keys(observations)) {
      const tIndex = Number(tIndexStr);
      const date = timeValues[tIndex];               // "YYYY-MM"
      const val = observations[tIndexStr]?.[0];
      if (date && typeof val === "number" && Number.isFinite(val)) {
        rows.push({ date, value: val });
      }
    }
    if (rows.length) {
      rows.sort((a, b) => a.date.localeCompare(b.date));
      out[coicopCode] = rows;
    }
  }
  return out;
}


// Compact Eurostat JSON ("class":"dataset") → Row[]
function parseEurostatCompactToRows(js: any): Row[] {
  const idxByTime: Record<string, number> = js?.dimension?.time?.category?.index || {};
  const valByPos = js?.value || {};
  // обръщаме index→timeLabel и вадим стойностите от value[pos]
  return Object.entries(idxByTime)
    .sort((a, b) => a[1] - b[1])
    .map(([timeLabel, pos]) => {
      const v = valByPos[String(pos)];
      return v == null ? null : { date: timeLabel, value: Number(v) };
    })
    .filter(Boolean) as Row[];
}

// Хелпър за разграничаване на форматите
function isSDMXSeries(js: any): boolean {
  return !!(js?.dataSets && js?.structure);
}

// 1) Общ HICP (CP00)
async function fetchEurostatHICP_SDMX({
  geo = "BG",
  unit = "I15",
  freq = "M",
  start = "2000-01",
  end, // може да е undefined → до най-новото
}: { geo?: string; unit?: string; freq?: "M"; start?: string; end?: string } = {}): Promise<Row[]> {
  // ВАЖНО: не encode-вай „пътя“ с '+'
  // Формат: /M.I15.CP00.BG?time=2000-01:2025-07&format=JSON&compressed=false
  const path = [freq, unit, "CP00", geo].join(".");
  const time = `${start}:${end ?? ""}`;
  const url = `${SDMX_BASE}/${path}?time=${time}&format=JSON&compressed=false`;

  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`SDMX error ${res.status}`);
  const js = await res.json();
if (isSDMXSeries(js)) {
  // твоя SDMX парсър
  const byCode = parseSDMXSeriesToRows(js, ["CP00"]);
  return (byCode["CP00"] || []).sort((a, b) => a.date.localeCompare(b.date));
} else {
  // compact JSON като в примера ти
  return parseEurostatCompactToRows(js).sort((a, b) => a.date.localeCompare(b.date));
}
}

// 2) Няколко COICOP категории (CP01+CP04+…)
async function fetchEurostatHICPForSDMX(
  categories: string[],
  {
    geo = "BG",
    unit = "I15",
    freq = "M",
    start = "2000-01",
    end,
  }: { geo?: string; unit?: string; freq?: "M"; start?: string; end?: string } = {}
): Promise<Record<string, Row[]>> {
  if (!categories.length) return {};
  const coicopPart = categories.join("+");          // ← плюс, не запетая
  const path = [freq, unit, coicopPart, geo].join(".");
  const time = `${start}:${end ?? ""}`;
  const url = `${SDMX_BASE}/${path}?time=${time}&format=JSON&compressed=false`;

  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`SDMX error ${res.status}`);
  const js = await res.json();
 if (isSDMXSeries(js)) {
  return parseSDMXSeriesToRows(js, categories);
} else {
  // compact отговорите носят само една серия (CP00/или конкретния COICOP)
  // при заявка с няколко COICOP-а Eurostat ще върне SDMX, но все пак слагаме fallback:
  const rows = parseEurostatCompactToRows(js);
  // тъй като пътят е .../CP01+CP04+..., compact няма как да дойде с няколко серии,
  // затова връщаме първата категория, ако е само една; иначе празно.
  const first = categories[0];
  return first ? { [first]: rows } : {};
}
}



// ------------------ UI atoms ------------------
// Polished Card (like your earlier example)
function Card({ title, value, note }: { title: string; value: string; note?: string }){
  return (
    <div className="card metric">
      <div className="kicker">{title}</div>
      <div className="value">{value}</div>
      {note && <div className="help">{note}</div>}
    </div>
  );
}

function PeriodPickerMonth({
  min, max, start, end, onChange
}:{min:string; max:string; start:string; end:string; onChange:(s:string,e:string)=>void}){
  return (
    <div className="row row-lg">
      <div>
        <div className="help">Начало</div>
        <input type="month" min={min} max={max} value={start} onChange={e=>onChange(e.target.value, end)} />
      </div>
      <div>
        <div className="help">Край</div>
        <input type="month" min={min} max={max} value={end} onChange={e=>onChange(start, e.target.value)} />
      </div>
    </div>
  );
}

// Tooltip with explanations (visual polish kept)
function InfoTooltip({ active, payload, label }: any){
  if(!active || !payload || !payload.length) return null;
  const rows = payload.filter((p:any)=>p.value!=null);
  const explain: Record<string,string> = {
    wage: "Заплата ребазирана (=100 в началния месец).",
    hicp: "Официален индекс на потребителските цени (HICP).",
    real: "Покупателна способност = заплата/цени.",
    personal: "Личен индекс според твоите разходи и HICP по категории."
  };
  return (
    <div style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:12,padding:'8px 10px',boxShadow:'0 2px 6px rgba(0,0,0,.05)'}}>
      <div style={{fontSize:12, color:'#475569', marginBottom:4}}>{label}</div>
      {rows.map((r:any)=> {
        const color = r.color || r.stroke || (r.payload && (r.payload.stroke || r.payload.color)) || '#111';
        const val = Number(r.value);
        const pct = Number.isFinite(val) ? (val - 100) : NaN; // за ребазираните индекси
        const pctText = Number.isFinite(pct) ? (pct>=0? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`) : '—';
        return (
          <div key={r.dataKey} style={{fontSize:13, display:'flex', alignItems:'flex-start', gap:8, marginBottom:6}}>
            <span style={{width:10,height:10,background:color,borderRadius:3,display:'inline-block',marginTop:6}} />
            <div style={{flex:1}}>
              <div>
                <strong style={{color}}>{r.name}:</strong>{' '}
                <span style={{color:'#0f172a'}}>{pctText}</span>
              </div>
              <div style={{fontSize:11,color:'#64748b'}}>{explain[r.dataKey]||''}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ------------------ Personal index helpers ------------------
function monthlyCategoryTotals(expenses: Expense[]): Record<string, Record<string, number>> {
  const totals: Record<string, Record<string, number>> = {};
  for(const e of expenses){
    const key=(parseCategoryToKey(String(e.category)) || (e.category as any)) as any;
    totals[e.date] ??= {};
    totals[e.date][key] = (totals[e.date][key]||0) + e.amount;
  }
  return totals;
}
function pickBaseMonthForWeights(expenses: Expense[], base: string): { baseUsed: string | null, weights: Record<string, number> }{
  const totalsByMonth = monthlyCategoryTotals(expenses);
  const build=(month:string)=>{
    const obj=totalsByMonth[month]; if(!obj) return null;
    const total = Object.values(obj).reduce((a,b)=>a+b,0); if(!total) return null;
    const w:Record<string,number>={};
    for(const [cat,sum] of Object.entries(obj)){
      const k=(parseCategoryToKey(String(cat)) || (cat as any)) as any;
      w[k] = (w[k]||0) + (sum as number)/total;
    }
    return w;
  };
  let w = build(base);
  if(w) return { baseUsed: base, weights: w };
  const months = Object.keys(totalsByMonth).sort();
  const before = months.filter(m=>m<=base).pop();
  if(before){ w=build(before); if(w) return { baseUsed: before, weights: w }; }
  const after = months.find(m=>m>base);
  if(after){ w=build(after); if(w) return { baseUsed: after, weights: w }; }
  return { baseUsed: null, weights: {} };
}
function computePersonalIndex(
  weights: Record<string, number>,
  seriesByCoicop: Record<string, Row[]>,
  dates: string[],
  base: string,
  catToCoicop: Record<string, string>
){
  const rebased: Record<string, Record<string, number>> = {};
  for(const cat of Object.keys(weights)){
    const code=catToCoicop[cat];
    const raw=seriesByCoicop[code]||[];
    const r=rebaseTo100(raw, base);
    rebased[cat] = Object.fromEntries(r.map(p=>[p.date,p.value]));
  }
  return dates.map(d=>{
    let val=0,wsum=0;
    for(const [cat,w] of Object.entries(weights)){
      const v=rebased[cat]?.[d];
      if(typeof v==='number'&&Number.isFinite(v)){ val+=w*v; wsum+=w; }
    }
    return {date:d, value: wsum?val:undefined as any};
  }).filter(p=>typeof p.value==='number');
}

// ------------------ Tables (with scroll) ------------------
function SalaryTable({ onChange }:{onChange:(rows:Row[])=>void}){
  const [rows,setRows]=useState<Row[]>([]);
  const [date,setDate]=useState('2020-01');
  const [value,setValue]=useState<number>(1500);

  useEffect(()=>{
    loadRows('wages').then(d=>{
      setRows(d);
      onChange(d);
    });
  },[onChange]);

  // 🔧 Дедупликация за уникален ключ по месец (последният запис печели)
  const viewRows = useMemo(()=>{
    const m = new Map<string, Row>();
    for (const r of rows) {
      if (/^\d{4}-\d{2}$/.test(r.date) && Number.isFinite(r.value)) {
        m.set(r.date, r); // overwrite => последният ред за даден месец остава
      }
    }
    return [...m.values()].sort((a,b)=>a.date.localeCompare(b.date));
  }, [rows]);

  const upsert=async()=>{
    // гарантира 1 запис на месец
    const next = rows.filter(r=>r.date!==date).concat({date,value:Number(value)});
    setRows(next);
    await saveRows('wages', next);
    onChange(next);
  };

  const del=async(d:string)=>{
    const next=rows.filter(r=>r.date!==d);
    setRows(next);
    await saveRows('wages',next);
    onChange(next);
  };

  return (
    <div className="grid">
      <div className="row">
        <input value={date} onChange={e=>setDate(e.target.value)} placeholder="YYYY-MM"/>
        <input type="number" value={value} onChange={e=>setValue(Number(e.target.value))} placeholder="Заплата (лв.)"/>
        <button onClick={upsert} className="btn btn-primary">Запази</button>
      </div>
      <div className="table-scroll">
        <table data-testid="wages-table">
          <thead>
            <tr><th>Дата</th><th>Заплата (лв.)</th><th/></tr>
          </thead>
          <tbody>
            {viewRows.map(r=>(
              <tr key={r.date}>
                <td>{r.date}</td>
                <td>{r.value}</td>
                <td className="text-right">
                  <button onClick={()=>del(r.date)} className="btn btn-sm btn-danger">Изтрий</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


function WagesUploader({ onRows }:{onRows:(rows:Row[])=>void}){
  const [status,setStatus]=useState('');
  const [url,setUrl]=useState('');
  const [paste,setPaste]=useState('');
  const handleParsed=async(rows:Row[],src:string)=>{
    const map=new Map<string,Row>();
    rows.forEach(r=>{ if(/^\d{4}-\d{2}$/.test(r.date) && Number.isFinite(r.value)) map.set(r.date,r); });
    const unique=[...map.values()].sort((a,b)=>a.date.localeCompare(b.date));
    await saveRows('wages', unique);
    onRows(unique);
    setStatus(`${src}: ${unique.length} реда`);
  };
  return (
    <div className="mt-3">
      <div className="text-muted-2" style={{fontSize:14,fontWeight:600}}>Импорт на заплати (CSV / Google Sheets)</div>
      <div className="row row-lg mt-2">
        <input data-testid="wages-file-input" type="file" accept=".csv" onChange={async e=>{
          const f=e.target.files?.[0]; if(!f) return;
          const txt=await f.text(); const rows=parseWagesCSV(txt); await handleParsed(rows,'CSV файл');
        }} />
        <input className="w-100 minw-240" placeholder="CSV URL" value={url} onChange={e=>setUrl(e.target.value)} />
        <button className="btn" onClick={async()=>{
          try{
            const res=await fetch(toCsvUrl(url)); if(!res.ok) throw new Error(String(res.status));
            const txt=await res.text(); const rows=parseWagesCSV(txt);
            if(!rows.length) throw new Error('Празни/неразпознати данни'); await handleParsed(rows,'CSV от URL');
          }catch(e:any){ setStatus('Грешка: '+(e?.message||e)); }
        }}>Импорт от URL</button>
      </div>
      <textarea className="w-100 mt-2" rows={4} placeholder="date,value" value={paste} onChange={e=>setPaste(e.target.value)} />
      <div className="row mt-2">
        <button className="btn" onClick={async()=>{ const rows=parseWagesCSV(paste); await handleParsed(rows,'Поставен CSV'); }}>Импорт от текст</button>
        {status && <div className="help" data-testid="wages-status">{status}</div>}
      </div>
    </div>
  );
}

function InflationUploader({ onChange }:{onChange:(rows:Row[])=>void}){
  const [count,setCount]=useState(0);
  const [status,setStatus]=useState('');
  const [loading,setLoading]=useState(false);
  const onFile=async(f:File)=>{
    const txt=await f.text();
    const rows:Row[]=txt.trim().split(/\r?\n/).slice(1).map(line=>{const [date,v]=line.split(','); return {date:date.trim(),value:Number(v)};}).filter(r=>r.date&&!Number.isNaN(r.value));
    await saveRows('hicp',rows);
    setCount(rows.length);
    setStatus(`CSV импорт: ${rows.length} реда.`);
    onChange(rows);
  };
  const loadOfficial = async ()=>{
    setLoading(true);
    setStatus('Зареждане на официална инфлация…');
    try{
      const rows = await fetchEurostatHICP_SDMX({ geo:'BG', unit:'I15', freq:'M', start:'2000-01' });
      await saveRows('hicp', rows);
      setCount(rows.length);
      setStatus(`Официална инфлация: ${rows.length} месеца.`);
      onChange(rows);
    }catch(e:any){
      setStatus('Грешка: '+(e?.message||e));
    }finally{
      setLoading(false);
    }
  };
  return (
    <div className="grid">
      <div className="row row-lg">
        <input data-testid="hicp-file-input" type="file" accept=".csv" onChange={e=>{ const f=e.target.files?.[0]; if(f) onFile(f); }} />
      </div>
      <div className="row mt-2">
        <button
          className="btn"
          data-testid="load-official-hicp"
          disabled={loading}
          onClick={loadOfficial}
        >
          {loading ? 'Зареждане…' : 'Зареди официална инфлация (Eurostat)'}
        </button>
      </div>
      {status && <div className="help" data-testid="hicp-status">{status}</div>}
      {count>0 && <span className="badge mt-2">Заредени: {count}</span>}
    </div>
  );
}

function ExpensesUploader({ onRows }:{onRows:(rows:Expense[])=>void}){
  const [status,setStatus]=useState('');
  const [url,setUrl]=useState('');
  const [paste,setPaste]=useState('');
  const handleParsed=async(rows:Expense[],src:string)=>{
    await saveExpenses(rows); onRows(rows); setStatus(`${src}: ${rows.length} реда`);
  };
  return (
    <div className="mt-2">
      <div className="text-muted-2" style={{fontSize:14,fontWeight:600}}>Импорт на разходи (CSV/Google Sheets)</div>
      <div className="row row-lg mt-2">
        <input data-testid="expenses-file-input" type="file" accept=".csv" onChange={async e=>{
          const f=e.target.files?.[0]; if(!f)return;
          const txt=await f.text(); const rows=parseExpensesCSV(txt); await handleParsed(rows,'CSV файл');
        }} />
        <input className="w-100 minw-240" placeholder="CSV URL" value={url} onChange={e=>setUrl(e.target.value)} />
        <button className="btn" onClick={async()=>{
          try{
            const res=await fetch(toCsvUrl(url)); if(!res.ok) throw new Error(String(res.status));
            const txt=await res.text(); const rows=parseExpensesCSV(txt); await handleParsed(rows,'CSV от URL');
          }catch(e:any){ setStatus('Грешка: '+(e?.message||e)); }
        }}>Импорт от URL</button>
      </div>
      <textarea className="w-100 mt-2" rows={4} placeholder="date,category,amount" value={paste} onChange={e=>setPaste(e.target.value)} />
      <div className="row mt-2">
        <button className="btn" onClick={async()=>{ const rows=parseExpensesCSV(paste); await handleParsed(rows,'Поставен CSV'); }}>Импорт от текст</button>
        {status && <div className="help" data-testid="expenses-status">{status}</div>}
      </div>
    </div>
  );
}

function ExpensesTable({ onChange }:{onChange:(rows:Expense[])=>void}){
  const [rows,setRows]=useState<Expense[]>([]);
  const [date,setDate]=useState('2024-01');
  const [category,setCategory]=useState<keyof typeof COICOP_MAP>('Food');
  const [amount,setAmount]=useState<number>(0);

  useEffect(()=>{ loadExpenses().then(x=>{ setRows(x); onChange(x); }); },[onChange]);

  const upsert=async()=>{
    const next=rows
      .filter(r=>!(r.date===date && (parseCategoryToKey(String(r.category))||r.category)===category))
      .concat({date,category:category as any,amount:Number(amount)});
    setRows(next); await saveExpenses(next); onChange(next);
  };
  const del=async(d:string,c:string)=>{
    const next=rows.filter(r=>!(r.date===d && String(r.category)===String(c)));
    setRows(next); await saveExpenses(next); onChange(next);
  };

  return (
    <div className="grid">
      <div className="row">
        <input value={date} onChange={e=>setDate(e.target.value)} placeholder="YYYY-MM"/>
        <select value={category} onChange={e=>setCategory(e.target.value as any)}>
          {CATEGORY_KEYS.map(k=> <option key={k} value={k}>{displayCategory(k)}</option>)}
        </select>
        <input type="number" value={amount} onChange={e=>setAmount(Number(e.target.value))} placeholder="Сума (лв.)"/>
        <button onClick={upsert} className="btn btn-primary">Запази</button>
      </div>

      <div className="table-scroll">
        <table data-testid="expenses-table">
          <thead>
            <tr className="text-muted">
              <th className="py-2">Месец</th><th className="py-2">Категория</th><th className="py-2">Сума</th><th/>
            </tr>
          </thead>
          <tbody>
            {[...rows]
              .sort((a,b)=> a.date.localeCompare(b.date) || String(a.category).localeCompare(String(b.category)))
              .map(r=> (
              <tr key={r.date+String(r.category)}>
                <td className="py-2">{r.date}</td>
                <td className="py-2">{displayCategory((parseCategoryToKey(String(r.category))||r.category) as any)}</td>
                <td className="py-2">{r.amount}</td>
                <td className="py-2 text-right">
                  <button onClick={()=>del(r.date,String(r.category))} className="btn btn-sm btn-danger">Изтрий</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ------------------ App ------------------
export default function App(){
  const [wages,setWages]=useState<Row[]>([]);
  const [hicp,setHicp]=useState<Row[]>([]);
  const [expenses,setExpenses]=useState<Expense[]>([]);
  const [hicpByCoicop,setHicpByCoicop]=useState<Record<string,Row[]>>({});
  const [catStatus,setCatStatus]=useState('');
  const [weightsBaseUsed,setWeightsBaseUsed]=useState<string|null>(null);
  const [avgWages, setAvgWages] = useState<Row[]>([]);
  const [resetCounter, setResetCounter] = useState(0);

  useEffect(()=>{ loadRows('wages').then(setWages); loadRows('hicp').then(setHicp); loadExpenses().then(setExpenses); },[]);
// On first run with empty stores, autoload defaults once
// useEffect(()=>{
//   (async ()=>{
//     const already = await getMeta<boolean>('autoLoaded');
//     if (already) return;
//     const hasAny = (wages.length + hicp.length + expenses.length) > 0;
//     if (!hasAny) await loadDefaults();
//   })();
//   // eslint-disable-next-line react-hooks/exhaustive-deps
// }, [wages.length, hicp.length, expenses.length]);

  const hicpSeries = useMemo(()=> toMonthlySeries(hicp), [hicp]);
  
  const [start,setStart]=useState('2015-01'); const [end,setEnd]=useState('2000-01');

  const touched=useRef(false);
  useEffect(()=>{ 
    if(touched.current) return; 
    if(!hicpSeries.length) return; 
    const last=hicpSeries[hicpSeries.length-1].date; 
    setStart('2015-01'); 
    setEnd(last); 
  },[hicpSeries.length]);

  const wageSeries = useMemo(()=> toMonthlySeries(wages), [wages]);
  const rebasedWage = useMemo(()=> rebaseTo100(wageSeries, start), [wageSeries,start]);
  const rebasedHicp = useMemo(()=> rebaseTo100(hicpSeries, start), [hicpSeries,start]);
  const slicedW = useMemo(()=> rangeSlice(rebasedWage,start,end), [rebasedWage,start,end]);
  const slicedC = useMemo(()=> rangeSlice(rebasedHicp,start,end), [rebasedHicp,start,end]);
  const avgWageSeries = useMemo(()=> toMonthlySeries(avgWages), [avgWages]);
  const rebasedAvgWage = useMemo(()=> rebaseTo100(avgWageSeries, start), [avgWageSeries,start]);
  const slicedAvg = useMemo(()=> rangeSlice(rebasedAvgWage, start, end), [rebasedAvgWage,start,end]);
  const datesSorted = useMemo(()=>{
    const set = new Set<string>();
    slicedW.forEach(r=>set.add(r.date));
    slicedC.forEach(r=>set.add(r.date));
    return [...set].sort();
  }, [slicedW, slicedC]);
  const pickerDates = useMemo(()=>{
      // prefer HICP, else avgWage, else personal wages
      const base = hicpSeries.length ? hicpSeries
                : (avgWageSeries.length ? avgWageSeries
                : wageSeries);
      if (!base.length) return [];
      const first = base[0].date;
      const last = base[base.length - 1].date;
      return monthRange(first, last);
    }, [hicpSeries, avgWageSeries, wageSeries]);
  // Personal index with fallback weights
  const { baseUsed, weights } = useMemo(()=> pickBaseMonthForWeights(expenses, start), [expenses, start]);
  useEffect(()=>{ setWeightsBaseUsed(baseUsed); }, [baseUsed]);
  const personalSeries = useMemo(()=>{
    if(!Object.keys(weights).length || !datesSorted.length) return [];
    return computePersonalIndex(weights, hicpByCoicop, datesSorted, start, COICOP_MAP);
  }, [weights, hicpByCoicop, datesSorted, start]);
  const rebasedPersonal = useMemo(()=> rebaseTo100(personalSeries, start), [personalSeries, start]);
  const personalMap = useMemo(()=> new Map(rebasedPersonal.map(p=>[p.date,p.value])), [rebasedPersonal]);

  const merged = useMemo(()=>{
    const map = new Map<string, any>();
    slicedW.forEach(r=>map.set(r.date,{date:r.date,wage: Number.isFinite(r.value)?r.value:undefined}));
    slicedC.forEach(r=>{ const x=map.get(r.date)||{date:r.date}; x.hicp= Number.isFinite(r.value)?r.value:undefined; map.set(r.date,x); });
    slicedAvg.forEach(r=>{
      const x = map.get(r.date) || { date: r.date };
      x.avgWage = Number.isFinite(r.value) ? r.value : undefined;
      map.set(r.date, x);
    });
    return [...map.values()].sort((a,b)=>a.date.localeCompare(b.date)).map(row=>({
      ...row,
      real: row.wage!=null && row.hicp!=null ? row.wage / (row.hicp/100) : undefined,
      personal: personalMap.get(row.date)
    }));
  }, [slicedW, slicedC, slicedAvg, personalMap]);

// Changes using nearest points (fix for sparse data)
const wageChange = useMemo(()=> changePctNearest(wageSeries, start, end), [wageSeries,start,end]);
const avgWageChange = useMemo(()=> changePctNearest(avgWageSeries, start, end), [avgWageSeries,start,end]); // ← add this
const hicpChange = useMemo(()=> changePctNearest(hicpSeries, start, end), [hicpSeries,start,end]);
const realChange = wageChange!=null && hicpChange!=null ? wageChange - hicpChange : null;


const personalChange = useMemo(()=> changePctNearest(personalSeries, start, end), [personalSeries, start, end]);
const realChangeOfficial = wageChange!=null && hicpChange!=null
  ? ((1 + wageChange) / (1 + hicpChange) - 1) * 100
  : null;
const realChangePersonal = wageChange!=null && personalChange!=null
  ? ((1 + wageChange) / (1 + personalChange) - 1) * 100
  : null;


// min/max real index over selected range
const extrema = useMemo(()=>{ const rows = merged.filter(r=> typeof r.real==='number'); if(!rows.length) return null; let min=rows[0], max=rows[0]; for(const r of rows){ if(r.real<min.real) min=r; if(r.real>max.real) max=r; } return { min, max }; }, [merged]);
const chartKey = useMemo(()=> 
  `${start}-${end}-${wageSeries.length}-${avgWageSeries.length}-${hicpSeries.length}-${Object.keys(hicpByCoicop).length}`, 
  [start,end,wageSeries.length,avgWageSeries.length,hicpSeries.length,hicpByCoicop]
);
const hasAvg = avgWages.length > 0;

// Default CSV asset URLs (served by Vite)
const DEFAULT_WAGES_CSV = new URL('../data/avg_wage_bg_2015_2025.csv', import.meta.url);
const DEFAULT_EXPENSES_CSV = new URL('../data/expenses.csv', import.meta.url);

// Load default data from CSV/Eurostat
const loadDefaults = async () => {
  try {
    const wagesRes = await fetch(String(DEFAULT_WAGES_CSV));
    const wagesTxt = await wagesRes.text();
    const wagesRows = parseWagesCSV(wagesTxt);
    setAvgWages(wagesRows);
    // await saveRows('wages', wagesRows);
    // setWages(wagesRows);
  } catch {}

  try {
    const expRes = await fetch(String(DEFAULT_EXPENSES_CSV));
    const expTxt = await expRes.text();
    const expRows = parseExpensesCSV(expTxt);
    await saveExpenses(expRows);
    setExpenses(expRows);
  } catch {}

  try {
    // HICP via Eurostat SDMX
    const hicpRows = await fetchEurostatHICP_SDMX({ geo:'BG', unit:'I15', freq:'M', start:'2000-01' });
    await saveRows('hicp', hicpRows);
    setHicp(hicpRows);
  } catch {}

  await setMeta('autoLoaded', true);
};

  return (
    <div className="container">
      <header className="row" style={{justifyContent:'space-between',alignItems:'center'}}>
      <h1 className="page-title">Лична инфлация — Enhanced</h1>
<div className="row" style={{gap:8}}>
  <button className="btn" onClick={async()=>{ await loadDefaults(); }}>
    Зареди дефолтни данни
  </button>
  <button
    className="btn btn-danger"
    onClick={async()=>{
      await clearAllData();
      // clear in-memory state
      setWages([]); setHicp([]); setExpenses([]); setAvgWages([]);
      setHicpByCoicop({}); setCatStatus(''); setWeightsBaseUsed(null);
      setResetCounter(c => c + 1);
    }}
  >
    Изчисти всички данни
  </button>
</div>
</header>

      <section className="grid grid-2 mt-4">
        <div className="card">
          <h2 className="section-title">1) Въведи/обнови заплати</h2>
          <SalaryTable key={resetCounter} onChange={setWages}/>
          <WagesUploader onRows={setWages}/>
          <div className="row mt-2">
          <button
            className="btn"
            onClick={async()=>{
              if (hasAvg) { 
                // remove from chart: reset avg series
                setAvgWages([]);
                return;
              }
              // load into chart
              try{
                const url = new URL('../data/avg_wage_bg_2015_2025.csv', import.meta.url);
                const res = await fetch(String(url));
                if(!res.ok) throw new Error(String(res.status));
                const txt = await res.text();
                const rows = parseWagesCSV(txt);
                setAvgWages(rows);
              }catch(e){}
            }}
          >
            {hasAvg ? 'Премахни средна заплата (БГ)' : 'Зареди средна заплата (БГ)'}
          </button>
          </div>
        </div>
        <div className="card">
          <h2 className="section-title">2) Зареди HICP/ИПЦ</h2>
          <InflationUploader onChange={setHicp}/>
        </div>
      </section>

      <section className="card mt-4">
        <h2 className="section-title">3) Лични разходи (CP01–CP12)</h2>
        <ExpensesTable key={resetCounter} onChange={setExpenses}/>
        <ExpensesUploader onRows={setExpenses}/>
        <div className="row mt-2">
        <button
          data-testid="fetch-coicop-btn"
          onClick={async()=>{
            const needed=[...new Set(Object.keys(weights).map(c=>COICOP_MAP[c]).filter(Boolean))];
            if(!needed.length){ setCatStatus('Няма тегла за базовия месец. Добави разходи.'); return; }
              setCatStatus('Изтегляне на HICP по категории...');
              try{
                const byCode = await fetchEurostatHICPForSDMX(needed, {
  geo: "BG",
  unit: "I15",
  freq: "M",
  start: "2000-01",
});
setHicpByCoicop(prev => ({ ...prev, ...byCode }));
                setCatStatus(`Заредени ${needed.length} категории.`);
              } catch(e:any){ setCatStatus('Грешка: '+(e?.message||e)); }
            }}
            className="btn"
          >
            Изтегли HICP по категориите ми
          </button>
          {weightsBaseUsed && <span className="badge">Тегла от: {weightsBaseUsed}</span>}
          {catStatus && <span className="help" data-testid="coicop-status">{catStatus}</span>}
        </div>
      </section>

      <section className="card mt-4">
        <h2 className="section-title">4) Период и резултати</h2>
        <PeriodPickerMonth
          min={pickerDates[0]||'2000-01'}
          max={pickerDates[pickerDates.length-1]||'2000-01'}
          start={start}
          end={end}
          onChange={(s,e)=>{ touched.current=true; setStart(s); setEnd(e); }}
        />

        <div className="grid grid-2 mt-3" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
          <Card title="Официална инфлация" value={hicpChange!=null? (hicpChange*100).toFixed(1)+'%':'—'} note="HICP за избрания период"/>
          <Card title="Промяна на заплатата" value={wageChange!=null? (wageChange*100).toFixed(1)+'%':'—'} note="Най-близки налични месеци"/>
          <Card title="Реална промяна" value={realChange!=null? (realChange*100).toFixed(1)+'%':'—'} note="Покупателна способност"/>
          <Card title="Реално увеличение (официално)" value={realChangeOfficial!=null ? realChangeOfficial.toFixed(1)+'%' : '—'} />
          <Card title="Реално увеличение (лично)" value={realChangePersonal!=null ? realChangePersonal.toFixed(1)+'%' : '—'} />

          {hasAvg && (
            <Card title="Средна заплата (БГ)" value={avgWageChange!=null? (avgWageChange*100).toFixed(1)+'%':'—'} note="Най-близки налични месеци"/>
          )}
        </div>

        {extrema && (
          <div className="grid grid-2 mt-3">
            <Card title="Най-добра покупателна способност" value={`${extrema.max.real.toFixed(2)} (месец ${extrema.max.date})`} />
            <Card title="Най-лоша покупателна способност" value={`${extrema.min.real.toFixed(2)} (месец ${extrema.min.date})`} />
          </div>
        )}
      </section>

      <section className="card mt-4">
        <h2 className="section-title">5) Визуализация</h2>
        <div className="help">Всички линии са ребазирани = 100 в началния месец. Tooltip дава описание.</div>
        <div className="chart-wrap" data-testid="result-chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart key={chartKey} data={merged} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
              <XAxis dataKey="date" minTickGap={24} allowDuplicatedCategory={false} />
              <YAxis
  tickFormatter={(v:number) => `${(v - 100).toFixed(1)}%`}  // ← беше v.toFixed(1)+"%"
  domain={['dataMin','dataMax']}
/>
              <Tooltip content={<InfoTooltip />} />
              <Legend />
              <ReferenceLine y={100} stroke="#e5e7eb" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="wage" name="Индекс заплата (=100)" stroke="#2563eb" dot={false} connectNulls isAnimationActive={false} />
              <Line type="monotone" dataKey="hicp" name="Индекс цени (HICP, =100)" stroke="#16a34a" dot={false} connectNulls isAnimationActive={false} />
              <Line type="monotone" dataKey="real" name="Реален индекс (заплата/цени)" stroke="#dc2626" dot={false} connectNulls isAnimationActive={false} />
              <Line type="monotone" dataKey="personal" name="Личен индекс (=100)" stroke="#7c3aed" dot={false} connectNulls isAnimationActive={false} />
              {hasAvg && (
                <Line type="monotone" dataKey="avgWage" name="Индекс средна заплата (БГ, =100)" stroke="#f59e0b" dot={false} connectNulls isAnimationActive={false} />
              )} 
              </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <footer className="help mt-4">
        Данните се пазят локално (IndexedDB). Реалният индекс ≈ покупателна способност. Личният индекс ползва тегла от най-близкия месец с разходи.
      </footer>
    </div>
  );
}
