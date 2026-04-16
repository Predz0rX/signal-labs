const { callLLM } = require('./llm-helper');

module.exports = {
  id: 'tech-stack-analysis',
  name: 'Technology & Innovation Landscape',
  tier: 'premium',
  dataDependencies: ['hackernews', 'open-alex', 'reddit', 'google-trends'],
  priority: 90,

  async generate(enrichedData, userContext) {
    const hn = enrichedData.hackernews?.value || {};
    const oa = enrichedData['open-alex']?.value || {};
    const reddit = enrichedData.reddit?.value || {};
    const trends = enrichedData['google-trends']?.value || {};

    const hnStories = (hn.stories || []).slice(0, 10).map(s =>
      `- "${s.title}" (${s.points} pts, ${s.comments} comments)`
    ).join('\n');

    const researchConcepts = (oa.concepts || []).slice(0, 10).map(c => `${c.name} (${c.count} papers)`).join(', ');
    const publicationTrend = (oa.yearlyTrend || []).map(y => `${y.year}: ${y.count}`).join(', ');
    const topPublications = (oa.publications || []).slice(0, 5).map(p =>
      `- "${p.title}" (${p.year}, ${p.citationCount} citations, ${p.source})`
    ).join('\n');

    const prompt = `You are a technology analyst. Analyze the tech/innovation landscape for this industry using REAL data.

TECH COMMUNITY SIGNALS (HackerNews — last 30 days):
${hnStories || '- No stories found'}
- Themes: ${(hn.themes || []).slice(0, 8).map(t => `${t.word} (${t.count}x)`).join(', ') || 'none'}

ACADEMIC RESEARCH (OpenAlex):
- Research velocity: ${oa.metrics?.researchVelocity || 'N/A'} YoY change
- Publication trend: ${publicationTrend || 'N/A'}
- Top concepts: ${researchConcepts || 'none'}
- Top cited papers:
${topPublications || '- No publications found'}
- Total publications: ${oa.metrics?.totalPublications || 0}

COMMUNITY TECH DISCUSSIONS (Reddit):
- Tech-related themes: ${(reddit.themes || []).slice(0, 5).map(t => t.word).join(', ') || 'none'}

SEARCH TRENDS:
- Related tech queries: ${(trends.relatedTopics || []).join(', ') || 'none'}

BUSINESS:
- Industry: ${userContext.industry}
- Competitors: ${userContext.namedCompetitors || 'none'}
- Advantage: ${userContext.competitiveAdvantage || 'unknown'}

NOTE: Tool-specific data (BuiltWith, etc.) not available. Base analysis on HN discussions, research trends, and community signals. Label all assessments as "estimated from community signals."

Return ONLY valid JSON:
{
  "techLandscape": {
    "emergingTech": [
      { "technology": "<tech>", "maturity": "Emerging|Growing|Mainstream", "adoptionRate": "<estimated>", "evidence": "<cite HN/research>" },
      { "technology": "<tech>", "maturity": "<maturity>", "adoptionRate": "<rate>", "evidence": "<evidence>" },
      { "technology": "<tech>", "maturity": "<maturity>", "adoptionRate": "<rate>", "evidence": "<evidence>" }
    ],
    "researchFrontier": "<2 sentences: where R&D investment is heading based on OpenAlex data>",
    "communityBuzz": "<what the tech community is most excited/concerned about>"
  },
  "competitorTechEstimate": [
    { "competitor": "<name>", "likelyStack": "<estimated from HN/Reddit discussions>", "techAdvantage": "<what they do well>", "techGap": "<potential weakness>" }
  ],
  "recommendations": [
    { "action": "<tech investment recommendation>", "rationale": "<cite research/community data>", "urgency": "Now|Soon|Watch" },
    { "action": "<action>", "rationale": "<rationale>", "urgency": "<urgency>" }
  ],
  "innovationScore": <1-100>,
  "innovationSummary": "<1 sentence: how innovative/tech-forward is this industry right now>"
}`;

    const result = await callLLM(prompt, { maxTokens: 3000 });
    return {
      data: result,
      confidence: 0.40,
      sources: ['hackernews', 'open-alex', 'reddit', 'google-trends'].filter(s => enrichedData[s]?.confidence > 0)
    };
  }
};
