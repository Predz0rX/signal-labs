const PptxGenJS = require('pptxgenjs');

const COLORS = {
  dark: '0A0A0A',
  blue: '0071E3',
  white: 'FFFFFF',
  gray: '6B7280',
  lightGray: 'F3F4F6',
  green: '10B981',
  red: 'EF4444',
  yellow: 'F59E0B',
};

/**
 * Generate a professional PPTX deck from a report payload.
 * @param {object} reportPayload — { report, meta }
 * @returns {Buffer} — PPTX file buffer
 */
async function buildPPTX(reportPayload) {
  const { report, meta } = reportPayload;
  const pptx = new PptxGenJS();

  pptx.author = 'Signal Labs';
  pptx.company = 'Signal Labs AI';
  pptx.subject = `${meta.industry} Market Intelligence Report`;
  pptx.title = `${meta.company || meta.industry} — Market Snapshot`;

  // ── Slide 1: Cover ──
  const cover = pptx.addSlide();
  cover.background = { color: COLORS.dark };
  cover.addText('signal', { x: 0.5, y: 0.3, w: 3, fontSize: 24, bold: true, color: COLORS.white, fontFace: 'Arial' });
  cover.addText('labs', { x: 1.65, y: 0.3, w: 2, fontSize: 24, bold: true, color: COLORS.blue, fontFace: 'Arial' });
  cover.addText(`${meta.industry} Market Intelligence`, { x: 0.5, y: 2.0, w: 9, fontSize: 32, bold: true, color: COLORS.white, fontFace: 'Arial' });
  cover.addText(`${meta.company || 'Market Snapshot'} — ${meta.country || 'Global'}`, { x: 0.5, y: 2.8, w: 9, fontSize: 18, color: COLORS.gray, fontFace: 'Arial' });
  cover.addText(meta.date || new Date().toLocaleDateString(), { x: 0.5, y: 3.4, w: 9, fontSize: 14, color: COLORS.gray, fontFace: 'Arial' });
  // KPI row
  const kpis = [
    { label: 'Market Score', value: `${report.marketScore || 'N/A'}/100` },
    { label: 'TAM', value: extractShort(report.tam) },
    { label: 'Sector Growth', value: meta.blsYoY || 'N/A' },
    { label: 'Quick Wins', value: `${(report.quickWins || []).length}` },
  ];
  kpis.forEach((kpi, i) => {
    cover.addText(kpi.value, { x: 0.5 + i * 2.3, y: 4.3, w: 2, fontSize: 20, bold: true, color: COLORS.blue, fontFace: 'Arial' });
    cover.addText(kpi.label, { x: 0.5 + i * 2.3, y: 4.8, w: 2, fontSize: 10, color: COLORS.gray, fontFace: 'Arial' });
  });

  // ── Slide 2: Executive Summary ──
  const execSlide = pptx.addSlide();
  addTitle(execSlide, 'Executive Intelligence Brief');
  const brief = report.executiveBrief || report.marketScoreRationale || 'Executive summary not available.';
  execSlide.addText(brief, { x: 0.5, y: 1.2, w: 9, h: 3.5, fontSize: 13, color: COLORS.dark, fontFace: 'Arial', valign: 'top', wrap: true });
  if (report.bottomLine) {
    execSlide.addShape(pptx.ShapeType.rect, { x: 0.5, y: 4.8, w: 9, h: 0.5, fill: { color: COLORS.lightGray } });
    execSlide.addText(`Bottom Line: ${report.bottomLine}`, { x: 0.7, y: 4.8, w: 8.6, h: 0.5, fontSize: 11, bold: true, color: COLORS.dark, fontFace: 'Arial', valign: 'middle' });
  }

  // ── Slide 3: Market Score ──
  const scoreSlide = pptx.addSlide();
  addTitle(scoreSlide, 'Market Attractiveness Score');
  const score = report.marketScore || 65;
  const scoreColor = score >= 70 ? COLORS.green : score >= 40 ? COLORS.yellow : COLORS.red;
  scoreSlide.addText(String(score), { x: 3.5, y: 1.5, w: 3, fontSize: 72, bold: true, color: scoreColor, fontFace: 'Arial', align: 'center' });
  scoreSlide.addText('/ 100', { x: 5.5, y: 2.0, w: 2, fontSize: 24, color: COLORS.gray, fontFace: 'Arial' });
  scoreSlide.addText(report.marketScoreRationale || '', { x: 0.5, y: 3.5, w: 9, fontSize: 13, color: COLORS.dark, fontFace: 'Arial', wrap: true });

  // ── Slide 4: TAM/SAM/SOM ──
  const tamSlide = pptx.addSlide();
  addTitle(tamSlide, 'Market Sizing');
  const sizing = [
    { label: 'TAM (Total Addressable)', value: report.tam || 'N/A' },
    { label: 'SAM (Serviceable Addressable)', value: report.sam || 'N/A' },
    { label: 'SOM (Serviceable Obtainable)', value: report.som || 'N/A' },
  ];
  sizing.forEach((s, i) => {
    tamSlide.addShape(pptx.ShapeType.rect, { x: 0.5, y: 1.3 + i * 1.2, w: 9, h: 1.0, fill: { color: i === 0 ? 'E0F2FE' : i === 1 ? 'FEF3C7' : 'ECFDF5' } });
    tamSlide.addText(s.label, { x: 0.7, y: 1.35 + i * 1.2, w: 3, fontSize: 11, bold: true, color: COLORS.dark, fontFace: 'Arial' });
    tamSlide.addText(s.value, { x: 0.7, y: 1.7 + i * 1.2, w: 8.6, fontSize: 11, color: COLORS.gray, fontFace: 'Arial', wrap: true });
  });

  // ── Slide 5: Top 3 Trends ──
  const trendsSlide = pptx.addSlide();
  addTitle(trendsSlide, 'Key Market Trends');
  [report.trend1, report.trend2, report.trend3].forEach((t, i) => {
    if (!t) return;
    const y = 1.2 + i * 1.3;
    trendsSlide.addText(`${i + 1}. ${t.title || ''}`, { x: 0.5, y, w: 9, fontSize: 14, bold: true, color: COLORS.dark, fontFace: 'Arial' });
    trendsSlide.addText(t.insight || '', { x: 0.5, y: y + 0.35, w: 9, fontSize: 11, color: COLORS.gray, fontFace: 'Arial', wrap: true });
    trendsSlide.addText(`Action: ${t.actionForThem || ''}`, { x: 0.5, y: y + 0.8, w: 9, fontSize: 11, bold: true, color: COLORS.blue, fontFace: 'Arial' });
  });

  // ── Slide 6: Competitive Landscape ──
  const compSlide = pptx.addSlide();
  addTitle(compSlide, 'Competitor Snapshot');
  const comps = report.competitors || [];
  const compRows = [['Competitor', 'Positioning', 'Watch Out']];
  comps.forEach(c => compRows.push([c.name || '', c.positioning || '', c.watchOut || '']));
  compSlide.addTable(compRows, {
    x: 0.5, y: 1.2, w: 9,
    fontSize: 10, fontFace: 'Arial',
    border: { pt: 0.5, color: 'E5E7EB' },
    colW: [2, 4, 3],
    autoPage: true,
    rowH: 0.6,
    headerRow: true,
    color: COLORS.dark,
  });

  // ── Slide 7: Risk Assessment ──
  if (report.riskAssessment && !report.riskAssessment.error) {
    const riskSlide = pptx.addSlide();
    addTitle(riskSlide, 'Risk Assessment');
    const risks = report.riskAssessment.risks || {};
    const riskRows = [['Category', 'Score', 'Level', 'Detail']];
    for (const [cat, data] of Object.entries(risks)) {
      riskRows.push([cat.replace(/([A-Z])/g, ' $1').trim(), String(data.score || ''), data.level || '', (data.detail || '').slice(0, 80)]);
    }
    riskSlide.addTable(riskRows, {
      x: 0.5, y: 1.2, w: 9, fontSize: 9, fontFace: 'Arial',
      border: { pt: 0.5, color: 'E5E7EB' }, colW: [2, 0.8, 1.2, 5], rowH: 0.5, headerRow: true, color: COLORS.dark,
    });
    if (report.riskAssessment.topRisk) {
      riskSlide.addText(`Top Risk: ${report.riskAssessment.topRisk}`, { x: 0.5, y: 4.5, w: 9, fontSize: 11, bold: true, color: COLORS.red, fontFace: 'Arial' });
    }
  }

  // ── Slide 8: Growth Playbook ──
  if (report.growthPlaybook && !report.growthPlaybook.error) {
    const gpSlide = pptx.addSlide();
    addTitle(gpSlide, '90-Day Growth Playbook');
    const channels = report.growthPlaybook.channels || [];
    channels.forEach((ch, i) => {
      const y = 1.2 + i * 1.0;
      gpSlide.addText(`${i + 1}. ${ch.channel || ''}`, { x: 0.5, y, w: 5, fontSize: 13, bold: true, color: COLORS.dark, fontFace: 'Arial' });
      gpSlide.addText(`ROI: ${ch.expectedROI || 'N/A'} | ${ch.timeToResults || ''}`, { x: 5.5, y, w: 4, fontSize: 11, color: COLORS.blue, fontFace: 'Arial' });
      gpSlide.addText(ch.rationale || '', { x: 0.5, y: y + 0.35, w: 9, fontSize: 10, color: COLORS.gray, fontFace: 'Arial', wrap: true });
    });
    if (report.growthPlaybook.priorityAction) {
      gpSlide.addShape(pptx.ShapeType.rect, { x: 0.5, y: 4.5, w: 9, h: 0.6, fill: { color: 'ECFDF5' } });
      gpSlide.addText(`Priority: ${report.growthPlaybook.priorityAction}`, { x: 0.7, y: 4.5, w: 8.6, h: 0.6, fontSize: 11, bold: true, color: COLORS.green, fontFace: 'Arial', valign: 'middle' });
    }
  }

  // ── Slide 9: Quick Wins ──
  const qwSlide = pptx.addSlide();
  addTitle(qwSlide, 'Quick Wins');
  (report.quickWins || []).forEach((qw, i) => {
    const y = 1.3 + i * 1.0;
    const impactColor = qw.impact === 'High' ? COLORS.green : COLORS.yellow;
    qwSlide.addText(`${i + 1}. ${qw.action || ''}`, { x: 0.5, y, w: 7, fontSize: 13, bold: true, color: COLORS.dark, fontFace: 'Arial' });
    qwSlide.addText(qw.impact || '', { x: 7.5, y, w: 2, fontSize: 11, bold: true, color: impactColor, fontFace: 'Arial', align: 'right' });
    qwSlide.addText(`Timeline: ${qw.timeframe || ''}`, { x: 0.5, y: y + 0.35, w: 9, fontSize: 10, color: COLORS.gray, fontFace: 'Arial' });
  });

  // ── Slide 10: Key Opportunity ──
  const oppSlide = pptx.addSlide();
  addTitle(oppSlide, 'Strategic Opportunity');
  const opp = report.opportunity || {};
  oppSlide.addText(opp.title || '', { x: 0.5, y: 1.3, w: 9, fontSize: 20, bold: true, color: COLORS.blue, fontFace: 'Arial' });
  oppSlide.addText(opp.description || '', { x: 0.5, y: 2.0, w: 9, fontSize: 13, color: COLORS.dark, fontFace: 'Arial', wrap: true });
  oppSlide.addText(`Urgency: ${opp.urgency || 'High'}`, { x: 0.5, y: 3.5, w: 3, fontSize: 12, bold: true, color: COLORS.red, fontFace: 'Arial' });
  oppSlide.addText(`Next Step: ${opp.nextStep || ''}`, { x: 0.5, y: 4.0, w: 9, fontSize: 12, bold: true, color: COLORS.green, fontFace: 'Arial' });

  // ── Slide 11: Opportunity Radar ──
  if (report.opportunityRadar && !report.opportunityRadar.error) {
    const radarSlide = pptx.addSlide();
    addTitle(radarSlide, 'Market Opportunity Radar');
    const microTrends = report.opportunityRadar.microTrends || [];
    microTrends.slice(0, 5).forEach((mt, i) => {
      const y = 1.2 + i * 0.7;
      radarSlide.addText(`${mt.trend || ''} (velocity: ${mt.velocityScore || '?'}/10)`, { x: 0.5, y, w: 7, fontSize: 11, bold: true, color: COLORS.dark, fontFace: 'Arial' });
      radarSlide.addText(mt.relevance || '', { x: 0.5, y: y + 0.25, w: 9, fontSize: 9, color: COLORS.gray, fontFace: 'Arial' });
    });
    if (report.opportunityRadar.timingSignal) {
      radarSlide.addText(`Timing: ${report.opportunityRadar.timingSignal}`, { x: 0.5, y: 4.8, w: 9, fontSize: 11, italic: true, color: COLORS.blue, fontFace: 'Arial' });
    }
  }

  // ── Slide 12: Disclaimer/CTA ──
  const ctaSlide = pptx.addSlide();
  ctaSlide.background = { color: COLORS.dark };
  ctaSlide.addText('Want deeper intelligence?', { x: 0.5, y: 1.5, w: 9, fontSize: 28, bold: true, color: COLORS.white, fontFace: 'Arial', align: 'center' });
  ctaSlide.addText('Upgrade to Intel or Pro for 15-competitor deep analysis,\nfinancial benchmarking, and lead intelligence.', { x: 0.5, y: 2.5, w: 9, fontSize: 16, color: COLORS.gray, fontFace: 'Arial', align: 'center' });
  ctaSlide.addText('signallabs.ai', { x: 0.5, y: 4.0, w: 9, fontSize: 14, color: COLORS.blue, fontFace: 'Arial', align: 'center' });
  ctaSlide.addText(`Generated ${meta.date} • ${meta.overallConfidence ? Math.round(meta.overallConfidence * 100) + '% confidence' : ''} • ${(meta.sourcesUsed || []).length} data sources`, { x: 0.5, y: 4.8, w: 9, fontSize: 10, color: COLORS.gray, fontFace: 'Arial', align: 'center' });

  return await pptx.write({ outputType: 'nodebuffer' });
}

function addTitle(slide, text) {
  slide.addText(text, { x: 0.5, y: 0.3, w: 9, fontSize: 22, bold: true, color: COLORS.dark, fontFace: 'Arial' });
  slide.addShape('line', { x: 0.5, y: 0.85, w: 9, h: 0, line: { color: COLORS.blue, width: 2 } });
}

function extractShort(str) {
  if (!str) return 'N/A';
  const match = str.match(/\$[\d.,]+[BMKTbmkt]?/);
  return match ? match[0] : str.split(' ').slice(0, 3).join(' ');
}

module.exports = { buildPPTX };
