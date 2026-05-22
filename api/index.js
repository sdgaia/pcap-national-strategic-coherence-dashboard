import express from 'express';
import axios from 'axios';

const app = express();

const PORT = process.env.PORT || 3000;

function gaugeColor(score) {
  if (score >= 80) return '#16a34a';
  if (score >= 60) return '#2563eb';
  if (score >= 40) return '#f97316';
  return '#dc2626';
}

function label(score) {
  if (score >= 80) return 'Strong';
  if (score >= 60) return 'Moderate';
  if (score >= 40) return 'Fragile';
  return 'Critical';
}

app.get('/', async (req, res) => {
  const strategyId = req.query.recordId || 'NS-1';

  const metrics = {
    governance: 84,
    drift: 26,
    reliability: 74,
    readiness: 81,
    escalated: 6,
    c1: 88,
    c2: 82,
    c3: 71,
    c4: 68,
    c5: 79,
    c6: 84
  };

  const sectors = [
    ['Agriculture', 82, 'Strong'],
    ['Climate', 79, 'Strong'],
    ['Education', 73, 'Moderate'],
    ['Energy', 65, 'Moderate'],
    ['Water', 58, 'Fragile']
  ];

  res.send(`
  <!DOCTYPE html>
  <html>
  <head>
    <title>PCAP National Strategic Coherence Dashboard</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
      body {
        margin:0;
        padding:20px;
        background:#eef2f7;
        font-family:Arial,sans-serif;
        color:#0f172a;
      }

      .dashboard {
        background:white;
        border-radius:24px;
        padding:24px;
      }

      .header {
        display:flex;
        justify-content:space-between;
        align-items:flex-start;
        margin-bottom:24px;
      }

      .title {
        font-size:54px;
        font-weight:800;
      }

      .subtitle {
        margin-top:8px;
        color:#475569;
        font-size:20px;
      }

      .grid {
        display:grid;
        grid-template-columns:repeat(5,1fr);
        gap:18px;
        margin-bottom:18px;
      }

      .card {
        background:white;
        border:1px solid #dbe2ea;
        border-radius:18px;
        padding:20px;
        box-shadow:0 2px 6px rgba(0,0,0,0.04);
      }

      .card h3 {
        margin:0 0 12px 0;
        font-size:18px;
      }

      .metric {
        text-align:center;
        font-size:56px;
        font-weight:800;
      }

      .metric-label {
        text-align:center;
        margin-top:6px;
        font-weight:700;
      }

      .row {
        display:grid;
        grid-template-columns:1.2fr 1fr;
        gap:18px;
        margin-bottom:18px;
      }

      .components {
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:18px;
      }

      .bar {
        height:12px;
        border-radius:10px;
        background:#e5e7eb;
        overflow:hidden;
        margin-top:6px;
      }

      .fill {
        height:12px;
        border-radius:10px;
      }

      table {
        width:100%;
        border-collapse:collapse;
      }

      th, td {
        padding:12px;
        border-bottom:1px solid #e5e7eb;
        text-align:left;
      }

      .half-grid {
        display:grid;
        grid-template-columns:repeat(3,1fr);
        gap:12px;
      }

      .mini {
        text-align:center;
      }

      canvas {
        max-height:300px;
      }
    </style>
  </head>
  <body>
    <div class="dashboard">

      <div class="header">
        <div>
          <div class="title">PCAP National Strategic Coherence Dashboard</div>
          <div class="subtitle">${strategyId} • Strategic Coherence Intelligence • Recursive National Architecture</div>
        </div>
        <div>Updated • ${new Date().toLocaleDateString()}</div>
      </div>

      <div class="grid">

        <div class="card">
          <h3>Strategic Governance Score</h3>
          <div class="metric" style="color:${gaugeColor(metrics.governance)}">${metrics.governance}%</div>
          <div class="metric-label">${label(metrics.governance)}</div>
        </div>

        <div class="card">
          <h3>Governance Drift</h3>
          <div class="metric" style="color:${gaugeColor(100-metrics.drift)}">${metrics.drift}%</div>
          <div class="metric-label">${label(100-metrics.drift)}</div>
        </div>

        <div class="card">
          <h3>Monitoring Reliability</h3>
          <div class="metric" style="color:${gaugeColor(metrics.reliability)}">${metrics.reliability}%</div>
          <div class="metric-label">${label(metrics.reliability)}</div>
        </div>

        <div class="card">
          <h3>Escalation Readiness</h3>
          <div class="metric" style="color:${gaugeColor(metrics.readiness)}">${metrics.readiness}%</div>
          <div class="metric-label">${label(metrics.readiness)}</div>
        </div>

        <div class="card">
          <h3>Escalated Actions</h3>
          <div class="metric" style="color:#dc2626">${metrics.escalated}</div>
          <div class="metric-label">Priority Actions</div>
        </div>

      </div>

      <div class="row">

        <div class="card">
          <h3>Recursive Strategic Components (C1–C6)</h3>
          <canvas id="radar"></canvas>
        </div>

        <div class="card">
          <h3>Strategic Governance Components</h3>

          <div class="half-grid">

            ${['c1','c2','c3','c4','c5','c6'].map((c,index)=>`
              <div class="mini">
                <h4>C${index+1}</h4>
                <svg width="140" height="90">
                  <path d="M20 70 A50 50 0 0 1 120 70" fill="none" stroke="#e5e7eb" stroke-width="12" stroke-linecap="round"/>
                  <path d="M20 70 A50 50 0 0 1 ${20 + metrics[c]} 70" fill="none" stroke="${gaugeColor(metrics[c])}" stroke-width="12" stroke-linecap="round"/>
                  <text x="70" y="58" text-anchor="middle" font-size="24" font-weight="bold" fill="${gaugeColor(metrics[c])}">${metrics[c]}%</text>
                </svg>
              </div>
            `).join('')}

          </div>
        </div>

      </div>

      <div class="row">

        <div class="card">
          <h3>Sectoral Strategies Benchmarking</h3>

          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Sector</th>
                <th>Governance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${sectors.map((s,i)=>`
                <tr>
                  <td>${i+1}</td>
                  <td>${s[0]}</td>
                  <td>${s[1]}%</td>
                  <td>${s[2]}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div class="card">
          <h3>Strategic Intelligence Summary</h3>

          <p><strong>Strongest area:</strong> C1 Policy Governance.</p>
          <p><strong>Primary weakness:</strong> C4 Monitoring architecture continuity.</p>
          <p><strong>Recursive issue:</strong> Drift remains visible across sectoral escalation chains.</p>
          <p><strong>Strategic implication:</strong> National strategy coherence is structurally present but operational resilience remains uneven between sectors.</p>

        </div>

      </div>

    </div>

    <script>
      const ctx = document.getElementById('radar');

      new Chart(ctx, {
        type: 'radar',
        data: {
          labels: [
            'C1 Policy',
            'C2 Instruments',
            'C3 Resources',
            'C4 Monitoring',
            'C5 Escalation',
            'C6 Traceability'
          ],
          datasets: [{
            label: 'Governance Score',
            data: [88,82,71,68,79,84],
            fill: true,
            backgroundColor: 'rgba(37,99,235,0.2)',
            borderColor: '#2563eb',
            pointBackgroundColor: '#2563eb'
          }]
        },
        options: {
          responsive: true,
          scales: {
            r: {
              min: 0,
              max: 100
            }
          }
        }
      });
    </script>

  </body>
  </html>
  `);
});

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
