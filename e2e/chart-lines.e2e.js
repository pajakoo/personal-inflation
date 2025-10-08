#!/usr/bin/env node

/**
 * End-to-end Selenium check that imports CSV data and verifies all chart lines render.
 *
 * Steps:
 * 1. Build and start the Vite preview server (static dist/ server).
 * 2. Launch headless Chrome, override Eurostat fetch with deterministic SDMX JSON built from local CSV.
 * 3. Upload personal wages & expenses CSV fixtures, auto-fetch the HICP series via stubbed request.
 * 4. Trigger category fetch and confirm that wage, HICP, real, and personal lines appear on the chart.
 */

const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const DIST_DIR = path.join(ROOT, 'dist');
const WAGES_CSV = path.join(DATA_DIR, 'personal_salary.csv');
const HICP_CSV = path.join(DATA_DIR, 'hicp_bg_monthly_index_2015eq100.csv');
const EXPENSES_CSV = path.join(DATA_DIR, 'expenses.csv');

const COICOP_CODES = [
  'CP01', 'CP02', 'CP03', 'CP04', 'CP05', 'CP06',
  'CP07', 'CP08', 'CP09', 'CP10', 'CP11', 'CP12'
];

function ensureDist() {
  const indexHtml = path.join(DIST_DIR, 'index.html');
  if (!fs.existsSync(indexHtml)) {
    throw new Error(
      'Missing dist/index.html. Run `npm run build` with a compatible Node.js version (>=18) before executing the Selenium suite.'
    );
  }
}

function mimeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html':
      return 'text/html';
    case '.js':
      return 'application/javascript';
    case '.css':
      return 'text/css';
    case '.json':
      return 'application/json';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.ico':
      return 'image/x-icon';
    case '.webmanifest':
      return 'application/manifest+json';
    case '.map':
      return 'application/json';
    default:
      return 'application/octet-stream';
  }
}

function startStaticServer(port = 4173) {
  const server = http.createServer((req, res) => {
    const rawPath = req.url ? req.url.split('?')[0] : '/';
    const safePath = path.normalize(decodeURIComponent(rawPath)).replace(/^(\.\.[\\/])+/, '');
    let filePath = path.join(DIST_DIR, safePath);
    if (!filePath.startsWith(DIST_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(DIST_DIR, 'index.html');
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': mimeFor(filePath) });
      res.end(data);
    });
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

function parseSimpleCsv(text) {
  const rows = [];
  const lines = text.trim().split(/\r?\n/);
  const header = lines.shift();
  if (!header) return rows;
  const delim = header.includes(';') && !header.includes(',') ? ';' : ',';
  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split(delim).map((p) => p.trim());
    rows.push(parts);
  }
  return rows;
}

function parseHicpRows() {
  const raw = fs.readFileSync(HICP_CSV, 'utf8');
  const rows = parseSimpleCsv(raw).map(([date, value]) => ({
    date,
    value: Number(value),
  }));
  return rows.filter((r) => r.date && Number.isFinite(r.value));
}

function createSdmxFixture(rows, coicopCodes) {
  const timeValues = rows.map((r) => r.date);
  const series = {};
  coicopCodes.forEach((code, idx) => {
    const observations = {};
    rows.forEach((row, tIdx) => {
      observations[String(tIdx)] = [row.value];
    });
    // Key format: freqIdx:unitIdx:coicopIdx:geoIdx
    const key = `0:0:${idx}:0`;
    series[key] = { observations };
  });
  return {
    dataSets: [{ series }],
    structure: {
      dimensions: {
        series: [
          { id: 'freq', values: [{ id: 'M' }] },
          { id: 'unit', values: [{ id: 'I15' }] },
          { id: 'coicop', values: coicopCodes.map((code) => ({ id: code })) },
          { id: 'geo', values: [{ id: 'BG' }] },
        ],
        observation: [
          { id: 'time', values: timeValues.map((id) => ({ id })) },
        ],
      },
    },
  };
}

async function uploadCsv(driver, testId, filePath) {
  const input = await driver.findElement(By.css(`[data-testid="${testId}"]`));
  await input.sendKeys(filePath);
}

async function waitForTableRows(driver, tableTestId, timeout = 10000) {
  await driver.wait(async () => {
    try {
      const rows = await driver.findElements(By.css(`[data-testid="${tableTestId}"] tbody tr`));
      return rows.length > 0;
    } catch {
      return false;
    }
  }, timeout);
}

async function waitForText(driver, locator, predicate, timeout = 10000) {
  await driver.wait(async () => {
    try {
      const el = await driver.findElement(locator);
      const text = await el.getText();
      return predicate(text);
    } catch {
      return false;
    }
  }, timeout);
}

async function waitForChartLines(driver, strokes, timeout = 15000) {
  for (const stroke of strokes) {
    await driver.wait(
      until.elementLocated(By.css(`path[stroke="${stroke}"]`)),
      timeout,
      `Timed out waiting for chart line with stroke ${stroke}`
    );
  }
}

async function loadAllData(driver) {
  await uploadCsv(driver, 'wages-file-input', WAGES_CSV);
  console.log('[selenium] Wage CSV uploaded, awaiting confirmation…');
  await waitForText(
    driver,
    By.css('[data-testid="wages-status"]'),
    (text) => text.includes('CSV файл')
  );
  //await waitForTableRows(driver, 'wages-table');

  console.log('[selenium] Uploading HICP CSV…');
  await uploadCsv(driver, 'hicp-file-input', HICP_CSV);
  await waitForText(
    driver,
    By.css('[data-testid="hicp-status"]'),
    (text) => text.includes('CSV импорт')
  );

  await uploadCsv(driver, 'expenses-file-input', EXPENSES_CSV);
  console.log('[selenium] Expenses CSV uploaded, awaiting status…');
  await waitForText(
    driver,
    By.css('[data-testid="expenses-status"]'),
    (text) => text.includes('CSV файл')
  );
  //await waitForTableRows(driver, 'expenses-table');

  const coicopBtn = await driver.findElement(By.css('[data-testid="fetch-coicop-btn"]'));
  console.log('[selenium] Triggering COICOP fetch…');
  await coicopBtn.click();

  await waitForText(
    driver,
    By.css('[data-testid="coicop-status"]'),
    (text) => text.includes('Заредени')
  );
}

async function main() {
  ensureDist();
  const server = await startStaticServer();

  const options = new chrome.Options()
    .addArguments('--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage');

  if (process.env.HEADLESS !== 'false') {
    options.addArguments('--headless=new');
  }
  
  const driver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(options)
    .build();

  const hicpRows = parseHicpRows();
  if (!hicpRows.length) {
    throw new Error('Failed to parse HICP rows from CSV.');
  }
  const fixture = createSdmxFixture(hicpRows, COICOP_CODES);

  try {
    await driver.get('http://127.0.0.1:4173/');

    // Override Eurostat fetch calls with deterministic local fixture.
    await driver.executeScript(
      `window.__TEST_SDMX_FIXTURE__ = arguments[0];
       const __origFetch = window.fetch.bind(window);
       window.fetch = async (input, init) => {
         const url = typeof input === 'string' ? input : input?.url;
         if (url && url.includes('PRC_HICP_MIDX')) {
           return new Response(JSON.stringify(window.__TEST_SDMX_FIXTURE__), {
             status: 200,
             headers: { 'Content-Type': 'application/json' },
           });
         }
         return __origFetch(input, init);
       };`,
      fixture
    );

    await loadAllData(driver);
    await waitForChartLines(driver, ['#2563eb', '#16a34a', '#dc2626', '#7c3aed']);
    console.log('[selenium] Verifying chart lines…');
    // Ensure the chart renders lines for wage, HICP, real, and personal indices.
    const chart = await driver.findElement(By.css('[data-testid="result-chart"]'));

    // Basic assertion: all required lines exist within the chart container.
    const missing = [];
    const checks = [
      { stroke: '#2563eb', label: 'wage' },
      { stroke: '#16a34a', label: 'hicp' },
      { stroke: '#dc2626', label: 'real' },
      { stroke: '#7c3aed', label: 'personal' },
    ];
    for (const { stroke, label } of checks) {
      const paths = await chart.findElements(By.css(`path[stroke="${stroke}"]`));
      if (!paths.length) missing.push(label);
    }
    if (missing.length) {
      throw new Error(`Missing chart lines: ${missing.join(', ')}`);
    }
    console.log('[selenium] All checks passed ✅');
  } finally {
    await driver.quit();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
