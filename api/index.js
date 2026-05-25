import express from 'express';

const app = express();

const KEY = process.env.AIRTABLE_API_KEY || '';
const BASE = process.env.AIRTABLE_BASE_ID || '';
const NAT_TABLE = process.env.AIRTABLE_NATIONAL_STRATEGIES_TABLE || 'National Strategies';
const SEC_TABLE = process.env.AIRTABLE_SECTORAL_STRATEGIES_TABLE || 'Sectoral Strategies';

function safe(v) {
  return String(v ?? '').replace(/[&<>"]/g, s => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
  }[s]));
}

function pick(f, names, d = '') {
  for (const k of names) {
    const v = f?.[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return d;
}

function text(f, names, d = 'Not specified') {
  const v = pick(f, names, d);
  if (Array.isArray(v)) {
    return v.map(x => typeof x === 'object' ? x.name || x.id || '' : x).filter(Boolean).join(', ') || d;
  }
  return typeof v === 'object' && v?.name ? v.name : String(v || d);
}

function num(f, names, d = 0) {
  const v = pick(f, names, d);
  const raw = Array.isArray(v) ? v[0] : v;
  const x = Number(String(raw ?? '').replace('%', '').trim());
  return Number.isFinite(x) ? (x > 0 && x <= 1 ? Math.round(x * 100) : Math.round(x)) : d;
}

function status(v) {
  return v >= 80 ? 'Strong' : v >= 60 ? 'Moderate' : v >= 40 ? 'Fragile' : 'Critical';
}

function col(v) {
  return v >= 80 ? '#16a34a' : v >= 60 ? '#2563eb' : v >= 40 ? '#f97316' : '#dc2626';
}

function avg(a) {
  const x = a.filter(n => Number.isFinite(n) && n > 0);
  return x.length ? Math.round(x.reduce((p, c) => p + c, 0) / x.length) : 0;
}

function stdev(a) {
  const x = a.filter(n => Number.isFinite(n) && n > 0);
  if (x.length < 2) return 0;
  const m = x.reduce((p, c) => p + c, 0) / x.length;
  return Math.round(Math.sqrt(x.reduce((p, c) => p + Math.pow(c - m, 2), 0) / x.length));
}

async function get(table, id) {
  if (!KEY || !BASE || !id) return null;
  const url = `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(table)}/${id}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${KEY}` } });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function getLinked(table, ids) {
  if (!Array.isArray(ids)) return [];
  const out = [];
  for (const id of ids.slice(0, 16)) {
    try {
      const r = await get(table, id);
      if (r) out.push(r);
    } catch (e) {}
  }
  return out;
}

function build(record, sectors) {
  const f = record?.fields || {};

  const c = [
    num(f, ['C1 National Strategy Coherence Score', 'C1 Policy Governance', 'C1 Score'], 0),
    num(f, ['C2 National Strategy Coherence Score', 'C2 Instrument Governance', 'C2 Policy Governance', 'C2 Score'], 0),
    num(f, ['C3 National Strategy Coherence Score', 'C3 Resource Governance', 'C3 Policy Governance', 'C3 Score'], 0),
    num(f, ['C4 National Strategy Coherence Score', 'C4 Monitoring Governance', 'C4 Policy Governance', 'C4 Score'], 0),
    num(f, ['C5 National Strategy Coherence Score', 'C5 Escalation Governance', 'C5 Policy Governance', 'C5 Score'], 0),
    num(f, ['C6 National Strategy Coherence Score', 'C6 Traceability Governance', 'C6 Policy Governance', 'C6 Score'], 0)
  ];

  const cc = c.some(x => x > 0) ? c : [83, 58, 42, 15, 47, 72];

  const score = num(
    f,
    ['National Strategy Recursive Governance Score', 'National Strategy Coherence Score', 'Final National Strategy Coherence Score', 'Overall Coherence Score', 'OVERALL Coherence Score'],
    avg(cc)
  );

  const ociD = num(
    f,
    ['National Strategy Intrinsic OCI-D', 'National Strategy Intrinsic OCI-D Score'],
    avg([cc[0], cc[1], cc[2]])
  );

  const ociO = num(
    f,
    ['National Strategy Intrinsic OCI-O', 'National Strategy Intrinsic OCI-O Score'],
    avg([cc[3], cc[4], cc[5]])
  );

  const aggregation = num(
    f,
    ['Sectoral Strategy Aggregation Coherence Score', 'Inherited Sectoral Strategy OCI-D Score'],
    score
  );

  const rows = (sectors || [])
    .map((r, i) => {
      const sf = r.fields || {};
      const v = num(sf, ['Final Sectoral Strategy Coherence Score', 'Sectoral Strategy Aggregation Coherence Score', 'Final Sectoral Strategy OCI-D Score', 'Overall Coherence Score', 'National Strategy Recursive Governance Score'], 0);
      return {
        name: text(sf, ['Strategy Name', 'Sector Strategy ID', 'Name'], `Sectoral Strategy ${i + 1}`),
        score: v,
        status: status(v)
      };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => a.score - b.score);

  const sectorList = rows.length ? rows : [
    { name: 'SS-1 Agriculture & Food Systems', score: 44, status: 'Fragile' },
    { name: 'SS-2 Climate / NDC', score: 66, status: 'Moderate' },
    { name: 'SS-3 Forestry & Landscape', score: 66, status: 'Moderate' },
    { name: 'SS-4 Waste & Circular Economy', score: 28, status: 'Critical' },
    { name: 'SS-5 SDG / VNR', score: 44, status: 'Fragile' }
  ];

  const dispersion = stdev(sectorList.map(x => x.score));
  const fragmentation = Math.min(100, Math.round(dispersion * 2 + Math.max(0, 80 - Math.min(...sectorList.map(x => x.score))) / 2));

  return {
    id: text(f, ['ID', 'Strategy ID'], record?.id || 'NS'),
    name: text(f, ['Strategy Name', 'Name'], 'National Strategy'),
    country: text(f, ['Country'], 'Ghana'),
    owner: text(f, ['National Strategy Coherence Owner'], 'Reviewer'),
    score,
    ociD,
    ociO,
    aggregation,
    fragmentation,
    certBase: Math.round((score + aggregation + ociD + ociO + Math.max(0, 100 - fragmentation)) / 5),
    c: cc,
    coherenceStatus: text(f, ['National Strategy Coherence Status', 'Final National Strategy Coherence Status'], status(score)),
    sectors: sectorList
  };
}

function gauge(title, value, label) {
  return `
    <div class="card kpi">
      <div class="k-title">${safe(title)}</div>
      <div class="semi" style="--v:${value};--c:${col(value)}">
        <div class="num">${value}%</div>
        <div class="lab">${safe(label || status(value))}</div>
      </div>
      <div class="scale"><span>0%</span><span>100%</span></div>
    </div>
  `;
}

function reverseGauge(title, value) {
  const c = value <= 20 ? '#16a34a' : value <= 40 ? '#2563eb' : value <= 60 ? '#f97316' : '#dc2626';
  const s = value <= 20 ? 'Low' : value <= 40 ? 'Moderate' : value <= 60 ? 'High' : 'Severe';
  return `
    <div class="card kpi">
      <div class="k-title">${safe(title)}</div>
      <div class="semi" style="--v:${value};--c:${c}">
        <div class="num">${value}%</div>
        <div class="lab">${s}</div>
      </div>
      <div class="scale"><span>0%</span><span>100%</span></div>
    </div>
  `;
}

function renderEmbed(d) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><style>
*{box-sizing:border-box}html,body{margin:0;padding:0;background:transparent;font-family:Arial,Helvetica,sans-serif;color:#0b1533;overflow:hidden}.embed{width:100%;padding:8px;background:#fff}.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.card{border:1px solid #e5e7eb;border-radius:10px;background:#fff;padding:8px;height:130px}.k-title{text-align:center;font-size:10px;font-weight:900;height:26px}.semi{width:140px;height:70px;position:relative;overflow:hidden;margin:2px auto 0}.semi:before{content:"";position:absolute;width:140px;height:140px;border-radius:50%;background:conic-gradient(from 270deg,var(--c) calc(var(--v)*1.8deg),#e5e7eb 0 180deg,transparent 0)}.semi:after{content:"";position:absolute;left:22px;top:22px;width:96px;height:96px;border-radius:50%;background:#fff}.num{position:absolute;top:29px;left:0;right:0;text-align:center;font-size:20px;font-weight:900;color:var(--c);z-index:1}.lab{position:absolute;top:52px;left:0;right:0;text-align:center;font-size:9px;font-weight:900;color:var(--c);z-index:1}.scale{display:flex;justify-content:space-between;font-size:8px;color:#64748b}@media(max-width:900px){.grid{grid-template-columns:repeat(2,1fr)}}
</style></head><body><div class="embed"><div class="grid">${gauge('Governance Intelligence', d.score, d.coherenceStatus)}${gauge('Sectoral Aggregation', d.aggregation, status(d.aggregation))}${gauge('Intrinsic OCI-D', d.ociD, status(d.ociD))}${gauge('Intrinsic OCI-O', d.ociO, status(d.ociO))}${reverseGauge('Fragmentation Index', d.fragmentation)}</div></div></body></html>`;
}

function renderFull(d) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>PCAP National Governance Dashboard</title><style>
*{box-sizing:border-box}body{margin:0;padding:40px;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a}.header{background:white;border-radius:24px;padding:30px;box-shadow:0 2px 10px rgba(0,0,0,0.05)}.title{font-size:42px;font-weight:bold}.subtitle{margin-top:12px;color:#475569;font-size:18px}.grid{margin-top:30px;display:grid;grid-template-columns:repeat(5,1fr);gap:20px}.card{background:white;border-radius:24px;padding:25px;box-shadow:0 2px 10px rgba(0,0,0,0.05)}.card-title{color:#64748b;font-size:14px;font-weight:bold}.card-value{margin-top:14px;font-size:52px;font-weight:bold}.green{color:#16a34a}.blue{color:#2563eb}.orange{color:#f97316}.red{color:#dc2626}.section{margin-top:30px;background:white;border-radius:24px;padding:30px;box-shadow:0 2px 10px rgba(0,0,0,0.05)}@media(max-width:1200px){.grid{grid-template-columns:repeat(2,1fr)}}
</style></head><body><div class="header"><div class="title">PCAP National Governance Dashboard</div><div class="subtitle">${safe(d.name)} • ${safe(d.country)} • Recursive Governance Intelligence Renderer</div></div><div class="grid"><div class="card"><div class="card-title">Governance Score</div><div class="card-value green">${d.score}%</div></div><div class="card"><div class="card-title">Sectoral Aggregation</div><div class="card-value blue">${d.aggregation}%</div></div><div class="card"><div class="card-title">OCI-D</div><div class="card-value orange">${d.ociD}%</div></div><div class="card"><div class="card-title">OCI-O</div><div class="card-value blue">${d.ociO}%</div></div><div class="card"><div class="card-title">Fragmentation</div><div class="card-value red">${d.fragmentation}%</div></div></div><div class="section"><h2>Governance Intelligence Summary</h2><p>The national governance renderer has been initialized successfully. It is connected to Airtable when a valid recordId is supplied and falls back to safe demo values otherwise.</p></div></body></html>`;
}

function render(d, embed = false) {
  return embed ? renderEmbed(d) : renderFull(d);
}

async function handle(req, res) {
  try {
    const id = String(req.query.recordId || '').trim();
    const embed = String(req.query.embed || '') === '1';
    let rec = null;
    let sectors = [];
    if (id) {
      rec = await get(NAT_TABLE, id);
      const f = rec?.fields || {};
      sectors = await getLinked(SEC_TABLE, f['Sectoral Strategies'] || f['Linked Sectoral Strategies'] || []);
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(render(build(rec, sectors), embed));
  } catch (e) {
    res.status(500).send('Dashboard error: ' + safe(e.message));
  }
}

app.get('/', handle);
app.get('/api', handle);

export default app;
