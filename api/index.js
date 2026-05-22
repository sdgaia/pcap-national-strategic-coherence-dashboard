import express from 'express';

const app = express();

const KEY = process.env.AIRTABLE_API_KEY;
const BASE = process.env.AIRTABLE_BASE_ID;
const NAT_TABLE = process.env.AIRTABLE_NATIONAL_STRATEGIES_TABLE || 'National Strategies';
const SEC_TABLE = process.env.AIRTABLE_SECTORAL_STRATEGIES_TABLE || 'Sectoral Strategies';

function safe(v){return String(v ?? '').replace(/[&<>\"]/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[s]));}
function pick(f,n,d=''){for(const k of n){const v=f?.[k];if(v!==undefined&&v!==null&&v!=='')return v;}return d;}
function text(f,n,d='Not specified'){const v=pick(f,n,d);if(Array.isArray(v))return v.map(x=>typeof x==='object'?(x.name||x.id||''):x).filter(Boolean).join(', ')||d;return typeof v==='object'&&v?.name?v.name:String(v||d);}
function num(f,n,d=0){const v=pick(f,n,d);const raw=Array.isArray(v)?v[0]:v;const s=String(raw??'').replace('%','').trim();const x=Number(s);return Number.isFinite(x)?(x>0&&x<=1?Math.round(x*100):Math.round(x)):d;}
function status(v){return v>=80?'Strong':v>=60?'Moderate':v>=40?'Fragile':'Critical';}
function col(v){return v>=80?'#16a34a':v>=60?'#2563eb':v>=40?'#f97316':'#dc2626';}
function badgeClass(v){return v>=80?'good':v>=60?'mid':v>=40?'frag':'bad';}

async function get(table,id){if(!KEY||!BASE||!id)return null;const url=`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(table)}/${id}`;const r=await fetch(url,{headers:{Authorization:`Bearer ${KEY}`}});if(!r.ok)throw new Error(await r.text());return r.json();}
async function getLinked(table,ids){if(!Array.isArray(ids))return[];const out=[];for(const id of ids.slice(0,16)){try{const r=await get(table,id);if(r)out.push(r);}catch(e){}}return out;}
function section(report,title){const t=String(report||'');const i=t.toLowerCase().indexOf(title.toLowerCase());if(i<0)return'';const rest=t.slice(i+title.length).trim();const next=rest.search(/\n[A-Z][A-Za-z\s\/–-]{4,}\n/);return (next>0?rest.slice(0,next):rest).trim().split('\n').filter(Boolean).slice(0,5).join(' ');}

function build(record,sectors){
 const f=record?.fields||{};
 const report=text(f,['National Strategy-Level AI Coherence Reports','AI Coherence Report'],'');
 const c=[
  num(f,['C1 National Strategy Coherence Score'],0),
  num(f,['C2 National Strategy Coherence Score'],0),
  num(f,['C3 National Strategy Coherence Score'],0),
  num(f,['C4 National Strategy Coherence Score'],0),
  num(f,['C5 National Strategy Coherence Score'],0),
  num(f,['C6 National Strategy Coherence Score'],0)
 ];
 const hasC=c.some(x=>x>0);
 const cc=hasC?c:[83,58,42,15,47,72];
 const score=num(f,['National Strategy Coherence Score','Final National Strategy Coherence Score'],Math.round(cc.reduce((a,b)=>a+b,0)/6));
 const ociD=num(f,['National Strategy Intrinsic OCI-D','National Strategy Intrinsic OCI-D Score'],Math.round((cc[0]+cc[1]+cc[2])/3));
 const ociO=num(f,['National Strategy Intrinsic OCI-O','National Strategy Intrinsic OCI-O Score'],Math.round((cc[3]+cc[4]+cc[5])/3));
 const aggregation=num(f,['Sectoral Strategy Aggregation Coherence Score','Inherited Sectoral Strategy OCI-D Score'],score);
 const rows=(sectors||[]).map((r,i)=>{const sf=r.fields||{};const v=num(sf,['Final Sectoral Strategy Coherence Score','Sectoral Strategy Aggregation Coherence Score','Final Sectoral Strategy OCI-D Score'],0);return{name:text(sf,['Strategy Name','Sector Strategy ID','Name'],`Sectoral Strategy ${i+1}`),score:v,status:status(v)}}).filter(x=>x.score>0).sort((a,b)=>a.score-b.score);
 return {
  id:text(f,['ID','Strategy ID'],record?.id||'NS'),
  name:text(f,['Strategy Name','Name'],'National Strategy'),
  country:text(f,['Country'],'Ghana'),
  focus:text(f,['Strategic Focus'],'National strategic coherence'),
  docs:text(f,['National Strategy Source Documents','Policy Source Documents'],'No source documents listed'),
  claimCount:num(f,['National Strategy Claim Count','National  Strategy Claim Count'],0),
  docType:text(f,['Policy Document Types'],'Analytical Report'),
  owner:text(f,['National Strategy Coherence Owner'],'Reviewer'),
  govResp:text(f,['National Strategy Governance Responsibility'],'Not assigned'),
  transResp:text(f,['National Strategy  Translation Responsibility','National Strategy Translation Responsibility'],'Not assigned'),
  monitorResp:text(f,['National Strategy Monitoring Responsibility'],'Reviewer'),
  score,ociD,ociO,aggregation,c:cc,
  coherenceStatus:text(f,['National Strategy Coherence Status','Final National Strategy Coherence Status'],status(score)),
  ociDRationale:text(f,['National Strategy OCI-D Rationale'],section(report,'AI Coherence Report')||'Design coherence is derived from C1-C3 strategic coherence indicators and linked evidence.'),
  ociORationale:text(f,['National Strategy OCI-O Rationale'],'Operational coherence is derived from C4-C6 strategic coherence indicators and linked evidence validation.'),
  reviewer:text(f,['Recommended Reviewer Focus 2','Recommended Reviewer Focus'],'Review unsupported or weak claims, evidence sufficiency, and translation of strategic responsibilities.'),
  cert:section(report,'Certification Outlook')||'Certification outlook not yet confirmed.',
  summary:section(report,'Executive Summary')||report.slice(0,620)||'Strategic coherence summary pending.',
  strengths:section(report,'Key Strengths')||'Strategic articulation, reference coherence and documentary foundations require confirmation.',
  weaknesses:section(report,'Critical Weaknesses')||'Weaknesses require reviewer confirmation.',
  sectors:rows.length?rows:[{name:'SS-1 Agriculture & Food Systems',score:44,status:'Fragile'},{name:'SS-2 Climate / NDC',score:66,status:'Moderate'},{name:'SS-3 Forestry & Landscape',score:66,status:'Moderate'},{name:'SS-4 Waste & Circular Economy',score:28,status:'Critical'},{name:'SS-5 SDG / VNR',score:44,status:'Fragile'}]
 };
}

function gauge(t,v,sub){return `<div class="card kpi"><div class="k-title">${safe(t)}</div><div class="semi" style="--v:${v};--c:${col(v)}"><div class="num">${v}%</div><div class="lab">${safe(sub||status(v))}</div></div><div class="scale"><span>0%</span><span>100%</span></div></div>`;}
function bar(t,v){return `<div class="bar"><b>${safe(t)}</b><div class="track"><div class="fill" style="width:${v}%;background:${col(v)}"></div></div><strong>${v}%</strong></div>`;}
function mini(t,v){return `<div class="mini"><h4>${safe(t)}</h4><div class="semi small" style="--v:${v};--c:${col(v)}"><div class="num sn">${v}%</div><div class="lab sl">${status(v)}</div></div></div>`;}
function radar(c){const p=[[0,-1.35*c[0]],[1.17*c[1],-.67*c[1]],[1.17*c[2],.67*c[2]],[0,1.35*c[3]],[-1.17*c[4],.67*c[4]],[-1.17*c[5],-.67*c[5]]].map(x=>x.join(',')).join(' ');return `<svg viewBox="0 0 420 350" width="100%" height="315"><g transform="translate(210 170)"><polygon points="0,-135 117,-67 117,67 0,135 -117,67 -117,-67" fill="none" stroke="#cbd5e1"/><polygon points="0,-101 88,-50 88,50 0,101 -88,50 -88,-50" fill="none" stroke="#dbe3ef"/><polygon points="0,-68 59,-34 59,34 0,68 -59,34 -59,-34" fill="none" stroke="#dbe3ef"/><polygon points="0,-34 29,-17 29,17 0,34 -29,17 -29,-17" fill="none" stroke="#dbe3ef"/><polygon points="${p}" fill="rgba(37,99,235,.16)" stroke="#2563eb" stroke-width="4"/><text x="0" y="-154" text-anchor="middle">C1 Alignment</text><text x="145" y="-70" text-anchor="middle">C2 Translation</text><text x="145" y="82" text-anchor="middle">C3 Architecture</text><text x="0" y="163" text-anchor="middle">C4 Monitoring</text><text x="-145" y="82" text-anchor="middle">C5 Escalation</text><text x="-145" y="-70" text-anchor="middle">C6 Auditability</text></g></svg>`;}
function row(s,i){return `<tr><td>${i+1}</td><td>${safe(s.name)}</td><td class="score" style="color:${col(s.score)}">${s.score}%</td><td><span class="badge ${badgeClass(s.score)}">${safe(s.status)}</span></td></tr>`;}

function render(d){const names=['C1 Strategic Alignment','C2 Policy Translation','C3 Sectoral Architecture','C4 Strategic Monitoring','C5 Strategic Escalation','C6 Strategic Auditability'];const weak=Math.min(...d.c);const wi=d.c.indexOf(weak);return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>PCAP National Strategic Coherence Dashboard</title><style>*{box-sizing:border-box}body{margin:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;color:#0b1533;padding:14px}.wrap{max-width:1880px;margin:auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:20px;box-shadow:0 8px 28px rgba(15,23,42,.05)}.top{display:flex;justify-content:space-between;gap:20px}.title{font-size:36px;font-weight:900;letter-spacing:-.5px}.sub{margin-top:8px;color:#64748b;font-size:15px}.meta{font-size:13px;color:#475569;text-align:right}.grid5{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-top:18px}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}.bottom{display:grid;grid-template-columns:1.35fr 1fr;gap:12px;margin-top:12px}.card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;box-shadow:0 3px 16px rgba(15,23,42,.035)}h3{margin:0 0 12px;font-size:16px}.kpi{height:215px}.k-title{text-align:center;font-size:15px;font-weight:900;min-height:34px}.semi{width:245px;height:122px;position:relative;overflow:hidden;margin:8px auto 0}.semi:before{content:"";position:absolute;width:245px;height:245px;border-radius:50%;background:conic-gradient(from 270deg,var(--c) calc(var(--v)*1.8deg),#e5e7eb 0 180deg,transparent 0)}.semi:after{content:"";position:absolute;left:38px;top:38px;width:169px;height:169px;border-radius:50%;background:#fff}.num{position:absolute;top:54px;left:0;right:0;text-align:center;font-size:34px;font-weight:900;color:var(--c);z-index:1}.lab{position:absolute;top:94px;left:0;right:0;text-align:center;font-size:13px;font-weight:900;color:var(--c);z-index:1}.scale{display:flex;justify-content:space-between;font-size:12px}.radarblock{display:grid;grid-template-columns:54% 46%;gap:12px;align-items:center}.bar{display:grid;grid-template-columns:210px 1fr 45px;gap:12px;align-items:center;margin:14px 0}.track{height:8px;background:#e5e7eb;border-radius:99px;overflow:hidden}.fill{height:8px;border-radius:99px}.weak{margin-top:18px;border:1px solid #fecaca;background:#fff1f2;color:#b91c1c;border-radius:8px;padding:12px;font-size:13px;font-weight:900;display:flex;justify-content:space-between}.pill{background:#dc2626;color:#fff;border-radius:99px;padding:7px 12px}.halfgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.mini h4{text-align:center;margin:0;font-size:14px}.small{width:185px;height:92px}.small:before{width:185px;height:185px}.small:after{left:29px;top:29px;width:127px;height:127px}.sn{top:42px;font-size:27px}.sl{top:74px;font-size:12px}table{width:100%;border-collapse:collapse;font-size:13px}th,td{border:1px solid #e5e7eb;padding:10px;text-align:center}th{background:#f8fafc}td:nth-child(2){text-align:left;font-weight:800}.score{font-size:17px;font-weight:900}.badge{border-radius:999px;padding:6px 10px;font-weight:800}.good{background:#ecfdf5;color:#166534}.mid{background:#eff6ff;color:#1d4ed8}.frag{background:#fff7ed;color:#ea580c}.bad{background:#fff1f2;color:#b91c1c}.box{border:1px solid #e5e7eb;border-radius:10px;padding:14px;margin-bottom:12px}.box h4{margin:0 0 8px}.box p{font-size:13px;line-height:1.45;margin:0}.note{margin-top:14px;color:#64748b;font-size:12px}@media(max-width:1200px){.grid5,.grid2,.bottom,.radarblock,.halfgrid{grid-template-columns:1fr}.top{display:block}.meta{text-align:left;margin-top:10px}}</style></head><body><div class="wrap"><div class="top"><div><div class="title">PCAP National Strategic Coherence Dashboard</div><div class="sub">${safe(d.id)} — ${safe(d.name)} • ${safe(d.country)} • Document & Referential Coherence View</div></div><div class="meta">Updated • ${new Date().toLocaleDateString()}<br/>Owner: ${safe(d.owner)}</div></div><div class="grid5">${gauge('National Strategic Coherence Score',d.score,d.coherenceStatus)}${gauge('Sectoral Aggregation Coherence',d.aggregation,status(d.aggregation))}${gauge('Intrinsic OCI-D',d.ociD,status(d.ociD))}${gauge('Intrinsic OCI-O',d.ociO,status(d.ociO))}<div class="card kpi"><div class="k-title">Claims / Evidence Base</div><div class="num" style="position:static;margin-top:40px;color:#2563eb">${d.claimCount}</div><div class="lab" style="position:static;color:#2563eb">${safe(d.docType)}</div></div></div><div class="grid2"><div class="card"><h3>Recursive Strategic Components (C1–C6)</h3><div class="radarblock"><div>${radar(d.c)}</div><div>${names.map((n,i)=>bar(n,d.c[i])).join('')}<div class="weak"><span>Weakest Strategic Layer<br>${names[wi]}</span><span class="pill">${weak}%</span></div></div></div></div><div class="card"><h3>Strategic Coherence Intelligence</h3><div class="halfgrid">${names.map((n,i)=>mini(n,d.c[i])).join('')}</div></div></div><div class="bottom"><div class="card"><h3>Linked Sectoral Strategy Coherence Benchmarking</h3><table><thead><tr><th>#</th><th>Sectoral Strategy</th><th>Strategic Coherence</th><th>Status</th></tr></thead><tbody>${d.sectors.map(row).join('')}</tbody></table><div class="note">Source documents: ${safe(d.docs)}</div></div><div class="card"><h3>Strategic Coherence Synthesis</h3><div class="box"><h4>Executive Summary</h4><p>${safe(d.summary)}</p></div><div class="box"><h4>Certification Outlook</h4><p>${safe(d.cert)}</p></div><div class="box"><h4>Reviewer Focus</h4><p>${safe(d.reviewer)}</p></div><div class="box"><h4>Responsibilities</h4><p><b>Governance:</b> ${safe(d.govResp)}<br/><b>Translation:</b> ${safe(d.transResp)}<br/><b>Monitoring:</b> ${safe(d.monitorResp)}</p></div></div></div><div class="note">Strategic coherence only. Operational governance exposure is intentionally excluded and handled in the separate National Governance Dashboard.</div></div></body></html>`}

async function handle(req,res){try{const id=String(req.query.recordId||'').trim();let rec=null,sectors=[];if(id){rec=await get(NAT_TABLE,id);const f=rec?.fields||{};sectors=await getLinked(SEC_TABLE,f['Sectoral Strategies']||f['Linked Sectoral Strategies']||[]);}res.setHeader('Content-Type','text/html; charset=utf-8');res.send(render(build(rec,sectors)));}catch(e){res.status(500).send('Dashboard error: '+safe(e.message));}}
app.get('/',handle);app.get('/api',handle);
export default app;
