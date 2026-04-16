require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

// Modular architecture
const reportController = require('./lib/controllers/reportController');
const apiController = require('./lib/controllers/apiController');
const scheduler = require('./lib/scheduler');
const { buildPPTX } = require('./lib/exporters/pptx');
const { buildXLSX } = require('./lib/exporters/xlsx');
const { buildPDF } = require('./lib/exporters/pdf');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use('/public', express.static(path.join(__dirname, 'public')));

// Ensure dirs exist
const reportsDir = path.join(__dirname, 'reports');
const leadsFile = path.join(__dirname, 'leads', 'leads.json');
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
if (!fs.existsSync(path.dirname(leadsFile))) fs.mkdirSync(path.dirname(leadsFile), { recursive: true });
if (!fs.existsSync(leadsFile)) fs.writeFileSync(leadsFile, '[]');

// Initialize all systems
reportController.init({ supabaseClient: supabase, reportsDirectory: reportsDir, leadsFilePath: leadsFile });
apiController.init({ supabaseClient: supabase });
scheduler.init({ supabaseClient: supabase, controller: reportController });

function getClientRuntimeConfigScript() {
  const url = JSON.stringify(process.env.SIGNAL_LABS_SUPABASE_URL || process.env.SUPABASE_URL || '');
  const anonKey = JSON.stringify(process.env.SIGNAL_LABS_SUPABASE_ANON_KEY || '');
  return `window.__SIGNAL_LABS_SUPABASE_URL__ = ${url}; window.__SIGNAL_LABS_SUPABASE_ANON_KEY__ = ${anonKey};`;
}

function sendHtmlWithRuntimeConfig(res, filePath) {
  let html = fs.readFileSync(filePath, 'utf-8');
  html = html.replace('</head>', `  <script>${getClientRuntimeConfigScript()}</script>\n</head>`);
  res.type('html').send(html);
}

// ═══════════════════════════════════════════
// ROUTES — Pages
// ═══════════════════════════════════════════
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/auth', (req, res) => sendHtmlWithRuntimeConfig(res, path.join(__dirname, 'public', 'auth.html')));
app.get(['/app', '/dashboard', '/account', '/plans'], (req, res) => sendHtmlWithRuntimeConfig(res, path.join(__dirname, 'public', 'app.html')));

// Health check (enriched with engine status)
app.get('/health', (req, res) => res.json({
  status: 'ok',
  version: '2.0.0',
  timestamp: new Date().toISOString(),
  engine: 'modular-v2-aaa',
  sources: require('./lib/core/DataSourceRegistry').getRegistered(),
  modules: require('./lib/core/ReportEngine').getModules()
}));

// ═══════════════════════════════════════════
// ROUTES — Report Viewer
// ═══════════════════════════════════════════
app.get('/report/:token', (req, res) => {
  const templatePath = path.join(__dirname, 'templates', 'web-report.html');
  if (!fs.existsSync(templatePath)) return res.status(404).send('Report template not found');
  res.sendFile(templatePath);
});

app.get('/api/report-data/:token', async (req, res) => {
  const token = req.params.token.replace(/[^a-zA-Z0-9_-]/g, '');
  const data = await reportController.loadReport(token);
  if (!data) return res.status(404).json({ error: 'Report not found or expired' });
  res.json(data);
});

// ═══════════════════════════════════════════
// ROUTES — Export (public, token-based)
// ═══════════════════════════════════════════
app.get('/report/:token/export/:format', async (req, res) => {
  const token = req.params.token.replace(/[^a-zA-Z0-9_-]/g, '');
  const format = req.params.format.toLowerCase();
  const data = await reportController.loadReport(token);
  if (!data) return res.status(404).json({ error: 'Report not found' });

  try {
    switch (format) {
      case 'pptx': {
        const buffer = await buildPPTX(data);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
        res.setHeader('Content-Disposition', `attachment; filename="SignalLabs-${data.meta.industry}-Report.pptx"`);
        return res.send(Buffer.from(buffer));
      }
      case 'xlsx': {
        const buffer = await buildXLSX(data);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="SignalLabs-${data.meta.industry}-Data.xlsx"`);
        return res.send(Buffer.from(buffer));
      }
      case 'pdf': {
        const pdfPath = await buildPDF({
          reportData: data.report, industry: data.meta.industry,
          company: data.meta.company, country: data.meta.country, userContext: data.meta
        });
        return res.download(pdfPath);
      }
      default:
        return res.status(400).json({ error: `Unsupported format: ${format}. Use pptx, xlsx, or pdf.` });
    }
  } catch (err) {
    console.error(`[export] ${format} failed:`, err.message);
    res.status(500).json({ error: `Export failed: ${err.message}` });
  }
});

// ═══════════════════════════════════════════
// ROUTES — Seed (admin)
// ═══════════════════════════════════════════
app.post('/api/seed', async (req, res) => {
  const { token, data, secret } = req.body;
  if (secret !== (process.env.SEED_SECRET || 'signallabs2026')) return res.status(403).json({ error: 'Forbidden' });
  if (!token || !data) return res.status(400).json({ error: 'Missing token or data' });
  await reportController.saveReport(token, data);
  console.log(`[seed] Report seeded: ${token}`);
  res.json({ ok: true, url: `/report/${token}` });
});

// ═══════════════════════════════════════════
// ROUTES — Free Report Generation
// ═══════════════════════════════════════════
app.post('/api/report', async (req, res) => {
  const { email, industry, company, country, stage, team, pains, decision, competitorsList, advantage } = req.body;

  if (!email || !industry) return res.status(400).json({ error: 'Email and industry are required' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email address' });

  console.log(`[server] Report request: ${email} | ${industry} | ${country || 'N/A'}`);

  const requestId = crypto.randomUUID();
  const payload = { email, industry, company, country, stage, team, pains, decision, competitorsList, advantage };

  if (supabase) {
    const { error: queueError } = await supabase.from('report_requests').insert({
      id: requestId, email, status: 'processing', started_at: new Date().toISOString(), payload
    });
    if (queueError) console.error('[server] Queue insert error:', queueError.message);
  }

  setTimeout(async () => {
    try {
      await reportController.processReport({ ...payload, requestId });
    } catch (err) {
      console.error('[server] Background report processing failed:', err && err.stack ? err.stack : err);
      if (supabase) {
        await supabase.from('report_requests').update({
          status: 'failed', error_message: String(err.message || err), completed_at: new Date().toISOString()
        }).eq('id', requestId);
      }
    }
  }, 0);

  return res.json({ success: true, message: 'Report started. Check your inbox in a few minutes.', requestId });
});

// ═══════════════════════════════════════════
// API v1 (programmatic access, key-authenticated)
// ═══════════════════════════════════════════
app.use('/api/v1', apiController.router);

// ═══════════════════════════════════════════
// START
// ═══════════════════════════════════════════
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Signal Labs v2 AAA (modular engine) running on http://localhost:${PORT}`);
  console.log(`  Sources: ${require('./lib/core/DataSourceRegistry').getRegistered().length}`);
  console.log(`  Modules: ${require('./lib/core/ReportEngine').getModules().length}`);
  console.log(`  Exports: PDF, PPTX, XLSX`);
  console.log(`  API v1:  /api/v1/reports`);

  // Start scheduler (check every 60s for due reports)
  scheduler.start(60000);
});
