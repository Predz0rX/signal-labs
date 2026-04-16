const crypto = require('crypto');
const DataSourceRegistry = require('./DataSourceRegistry');
const { aggregateConfidence } = require('./ConfidenceScorer');

const modules = {};

/**
 * Register a report module.
 * @param {object} mod — must have: id, name, tier, dataDependencies[], priority, generate(enrichedData, userContext)
 */
function registerModule(mod) {
  if (!mod.id || typeof mod.generate !== 'function') {
    throw new Error(`Invalid module: must have id and generate(). Got: ${mod.id || 'unknown'}`);
  }
  modules[mod.id] = mod;
}

/**
 * Generate a full report.
 * @param {object} params
 * @param {string} params.email
 * @param {string} params.industry
 * @param {string} params.company
 * @param {string} params.country
 * @param {object} params.userContext — stage, teamSize, pains, bigDecision, namedCompetitors, competitiveAdvantage
 * @param {string} [params.tier='free'] — 'free' or 'premium'
 * @returns {object} — { report, meta, sources, confidence }
 */
async function generateReport(params) {
  const { email, industry, company, country, userContext = {}, tier = 'free' } = params;

  // 1. Determine which modules to run based on tier
  const activeModules = Object.values(modules)
    .filter(m => tier === 'premium' || m.tier === 'free')
    .sort((a, b) => a.priority - b.priority);

  // 2. Collect all required data sources
  const requiredSources = new Set();
  for (const mod of activeModules) {
    for (const dep of (mod.dataDependencies || [])) {
      if (DataSourceRegistry.has(dep)) requiredSources.add(dep);
    }
  }

  // 3. Build the query from user context
  const query = {
    industry,
    company: company || '',
    country: country || userContext.country || 'United States',
    competitors: userContext.namedCompetitors || '',
    stage: userContext.stage || 'unknown',
    pains: userContext.pains || []
  };

  // 4. Fetch all data in parallel
  console.log(`[ReportEngine] Fetching from ${requiredSources.size} sources: ${[...requiredSources].join(', ')}`);
  const enrichedData = await DataSourceRegistry.fetchAll([...requiredSources], query);

  // 5. Run each module with the enriched data
  const reportSections = {};
  const allSources = [];
  const sectionConfidences = [];

  for (const mod of activeModules) {
    try {
      console.log(`[ReportEngine] Running module: ${mod.id}`);
      const result = await mod.generate(enrichedData, { ...userContext, industry, company, country });
      reportSections[mod.id] = result.data || result;
      if (result.sources) allSources.push(...result.sources);
      if (result.confidence !== undefined) sectionConfidences.push({ id: mod.id, confidence: result.confidence });
    } catch (err) {
      console.error(`[ReportEngine] Module ${mod.id} failed:`, err.message);
      reportSections[mod.id] = { error: err.message };
    }
  }

  // 6. Assemble the legacy-compatible report format
  const report = assembleLegacyFormat(reportSections);

  // 7. Build metadata
  const token = crypto.randomBytes(16).toString('hex');
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const meta = {
    token,
    email,
    industry,
    company: company || '',
    country: country || 'United States',
    date,
    stage: userContext.stage || '',
    teamSize: userContext.teamSize || '',
    pains: userContext.pains || [],
    bigDecision: userContext.bigDecision || '',
    blsYoY: enrichedData.bls?.value?.yearOverYearChange || 'N/A',
    trendsScore: enrichedData['google-trends']?.value?.interestScore || 50,
    newsCount: enrichedData.newsapi?.value?.length || 0,
    createdAt: new Date().toISOString(),
    viewed: false,
    viewedAt: null,
    // New AAA fields
    overallConfidence: aggregateConfidence(sectionConfidences.map(s => ({ confidence: s.confidence }))),
    sourcesUsed: [...new Set(allSources)],
    modulesRun: activeModules.map(m => m.id),
    tier
  };

  return { report, meta, token };
}

/**
 * Assemble the legacy flat report format for backward compatibility with existing templates.
 * Maps modular section outputs to the flat key structure expected by web-report.html and report.html.
 */
function assembleLegacyFormat(sections) {
  const ms = sections['market-score'] || {};
  const mz = sections['market-sizing'] || {};
  const ta = sections['trend-analysis'] || {};
  const cl = sections['competitive-landscape'] || {};
  const sr = sections['signals-radar'] || {};
  const qw = sections['quick-wins'] || {};
  const op = sections['opportunity'] || {};
  const es = sections['executive-summary'] || {};

  return {
    marketScore: ms.marketScore || 65,
    marketScoreRationale: ms.marketScoreRationale || '',
    marketSize: mz.marketSize || 'N/A',
    tam: mz.tam || 'Data unavailable',
    sam: mz.sam || 'Data unavailable',
    som: mz.som || 'Data unavailable',
    trend1: ta.trends?.[0] || ta.trend1 || { title: '', insight: '', dataPoint: '', actionForThem: '' },
    trend2: ta.trends?.[1] || ta.trend2 || { title: '', insight: '', dataPoint: '', actionForThem: '' },
    trend3: ta.trends?.[2] || ta.trend3 || { title: '', insight: '', dataPoint: '', actionForThem: '' },
    signal1: sr.signals?.[0] || sr.signal1 || { headline: '', source: '', implication: '' },
    signal2: sr.signals?.[1] || sr.signal2 || { headline: '', source: '', implication: '' },
    competitors: cl.competitors || [],
    quickWins: qw.quickWins || [],
    opportunity: op.opportunity || { title: '', description: '', urgency: 'High', nextStep: '' },
    teaserCompetitors: cl.teaserCompetitors || '',
    teaserFinancials: ms.teaserFinancials || '',
    teaserLeads: es.teaserLeads || '',

    // ── AAA Premium Sections (Phase 3) ──
    executiveBrief: es.executiveBrief || '',
    keyMetrics: es.keyMetrics || [],
    bottomLine: es.bottomLine || '',

    // Risk Assessment
    riskAssessment: sections['risk-assessment'] || null,

    // Financial Health Dashboard
    financialHealth: sections['financial-health'] || null,

    // Market Opportunity Radar
    opportunityRadar: sections['market-opportunity-radar'] || null,

    // Customer Intelligence
    customerIntelligence: sections['customer-intelligence'] || null,

    // Growth Playbook
    growthPlaybook: sections['growth-playbook'] || null,

    // Investment Readiness
    investmentReadiness: sections['investment-readiness'] || null,

    // Marketing Intelligence
    marketingIntel: sections['marketing-intel'] || null,

    // Tech Stack Analysis
    techStackAnalysis: sections['tech-stack-analysis'] || null,

    // Full sections map for custom templates
    _sections: sections
  };
}

/**
 * Get all registered module IDs.
 */
function getModules() {
  return Object.keys(modules);
}

module.exports = { registerModule, generateReport, getModules };
