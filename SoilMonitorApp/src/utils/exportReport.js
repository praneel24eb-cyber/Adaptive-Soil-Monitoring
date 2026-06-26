// ─── exportReport.js ──────────────────────────────────────────────────────
// Generates an HTML soil-monitoring report and exports it as a PDF using
// expo-print + expo-sharing. Both packages are already in package.json.

import * as Print   from 'expo-print';
import * as Sharing from 'expo-sharing';

// ── Helper: compute stats for a numeric array ─────────────────────────────
function stats(arr) {
  const nums = arr.filter(v => v !== null && v !== undefined && !isNaN(Number(v))).map(Number);
  if (nums.length === 0) return { min: '—', max: '—', avg: '—', count: 0 };
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
  return {
    min:   min.toFixed(1),
    max:   max.toFixed(1),
    avg:   avg.toFixed(1),
    count: nums.length,
  };
}

// ── HTML template ─────────────────────────────────────────────────────────
function buildHtml({ history, alerts, latestReading, generatedAt }) {
  const N    = stats(history.map(r => r.N));
  const P    = stats(history.map(r => r.P));
  const K    = stats(history.map(r => r.K));
  const mois = stats(history.map(r => r.moisture));
  const temp = stats(history.map(r => r.temp));

  const driftCount     = alerts.filter(a => a.type === 'drift'     || (!a.type && a.cusum !== undefined)).length;
  const threshCount    = alerts.filter(a => a.type === 'threshold').length;
  const latestClass    = latestReading?.class ?? '—';
  const latestN        = latestReading?.N       ?? '—';
  const latestP        = latestReading?.P       ?? '—';
  const latestK        = latestReading?.K       ?? '—';
  const latestMoisture = latestReading?.moisture ?? '—';
  const latestTemp     = latestReading?.temp     ?? '—';

  const alertRows = alerts.slice(0, 20).map(a => {
    const time = a.receivedAt ? new Date(a.receivedAt).toLocaleString() : '—';
    const type = a.type === 'threshold' ? '🚨 Threshold' : '⚠️ Drift';
    return `<tr>
      <td>${type}</td>
      <td>${time}</td>
      <td>${a.message ?? '—'}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Soil Monitoring Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
           background: #0d1117; color: #e6edf3; padding: 32px; }
    h1   { font-size: 26px; font-weight: 900; margin-bottom: 4px; }
    h2   { font-size: 14px; font-weight: 600; color: #8b949e;
           text-transform: uppercase; letter-spacing: 1.5px; margin: 24px 0 10px; }
    .subtitle { color: #8b949e; font-size: 12px; margin-bottom: 28px; }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 12px;
             font-size: 11px; font-weight: 700; background: #21262d; border: 1px solid #30363d; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .card { background: #161b22; border: 1px solid #30363d;
            border-radius: 10px; padding: 14px; }
    .card-title { font-size: 11px; color: #8b949e; text-transform: uppercase;
                  letter-spacing: 1px; margin-bottom: 8px; }
    .card-val { font-size: 24px; font-weight: 800; }
    .stat-row { display: flex; justify-content: space-between;
                padding: 5px 0; border-bottom: 1px solid #21262d;
                font-size: 13px; }
    .stat-row:last-child { border-bottom: none; }
    .muted { color: #8b949e; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { text-align: left; color: #8b949e; padding: 6px 8px;
         border-bottom: 1px solid #30363d; }
    td { padding: 6px 8px; border-bottom: 1px solid #21262d; }
    .accent { color: #58a6ff; }
    .green  { color: #00ff88; }
    .yellow { color: #ffb703; }
    .red    { color: #ef233c; }
    .section { background: #161b22; border: 1px solid #30363d;
               border-radius: 10px; padding: 16px; margin-bottom: 16px; }
    .header-bar { border-left: 4px solid #58a6ff; padding-left: 14px; margin-bottom: 24px; }
    .footer { margin-top: 32px; text-align: center; color: #484f58; font-size: 11px; }
  </style>
</head>
<body>
  <div class="header-bar">
    <h1>🌱 Soil Monitoring Report</h1>
    <p class="subtitle">Generated: ${generatedAt} &nbsp;|&nbsp; ${history.length} readings &nbsp;|&nbsp; ${alerts.length} alerts</p>
  </div>

  <!-- Latest reading snapshot -->
  <h2>Latest Snapshot</h2>
  <div class="grid" style="margin-bottom:16px">
    <div class="card">
      <div class="card-title">Nitrogen (N)</div>
      <div class="card-val accent">${latestN}</div>
      <div class="muted" style="font-size:11px;margin-top:4px">mg/kg</div>
    </div>
    <div class="card">
      <div class="card-title">Phosphorus (P)</div>
      <div class="card-val" style="color:#ab47bc">${latestP}</div>
      <div class="muted" style="font-size:11px;margin-top:4px">mg/kg</div>
    </div>
    <div class="card">
      <div class="card-title">Potassium (K)</div>
      <div class="card-val" style="color:#ff7043">${latestK}</div>
      <div class="muted" style="font-size:11px;margin-top:4px">mg/kg</div>
    </div>
    <div class="card">
      <div class="card-title">Moisture</div>
      <div class="card-val" style="color:#29b6f6">${latestMoisture}</div>
      <div class="muted" style="font-size:11px;margin-top:4px">%</div>
    </div>
    <div class="card">
      <div class="card-title">Temperature</div>
      <div class="card-val" style="color:#ef5350">${latestTemp}</div>
      <div class="muted" style="font-size:11px;margin-top:4px">°C</div>
    </div>
    <div class="card">
      <div class="card-title">Fertility Class</div>
      <div class="card-val" style="font-size:16px;margin-top:6px">${latestClass}</div>
    </div>
  </div>

  <!-- Session statistics -->
  <h2>Session Statistics (${history.length} readings)</h2>
  <div class="section">
    <table>
      <thead><tr>
        <th>Sensor</th><th>Min</th><th>Avg</th><th>Max</th><th>Readings</th>
      </tr></thead>
      <tbody>
        <tr><td class="accent">Nitrogen (N) mg/kg</td><td>${N.min}</td><td>${N.avg}</td><td>${N.max}</td><td>${N.count}</td></tr>
        <tr><td style="color:#ab47bc">Phosphorus (P) mg/kg</td><td>${P.min}</td><td>${P.avg}</td><td>${P.max}</td><td>${P.count}</td></tr>
        <tr><td style="color:#ff7043">Potassium (K) mg/kg</td><td>${K.min}</td><td>${K.avg}</td><td>${K.max}</td><td>${K.count}</td></tr>
        <tr><td style="color:#29b6f6">Moisture %</td><td>${mois.min}</td><td>${mois.avg}</td><td>${mois.max}</td><td>${mois.count}</td></tr>
        <tr><td style="color:#ef5350">Temperature °C</td><td>${temp.min}</td><td>${temp.avg}</td><td>${temp.max}</td><td>${temp.count}</td></tr>
      </tbody>
    </table>
  </div>

  <!-- Alerts summary -->
  <h2>Alerts Summary</h2>
  <div class="section">
    <div class="stat-row">
      <span class="muted">Total alerts</span><span>${alerts.length}</span>
    </div>
    <div class="stat-row">
      <span class="muted">⚠️ Drift alerts</span><span class="yellow">${driftCount}</span>
    </div>
    <div class="stat-row">
      <span class="muted">🚨 Threshold alerts</span><span class="red">${threshCount}</span>
    </div>
  </div>

  ${alerts.length > 0 ? `
  <h2>Alert Log (last 20)</h2>
  <div class="section" style="padding:0">
    <table>
      <thead><tr><th>Type</th><th>Time</th><th>Message</th></tr></thead>
      <tbody>${alertRows}</tbody>
    </table>
  </div>` : ''}

  <div class="footer">
    IoT Soil Fertility Monitor — RVCE IoT Mini Project — ESP32 + Firebase + Groq AI
  </div>
</body>
</html>`;
}

// ── Public API ─────────────────────────────────────────────────────────────
/**
 * Generate and share a PDF report.
 * @param {{ history: Array, alerts: Array, latestReading: Object|null }} data
 */
export async function exportPDFReport({ history, alerts, latestReading }) {
  const generatedAt = new Date().toLocaleString();
  const html = buildHtml({ history, alerts, latestReading, generatedAt });

  try {
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Share Soil Report',
        UTI: 'com.adobe.pdf',
      });
    } else {
      // Fallback: open the print dialog directly
      await Print.printAsync({ uri });
    }
    return { success: true };
  } catch (err) {
    console.error('[exportReport]', err);
    return { success: false, error: err.message };
  }
}
