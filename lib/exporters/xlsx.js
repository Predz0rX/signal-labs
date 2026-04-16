const ExcelJS = require('exceljs');

/**
 * Generate a multi-tab XLSX workbook from a report payload.
 * Each module gets its own worksheet.
 * @param {object} reportPayload — { report, meta }
 * @returns {Buffer} — XLSX file buffer
 */
async function buildXLSX(reportPayload) {
  const { report, meta } = reportPayload;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Signal Labs';
  wb.created = new Date();

  const headerStyle = { font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0071E3' } }, alignment: { horizontal: 'left' } };
  const subHeaderStyle = { font: { bold: true, size: 10 }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } } };

  // ── Tab 1: Summary ──
  const summary = wb.addWorksheet('Summary');
  summary.columns = [{ header: 'Metric', key: 'metric', width: 30 }, { header: 'Value', key: 'value', width: 50 }];
  styleHeader(summary);
  summary.addRows([
    { metric: 'Company', value: meta.company || 'N/A' },
    { metric: 'Industry', value: meta.industry },
    { metric: 'Country', value: meta.country || 'US' },
    { metric: 'Stage', value: meta.stage || 'N/A' },
    { metric: 'Team Size', value: meta.teamSize || 'N/A' },
    { metric: 'Report Date', value: meta.date },
    { metric: 'Market Score', value: `${report.marketScore || 'N/A'}/100` },
    { metric: 'Score Rationale', value: report.marketScoreRationale || '' },
    { metric: 'TAM', value: report.tam || 'N/A' },
    { metric: 'SAM', value: report.sam || 'N/A' },
    { metric: 'SOM', value: report.som || 'N/A' },
    { metric: 'BLS Sector Growth', value: meta.blsYoY || 'N/A' },
    { metric: 'Trends Score', value: `${meta.trendsScore || 'N/A'}/100` },
    { metric: 'News Volume (7d)', value: meta.newsCount || 0 },
    { metric: 'Overall Confidence', value: meta.overallConfidence ? `${Math.round(meta.overallConfidence * 100)}%` : 'N/A' },
    { metric: 'Sources Used', value: (meta.sourcesUsed || []).join(', ') },
    { metric: 'Modules Run', value: (meta.modulesRun || []).join(', ') },
  ]);

  // ── Tab 2: Trends ──
  const trends = wb.addWorksheet('Trends');
  trends.columns = [
    { header: '#', key: 'num', width: 5 },
    { header: 'Trend', key: 'title', width: 30 },
    { header: 'Insight', key: 'insight', width: 50 },
    { header: 'Data Point', key: 'dataPoint', width: 30 },
    { header: 'Action', key: 'action', width: 40 },
  ];
  styleHeader(trends);
  [report.trend1, report.trend2, report.trend3].forEach((t, i) => {
    if (t) trends.addRow({ num: i + 1, title: t.title || '', insight: t.insight || '', dataPoint: t.dataPoint || '', action: t.actionForThem || '' });
  });

  // ── Tab 3: Competitors ──
  const compWs = wb.addWorksheet('Competitors');
  compWs.columns = [
    { header: 'Name', key: 'name', width: 25 },
    { header: 'Positioning', key: 'positioning', width: 50 },
    { header: 'Watch Out', key: 'watchOut', width: 40 },
  ];
  styleHeader(compWs);
  (report.competitors || []).forEach(c => compWs.addRow(c));

  // ── Tab 4: Quick Wins ──
  const qwWs = wb.addWorksheet('Quick Wins');
  qwWs.columns = [
    { header: 'Action', key: 'action', width: 50 },
    { header: 'Timeframe', key: 'timeframe', width: 20 },
    { header: 'Impact', key: 'impact', width: 15 },
  ];
  styleHeader(qwWs);
  (report.quickWins || []).forEach(qw => qwWs.addRow(qw));

  // ── Tab 5: Risk Assessment ──
  if (report.riskAssessment && report.riskAssessment.risks) {
    const riskWs = wb.addWorksheet('Risk Assessment');
    riskWs.columns = [
      { header: 'Category', key: 'category', width: 20 },
      { header: 'Score (1-10)', key: 'score', width: 12 },
      { header: 'Level', key: 'level', width: 12 },
      { header: 'Detail', key: 'detail', width: 50 },
      { header: 'Mitigation', key: 'mitigation', width: 40 },
    ];
    styleHeader(riskWs);
    for (const [cat, data] of Object.entries(report.riskAssessment.risks)) {
      riskWs.addRow({ category: cat, score: data.score, level: data.level, detail: data.detail, mitigation: data.mitigation });
    }
    riskWs.addRow({});
    riskWs.addRow({ category: 'Overall Risk Score', score: report.riskAssessment.overallRiskScore, level: report.riskAssessment.overallLevel });
  }

  // ── Tab 6: Growth Playbook ──
  if (report.growthPlaybook && report.growthPlaybook.channels) {
    const gpWs = wb.addWorksheet('Growth Playbook');
    gpWs.columns = [
      { header: 'Channel', key: 'channel', width: 25 },
      { header: 'Expected ROI', key: 'expectedROI', width: 15 },
      { header: 'Time to Results', key: 'timeToResults', width: 18 },
      { header: 'Budget', key: 'budgetRange', width: 18 },
      { header: 'Rationale', key: 'rationale', width: 45 },
    ];
    styleHeader(gpWs);
    report.growthPlaybook.channels.forEach(ch => gpWs.addRow(ch));
  }

  // ── Tab 7: Customer Intelligence ──
  if (report.customerIntelligence && report.customerIntelligence.icp) {
    const ciWs = wb.addWorksheet('Customer Intel');
    ciWs.columns = [{ header: 'Attribute', key: 'attr', width: 25 }, { header: 'Value', key: 'val', width: 60 }];
    styleHeader(ciWs);
    const icp = report.customerIntelligence.icp;
    ciWs.addRows([
      { attr: 'ICP Title', val: icp.title || '' },
      { attr: 'Demographics', val: icp.demographics || '' },
      { attr: 'Pain Points', val: (icp.painPoints || []).join('; ') },
      { attr: 'Buying Triggers', val: (icp.buyingTriggers || []).join('; ') },
      { attr: 'Preferred Channels', val: (icp.preferredChannels || []).join('; ') },
    ]);
  }

  // ── Tab 8: Financial Health ──
  if (report.financialHealth && report.financialHealth.benchmarkTable) {
    const fhWs = wb.addWorksheet('Financial Health');
    fhWs.columns = [
      { header: 'Metric', key: 'metric', width: 25 },
      { header: 'Industry Median', key: 'industryMedian', width: 20 },
      { header: 'Top Quartile', key: 'topQuartile', width: 20 },
      { header: 'Source', key: 'source', width: 15 },
    ];
    styleHeader(fhWs);
    report.financialHealth.benchmarkTable.forEach(row => fhWs.addRow(row));
  }

  // ── Tab 9: Opportunity Radar ──
  if (report.opportunityRadar && report.opportunityRadar.microTrends) {
    const orWs = wb.addWorksheet('Opportunity Radar');
    orWs.columns = [
      { header: 'Trend', key: 'trend', width: 25 },
      { header: 'Velocity (1-10)', key: 'velocityScore', width: 14 },
      { header: 'Evidence', key: 'evidence', width: 45 },
      { header: 'Time to Mainstream', key: 'timeToMainstream', width: 18 },
      { header: 'Relevance', key: 'relevance', width: 35 },
    ];
    styleHeader(orWs);
    report.opportunityRadar.microTrends.forEach(mt => orWs.addRow(mt));
  }

  // ── Tab 10: Signals ──
  const sigWs = wb.addWorksheet('Market Signals');
  sigWs.columns = [
    { header: 'Headline', key: 'headline', width: 50 },
    { header: 'Source', key: 'source', width: 20 },
    { header: 'Implication', key: 'implication', width: 50 },
  ];
  styleHeader(sigWs);
  [report.signal1, report.signal2].filter(Boolean).forEach(s => sigWs.addRow(s));

  return await wb.xlsx.writeBuffer();
}

function styleHeader(ws) {
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0071E3' } };
  headerRow.alignment = { horizontal: 'left' };
}

module.exports = { buildXLSX };
