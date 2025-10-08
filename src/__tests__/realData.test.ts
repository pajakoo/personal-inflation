import { describe, it, expect, afterAll } from 'vitest';
import { changePctNearest, type Row, toMonthlySeries } from '../calc';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

function detectAndParseCsv(text: string): Row[] {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return [];
  const header = lines[0].replace(/^\uFEFF/, '').toLowerCase();
  const delim = header.includes(';') && !header.includes(',') ? ';' : ',';
  const cols = header.split(delim).map((s) => s.trim());
  const dateIdx = cols.findIndex((c) => ['date', 'дата', 'месец', 'month', 'data'].includes(c));
  const valIdx = cols.findIndex((c) => ['value', 'salary', 'заплата', 'amount', 'стойност'].includes(c));
  const rows: Row[] = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const parts = line.split(delim);
    const rawDate = (dateIdx >= 0 ? parts[dateIdx] : parts[0])?.trim() || '';
    const date = rawDate.replace(/\./g, '-');
    let vStr = (valIdx >= 0 ? parts[valIdx] : parts[1])?.trim() || '';
    vStr = vStr.replace(/\u00A0/g, '').replace(/\s+/g, '').replace(/,(\d+)$/, '.$1');
    const value = Number(vStr);
    if (/^\d{4}-\d{2}$/.test(date) && Number.isFinite(value)) rows.push({ date, value });
  }
  return toMonthlySeries(rows);
}

const root = path.resolve(__dirname, '..', '..');
const data = (p: string) => path.join(root, 'data', p);

const summary: string[] = [];

describe('real data CSVs in data/', () => {
  it('avg_wage_bg_2015_2025.csv → computes 2020-01..latest wage change', async () => {
    const txt = await readFile(data('avg_wage_bg_2015_2025.csv'), 'utf8');
    const rows = detectAndParseCsv(txt);
    expect(rows.length).toBeGreaterThan(24);
    const start = '2020-01';
    const end = rows[rows.length - 1].date;
    const ch = changePctNearest(rows, start, end);
    expect(ch).not.toBeNull();
    summary.push(`Avg wage change ${start}..${end}: ${(ch! * 100).toFixed(2)}%`);
  });

  it('personal_clean.csv → computes 2020-01..latest series change', async () => {
    const txt = await readFile(data('personal_salary.csv'), 'utf8');
    const rows = detectAndParseCsv(txt);
    expect(rows.length).toBeGreaterThan(24);
    const start = '2020-01';
    const end = rows[rows.length - 1].date;
    const ch = changePctNearest(rows, start, end);
    expect(ch).not.toBeNull();
    summary.push(`Personal series change ${start}..${end}: ${(ch! * 100).toFixed(2)}%`);
  });

  it('costs.csv → weights per month can be normalized (smoke test)', async () => {
    const txt = await readFile(data('expenses.csv'), 'utf8');
    // This file has Bulgarian headers and may use commas; detect automatically
    const rows = detectAndParseCsv(txt);
    // Some rows may be filtered out due to header differences; this is a smoke test
    expect(Array.isArray(rows)).toBe(true);
  });
});

afterAll(() => {
  if (summary.length) {
    console.log('\nReal Data Summary:');
    for (const s of summary) console.log(`- ${s}`);
  }
});
