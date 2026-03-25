require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const { fetchNews } = require('./lib/fetchNews');
const { fetchBLS } = require('./lib/fetchBLS');
const { fetchTrends } = require('./lib/fetchTrends');
const { generateReport } = require('./lib/generateReport');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Ensure dirs exist
const reportsDir = path.join(__dirname, 'reports');
const leadsFile = path.join(__dirname, 'leads', 'leads.json');
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

async function saveReportPersistent(token, reportPayload) {
  const content = JSON.stringify(reportPayload, null, 2);
  fs.writeFileSync(path.join(reportsDir, `report-${token}.json`), content);
  if (!supabase) return { mode: 'local' };
  const { error } = await supabase.from('reports').upsert({
    token,
    email: reportPayload?.meta?.email || null,
    payload: reportPayload
  });
  if (error) throw new Error(`Supabase save failed: ${error.message}`);
  return { mode: 'supabase' };
}

async function loadReportPersistent(token) {
  const localPath = path.join(reportsDir, `report-${token}.json`);
  if (fs.existsSync(localPath)) return JSON.parse(fs.readFileSync(localPath, 'utf-8'));
  if (!supabase) return null;
  const { data, error } = await supabase.from('reports').select('payload').eq('token', token).single();
  if (error || !data) return null;
  return data.payload;
}

// Serve landing page
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ── WEB REPORT VIEWER ──
app.get('/report/:token', (req, res) => {
  const templatePath = path.join(__dirname, 'templates', 'web-report.html');
  if (!fs.existsSync(templatePath)) return res.status(404).send('Report template not found');
  res.sendFile(templatePath);
});

// ── REPORT DATA API ──
app.get('/api/report-data/:token', async (req, res) => {
  const token = req.params.token.replace(/[^a-zA-Z0-9_-]/g, '');
  const data = await loadReportPersistent(token);
  if (!data) {
    return res.status(404).json({ error: 'Report not found or expired' });
  }
  res.json(data);
});

// ── SEED REPORT (for uploading generated reports to server) ──
app.post('/api/seed', async (req, res) => {
  const { token, data, secret } = req.body;
  if (secret !== (process.env.SEED_SECRET || 'signallabs2026')) return res.status(403).json({ error: 'Forbidden' });
  if (!token || !data) return res.status(400).json({ error: 'Missing token or data' });
  await saveReportPersistent(token, data);
  console.log(`[seed] Report seeded: ${token}`);
  res.json({ ok: true, url: `/report/${token}` });
});

// ── FREE REPORT ENDPOINT ──
app.post('/api/report', async (req, res) => {
  const { email, industry, company, country, stage, team, pains, decision, competitorsList, advantage } = req.body;

  if (!email || !industry) return res.status(400).json({ error: 'Email and industry are required' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email address' });

  console.log(`[server] Report request: ${email} | ${industry} | ${country || 'N/A'}`);

  const userContext = {
    industry, country: country || 'United States',
    stage: stage || 'unknown', teamSize: team || 'unknown',
    pains: pains || [], bigDecision: decision || '',
    namedCompetitors: competitorsList || '', competitiveAdvantage: advantage || 'unknown'
  };

  // Respond immediately — process in background to avoid Render's 30s timeout
  res.json({ success: true, message: 'Report on the way! Check your inbox in about 5 minutes.' });

  // Process async (fire and forget)
  setImmediate(async () => {
  try {
    // 1. Fetch data in parallel
    const [newsData, blsData, trendsData] = await Promise.all([
      fetchNews(industry), fetchBLS(industry), fetchTrends(industry)
    ]);

    userContext._trendsScore = trendsData.interestScore || 50;
    userContext._blsYoY = blsData.yearOverYearChange || 'N/A';
    userContext._newsCount = newsData.length;

    // 2. Generate report with AI
    const reportData = await generateReport({ industry, company, country, userContext, newsData, blsData, trendsData });

    // 3. Generate unique token
    const token = crypto.randomBytes(16).toString('hex');
    const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    // 4. Save report JSON
    const reportPayload = {
      report: reportData,
      meta: {
        token, email, industry, company: company || '',
        country: country || 'United States', date,
        stage: stage || '', teamSize: team || '',
        pains: pains || [], bigDecision: decision || '',
        blsYoY: blsData.yearOverYearChange || 'N/A',
        trendsScore: trendsData.interestScore || 50,
        newsCount: newsData.length,
        createdAt: new Date().toISOString(),
        viewed: false, viewedAt: null
      }
    };
    await saveReportPersistent(token, reportPayload);

    // 5. Build report URL
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const reportUrl = `${baseUrl}/report/${token}`;

    // 6. Send email with magic link (no PDF attachment)
    await sendEmailMagicLink({ to: email, industry, company, reportUrl });

    // 7. Save lead
    const leads = JSON.parse(fs.readFileSync(leadsFile, 'utf-8'));
    const sequence = determineSequence(userContext);
    leads.push({
      id: `lead_${Date.now()}`, email, company: company || '',
      timestamp: new Date().toISOString(), industry,
      country: country || '', stage: stage || '', teamSize: team || '',
      pains: pains || [], bigDecision: decision || '',
      namedCompetitors: competitorsList || '', competitiveAdvantage: advantage || '',
      reportToken: token, reportUrl,
      followUpSequence: sequence, status: 'report_sent',
      tags: buildTags(userContext)
    });
    fs.writeFileSync(leadsFile, JSON.stringify(leads, null, 2));

    console.log(`[server] Report saved: ${token} | Email sent to ${email}`);

  } catch (err) {
    console.error('[server] Background report error:', err.message);
  }
  }); // end setImmediate
});

// ── EMAIL WITH MAGIC LINK ──
async function sendEmailMagicLink({ to, industry, company, reportUrl }) {
  const { Resend } = require('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send({
    from: process.env.FROM_EMAIL || 'onboarding@resend.dev',
    to: [to],
    subject: `Your ${industry} Market Snapshot is ready`,
    html: `
      <div style="font-family:'DM Sans',-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:32px 20px;color:#111">
        <div style="margin-bottom:24px">
          <span style="font-size:20px;font-weight:800;color:#0A0A0A">signal<span style="color:#0071E3">labs</span></span>
        </div>
        <h2 style="font-size:22px;font-weight:800;color:#0A0A0A;margin:0 0 10px;letter-spacing:-.5px">Your Market Snapshot is ready</h2>
        <p style="font-size:15px;color:#6B7280;line-height:1.65;margin:0 0 28px">
          ${company ? `Hi from ${company},` : 'Hi,'}<br><br>
          Your <strong>${industry}</strong> Market Intelligence Report is ready to view. Click below to open your personalized report with real-time charts, competitor analysis, and actionable insights.
        </p>
        <a href="${reportUrl}" style="display:inline-block;padding:14px 28px;background:#0071E3;color:#fff;font-size:15px;font-weight:700;border-radius:10px;text-decoration:none">
          Open my report &rarr;
        </a>
        <p style="font-size:12px;color:#9CA3AF;margin-top:20px;line-height:1.6">
          Or copy this link: <a href="${reportUrl}" style="color:#0071E3">${reportUrl}</a><br>
          This link is unique to you. Do not share it publicly.
        </p>
        <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0">
        <p style="font-size:11px;color:#9CA3AF">
          Signal Labs &middot; AI-powered market intelligence<br>
          <a href="https://signal-labs-omega.vercel.app" style="color:#9CA3AF">signal-labs-omega.vercel.app</a>
        </p>
      </div>`
  });
  if (error) throw new Error(`Resend error: ${JSON.stringify(error)}`);
  return data;
}

function determineSequence(ctx) {
  if ((ctx.pains||[]).includes('investors') || ['growth','established'].includes(ctx.stage)) return 'sequence_pro_pitch';
  if (!['United States','US'].includes(ctx.country)) return 'sequence_latam_intel';
  if ((ctx.pains||[]).includes('competitors') || (ctx.pains||[]).includes('market-growth')) return 'sequence_intel_pitch';
  if ((ctx.pains||[]).includes('leads') || (ctx.pains||[]).includes('growth')) return 'sequence_pulse_upsell';
  return 'sequence_general';
}

function buildTags(ctx) {
  const tags = [];
  if (!['United States','US',''].includes(ctx.country||'')) tags.push('latam');
  if (['growth','established'].includes(ctx.stage)) tags.push('high-value');
  if ((ctx.pains||[]).includes('investors')) tags.push('fundraising');
  if ((ctx.pains||[]).includes('expansion')) tags.push('expansion');
  if (ctx.namedCompetitors) tags.push('competitor-aware');
  if (ctx.stage) tags.push(`stage-${ctx.stage}`);
  tags.push(`industry-${(ctx.industry||'').toLowerCase().replace(/[^a-z0-9]/g,'-')}`);
  return tags;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Signal Labs running on http://localhost:${PORT}`));
