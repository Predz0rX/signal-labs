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

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing Supabase env vars');
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const resend = new Resend(process.env.RESEND_API_KEY);

const reportsDir = path.join(__dirname, 'reports');
if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

async function saveReportPersistent(token, reportPayload) {
  fs.writeFileSync(path.join(reportsDir, `report-${token}.json`), JSON.stringify(reportPayload, null, 2));
  const { error } = await supabase.from('reports').upsert({ token, email: reportPayload.meta.email, payload: reportPayload });
  if (error) throw error;
}

async function sendEmailMagicLink({ to, industry, company, reportUrl }) {
  const { error } = await resend.emails.send({
    from: process.env.FROM_EMAIL || 'reports@studio58vision.com',
    to: [to],
    subject: `Your ${industry} Market Snapshot is ready`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px"><h2>Your Market Snapshot is ready</h2><p>${company ? `Hi from ${company},` : 'Hi,'}<br><br>Your <strong>${industry}</strong> report is ready.</p><p><a href="${reportUrl}" style="display:inline-block;padding:12px 20px;background:#0071E3;color:#fff;text-decoration:none;border-radius:8px">Open my report</a></p><p>${reportUrl}</p></div>`
  });
  if (error) throw new Error(JSON.stringify(error));
}

async function processOne(job) {
  const payload = job.payload || {};
  const { email, industry, company, country, stage, team, pains, decision, competitorsList, advantage } = payload;
  const userContext = {
    industry, country: country || 'United States', stage: stage || 'unknown', teamSize: team || 'unknown',
    pains: pains || [], bigDecision: decision || '', namedCompetitors: competitorsList || '', competitiveAdvantage: advantage || 'unknown'
  };
  const [newsData, blsData, trendsData] = await Promise.all([
    fetchNews(industry), fetchBLS(industry), fetchTrends(industry)
  ]);
  userContext._trendsScore = trendsData.interestScore || 50;
  userContext._blsYoY = blsData.yearOverYearChange || 'N/A';
  userContext._newsCount = newsData.length;
  const reportData = await generateReport({ industry, company, country, userContext, newsData, blsData, trendsData });
  const token = crypto.randomBytes(16).toString('hex');
  const reportPayload = {
    report: reportData,
    meta: {
      token, email, industry, company: company || '', country: country || 'United States',
      date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      stage: stage || '', teamSize: team || '', pains: pains || [], bigDecision: decision || '',
      blsYoY: blsData.yearOverYearChange || 'N/A', trendsScore: trendsData.interestScore || 50, newsCount: newsData.length,
      createdAt: new Date().toISOString(), viewed: false, viewedAt: null
    }
  };
  await saveReportPersistent(token, reportPayload);
  const reportUrl = `${process.env.BASE_URL}/report/${token}`;
  await sendEmailMagicLink({ to: email, industry, company, reportUrl });
  await supabase.from('report_requests').update({ status: 'done', report_token: token, completed_at: new Date().toISOString() }).eq('id', job.id);
  console.log(`[local-worker] Done ${job.id} -> ${token}`);
}

async function tick() {
  const { data: jobs, error } = await supabase
    .from('report_requests')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) { console.error('[local-worker] read error', error.message); return; }
  if (!jobs || !jobs.length) return;
  const job = jobs[0];
  const { error: claimError } = await supabase.from('report_requests').update({ status: 'processing', started_at: new Date().toISOString() }).eq('id', job.id).eq('status', 'pending');
  if (claimError) { console.error('[local-worker] claim error', claimError.message); return; }
  try { await processOne(job); }
  catch (err) {
    console.error('[local-worker] fail', err && err.message ? err.message : err);
    await supabase.from('report_requests').update({ status: 'failed', error_message: String(err.message || err), completed_at: new Date().toISOString() }).eq('id', job.id);
  }
}

console.log('[local-worker] Started. Polling every 15s...');
setInterval(() => tick().catch(err => console.error(err)), 15000);
tick().catch(err => console.error(err));
