export type Row = { date: string; value: number };

export function toMonthlySeries(rows: Row[]): Row[] {
  const m = new Map<string, number>();
  rows.forEach((r) => m.set(r.date, r.value));
  return [...m.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function findNearest(series: Row[], target: string): Row | null {
  if (!series.length) return null;
  let best: Row | null = null;
  for (const r of series) {
    if (r.date === target) return r;
    if (r.date < target) best = r;
    if (r.date > target && !best) return r;
  }
  return best || series[series.length - 1];
}

export function changePctNearest(series: Row[], s: string, e: string): number | null {
  const start = findNearest(series, s);
  const end = findNearest(series, e);
  if (!start || !end) return null;
  return end.value / start.value - 1;
}

export function computeRealChange(
  wages: Row[],
  hicp: Row[],
  start: string,
  end: string
): number | null {
  const wageSeries = toMonthlySeries(wages);
  const hicpSeries = toMonthlySeries(hicp);
  const wageChange = changePctNearest(wageSeries, start, end);
  const hicpChange = changePctNearest(hicpSeries, start, end);
  if (wageChange == null || hicpChange == null) return null;
  return wageChange - hicpChange;
}

// Rebase a series so that base month = 100
export function rebaseTo100(series: Row[], base: string): Row[] {
  const p = series.find((r) => r.date === base);
  if (!p) return series.map((r) => ({ ...r }));
  const k = 100 / p.value;
  return series.map((r) => ({ date: r.date, value: r.value * k }));
}

// Compute weighted personal price index given category weights and HICP-by-COICOP
export function computePersonalIndex(
  weights: Record<string, number>,
  seriesByCoicop: Record<string, Row[]>,
  dates: string[],
  base: string,
  catToCoicop: Record<string, string>
): Row[] {
  const rebased: Record<string, Record<string, number>> = {};
  for (const cat of Object.keys(weights)) {
    const code = catToCoicop[cat];
    const raw = seriesByCoicop[code] || [];
    const r = rebaseTo100(raw, base);
    rebased[cat] = Object.fromEntries(r.map((p) => [p.date, p.value]));
  }
  return dates
    .map((d) => {
      let val = 0,
        wsum = 0;
      for (const [cat, w] of Object.entries(weights)) {
        const v = rebased[cat]?.[d];
        if (typeof v === 'number' && Number.isFinite(v)) {
          val += w * v;
          wsum += w;
        }
      }
      return { date: d, value: wsum ? val : (undefined as unknown as number) };
    })
    .filter((p) => typeof p.value === 'number');
}
