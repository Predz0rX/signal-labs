const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Core engine
const CacheManager = require('../core/CacheManager');
const DataSourceRegistry = require('../core/DataSourceRegistry');
const ReportEngine = require('../core/ReportEngine');

// Data sources — Original
const newsapiSource = require('../sources/newsapi');
const blsSource = require('../sources/bls');
const googleTrendsSource = require('../sources/google-trends');
// Data sources — Phase 2 (real data expansion)
const fredSource = require('../sources/fred');
const secEdgarSource = require('../sources/sec-edgar');
const alphaVantageSource = require('../sources/alpha-vantage');
const worldBankSource = require('../sources/world-bank');
const redditSource = require('../sources/reddit');
const hackernewsSource = require('../sources/hackernews');
const openAlexSource = require('../sources/open-alex');
const oecdSource = require('../sources/oecd');

// Report modules — Original (Phase 1)
const marketScoreModule = require('../modules/market-score');
const marketSizingModule = require('../modules/market-sizing');
const trendAnalysisModule = require('../modules/trend-analysis');
const competitiveLandscapeModule = require('../modules/competitive-landscape');
const signalsRadarModule = require('../modules/signals-radar');
const quickWinsModule = require('../modules/quick-wins');
const opportunityModule = require('../modules/opportunity');
const executiveSummaryModule = require('../modules/executive-summary');
// Report modules — Phase 3 (premium AAA)
const riskAssessmentModule = require('../modules/risk-assessment');
const financialHealthModule = require('../modules/financial-health');
const marketOpportunityRadarModule = require('../modules/market-opportunity-radar');
const customerIntelligenceModule = require('../modules/customer-intelligence');
const growthPlaybookModule = require('../modules/growth-playbook');
const investmentReadinessModule = require('../modules/investment-readiness');
const marketingIntelModule = require('../modules/marketing-intel');
const techStackAnalysisModule = require('../modules/tech-stack-analysis');

let supabase = null;
let reportsDir = '';
let leadsFile = '';

/**
 * Initialize the report controller with required dependencies.
 */
function init({ supabaseClient, reportsDirectory, leadsFilePath }) {
  supabase = supabaseClient;
  reportsDir = reportsDirectory;
  leadsFile = leadsFilePath;

  // Initialize cache with Supabase
  CacheManager.init(supabaseClient);

  // Register all data sources — Original
  DataSourceRegistry.register(newsapiSource);
  DataSourceRegistry.register(blsSource);
  DataSourceRegistry.register(googleTrendsSource);
  // Register Phase 2 sources (real data expansion)
  DataSourceRegistry.register(fredSource);
  DataSourceRegistry.register(secEdgarSource);
  DataSourceRegistry.register(alphaVantageSource);
  DataSourceRegistry.register(worldBankSource);
  DataSourceRegistry.register(redditSource);
  DataSourceRegistry.register(hackernewsSource);
  DataSourceRegistry.register(openAlexSource);
  DataSourceRegistry.register(oecdSource);

  // Register all report modules — Original
  ReportEngine.registerModule(marketScoreModule);
  ReportEngine.registerModule(marketSizingModule);
  ReportEngine.registerModule(trendAnalysisModule);
  ReportEngine.registerModule(competitiveLandscapeModule);
  ReportEngine.registerModule(signalsRadarModule);
  ReportEngine.registerModule(quickWinsModule);
  ReportEngine.registerModule(opportunityModule);
  ReportEngine.registerModule(executiveSummaryModule);
  // Register Phase 3 modules (premium AAA)
  ReportEngine.registerModule(riskAssessmentModule);
  ReportEngine.registerModule(financialHealthModule);
  ReportEngine.registerModule(marketOpportunityRadarModule);
  ReportEngine.registerModule(customerIntelligenceModule);
  ReportEngine.registerModule(growthPlaybookModule);
  ReportEngine.registerModule(investmentReadinessModule);
  ReportEngine.registerModule(marketingIntelModule);
  ReportEngine.registerModule(techStackAnalysisModule);

  console.log(`[ReportController] Initialized with ${DataSourceRegistry.getRegistered().length} sources, ${ReportEngine.getModules().length} modules`);
}

/**
 * Save report to local filesystem + Supabase.
 */
async function saveReport(token, reportPayload) {
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

/**
 * Load a report from local or Supabase.
 */
async function loadReport(token) {
  const localPath = path.join(reportsDir, `report-${token}.json`);
  if (fs.existsSync(localPath)) return JSON.parse(fs.readFileSync(localPath, 'utf-8'));
  if (!supabase) return null;
  const { data, error } = await supabase.from('reports').select('payload').eq('token', token).single();
  if (error || !data) return null;
  return data.payload;
}

/**
 * Process a full report request using the modular engine.
 */
async function processReport({ email, industry, company, country, stage, team, pains, decision, competitorsList, advantage, requestId = null, tier = 'free' }) {
  const userContext = {
    industry,
    company: company || '',
    country: country || 'United States',
    stage: stage || 'unknown',
    teamSize: team || 'unknown',
    pains: pains || [],
    bigDecision: decision || '',
    namedCompetitors: competitorsList || '',
    competitiveAdvantage: advantage || 'unknown'
  };

  console.log(`[ReportController] Generating ${tier} report for ${email} | ${industry}`);

  // Use the modular engine
  const { report, meta, token } = await ReportEngine.generateReport({
    email,
    industry,
    company,
    country,
    userContext,
    tier
  });

  const reportPayload = { report, meta };
  await saveReport(token, reportPayload);

  // Send email (optional — skip gracefully if RESEND_API_KEY not configured)
  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  const reportUrl = `${baseUrl}/report/${token}`;
  if (process.env.RESEND_API_KEY) {
    try {
      await sendEmailMagicLink({ to: email, industry, company, reportUrl });
    } catch (emailErr) {
      console.error('[ReportController] Email delivery failed (continuing):', emailErr.message);
    }
  } else {
    console.log('[ReportController] RESEND_API_KEY not set — skipping email delivery');
  }

  // Save lead
  saveLead({ email, company, industry, country, stage, team, pains, decision, competitorsList, advantage, token, reportUrl, userContext });

  // Update queue status
  if (supabase && requestId) {
    await supabase.from('report_requests').update({
      status: 'done',
      report_token: token,
      completed_at: new Date().toISOString()
    }).eq('id', requestId);
  }

  console.log(`[ReportController] Report completed: ${token} -> ${email}`);
  return { token, reportUrl };
}

/**
 * Send email with magic link.
 */
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

// Lead management helpers
function determineSequence(ctx) {
  if ((ctx.pains || []).includes('investors') || ['growth', 'established'].includes(ctx.stage)) return 'sequence_pro_pitch';
  if (!['United States', 'US'].includes(ctx.country)) return 'sequence_latam_intel';
  if ((ctx.pains || []).includes('competitors') || (ctx.pains || []).includes('market-growth')) return 'sequence_intel_pitch';
  if ((ctx.pains || []).includes('leads') || (ctx.pains || []).includes('growth')) return 'sequence_pulse_upsell';
  return 'sequence_general';
}

function buildTags(ctx) {
  const tags = [];
  if (!['United States', 'US', ''].includes(ctx.country || '')) tags.push('latam');
  if (['growth', 'established'].includes(ctx.stage)) tags.push('high-value');
  if ((ctx.pains || []).includes('investors')) tags.push('fundraising');
  if ((ctx.pains || []).includes('expansion')) tags.push('expansion');
  if (ctx.namedCompetitors) tags.push('competitor-aware');
  if (ctx.stage) tags.push(`stage-${ctx.stage}`);
  tags.push(`industry-${(ctx.industry || '').toLowerCase().replace(/[^a-z0-9]/g, '-')}`);
  return tags;
}

function saveLead({ email, company, industry, country, stage, team, pains, decision, competitorsList, advantage, token, reportUrl, userContext }) {
  try {
    if (!fs.existsSync(path.dirname(leadsFile))) fs.mkdirSync(path.dirname(leadsFile), { recursive: true });
    if (!fs.existsSync(leadsFile)) fs.writeFileSync(leadsFile, '[]');
    const leads = JSON.parse(fs.readFileSync(leadsFile, 'utf-8'));
    leads.push({
      id: `lead_${Date.now()}`,
      email,
      company: company || '',
      timestamp: new Date().toISOString(),
      industry,
      country: country || '',
      stage: stage || '',
      teamSize: team || '',
      pains: pains || [],
      bigDecision: decision || '',
      namedCompetitors: competitorsList || '',
      competitiveAdvantage: advantage || '',
      reportToken: token,
      reportUrl,
      followUpSequence: determineSequence(userContext),
      status: 'report_sent',
      tags: buildTags(userContext)
    });
    fs.writeFileSync(leadsFile, JSON.stringify(leads, null, 2));
  } catch (err) {
    console.error('[ReportController] Lead save error:', err.message);
  }
}

module.exports = { init, processReport, saveReport, loadReport };
