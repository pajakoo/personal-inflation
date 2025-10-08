import { describe, it, expect, afterAll } from 'vitest';
import { computeRealChange, type Row } from '../calc';

// Helper to build minimal time series with start/end months
function series(values: [string, number][]): Row[] {
  return values.map(([date, value]) => ({ date, value }));
}

// Collect results for summary output
const summary: Array<{ name: string; wageChange: number; hicpChange: number; realChange: number }> = [];

// Utility to compute percentage change given two points
function pctChange(a: number, b: number): number { return b / a - 1; }

describe('computeRealChange()', () => {
  it('1) salary down, inflation up -> real goes down', () => {
    // Wages: 1000 -> 900  (-10%)
    const wages = series([
      ['2024-01', 1000],
      ['2024-02', 900],
    ]);
    // HICP: 100 -> 110 (+10%)
    const hicp = series([
      ['2024-01', 100],
      ['2024-02', 110],
    ]);

    const real = computeRealChange(wages, hicp, '2024-01', '2024-02');
    expect(real).not.toBeNull();
    expect(real!).toBeCloseTo(-0.20, 1); // -20%

    summary.push({
      name: 'Salary ↓10%, Inflation ↑10%',
      wageChange: pctChange(1000, 900),
      hicpChange: pctChange(100, 110),
      realChange: real!,
    });
  });

  it('2) salary up, inflation up -> real depends (here +5%)', () => {
    // Wages: 1000 -> 1100 (+10%)
    const wages = series([
      ['2024-01', 1000],
      ['2024-02', 1100],
    ]);
    // HICP: 100 -> 105 (+5%)
    const hicp = series([
      ['2024-01', 100],
      ['2024-02', 105],
    ]);

    const real = computeRealChange(wages, hicp, '2024-01', '2024-02');
    expect(real).not.toBeNull();
    expect(real!).toBeCloseTo(0.05, 3); // +5%

    summary.push({
      name: 'Salary ↑10%, Inflation ↑5%',
      wageChange: pctChange(1000, 1100),
      hicpChange: pctChange(100, 105),
      realChange: real!,
    });
  });

  it('3) salary up, inflation down -> real goes up (here +15%)', () => {
    // Wages: 1000 -> 1100 (+10%)
    const wages = series([
      ['2024-01', 1000],
      ['2024-02', 1100],
    ]);
    // HICP: 100 -> 95 (-5%)
    const hicp = series([
      ['2024-01', 100],
      ['2024-02', 95],
    ]);

    const real = computeRealChange(wages, hicp, '2024-01', '2024-02');
    expect(real).not.toBeNull();
    expect(real!).toBeCloseTo(0.15, 3); // +15%

    summary.push({
      name: 'Salary ↑10%, Inflation ↓5%',
      wageChange: pctChange(1000, 1100),
      hicpChange: pctChange(100, 95),
      realChange: real!,
    });
  });
});

afterAll(() => {
  // Print a concise summary for visual comparison in test output
  console.log('\nSummary (wageChange, hicpChange, realChange):');
  for (const r of summary) {
    const fmt = (x: number) => `${(x * 100).toFixed(1)}%`;
    console.log(`- ${r.name}: wage=${fmt(r.wageChange)}, hicp=${fmt(r.hicpChange)}, real=${fmt(r.realChange)}`);
  }
});
