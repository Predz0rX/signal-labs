const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

function extractShort(str) {
  if (!str) return 'N/A';
  const match = str.match(/\$[\d.,]+[BMKbmk]?/);
  if (match) return match[0];
  const words = str.split(' ');
  return words.slice(0, 3).join(' ');
}

function stageLabel(stage) {
  const map = { idea: 'Pre-revenue', startup: 'Startup', growth: 'Growth Stage', established: 'Established' };
  return map[stage] || stage || 'Unknown';
}

async function buildPDF({ reportData, industry, company, country, userContext }) {
  const templatePath = path.join(__dirname, '../../templates/report.html');
  let html = fs.readFileSync(templatePath, 'utf-8');

  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const ctx = userContext || {};
  const comps = reportData.competitors || [];
  const qws = reportData.quickWins || [];

  const score = Number(reportData.marketScore) || 65;
  const gaugeArc = Math.round((score / 100) * 94.25);
  const scoreDescriptor = score >= 80 ? 'Highly attractive market' : score >= 60 ? 'Solid market opportunity' : score >= 40 ? 'Moderate opportunity' : 'Challenging market conditions';
  const trendsScore = Number(ctx._trendsScore || 50);
  const empYoY = ctx._blsYoY || '0%';
  const empNum = parseFloat(empYoY.replace('%', '').replace('+', '')) || 0;
  const empPct = Math.min(100, Math.max(5, 50 + empNum * 3));
  const newsCnt = Number(ctx._newsCount || 3);
  const newsPct = Math.min(100, newsCnt * 20);

  const replacements = {
    '{{industry}}': industry || 'Your Industry',
    '{{company}}': company || 'Your Business',
    '{{country}}': country || ctx.country || 'United States',
    '{{date}}': date,
    '{{stage}}': stageLabel(ctx.stage),
    '{{teamSize}}': ctx.teamSize || 'N/A',
    '{{marketScore}}': String(score),
    '{{gauge_dash}}': String(gaugeArc),
    '{{score_descriptor}}': scoreDescriptor,
    '{{score_pct}}': String(score),
    '{{marketScoreRationale}}': reportData.marketScoreRationale || '',
    '{{marketSize}}': reportData.marketSize || 'N/A',
    '{{tam}}': reportData.tam || 'Data unavailable',
    '{{tam_short}}': extractShort(reportData.tam),
    '{{tam_clean}}': (reportData.tam || '').replace(/[<>]/g, ''),
    '{{sam}}': reportData.sam || 'Data unavailable',
    '{{sam_short}}': extractShort(reportData.sam),
    '{{sam_clean}}': (reportData.sam || '').replace(/[<>]/g, ''),
    '{{som}}': reportData.som || 'Data unavailable',
    '{{som_short}}': extractShort(reportData.som),
    '{{som_clean}}': (reportData.som || '').replace(/[<>]/g, ''),
    '{{bigDecision}}': (ctx.bigDecision || 'grow the business').replace(/[<>]/g, ''),
    '{{pains_readable}}': (ctx.pains || []).join(', ').replace(/-/g, ' ') || 'general growth',
    '{{trend_context}}': score >= 70 ? 'strong upward momentum' : score >= 50 ? 'steady conditions' : 'a more cautious environment',
    '{{trend_y_end}}': String(Math.round(78 - (trendsScore * 0.58))),
    '{{trend_y_final}}': String(Math.round(78 - (trendsScore * 0.68))),
    '{{trend_label_y}}': String(Math.max(15, Math.round(78 - (trendsScore * 0.68)) - 6)),
    '{{trends_pct}}': String(trendsScore),
    '{{trends_score}}': String(trendsScore),
    '{{emp_pct}}': String(Math.round(empPct)),
    '{{blsYoY}}': empYoY,
    '{{news_pct}}': String(newsPct),
    '{{news_count}}': String(newsCnt),
    '{{trend1_title}}': reportData.trend1?.title || '',
    '{{trend1_insight}}': reportData.trend1?.insight || '',
    '{{trend1_dataPoint}}': reportData.trend1?.dataPoint || '',
    '{{trend1_actionForThem}}': reportData.trend1?.actionForThem || '',
    '{{trend2_title}}': reportData.trend2?.title || '',
    '{{trend2_insight}}': reportData.trend2?.insight || '',
    '{{trend2_dataPoint}}': reportData.trend2?.dataPoint || '',
    '{{trend2_actionForThem}}': reportData.trend2?.actionForThem || '',
    '{{trend3_title}}': reportData.trend3?.title || '',
    '{{trend3_insight}}': reportData.trend3?.insight || '',
    '{{trend3_dataPoint}}': reportData.trend3?.dataPoint || '',
    '{{trend3_actionForThem}}': reportData.trend3?.actionForThem || '',
    '{{signal1_headline}}': reportData.signal1?.headline || '',
    '{{signal1_source}}': reportData.signal1?.source || '',
    '{{signal1_implication}}': reportData.signal1?.implication || '',
    '{{signal2_headline}}': reportData.signal2?.headline || '',
    '{{signal2_source}}': reportData.signal2?.source || '',
    '{{signal2_implication}}': reportData.signal2?.implication || '',
    '{{comp1_name}}': comps[0]?.name || 'Competitor 1',
    '{{comp1_positioning}}': comps[0]?.positioning || '',
    '{{comp1_watchOut}}': comps[0]?.watchOut || '',
    '{{comp2_name}}': comps[1]?.name || 'Competitor 2',
    '{{comp2_positioning}}': comps[1]?.positioning || '',
    '{{comp2_watchOut}}': comps[1]?.watchOut || '',
    '{{comp3_name}}': comps[2]?.name || 'Competitor 3',
    '{{comp3_positioning}}': comps[2]?.positioning || '',
    '{{comp3_watchOut}}': comps[2]?.watchOut || '',
    '{{qw1_action}}': qws[0]?.action || '',
    '{{qw1_timeframe}}': qws[0]?.timeframe || '',
    '{{qw2_action}}': qws[1]?.action || '',
    '{{qw2_timeframe}}': qws[1]?.timeframe || '',
    '{{qw3_action}}': qws[2]?.action || '',
    '{{qw3_timeframe}}': qws[2]?.timeframe || '',
    '{{opportunity_title}}': reportData.opportunity?.title || '',
    '{{opportunity_description}}': reportData.opportunity?.description || '',
    '{{opportunity_urgency}}': reportData.opportunity?.urgency || 'High',
    '{{opportunity_nextStep}}': reportData.opportunity?.nextStep || '',
    '{{teaserCompetitors}}': reportData.teaserCompetitors || '',
    '{{teaserFinancials}}': reportData.teaserFinancials || '',
    '{{teaserLeads}}': reportData.teaserLeads || ''
  };

  for (const [key, val] of Object.entries(replacements)) {
    html = html.split(key).join(String(val).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
  }

  const reportsDir = path.join(__dirname, '../../reports');
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
  const pdfPath = path.join(reportsDir, `report-${Date.now()}.pdf`);

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } });
  } finally {
    await browser.close();
  }
  return pdfPath;
}

module.exports = { buildPDF };
