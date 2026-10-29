const VERSION = '2024-11-06';
const API = 'https://api.dev.runwayml.com/v1';
const MODEL = 'gen4_turbo';
const MAX_DATA_URI = 5 * 1024 * 1024;
const MAX_BODY = MAX_DATA_URI + 16000;
const RATIOS = { '9:16': '720:1280', '16:9': '1280:720', '1:1': '960:960' };
const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'CANCELED', 'UNKNOWN', 'REJECTED']);
const PRICE_SOURCE = 'https://docs.dev.runwayml.com/guides/pricing/';

class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
const fail = (status, code, message) => { throw new ApiError(status, code, message); };

export function configuration(env, now = Date.now()) {
  const rate = Number(env.STUDIO_RATE_CENTS_PER_SECOND);
  const verified = Date.parse(`${env.STUDIO_RATE_VERIFIED_AT || ''}T00:00:00Z`);
  const priceReady = Number.isSafeInteger(rate) && rate > 0 && rate <= 1000 && Number.isFinite(verified) && now >= verified && now - verified < 30 * 86400000;
  const missing = [];
  if (!env.RUNWAYML_API_SECRET) missing.push('Runway API secret');
  if (!env.STUDIO_ACCESS_TOKEN || env.STUDIO_ACCESS_TOKEN.length < 32) missing.push('Private studio access token');
  if (!env.STUDIO_DB) missing.push('Studio database binding');
  if (!priceReady) missing.push('Recently verified API tariff');
  return { ready: !missing.length, missing, priceReady, rate, verifiedAt: env.STUDIO_RATE_VERIFIED_AT || null };
}

async function authenticate(request, env) {
  const token = request.headers.get('Authorization')?.replace(/^Bearer /, '') || '';
  if (!env.STUDIO_ACCESS_TOKEN || env.STUDIO_ACCESS_TOKEN.length < 32) fail(503, 'not_configured', 'Private studio access is not configured.');
  const digest = value => crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  const [a, b] = await Promise.all([digest(token), digest(env.STUDIO_ACCESS_TOKEN)]);
  const left = new Uint8Array(a), right = new Uint8Array(b);
  let difference = 0; for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  if (difference) fail(401, 'unauthorized', 'Enter a valid private studio access token.');
}

async function readJson(request) {
  if (!request.headers.get('Content-Type')?.includes('application/json')) fail(415, 'json_required', 'Send application/json.');
  if (Number(request.headers.get('Content-Length')) > MAX_BODY) fail(413, 'body_too_large', 'The request is too large.');
  const reader = request.body?.getReader();
  if (!reader) fail(400, 'empty_body', 'A JSON request body is required.');
  const chunks = []; let size = 0;
  while (true) {
    const part = await reader.read(); if (part.done) break;
    size += part.value.byteLength;
    if (size > MAX_BODY) { await reader.cancel(); fail(413, 'body_too_large', 'The encoded image must fit within 5 MiB.'); }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let body;
  try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { fail(400, 'invalid_json', 'The request body is not valid JSON.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'invalid_json', 'Send a JSON object.');
  return body;
}

async function imageHash(image) {
  if (typeof image !== 'string' || image.length > MAX_DATA_URI) fail(422, 'invalid_image', 'Use a JPEG, PNG or WebP data URI no larger than 5 MiB after base64 encoding.');
  const match = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
  if (!match || match[2].length % 4 !== 0) fail(422, 'invalid_image', 'Use a valid JPEG, PNG or WebP base64 data URI.');
  let bytes; try { bytes = Uint8Array.from(atob(match[2]), character => character.charCodeAt(0)); } catch { fail(422, 'invalid_image', 'The image base64 could not be decoded.'); }
  const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10;
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if (!(match[1] === 'png' ? png : match[1] === 'webp' ? webp : jpeg)) fail(422, 'invalid_image', 'Image bytes do not match the declared format.');
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
}

const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{8,100}$/.test(value);
const publicJob = row => ({ id: row.id, quoteId: row.quote_id, projectId: row.project_id, status: row.status, providerTaskId: row.provider_id, committedEstimateCents: row.cost_cents, outputs: JSON.parse(row.output_json || '[]'), error: row.error || null, createdAt: row.created_at, updatedAt: row.updated_at });
const statement = (db, sql, ...values) => db.prepare(sql).bind(...values);

async function makeQuote(body, env, now, config) {
  if (!identifier(body.projectId)) fail(422, 'invalid_project', 'Use a valid project ID.');
  if (typeof body.prompt !== 'string' || !body.prompt.trim() || [...body.prompt.trim()].length > 1000) fail(422, 'invalid_prompt', 'The combined scene prompt and shared details must contain 1–1,000 characters.');
  if (![5, 10].includes(body.duration)) fail(422, 'invalid_duration', 'This integration supports 5 or 10 seconds per scene.');
  if (!RATIOS[body.aspectRatio]) fail(422, 'invalid_ratio', 'Choose portrait, square or landscape.');
  if (typeof body.budgetCapUsd !== 'number' || !Number.isFinite(body.budgetCapUsd) || body.budgetCapUsd <= 0 || body.budgetCapUsd > 10000) fail(422, 'budget_required', 'Set a project generation budget in USD, up to 10,000.');
  const budget = Math.round(body.budgetCapUsd * 100), cost = config.rate * body.duration;
  if (!Number.isSafeInteger(budget) || budget < cost) fail(422, 'budget_exceeded', 'The estimated scene cost exceeds your project budget.');
  const hash = await imageHash(body.image);
  await statement(env.STUDIO_DB, 'INSERT OR IGNORE INTO studio_projects(id,budget_cents,created_at) VALUES(?,?,?)', body.projectId, budget, now).run();
  const project = await statement(env.STUDIO_DB, 'SELECT * FROM studio_projects WHERE id=?', body.projectId).first();
  if (project.budget_cents !== budget) fail(409, 'budget_locked', 'This project already has a server budget. Create a new project for a different budget; an existing budget is not silently reset.');
  if (project.committed_cents + cost > budget) fail(409, 'budget_exceeded', 'The project has insufficient uncommitted budget.');
  const id = crypto.randomUUID(), expiresAt = now + 5 * 60000;
  const payload = { model: MODEL, promptText: body.prompt.trim(), duration: body.duration, ratio: RATIOS[body.aspectRatio] };
  await statement(env.STUDIO_DB, 'INSERT INTO studio_quotes(id,project_id,payload,image_hash,cost_cents,expires_at) VALUES(?,?,?,?,?,?)', id, body.projectId, JSON.stringify(payload), hash, cost, expiresAt).run();
  return { id, projectId: body.projectId, model: MODEL, duration: body.duration, ratio: body.aspectRatio, estimatedCostCents: cost, projectBudgetCents: budget, committedEstimateCents: project.committed_cents, expiresAt, pricing: { method: 'configured-published-tariff', source: PRICE_SOURCE, verifiedAt: config.verifiedAt, excludesTaxes: true }, notice: 'Estimate of this API generation only. Tax, editing, storage and publishing are excluded. Failed or uncertain submissions retain their committed budget until reconciled.' };
}

async function submitJob(body, env, now, fetcher) {
  if (!identifier(body.quoteId)) fail(422, 'invalid_quote', 'A valid quote ID is required.');
  if (body.confirmGenerationAndUpload !== true) fail(422, 'consent_required', 'Confirm the estimated cost and sending this image and prompt to Runway.');
  const existing = await statement(env.STUDIO_DB, 'SELECT * FROM studio_jobs WHERE quote_id=?', body.quoteId).first();
  if (existing) return publicJob(existing);
  const quote = await statement(env.STUDIO_DB, 'SELECT * FROM studio_quotes WHERE id=?', body.quoteId).first();
  if (!quote) fail(404, 'quote_not_found', 'This quote does not exist.');
  if (quote.expires_at <= now) fail(409, 'quote_expired', 'This estimate expired. Request another before generating.');
  if (quote.image_hash !== await imageHash(body.image)) fail(409, 'image_changed', 'The image changed after the estimate. Request a new estimate.');
  const id = crypto.randomUUID();
  try {
    await env.STUDIO_DB.batch([
      statement(env.STUDIO_DB, "INSERT INTO studio_jobs(id,quote_id,project_id,cost_cents,status,created_at,updated_at) SELECT ?,q.id,q.project_id,q.cost_cents,'SUBMITTING',?,? FROM studio_quotes q JOIN studio_projects p ON p.id=q.project_id WHERE q.id=? AND q.claimed=0 AND q.expires_at>? AND p.committed_cents+q.cost_cents<=p.budget_cents", id, now, now, quote.id, now),
      statement(env.STUDIO_DB, 'UPDATE studio_projects SET committed_cents=committed_cents+? WHERE id=? AND EXISTS(SELECT 1 FROM studio_jobs WHERE id=?)', quote.cost_cents, quote.project_id, id),
      statement(env.STUDIO_DB, 'UPDATE studio_quotes SET claimed=1 WHERE id=? AND EXISTS(SELECT 1 FROM studio_jobs WHERE id=?)', quote.id, id)
    ]);
  } catch (error) {
    const duplicate = await statement(env.STUDIO_DB, 'SELECT * FROM studio_jobs WHERE quote_id=?', quote.id).first();
    if (duplicate) return publicJob(duplicate);
    throw error;
  }
  const reserved = await statement(env.STUDIO_DB, 'SELECT * FROM studio_jobs WHERE id=?', id).first();
  if (!reserved) {
    const duplicate = await statement(env.STUDIO_DB, 'SELECT * FROM studio_jobs WHERE quote_id=?', quote.id).first();
    if (duplicate) return publicJob(duplicate);
    fail(409, 'budget_or_quote_conflict', 'The budget or quote is no longer available. No generation was submitted.');
  }
  let providerId = null, status = 'UNKNOWN', message = 'Submission outcome is unknown. Do not resubmit; reconcile with Runway first.';
  try {
    const response = await fetcher(`${API}/image_to_video`, { method: 'POST', headers: { 'Authorization': `Bearer ${env.RUNWAYML_API_SECRET}`, 'X-Runway-Version': VERSION, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...JSON.parse(quote.payload), promptImage: body.image }), signal: AbortSignal.timeout(25000) });
    const data = await response.json().catch(() => ({}));
    if (response.ok && typeof data.id === 'string' && identifier(data.id)) { providerId = data.id; status = 'PENDING'; message = null; }
    else if (!response.ok) { status = 'REJECTED'; message = `Runway HTTP ${response.status}: ${String(data.error || data.message || 'Request rejected.').slice(0, 400)}`; }
  } catch { /* Never retry a potentially accepted paid request. */ }
  await statement(env.STUDIO_DB, 'UPDATE studio_jobs SET status=?,provider_id=?,error=?,updated_at=? WHERE id=?', status, providerId, message, now, id).run();
  return publicJob(await statement(env.STUDIO_DB, 'SELECT * FROM studio_jobs WHERE id=?', id).first());
}

async function getJob(id, env, now, fetcher) {
  let row = await statement(env.STUDIO_DB, 'SELECT * FROM studio_jobs WHERE id=?', id).first();
  if (!row) fail(404, 'job_not_found', 'This generation task does not exist.');
  if (row.status === 'SUBMITTING' && now - row.updated_at > 90000) {
    await statement(env.STUDIO_DB, "UPDATE studio_jobs SET status='UNKNOWN',error=?,updated_at=? WHERE id=? AND status='SUBMITTING'", 'Submission was interrupted. Reconcile with Runway before trying another generation.', now, id).run();
    row = await statement(env.STUDIO_DB, 'SELECT * FROM studio_jobs WHERE id=?', id).first();
  }
  if (!row.provider_id || TERMINAL.has(row.status) || now - row.polled_at < 5000) return publicJob(row);
  if (!env.RUNWAYML_API_SECRET) return { ...publicJob(row), pollError: 'The provider key is unavailable. Stored task state is still readable.' };
  await statement(env.STUDIO_DB, 'UPDATE studio_jobs SET polled_at=? WHERE id=?', now, id).run();
  try {
    const response = await fetcher(`${API}/tasks/${encodeURIComponent(row.provider_id)}`, { headers: { 'Authorization': `Bearer ${env.RUNWAYML_API_SECRET}`, 'X-Runway-Version': VERSION }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) return { ...publicJob(row), pollError: `Runway status check returned HTTP ${response.status}.` };
    const data = await response.json();
    const outputs = Array.isArray(data.output) ? data.output.filter(value => { try { return typeof value === 'string' && new URL(value).protocol === 'https:'; } catch { return false; } }) : [];
    const status = typeof data.status === 'string' ? data.status.slice(0, 40) : row.status;
    const error = data.failure ? String(data.failure).slice(0, 500) : data.failureCode ? String(data.failureCode).slice(0, 100) : null;
    await statement(env.STUDIO_DB, 'UPDATE studio_jobs SET status=?,output_json=?,error=?,updated_at=? WHERE id=?', status, JSON.stringify(outputs), error, now, id).run();
    return publicJob(await statement(env.STUDIO_DB, 'SELECT * FROM studio_jobs WHERE id=?', id).first());
  } catch { return { ...publicJob(row), pollError: 'The status check timed out. The generation was not resubmitted.' }; }
}

export async function handleStudioRequest(request, env = {}, options = {}) {
  const now = options.now ?? Date.now(), fetcher = options.fetcher || fetch;
  const path = new URL(request.url).pathname.replace(/\/$/, '');
  try {
    const config = configuration(env, now);
    if (path === '/api/studio/status' && request.method === 'GET') return json({ generation: { available: config.ready, provider: 'Runway', model: MODEL, missing: config.missing, durations: [5, 10], aspectRatios: Object.keys(RATIOS), privateOwnerAccess: true }, publishing: { available: false, channels: [] } });
    await authenticate(request, env);
    if (request.method === 'POST' && !config.ready) fail(503, 'not_configured', `Setup required: ${config.missing.join(', ')}.`);
    if (!env.STUDIO_DB) fail(503, 'not_configured', 'Studio database binding is required.');
    if (request.method === 'POST') {
      const origin = request.headers.get('Origin');
      if (origin && origin !== new URL(request.url).origin) fail(403, 'origin_rejected', 'Submit from this studio origin.');
      const body = await readJson(request);
      if (path === '/api/studio/quote') return json(await makeQuote(body, env, now, config), 201);
      if (path === '/api/studio/jobs') return json(await submitJob(body, env, now, fetcher), 202);
    }
    const match = /^\/api\/studio\/jobs\/([A-Za-z0-9_-]{8,100})$/.exec(path);
    if (request.method === 'GET' && match) return json(await getJob(match[1], env, now, fetcher));
    const projectMatch = /^\/api\/studio\/projects\/([A-Za-z0-9_-]{8,100})\/jobs$/.exec(path);
    if (request.method === 'GET' && projectMatch) {
      const results = await statement(env.STUDIO_DB, 'SELECT * FROM studio_jobs WHERE project_id=? ORDER BY created_at DESC LIMIT 50', projectMatch[1]).all();
      return json({ jobs: results.results.map(publicJob) });
    }
    return json({ error: 'not_found', message: 'Unknown studio API endpoint.' }, 404);
  } catch (error) {
    return json({ error: error instanceof ApiError ? error.code : 'service_error', message: error instanceof ApiError ? error.message : 'The studio could not complete this operation. No automatic generation retry was attempted.' }, error instanceof ApiError ? error.status : 500);
  }
}
