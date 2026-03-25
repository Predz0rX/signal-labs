require('dotenv').config();

const { fetchNews } = require('./lib/fetchNews');
const { fetchBLS } = require('./lib/fetchBLS');
const { fetchTrends } = require('./lib/fetchTrends');
const { generateReport } = require('./lib/generateReport');
const { buildPDF } = require('./lib/buildPDF');
const { sendEmail } = require('./lib/sendEmail');

async function test() {
  const industry = 'SaaS software';
  const company = 'Signal Labs Test';
  const email = 'carlosalazarphotography@gmail.com';

  console.log('=== Signal Labs Full Pipeline Test (with email) ===\n');

  console.log('1. Fetching data sources...');
  const [newsData, blsData, trendsData] = await Promise.all([
    fetchNews(industry),
    fetchBLS(industry),
    fetchTrends(industry)
  ]);
  console.log(`   ✓ News: ${newsData.length} articles`);
  console.log(`   ✓ BLS: ${blsData.sectorName} — ${blsData.currentEmployment}, ${blsData.yearOverYearChange} YoY`);
  console.log(`   ✓ Trends: score ${trendsData.interestScore}`);

  console.log('\n2. Generating report with Claude...');
  const reportData = await generateReport({ industry, company, newsData, blsData, trendsData });
  console.log(`   ✓ Report generated — Opportunity: ${reportData.opportunity?.title}`);

  console.log('\n3. Building PDF...');
  const pdfPath = await buildPDF({ reportData, industry, company });
  console.log(`   ✓ PDF: ${pdfPath}`);

  console.log(`\n4. Sending email to ${email}...`);
  await sendEmail({ to: email, industry, company, pdfPath });
  console.log(`   ✓ Email sent!`);

  console.log('\n=== PIPELINE COMPLETE — Check your inbox! ===');
}

test().catch(err => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
