require('dotenv').config();

const { fetchNews } = require('./lib/fetchNews');
const { fetchBLS } = require('./lib/fetchBLS');
const { fetchTrends } = require('./lib/fetchTrends');
const { generateReport } = require('./lib/generateReport');
const { buildPDF } = require('./lib/buildPDF');

async function test() {
  const industry = 'SaaS';
  const company = 'Predz0rx Ventures';
  const country = 'United States';

  const userContext = {
    industry: 'SaaS',
    country: 'United States',
    stage: 'growth',
    teamSize: '6-20',
    pains: ['competitors', 'expansion'],
    bigDecision: 'Expand to a new city or country',
    namedCompetitors: 'HubSpot, Pipedrive, Salesforce',
    competitiveAdvantage: 'niche'
  };

  console.log('Fetching data...');
  const [newsData, blsData, trendsData] = await Promise.all([
    fetchNews(industry),
    fetchBLS(industry),
    fetchTrends(industry)
  ]);
  console.log('Data fetched. Generating report with Claude...');
  const reportData = await generateReport({ industry, company, country, userContext, newsData, blsData, trendsData });
  console.log('Report generated. Building PDF...');
  // Pass metrics to buildPDF via userContext
  userContext._trendsScore = trendsData.interestScore || 50;
  userContext._blsYoY = blsData.yearOverYearChange || '0%';
  userContext._newsCount = newsData.length || 0;
  const pdfPath = await buildPDF({ reportData, industry, company, country, userContext });
  console.log('PDF ready:', pdfPath);
  return pdfPath;
}

test().then(p => {
  console.log('DONE:', p);
}).catch(err => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
