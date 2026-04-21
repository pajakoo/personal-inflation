exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid JSON body' })
    };
  }

  const password = String(payload.password || '');
  const expectedPassword = process.env.WAGES_PASSWORD || '';
  const rowsJson = process.env.WAGES_ROWS_JSON || '';

  if (!expectedPassword || !rowsJson) {
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'Missing server configuration' })
    };
  }

  if (password !== expectedPassword) {
    return {
      statusCode: 401,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'Невалидна парола' })
    };
  }

  let rows;
  try {
    rows = JSON.parse(rowsJson);
  } catch {
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid WAGES_ROWS_JSON format' })
    };
  }

  if (!Array.isArray(rows)) {
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'WAGES_ROWS_JSON must be an array' })
    };
  }

  const sanitized = rows
    .map((r) => ({ date: String(r && r.date ? r.date : ''), value: Number(r && r.value) }))
    .filter((r) => /^\d{4}-\d{2}$/.test(r.date) && Number.isFinite(r.value))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    statusCode: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store'
    },
    body: JSON.stringify({ rows: sanitized })
  };
};
