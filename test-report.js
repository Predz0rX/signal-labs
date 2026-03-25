require('dotenv').config();

const { fetchNews } = require('./lib/fetchNews');
const { fetchBLS } = require('./lib/fetchBLS');
const { fetchTrends } = require('./lib/fetchTrends');
const { generateReport } = require('./lib/generateReport');
const { buildPDF } = require('./lib/buildPDF');

async function test() {
  const industry = 'SaaS software';
  const company = 'TestCo';

  console.log('=== Signal Labs Report Generator Test ===\n');

  // Step 1: Fetch data
  console.log('1. Fetching data sources...');
  const [newsData, blsData, trendsData] = await Promise.all([
    fetchNews(industry),
    fetchBLS(industry),
    fetchTrends(industry)
  ]);
  console.log(`   ✓ News: ${newsData.length} articles`);
  console.log(`   ✓ BLS: ${blsData.sectorName} — ${blsData.currentEmployment} employed, ${blsData.yearOverYearChange} YoY`);
  console.log(`   ✓ Trends: "${trendsData.keyword}" score ${trendsData.interestScore}, trending: ${trendsData.trending}`);

  // Step 2: Generate report
  console.log('\n2. Generating report with Claude...');
  const reportData = await generateReport({ industry, company, newsData, blsData, trendsData });
  console.log('   ✓ Report generated');
  console.log(`   Market size: ${reportData.marketSize}`);
  console.log(`   Opportunity: ${reportData.opportunity?.title}`);

  // Step 3: Build PDF
  console.log('\n3. Building PDF...');
  const pdfPath = await buildPDF({ reportData, industry, company });
  console.log(`   ✓ PDF saved: ${pdfPath}`);

  console.log('\n=== TEST COMPLETE ===');
  console.log('Open the PDF to verify the report looks correct.');
  console.log('If everything looks good, configure your .env and run: node server.js');
}

test().catch(err => {
  console.error('\n❌ Test failed:', err.message);
  process.exit(1);
});
