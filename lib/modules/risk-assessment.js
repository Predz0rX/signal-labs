const { callLLM } = require('./llm-helper');

module.exports = {
  id: 'risk-assessment',
  name: 'Risk Assessment Matrix',
  tier: 'free',
  dataDependencies: ['fred', 'newsapi', 'world-bank', 'oecd', 'bls'],
  priority: 55,

  async generate(enrichedData, userContext) {
    const fred = enrichedData.fred?.value || {};
    const news = enrichedData.newsapi?.value || [];
    const wb = enrichedData['world-bank']?.value || {};
    const oecd = enrichedData.oecd?.value || {};
    const bls = enrichedData.bls?.value || {};

    const fredSummary = fred.summary || {};
    const fredIndicators = fred.indicators || {};
    const wbSummary = wb.summary || {};
    const oecdSummary = oecd.summary || {};

    // Identify risk-related news
    const riskKeywords = ['regulation', 'regulatory', 'lawsuit', 'fine', 'ban', 'tariff', 'sanction', 'layoff', 'bankruptcy', 'decline', 'crash', 'disruption', 'threat', 'risk', 'warning', 'downturn'];
    const riskNews = news.filter(n =>
      riskKeywords.some(k => (n.title + ' ' + (n.description || '')).toLowerCase().includes(k))
    ).slice(0, 5);

    const prompt = `You are a risk analyst. Build a comprehensive risk assessment using REAL DATA.

MACROECONOMIC RISKS (FRED — Federal Reserve):
- GDP Growth: ${fredSummary.gdpGrowth || 'N/A'}
- Inflation: ${fredSummary.inflation || 'N/A'}
- Unemployment: ${fredSummary.unemployment || 'N/A'} (trend: ${fredSummary.unemploymentTrend || 'stable'})
- Fed Rate: ${fredIndicators.FED_RATE?.latest || 'N/A'}
- Yield Curve: ${fredSummary.yieldSpread || 'N/A'} — Recession Risk: ${fredSummary.recessionRisk || 'Normal'}
- Consumer Sentiment: ${fredSummary.consumerSentiment || 'N/A'} (trend: ${fredSummary.sentimentTrend || 'stable'})

COUNTRY RISKS (World Bank):
- Country: ${wbSummary.country || 'US'}
- GDP per capita: ${wbSummary.gdpPerCapita || 'N/A'}
- Inflation: ${wbSummary.inflation || 'N/A'}
- Unemployment: ${wbSummary.unemployment || 'N/A'}
- FDI (% GDP): ${wbSummary.fdiPctGdp || 'N/A'}

OECD CONFIDENCE (${oecdSummary.oecdCode || 'N/A'}):
- Business Confidence: ${oecdSummary.businessConfidence || 'N/A'}
- Consumer Confidence: ${oecdSummary.consumerConfidence || 'N/A'}

SECTOR RISK (BLS):
- Employment: ${bls.yearOverYearChange || 'N/A'} YoY in ${bls.sectorName || userContext.industry}

RISK-RELATED NEWS:
${riskNews.map(n => `- "${n.title}" (${n.source})`).join('\n') || '- No risk-specific news detected'}

BUSINESS:
- Industry: ${userContext.industry}, Country: ${userContext.country || 'US'}
- Stage: ${userContext.stage || 'unknown'}
- Challenges: ${(userContext.pains || []).join(', ') || 'general'}
- Competitors: ${userContext.namedCompetitors || 'none'}

Score each risk category 1-10 (1=low, 10=critical). Cite specific data for each score.

Return ONLY valid JSON:
{
  "risks": {
    "macroeconomic": { "score": <1-10>, "level": "Low|Medium|High|Critical", "detail": "<cite FRED data>", "mitigation": "<action>" },
    "regulatory": { "score": <1-10>, "level": "<level>", "detail": "<cite news or known regulations>", "mitigation": "<action>" },
    "competitive": { "score": <1-10>, "level": "<level>", "detail": "<cite competitor dynamics>", "mitigation": "<action>" },
    "market": { "score": <1-10>, "level": "<level>", "detail": "<cite employment/trends data>", "mitigation": "<action>" },
    "technology": { "score": <1-10>, "level": "<level>", "detail": "<disruption risk>", "mitigation": "<action>" },
    "country": { "score": <1-10>, "level": "<level>", "detail": "<cite World Bank/OECD data>", "mitigation": "<action>" }
  },
  "overallRiskScore": <1-10>,
  "overallLevel": "Low|Medium|High|Critical",
  "topRisk": "<the single biggest risk they face, in 1 sentence>",
  "topMitigation": "<the single most important protective action>"
}`;

    const result = await callLLM(prompt, { maxTokens: 3000 });
    const sources = ['fred', 'newsapi', 'world-bank', 'oecd', 'bls'].filter(s => enrichedData[s]?.confidence > 0);

    return {
      data: result,
      confidence: sources.length >= 3 ? 0.65 : 0.40,
      sources
    };
  }
};
