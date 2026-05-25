import express from 'express';

const app = express();

const KEY = process.env.AIRTABLE_API_KEY;
const BASE = process.env.AIRTABLE_BASE_ID;
const NAT_TABLE =
  process.env.AIRTABLE_NATIONAL_STRATEGIES_TABLE || 'National Strategies';
const SEC_TABLE =
  process.env.AIRTABLE_SECTORAL_STRATEGIES_TABLE || 'Sectoral Strategies';

function safe(v: any) {
  return String(v ?? '').replace(
    /[&<>\"]/g,
    (s) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[s]
  );
}

function pick(f: any, n: string[], d: any = '') {
  for (const k of n) {
    const v = f?.[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return d;
}

function text(f: any, n: string[], d = 'Not specified') {
  const v = pick(f, n, d);

  if (Array.isArray(v)) {
    return (
      v
        .map((x) =>
          typeof x === 'object'
            ? x.name || x.id || ''
            : x
        )
        .filter(Boolean)
        .join(', ') || d
    );
  }

  return typeof v === 'object' && v?.name
    ? v.name
    : String(v || d);
}

function num(f: any, n: string[], d = 0) {
  const v = pick(f, n, d);
  const raw = Array.isArray(v) ? v[0] : v;

  const s = String(raw ?? '')
    .replace('%', '')
    .trim();

  const x = Number(s);

  return Number.isFinite(x)
    ? x > 0 && x <= 1
      ? Math.round(x * 100)
      : Math.round(x)
    : d;
}

function status(v: number) {
  return v >= 80
    ? 'Strong'
    : v >= 60
    ? 'Moderate'
    : v >= 40
    ? 'Fragile'
    : 'Critical';
}

function col(v: number) {
  return v >= 80
    ? '#16a34a'
    : v >= 60
    ? '#2563eb'
    : v >= 40
    ? '#f97316'
    : '#dc2626';
}

function badgeClass(v: number) {
  return v >= 80
    ? 'good'
    : v >= 60
    ? 'mid'
    : v >= 40
    ? 'frag'
    : 'bad';
}

function avg(a: number[]) {
  const x = a.filter(
    (n) => Number.isFinite(n) && n > 0
  );

  return x.length
    ? Math.round(
        x.reduce((p, c) => p + c, 0) / x.length
      )
    : 0;
}

function stdev(a: number[]) {
  const x = a.filter(
    (n) => Number.isFinite(n) && n > 0
  );

  if (x.length < 2) return 0;

  const m =
    x.reduce((p, c) => p + c, 0) / x.length;

  return Math.round(
    Math.sqrt(
      x.reduce(
        (p, c) => p + Math.pow(c - m, 2),
        0
      ) / x.length
    )
  );
}

async function get(table: string, id: string) {
  if (!KEY || !BASE || !id) return null;

  const url = `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(
    table
  )}/${id}`;

  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${KEY}`,
    },
  });

  if (!r.ok) {
    throw new Error(await r.text());
  }

  return r.json();
}

async function getLinked(
  table: string,
  ids: string[]
) {
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

function section(report: string, title: string) {
  const t = String(report || '');

  const i = t
    .toLowerCase()
    .indexOf(title.toLowerCase());

  if (i < 0) return '';

  const rest = t.slice(i + title.length).trim();

  const next = rest.search(
    /\n[A-Z][A-Za-z\s\/–-]{4,}\n/
  );

  return (
    next > 0
      ? rest.slice(0, next)
      : rest
  )
    .trim()
    .split('\n')
    .filter(Boolean)
    .slice(0, 5)
    .join(' ');
}

function build(record: any, sectors: any[]) {
  const f = record?.fields || {};

  const report = text(
    f,
    [
      'National Strategy-Level AI Coherence Reports',
      'AI Coherence Report',
    ],
    ''
  );

  const c = [
    num(f, ['C1 National Strategy Coherence Score'], 0),
    num(f, ['C2 National Strategy Coherence Score'], 0),
    num(f, ['C3 National Strategy Coherence Score'], 0),
    num(f, ['C4 National Strategy Coherence Score'], 0),
    num(f, ['C5 National Strategy Coherence Score'], 0),
    num(f, ['C6 National Strategy Coherence Score'], 0),
  ];

  const cc = c.some((x) => x > 0)
    ? c
    : [83, 58, 42, 15, 47, 72];

  const score = num(
    f,
    [
      'National Strategy Coherence Score',
      'Final National Strategy Coherence Score',
    ],
    avg(cc)
  );

  const ociD = num(
    f,
    [
      'National Strategy Intrinsic OCI-D',
      'National Strategy Intrinsic OCI-D Score',
    ],
    avg([cc[0], cc[1], cc[2]])
  );

  const ociO = num(
    f,
    [
      'National Strategy Intrinsic OCI-O',
      'National Strategy Intrinsic OCI-O Score',
    ],
    avg([cc[3], cc[4], cc[5]])
  );

  const aggregation = num(
    f,
    [
      'Sectoral Strategy Aggregation Coherence Score',
      'Inherited Sectoral Strategy OCI-D Score',
    ],
    score
  );

  const rows = (sectors || [])
    .map((r, i) => {
      const sf = r.fields || {};

      const v = num(
        sf,
        [
          'Final Sectoral Strategy Coherence Score',
          'Sectoral Strategy Aggregation Coherence Score',
          'Final Sectoral Strategy OCI-D Score',
        ],
        0
      );

      return {
        name: text(
          sf,
          [
            'Strategy Name',
            'Sector Strategy ID',
            'Name',
          ],
          `Sectoral Strategy ${i + 1}`
        ),
        score: v,
        status: status(v),
      };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => a.score - b.score);

  const sectorList = rows.length
    ? rows
    : [
        {
          name: 'SS-1 Agriculture & Food Systems',
          score: 44,
          status: 'Fragile',
        },
        {
          name: 'SS-2 Climate / NDC',
          score: 66,
          status: 'Moderate',
        },
        {
          name: 'SS-3 Forestry & Landscape',
          score: 66,
          status: 'Moderate',
        },
        {
          name: 'SS-4 Waste & Circular Economy',
          score: 28,
          status: 'Critical',
        },
        {
          name: 'SS-5 SDG / VNR',
          score: 44,
          status: 'Fragile',
        },
      ];

  const dispersion = stdev(
    sectorList.map((x) => x.score)
  );

  const fragmentation = Math.min(
    100,
    Math.round(
      dispersion * 2 +
        Math.max(
          0,
          80 -
            Math.min(
              ...sectorList.map((x) => x.score)
            )
        ) /
          2
    )
  );

  const certBase = Math.round(
    (
      score +
      aggregation +
      ociD +
      ociO +
      Math.max(0, 100 - fragmentation)
    ) / 5
  );

  return {
    id: text(
      f,
      ['ID', 'Strategy ID'],
      record?.id || 'NS'
    ),

    name: text(
      f,
      ['Strategy Name', 'Name'],
      'National Strategy'
    ),

    country: text(f, ['Country'], 'Ghana'),

    owner: text(
      f,
      ['National Strategy Coherence Owner'],
      'Reviewer'
    ),

    score,
    ociD,
    ociO,
    aggregation,
    fragmentation,
    certBase,
    c: cc,

    coherenceStatus: text(
      f,
      [
        'National Strategy Coherence Status',
        'Final National Strategy Coherence Status',
      ],
      status(score)
    ),

    sectors: sectorList,
  };
}

function gauge(
  t: string,
  v: number,
  sub?: string
) {
  return `
  <div class="card kpi">
    <div class="k-title">${safe(t)}</div>

    <div class="semi" style="--v:${v};--c:${col(v)}">
      <div class="num">${v}%</div>
      <div class="lab">${safe(
        sub || status(v)
      )}</div>
    </div>

    <div class="scale">
      <span>0%</span>
      <span>100%</span>
    </div>
  </div>
  `;
}

function reverseGauge(t: string, v: number) {
  const c =
    v <= 20
      ? '#16a34a'
      : v <= 40
      ? '#2563eb'
      : v <= 60
      ? '#f97316'
      : '#dc2626';

  const s =
    v <= 20
      ? 'Low'
      : v <= 40
      ? 'Moderate'
      : v <= 60
      ? 'High'
      : 'Severe';

  return `
  <div class="card kpi">
    <div class="k-title">${safe(t)}</div>

    <div class="semi" style="--v:${v};--c:${c}">
      <div class="num">${v}%</div>
      <div class="lab">${s}</div>
    </div>

    <div class="scale">
      <span>0%</span>
      <span>100%</span>
    </div>
  </div>
  `;
}

function renderEmbed(d: any) {
  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>

<style>
*{
  box-sizing:border-box
}

html,body{
  margin:0;
  padding:0;
  background:transparent;
  font-family:Arial,Helvetica,sans-serif;
  overflow:hidden;
  color:#0b1533
}

.embed{
  padding:8px;
  background:#fff
}

.grid{
  display:grid;
  grid-template-columns:repeat(5,1fr);
  gap:8px
}

.card{
  border:1px solid #e5e7eb;
  border-radius:10px;
  background:#fff;
  padding:8px;
  height:130px
}

.k-title{
  text-align:center;
  font-size:10px;
  font-weight:900;
  height:26px
}

.semi{
  width:140px;
  height:70px;
  position:relative;
  overflow:hidden;
  margin:2px auto 0
}

.semi:before{
  content:"";
  position:absolute;
  width:140px;
  height:140px;
  border-radius:50%;
  background:
    conic-gradient(
      from 270deg,
      var(--c) calc(var(--v)*1.8deg),
      #e5e7eb 0 180deg,
      transparent 0
    )
}

.semi:after{
  content:"";
  position:absolute;
  left:22px;
  top:22px;
  width:96px;
  height:96px;
  border-radius:50%;
  background:#fff
}

.num{
  position:absolute;
  top:29px;
  left:0;
  right:0;
  text-align:center;
  font-size:20px;
  font-weight:900;
  color:var(--c);
  z-index:1
}

.lab{
  position:absolute;
  top:52px;
  left:0;
  right:0;
  text-align:center;
  font-size:9px;
  font-weight:900;
  color:var(--c);
  z-index:1
}

.scale{
  display:flex;
  justify-content:space-between;
  font-size:8px;
  color:#64748b
}

@media(max-width:800px){
  .grid{
    grid-template-columns:repeat(2,1fr)
  }
}
</style>
</head>

<body>

<div class="embed">

<div class="grid">

${gauge(
  'Governance Intelligence',
  d.score,
  d.coherenceStatus
)}

${gauge(
  'Sectoral Aggregation',
  d.aggregation,
  status(d.aggregation)
)}

${gauge(
  'Intrinsic OCI-D',
  d.ociD,
  status(d.ociD)
)}

${gauge(
  'Intrinsic OCI-O',
  d.ociO,
  status(d.ociO)
)}

${reverseGauge(
  'Fragmentation Index',
  d.fragmentation
)}

</div>

</div>

</body>
</html>
`;
}

function renderFull(d: any) {
  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>

<style>
body{
  margin:0;
  padding:20px;
  background:#f5f7fb;
  font-family:Arial,Helvetica,sans-serif
}
</style>
</head>

<body>

<h1>
PCAP National Governance Intelligence Dashboard
</h1>

<p>
${safe(d.name)} • ${safe(d.country)}
</p>

</body>
</html>
`;
}

function render(d: any, embed = false) {
  return embed
    ? renderEmbed(d)
    : renderFull(d);
}

async function handle(req: any, res: any) {
  try {
    const id = String(
      req.query.recordId || ''
    ).trim();

    const embed =
      String(req.query.embed || '') === '1';

    let rec = null;
    let sectors: any[] = [];

    if (id) {
      rec = await get(NAT_TABLE, id);

      const f = rec?.fields || {};

      sectors = await getLinked(
        SEC_TABLE,
        f['Sectoral Strategies'] ||
          f['Linked Sectoral Strategies'] ||
          []
      );
    }

    res.setHeader(
      'Content-Type',
      'text/html; charset=utf-8'
    );

    res.send(
      render(build(rec, sectors), embed)
    );
  } catch (e: any) {
    res
      .status(500)
      .send(
        'Dashboard error: ' + safe(e.message)
      );
  }
}

app.get('/', handle);
app.get('/api', handle);

export default app;
