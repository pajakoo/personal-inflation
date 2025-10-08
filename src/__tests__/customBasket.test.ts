import { describe, it, expect, afterAll } from 'vitest';
import { computePersonalIndex, changePctNearest, type Row } from '../calc';

// Simulate a custom basket with user-defined codes
const customMap = { Stocks: 'CUST_STOCKS', Services: 'CUST_SERVICES' } as const;

type SeriesMap = Record<string, Row[]>;

function series(values: [string, number][]): Row[] {
  return values.map(([date, value]) => ({ date, value }));
}

function pctChange(a: number, b: number): number { return b / a - 1; }

const summary: Array<{ name: string; wageChange: number; personalInfl: number; realPersonal: number }> = [];

describe('custom basket (Stocks/Services) personal index', () => {
  it('1) salary down, basket up -> real personal −20%', () => {
    // Wages: 1000 -> 900 (−10%)
    const wageCh = pctChange(1000, 900);

    // Basket up +10%
    const seriesByCoicop: SeriesMap = {
      [customMap.Stocks]: series([
        ['2024-01', 100],
        ['2024-02', 110],
      ]),
      [customMap.Services]: series([
        ['2024-01', 100],
        ['2024-02', 110],
      ]),
    };
    const weights = { Stocks: 0.5, Services: 0.5 };
    const dates = ['2024-01', '2024-02'];

    const pIdx = computePersonalIndex(weights as any, seriesByCoicop, dates, '2024-01', customMap as any);
    const personalCh = changePctNearest(pIdx, '2024-01', '2024-02')!; // +10%
    const real = wageCh - personalCh; // −20%

    expect(real).toBeCloseTo(-0.20, 2);
    summary.push({ name: 'Salary ↓10%, Basket ↑10%', wageChange: wageCh, personalInfl: personalCh, realPersonal: real });
  });

  it('2) salary up, basket up (slower) -> real personal +5%', () => {
    // Wages: 1000 -> 1100 (+10%)
    const wageCh = pctChange(1000, 1100);

    // Basket up +5%
    const seriesByCoicop: SeriesMap = {
      [customMap.Stocks]: series([
        ['2024-01', 100],
        ['2024-02', 105],
      ]),
      [customMap.Services]: series([
        ['2024-01', 100],
        ['2024-02', 105],
      ]),
    };
    const weights = { Stocks: 0.5, Services: 0.5 };
    const dates = ['2024-01', '2024-02'];

    const pIdx = computePersonalIndex(weights as any, seriesByCoicop, dates, '2024-01', customMap as any);
    const personalCh = changePctNearest(pIdx, '2024-01', '2024-02')!; // +5%
    const real = wageCh - personalCh; // +5%

    expect(real).toBeCloseTo(0.05, 3);
    summary.push({ name: 'Salary ↑10%, Basket ↑5%', wageChange: wageCh, personalInfl: personalCh, realPersonal: real });
  });

  it('3) salary up, basket down -> real personal +15%', () => {
    // Wages: 1000 -> 1100 (+10%)
    const wageCh = pctChange(1000, 1100);

    // Basket down −5%
    const seriesByCoicop: SeriesMap = {
      [customMap.Stocks]: series([
        ['2024-01', 100],
        ['2024-02', 95],
      ]),
      [customMap.Services]: series([
        ['2024-01', 100],
        ['2024-02', 95],
      ]),
    };
    const weights = { Stocks: 0.5, Services: 0.5 };
    const dates = ['2024-01', '2024-02'];

    const pIdx = computePersonalIndex(weights as any, seriesByCoicop, dates, '2024-01', customMap as any);
    const personalCh = changePctNearest(pIdx, '2024-01', '2024-02')!; // −5%
    const real = wageCh - personalCh; // +15%

    expect(real).toBeCloseTo(0.15, 3);
    summary.push({ name: 'Salary ↑10%, Basket ↓5%', wageChange: wageCh, personalInfl: personalCh, realPersonal: real });
  });
});

afterAll(() => {
  console.log('\nCustom Basket Summary (wageChange, personalInfl, realPersonal):');
  for (const r of summary) {
    const fmt = (x: number) => `${(x * 100).toFixed(1)}%`;
    console.log(`- ${r.name}: wage=${fmt(r.wageChange)}, personal=${fmt(r.personalInfl)}, real=${fmt(r.realPersonal)}`);
  }
});
