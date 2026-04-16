const express = require('express');
const crypto = require('crypto');
const reportController = require('./reportController');
const { buildPPTX } = require('../exporters/pptx');
const { buildXLSX } = require('../exporters/xlsx');
const { buildPDF } = require('../exporters/pdf');

const router = express.Router();

let supabase = null;

function init({ supabaseClient }) {
  supabase = supabaseClient;
}

// ── API Key Auth Middleware ──
async function authenticate(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  if (!apiKey) return res.status(401).json({ error: 'Missing API key. Include X-API-Key header.' });

  if (!supabase) return res.status(503).json({ error: 'Database not configured' });

  const { data, error } = await supabase
    .from('api_keys')
    .select('*')
    .eq('key', apiKey)
    .eq('active', true)
    .single();

  if (error || !data) return res.status(403).json({ error: 'Invalid or inactive API key' });

  req.apiUser = data;
  next();
}

// ── POST /api/v1/reports — Create a report programmatically ──
router.post('/reports', authenticate, async (req, res) => {
  const { email, industry, company, country, stage, team, pains, decision, competitorsList, advantage, tier } = req.body;

  if (!email || !industry) return res.status(400).json({ error: 'email and industry are required' });

  try {
    const result = await reportController.processReport({
      email, industry, company, country, stage, team, pains, decision, competitorsList, advantage,
      tier: tier || req.apiUser.tier || 'free'
    });
    res.json({ success: true, token: result.token, reportUrl: result.reportUrl });
  } catch (err) {
    console.error('[api/v1] Report generation failed:', err.message);
    res.status(500).json({ error: 'Report generation failed', detail: err.message });
  }
});

// ── GET /api/v1/reports — List reports for the API key holder ──
router.get('/reports', authenticate, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Database not configured' });

  const { data, error } = await supabase
    .from('reports')
    .select('token, email, payload->meta->industry, payload->meta->company, payload->meta->date, payload->meta->createdAt')
    .eq('email', req.apiUser.email)
    .order('created_at', { ascending: false })
    .limit(parseInt(req.query.limit) || 20);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ reports: data || [] });
});

// ── GET /api/v1/reports/:token — Get report JSON ──
router.get('/reports/:token', authenticate, async (req, res) => {
  const token = req.params.token.replace(/[^a-zA-Z0-9_-]/g, '');
  const data = await reportController.loadReport(token);
  if (!data) return res.status(404).json({ error: 'Report not found' });
  res.json(data);
});

// ── GET /api/v1/reports/:token/export/:format — Export report ──
router.get('/reports/:token/export/:format', authenticate, async (req, res) => {
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
          reportData: data.report,
          industry: data.meta.industry,
          company: data.meta.company,
          country: data.meta.country,
          userContext: data.meta
        });
        return res.download(pdfPath);
      }
      default:
        return res.status(400).json({ error: `Unsupported format: ${format}. Use pptx, xlsx, or pdf.` });
    }
  } catch (err) {
    console.error(`[api/v1] Export ${format} failed:`, err.message);
    res.status(500).json({ error: `Export failed: ${err.message}` });
  }
});

// ── POST /api/v1/webhooks — Register a webhook ──
router.post('/webhooks', authenticate, async (req, res) => {
  const { url, event } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });

  if (!supabase) return res.status(503).json({ error: 'Database not configured' });

  const { data, error } = await supabase.from('webhooks').insert({
    id: crypto.randomUUID(),
    api_key_id: req.apiUser.id,
    url,
    event: event || 'report.completed',
    active: true,
    created_at: new Date().toISOString()
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ webhook: data });
});

// ── GET /api/v1/webhooks — List webhooks ──
router.get('/webhooks', authenticate, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Database not configured' });

  const { data, error } = await supabase
    .from('webhooks')
    .select('*')
    .eq('api_key_id', req.apiUser.id)
    .eq('active', true);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ webhooks: data || [] });
});

// ── DELETE /api/v1/webhooks/:id — Delete a webhook ──
router.delete('/webhooks/:id', authenticate, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Database not configured' });

  const { error } = await supabase
    .from('webhooks')
    .update({ active: false })
    .eq('id', req.params.id)
    .eq('api_key_id', req.apiUser.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = { router, init };
