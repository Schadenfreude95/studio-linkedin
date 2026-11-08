export const KINDS = ['comment', 'message'];
export const STATUSES = ['open', 'replied'];
const METRICS = ['impressions', 'reactions', 'comments', 'shares', 'clicks'];

const str = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max ? v.trim() : null;
const int = v => Number.isSafeInteger(v) && v >= 0 ? v : null;

// Normalizza un elemento grezzo proveniente da una fonte. Lancia errore se non valido.
export function normalizeItem(raw, now = Date.now()) {
  const source_id = str(raw?.source_id, 200);
  const kind = KINDS.includes(raw?.kind) ? raw.kind : null;
  const text = str(raw?.text, 2000);
  const author = str(raw?.author, 120) || 'Anonimo';
  const created_at = Number.isFinite(raw?.created_at) && raw.created_at > 0 ? raw.created_at : null;
  const post_id = raw?.post_id == null ? null : str(String(raw.post_id), 200);
  if (!source_id || !kind || !text || created_at === null) throw new Error('Elemento community non valido.');
  return { source_id, kind, post_id, author, text, created_at, fetched_at: now };
}

// Normalizza uno snapshot di metriche per un post. Lancia errore se non valido.
export function normalizeSnapshot(raw, now = Date.now()) {
  const post_id = str(String(raw?.post_id ?? ''), 200);
  if (!post_id) throw new Error('Post non valido.');
  const row = { post_id, captured_at: now };
  for (const m of METRICS) {
    const v = raw?.[m] ?? 0;
    if (int(v) === null) throw new Error(`Metrica non valida: ${m}`);
    row[m] = v;
  }
  return row;
}

// Costruisce la query di lettura della inbox con filtri su colonne whitelisted.
export function buildInboxQuery(params = {}) {
  const where = [];
  const args = [];
  if (params.kind) {
    if (!KINDS.includes(params.kind)) throw new Error('Tipo non valido.');
    where.push('kind = ?'); args.push(params.kind);
  }
  if (params.status) {
    if (!STATUSES.includes(params.status)) throw new Error('Stato non valido.');
    where.push('status = ?'); args.push(params.status);
  }
  if (params.post) {
    const post = str(String(params.post), 200);
    if (!post) throw new Error('Post non valido.');
    where.push('post_id = ?'); args.push(post);
  }
  const limit = Math.min(Math.max(Number.parseInt(params.limit ?? '100', 10) || 100, 1), 200);
  const sql = `SELECT source_id,kind,post_id,author,text,created_at,status FROM community_items${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT ?`;
  return { sql, args: [...args, limit] };
}

// Riassume gli snapshot più recenti per post e i totali complessivi.
export function summarizeMetrics(snapshots) {
  const latest = new Map();
  for (const s of snapshots) {
    const cur = latest.get(s.post_id);
    if (!cur || s.captured_at > cur.captured_at) latest.set(s.post_id, s);
  }
  const totals = Object.fromEntries(METRICS.map(m => [m, 0]));
  const posts = [...latest.values()].map(s => {
    for (const m of METRICS) totals[m] += s[m];
    const engagement = s.impressions > 0 ? Math.round(((s.reactions + s.comments + s.shares + s.clicks) / s.impressions) * 10000) / 100 : null;
    return { post_id: s.post_id, captured_at: s.captured_at, ...Object.fromEntries(METRICS.map(m => [m, s[m]])), engagement };
  }).sort((a, b) => b.impressions - a.impressions);
  return { totals, posts };
}

export const METRIC_FIELDS = METRICS;
