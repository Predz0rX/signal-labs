require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { fetchNews } = require('./lib/fetchNews');
const { fetchBLS } = require('./lib/fetchBLS');
const { fetchTrends } = require('./lib/fetchTrends');
const { generateReport } = require('./lib/generateReport');

async function test() {
  const industry = 'SaaS';
  const company = 'Predz0rx Ventures';
  const country = 'United States';
  const userContext = {
    industry, country, stage: 'growth', teamSize: '6-20',
    pains: ['competitors', 'expansion'],
    bigDecision: 'Expand to a new city or country',
    namedCompetitors: 'HubSpot, Pipedrive, Salesforce',
    competitiveAdvantage: 'niche'
  };

  console.log('Fetching live data...');
  const [newsData, blsData, trendsData] = await Promise.all([
    fetchNews(industry), fetchBLS(industry), fetchTrends(industry)
  ]);
  userContext._trendsScore = trendsData.interestScore || 50;
  userContext._blsYoY = blsData.yearOverYearChange || 'N/A';
  userContext._newsCount = newsData.length;

  console.log('Generating report with Claude...');
  const reportData = await generateReport({ industry, company, country, userContext, newsData, blsData, trendsData });

  const token = crypto.randomBytes(16).toString('hex');
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const payload = {
    report: reportData,
    meta: {
      token, email: 'test@signallabs.ai', industry, company,
      country, date, stage: userContext.stage, teamSize: userContext.teamSize,
      pains: userContext.pains, bigDecision: userContext.bigDecision,
      blsYoY: blsData.yearOverYearChange || 'N/A',
      trendsScore: trendsData.interestScore || 50,
      newsCount: newsData.length,
      createdAt: new Date().toISOString(), viewed: false
    }
  };

  const reportsDir = path.join(__dirname, 'reports');
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
  const filePath = path.join(reportsDir, `report-${token}.json`);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));

  const reportUrl = `http://localhost:3000/report/${token}`;
  console.log('\n✅ Report JSON saved:', filePath);
  console.log('✅ Start server with: node server.js');
  console.log('✅ Then open:', reportUrl);
  console.log('\nToken:', token);
}

test().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
