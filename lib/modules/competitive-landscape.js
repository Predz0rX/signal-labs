const { callLLM } = require('./llm-helper');

module.exports = {
  id: 'competitive-landscape',
  name: 'Competitor Snapshot',
  tier: 'free',
  dataDependencies: ['newsapi', 'sec-edgar', 'alpha-vantage', 'hackernews'],
  priority: 50,

  async generate(enrichedData, userContext) {
    const news = enrichedData.newsapi?.value || [];
    const sec = enrichedData['sec-edgar']?.value || {};
    const av = enrichedData['alpha-vantage']?.value || {};
    const hn = enrichedData.hackernews?.value || {};

    // Build real competitor data block
    const secCompanies = (sec.companies || []).map(c =>
      `- ${c.name} (${c.ticker}): Revenue ${c.financials?.revenue}, Net Income ${c.financials?.netIncome}, Gross Margin ${c.financials?.grossMargin}, Net Margin ${c.financials?.netMargin}, D/E Ratio ${c.financials?.debtToEquity}`
    ).join('\n');

    const avCompanies = (av.companies || []).map(c =>
      `- ${c.name} (${c.symbol}): Market Cap ${c.marketCap}, P/E ${c.peRatio}, Rev Growth ${c.quarterlyRevenueGrowth}, Profit Margin ${c.profitMargin}`
    ).join('\n');

    const competitorHNMentions = (hn.competitorMentions || []).slice(0, 5).map(m =>
      `- "${m.title}" (${m.points} pts)`
    ).join('\n');

    const competitorNewsMentions = news.filter(n =>
      userContext.namedCompetitors && userContext.namedCompetitors.split(',').some(c =>
        (n.title + ' ' + n.description).toLowerCase().includes(c.trim().toLowerCase())
      )
    ).map(n => `- "${n.title}" (${n.source})`).join('\n');

    const prompt = `You are a competitive intelligence analyst. Analyze the competitive landscape using REAL DATA.

REAL FINANCIAL DATA (SEC EDGAR — public filings):
${secCompanies || '- No SEC data available (competitors may be private)'}

REAL MARKET DATA (Alpha Vantage):
${avCompanies || '- No market data available'}
- Sector performance: ${av.sector?.etf || 'N/A'} ${av.sector?.changePercent || ''}

HACKER NEWS COMPETITOR MENTIONS:
${competitorHNMentions || '- No competitor mentions found'}

NEWS COMPETITOR MENTIONS:
${competitorNewsMentions || '- No competitor-specific news'}

BUSINESS:
- Industry: ${userContext.industry}, Country: ${userContext.country || 'US'}
- Named competitors: ${userContext.namedCompetitors || 'none specified'}
- Their advantage: ${userContext.competitiveAdvantage || 'unknown'}
- Stage: ${userContext.stage || 'unknown'}

IMPORTANT: If SEC/Alpha Vantage data is available for a competitor, cite specific financials. For private companies, estimate based on industry context.

Return ONLY valid JSON:
{
  "competitors": [
    { "name": "<name>", "positioning": "<what they do + real financial data if available>", "watchOut": "<specific threat backed by data>" },
    { "name": "<name>", "positioning": "<positioning>", "watchOut": "<threat>" },
    { "name": "<name>", "positioning": "<positioning>", "watchOut": "<threat>" }
  ],
  "teaserCompetitors": "<1-sentence teaser of what 15-competitor deep analysis with full financials would reveal>"
}`;

    const result = await callLLM(prompt, { maxTokens: 2500 });
    const sources = ['newsapi', 'sec-edgar', 'alpha-vantage', 'hackernews'].filter(s => enrichedData[s]?.confidence > 0);

    return {
      data: result,
      confidence: sec.companiesFound > 0 ? 0.65 : 0.35,
      sources
    };
  }
};
