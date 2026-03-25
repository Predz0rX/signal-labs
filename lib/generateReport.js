const axios = require('axios');

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://100.70.215.94:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen3:14b';

async function generateReport({ industry, company, country, userContext, newsData, blsData, trendsData }) {
  const ctx = userContext || {};
  const painLabels = {
    'market-growth': 'understanding if their market is growing or dying',
    'competitors': 'lack of visibility into what competitors are doing',
    'margins': 'not knowing if their pricing/margins are competitive',
    'growth': 'knowing how to grow their product/service',
    'risk': 'being caught off guard by market changes or regulations',
    'leads': 'not knowing who to sell to or how to find customers',
    'churn': 'losing customers without understanding why',
    'expansion': 'evaluating expansion into a new market',
    'investors': 'needing data to convince investors',
    'decisions': 'making decisions without solid data'
  };
  const painDescriptions = (ctx.pains || []).map(p => painLabels[p] || p).join(', ');

  const prompt = `You are a senior market analyst. Generate a detailed, genuinely useful Market Snapshot report for this business:

BUSINESS PROFILE:
- Industry: ${industry}
- Country/Region: ${country || ctx.country || 'United States'}
- Business Stage: ${ctx.stage || 'unknown'}
- Team Size: ${ctx.teamSize || 'unknown'}
- Main Challenges: ${painDescriptions || 'general market intelligence'}
- Biggest Goal (next 90 days): ${ctx.bigDecision || 'not specified'}
- Named Competitors: ${ctx.namedCompetitors || 'none specified'}
- Competitive Advantage: ${ctx.competitiveAdvantage || 'unknown'}

REAL DATA:
- BLS Employment: ${JSON.stringify(blsData)}
- Recent News: ${JSON.stringify(newsData)}
- Google Trends: ${JSON.stringify(trendsData)}

Return ONLY a valid JSON object (no markdown, no explanation):
{
  "marketScore": <integer 1-100 representing overall market attractiveness for this business>,
  "marketScoreRationale": "<2 sentences explaining the score>",
  "marketSize": "<estimated US or relevant market size with source>",
  "tam": "<Total Addressable Market estimate with reasoning>",
  "sam": "<Serviceable Addressable Market for their specific segment>",
  "som": "<Serviceable Obtainable Market realistic for their stage>",
  "trend1": {
    "title": "<trend title>",
    "insight": "<2-3 sentences of insight specific to their profile>",
    "dataPoint": "<specific stat or number>",
    "actionForThem": "<1 concrete action they can take based on this trend>"
  },
  "trend2": {
    "title": "<trend title>",
    "insight": "<2-3 sentences of insight specific to their profile>",
    "dataPoint": "<specific stat or number>",
    "actionForThem": "<1 concrete action they can take based on this trend>"
  },
  "trend3": {
    "title": "<trend title>",
    "insight": "<2-3 sentences of insight specific to their profile>",
    "dataPoint": "<specific stat or number>",
    "actionForThem": "<1 concrete action they can take based on this trend>"
  },
  "signal1": {
    "headline": "<news headline or market signal>",
    "source": "<source name>",
    "implication": "<specific implication for their business>"
  },
  "signal2": {
    "headline": "<news headline or market signal>",
    "source": "<source name>",
    "implication": "<specific implication for their business>"
  },
  "competitors": [
    {"name": "<competitor name>", "positioning": "<one line on what they do and their main strength>", "watchOut": "<one specific thing to watch>"},
    {"name": "<competitor name>", "positioning": "<one line>", "watchOut": "<one specific thing>"},
    {"name": "<competitor name>", "positioning": "<one line>", "watchOut": "<one specific thing>"}
  ],
  "quickWins": [
    {"action": "<specific actionable quick win #1>", "timeframe": "<this week / this month>", "impact": "High"},
    {"action": "<specific actionable quick win #2>", "timeframe": "<this week / this month>", "impact": "Medium"},
    {"action": "<specific actionable quick win #3>", "timeframe": "<this week / this month>", "impact": "High"}
  ],
  "opportunity": {
    "title": "<opportunity name>",
    "description": "<3-4 sentences specific to their stage, pains, and goal>",
    "urgency": "High",
    "nextStep": "<the single most important next action to capture this opportunity>"
  },
  "teaserCompetitors": "<Compelling 1-sentence teaser of what a full 15-competitor deep analysis would reveal — reference their named competitors if given>",
  "teaserFinancials": "<Compelling 1-sentence teaser of what financial benchmarking vs industry would show for their stage>",
  "teaserLeads": "<Compelling 1-sentence teaser about the lead intelligence list — specific to their industry and stage>"
}

CRITICAL: Be specific to their profile. If they named competitors, use them. If they have a specific goal, make the opportunity relevant to that goal. Use real numbers from the data. Return ONLY the JSON.`;

  if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'PENDING') {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    try {
      const message = await client.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 2500,
        messages: [{ role: 'user', content: prompt }]
      });
      const text = message.content[0].text.trim();
      const cleaned = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
      return JSON.parse(cleaned);
    } catch (err) {
      console.error('[generateReport] Claude API error:', err.message);
      throw err;
    }
  }

  console.log(`[generateReport] Using Ollama: ${OLLAMA_MODEL}`);
  try {
    const response = await axios.post(`${OLLAMA_BASE_URL}/api/chat`, {
      model: OLLAMA_MODEL,
      stream: false,
      options: { temperature: 0.3, num_ctx: 8192 },
      messages: [
        { role: 'system', content: 'You are a JSON-only market analyst. Return only valid JSON, no explanations, no markdown, no <think> tags.' },
        { role: 'user', content: prompt }
      ]
    }, { timeout: 120000 });

    let text = response.data?.message?.content || '';
    text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    text = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) text = jsonMatch[0];
    return JSON.parse(text);
  } catch (err) {
    console.error('[generateReport] Ollama error:', err.message);
    throw err;
  }
}

module.exports = { generateReport };
