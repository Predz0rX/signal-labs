require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { fetchNews } = require('./lib/fetchNews');
const { fetchBLS } = require('./lib/fetchBLS');
const { fetchTrends } = require('./lib/fetchTrends');
const { generateReport } = require('./lib/generateReport');
const { Resend } = require('resend');

const input = JSON.parse(process.argv[2] || '{}');
const { email, industry, company, country, stage, team, pains, decision, competitorsList, advantage } = input;

const reportsDir = path.join(__dirname, 'reports');
const leadsFile = path.join(__dirname, 'leads', 'leads.json');
if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
if (!fs.existsSync(path.dirname(leadsFile))) fs.mkdirSync(path.dirname(leadsFile), { recursive: true });
if (!fs.existsSync(leadsFile)) fs.writeFileSync(leadsFile, '[]');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

async function saveReportPersistent(token, reportPayload) {
  const content = JSON.stringify(reportPayload, null, 2);
  fs.writeFileSync(path.join(reportsDir, `report-${token}.json`), content);
  if (!supabase) return;
  const { error } = await supabase.from('reports').upsert({
    token,
    email: reportPayload?.meta?.email || null,
    payload: reportPayload
  });
  if (error) throw new Error(`Supabase save failed: ${error.message}`);
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

async function sendEmailMagicLink({ to, industry, company, reportUrl }) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: process.env.FROM_EMAIL || 'onboarding@resend.dev',
    to: [to],
    subject: `Your ${industry} Market Snapshot is ready`,
    html: `<div style="font-family:'DM Sans',-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:32px 20px;color:#111"><div style="margin-bottom:24px"><span style="font-size:20px;font-weight:800;color:#0A0A0A">signal<span style="color:#0071E3">labs</span></span></div><h2 style="font-size:22px;font-weight:800;color:#0A0A0A;margin:0 0 10px;letter-spacing:-.5px">Your Market Snapshot is ready</h2><p style="font-size:15px;color:#6B7280;line-height:1.65;margin:0 0 28px">${company ? `Hi from ${company},` : 'Hi,'}<br><br>Your <strong>${industry}</strong> Market Intelligence Report is ready to view. Click below to open your personalized report with real-time charts, competitor analysis, and actionable insights.</p><a href="${reportUrl}" style="display:inline-block;padding:14px 28px;background:#0071E3;color:#fff;font-size:15px;font-weight:700;border-radius:10px;text-decoration:none">Open my report &rarr;</a><p style="font-size:12px;color:#9CA3AF;margin-top:20px;line-height:1.6">Or copy this link: <a href="${reportUrl}" style="color:#0071E3">${reportUrl}</a><br>This link is unique to you. Do not share it publicly.</p></div>`
  });
  if (error) throw new Error(`Resend error: ${JSON.stringify(error)}`);
}

(async () => {
  try {
    const userContext = {
      industry, country: country || 'United States',
      stage: stage || 'unknown', teamSize: team || 'unknown',
      pains: pains || [], bigDecision: decision || '',
      namedCompetitors: competitorsList || '', competitiveAdvantage: advantage || 'unknown'
    };

    const [newsData, blsData, trendsData] = await Promise.all([
      fetchNews(industry), fetchBLS(industry), fetchTrends(industry)
    ]);

    userContext._trendsScore = trendsData.interestScore || 50;
    userContext._blsYoY = blsData.yearOverYearChange || 'N/A';
    userContext._newsCount = newsData.length;

    const reportData = await generateReport({ industry, company, country, userContext, newsData, blsData, trendsData });
    const token = crypto.randomBytes(16).toString('hex');
    const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
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
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const reportUrl = `${baseUrl}/report/${token}`;
    await sendEmailMagicLink({ to: email, industry, company, reportUrl });

    const leads = JSON.parse(fs.readFileSync(leadsFile, 'utf-8'));
    leads.push({
      id: `lead_${Date.now()}`, email, company: company || '', timestamp: new Date().toISOString(), industry,
      country: country || '', stage: stage || '', teamSize: team || '', pains: pains || [],
      bigDecision: decision || '', namedCompetitors: competitorsList || '', competitiveAdvantage: advantage || '',
      reportToken: token, reportUrl, followUpSequence: determineSequence(userContext), status: 'report_sent', tags: buildTags(userContext)
    });
    fs.writeFileSync(leadsFile, JSON.stringify(leads, null, 2));
    console.log(`[worker] Report saved + emailed: ${token} -> ${email}`);
  } catch (err) {
    console.error('[worker] Fatal:', err && err.stack ? err.stack : err);
    process.exitCode = 1;
  }
})();
