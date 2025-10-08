import { describe, it, expect, afterAll } from 'vitest';
import { computePersonalIndex, changePctNearest, type Row } from '../calc';

// Local COICOP mapping just for tests
const catToCoicop = { Food: 'CP01', Transport: 'CP07' } as const;

type SeriesMap = Record<string, Row[]>;

function series(values: [string, number][]): Row[] {
  return values.map(([date, value]) => ({ date, value }));
}

function pctChange(a: number, b: number): number { return b / a - 1; }

const summary: Array<{ name: string; wageChange: number; personalInfl: number; realPersonal: number }> = [];

describe('personal inflation behaves analogously to headline case', () => {
  it('1) salary down, personal inflation up -> real personal goes down (-20%)', () => {
    // Wages: 1000 -> 900 (-10%)
    const wages = series([
      ['2024-01', 1000],
      ['2024-02', 900],
    ]);

    // Personal inflation via categories: +10%
    const seriesByCoicop: SeriesMap = {
      CP01: series([
        ['2024-01', 100],
        ['2024-02', 110],
      ]),
      CP07: series([
        ['2024-01', 100],
        ['2024-02', 110],
      ]),
    };
    const weights = { Food: 0.6, Transport: 0.4 };
    const dates = ['2024-01', '2024-02'];
    const personalIdx = computePersonalIndex(weights, seriesByCoicop, dates, '2024-01', catToCoicop as any);

    const wageCh = pctChange(1000, 900); // -10%
    const personalCh = changePctNearest(personalIdx, '2024-01', '2024-02')!; // +10%
    const real = wageCh - personalCh; // -20%

    expect(real).toBeCloseTo(-0.20, 2);

    summary.push({ name: 'Salary ↓10%, Personal ↑10%', wageChange: wageCh, personalInfl: personalCh, realPersonal: real });
  });

  it('2) salary up, personal inflation up -> real personal +5%', () => {
    // Wages: 1000 -> 1100 (+10%)
    const wages = series([
      ['2024-01', 1000],
      ['2024-02', 1100],
    ]);

    // Personal inflation via categories: +5%
    const seriesByCoicop: SeriesMap = {
      CP01: series([
        ['2024-01', 100],
        ['2024-02', 105],
      ]),
      CP07: series([
        ['2024-01', 100],
        ['2024-02', 105],
      ]),
    };
    const weights = { Food: 0.6, Transport: 0.4 };
    const dates = ['2024-01', '2024-02'];
    const personalIdx = computePersonalIndex(weights, seriesByCoicop, dates, '2024-01', catToCoicop as any);

    const wageCh = pctChange(1000, 1100); // +10%
    const personalCh = changePctNearest(personalIdx, '2024-01', '2024-02')!; // +5%
    const real = wageCh - personalCh; // +5%

    expect(real).toBeCloseTo(0.05, 3);

    summary.push({ name: 'Salary ↑10%, Personal ↑5%', wageChange: wageCh, personalInfl: personalCh, realPersonal: real });
  });

  it('3) salary up, personal inflation down -> real personal +15%', () => {
    // Wages: 1000 -> 1100 (+10%)
    const wages = series([
      ['2024-01', 1000],
      ['2024-02', 1100],
    ]);

    // Personal inflation via categories: -5%
    const seriesByCoicop: SeriesMap = {
      CP01: series([
        ['2024-01', 100],
        ['2024-02', 95],
      ]),
      CP07: series([
        ['2024-01', 100],
        ['2024-02', 95],
      ]),
    };
    const weights = { Food: 0.6, Transport: 0.4 };
    const dates = ['2024-01', '2024-02'];
    const personalIdx = computePersonalIndex(weights, seriesByCoicop, dates, '2024-01', catToCoicop as any);

    const wageCh = pctChange(1000, 1100); // +10%
    const personalCh = changePctNearest(personalIdx, '2024-01', '2024-02')!; // -5%
    const real = wageCh - personalCh; // +15%

    expect(real).toBeCloseTo(0.15, 3);

    summary.push({ name: 'Salary ↑10%, Personal ↓5%', wageChange: wageCh, personalInfl: personalCh, realPersonal: real });
  });
});

afterAll(() => {
  console.log('\nPersonal Summary (wageChange, personalInfl, realPersonal):');
  for (const r of summary) {
    const fmt = (x: number) => `${(x * 100).toFixed(1)}%`;
    console.log(`- ${r.name}: wage=${fmt(r.wageChange)}, personal=${fmt(r.personalInfl)}, real=${fmt(r.realPersonal)}`);
  }
});
