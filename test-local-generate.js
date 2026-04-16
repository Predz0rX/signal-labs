require('dotenv').config();
process.env.BASE_URL = 'https://signal-labs-wddk.onrender.com';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { fetchNews } = require('./lib/fetchNews');
const { fetchBLS } = require('./lib/fetchBLS');
const { fetchTrends } = require('./lib/fetchTrends');
const { generateReport } = require('./lib/generateReport');

const { Resend } = require('resend');

async function run() {
  const industry = 'SaaS', company = 'Predz0rx Ventures', country = 'United States';
  const userContext = {
    industry, country, stage: 'growth', teamSize: '6-20',
    pains: ['competitors','expansion'],
    bigDecision: 'Expand to Mexico',
    namedCompetitors: 'HubSpot, Pipedrive',
    competitiveAdvantage: 'niche'
  };

  console.log('Fetching data...');
  const [newsData, blsData, trendsData] = await Promise.all([
    fetchNews(industry), fetchBLS(industry), fetchTrends(industry)
  ]);
  userContext._trendsScore = trendsData.interestScore || 50;
  userContext._blsYoY = blsData.yearOverYearChange || 'N/A';
  userContext._newsCount = newsData.length;

  console.log('Generating with Claude...');
  const reportData = await generateReport({ industry, company, country, userContext, newsData, blsData, trendsData });

  const token = crypto.randomBytes(16).toString('hex');
  const date = new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});
  const payload = { report: reportData, meta: { token, email:'carlosalazarphotography@gmail.com', industry, company, country, date, stage:'growth', teamSize:'6-20', pains:['competitors','expansion'], bigDecision:'Expand to Mexico', blsYoY: blsData.yearOverYearChange||'N/A', trendsScore: trendsData.interestScore||50, newsCount: newsData.length, createdAt: new Date().toISOString(), viewed: false } };

  const rDir = path.join(__dirname,'reports');
  if(!fs.existsSync(rDir)) fs.mkdirSync(rDir,{recursive:true});
  fs.writeFileSync(path.join(rDir, `report-${token}.json`), JSON.stringify(payload,null,2));
  console.log('Report saved:', token);

  // Upload to Render via API (PUT the file content)
  const reportUrl = `https://signal-labs-wddk.onrender.com/report/${token}`;

  // Send email
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: process.env.FROM_EMAIL || 'onboarding@resend.dev',
    to: ['carlosalazarphotography@gmail.com'],
    subject: `Your SaaS Market Snapshot is ready`,
    html: `<div style="font-family:sans-serif;max-width:540px;margin:0 auto;padding:28px 20px"><div style="font-size:19px;font-weight:800;margin-bottom:20px">signal<span style="color:#0071E3">labs</span></div><h2 style="font-size:20px;font-weight:800;margin:0 0 8px">Your Market Snapshot is ready</h2><p style="color:#6B7280;margin:0 0 24px;line-height:1.6">Your <strong>SaaS</strong> Market Intelligence Report is ready. Click below to open your personalized report with live charts and competitor analysis.</p><a href="${reportUrl}" style="display:inline-block;padding:13px 26px;background:#0071E3;color:#fff;font-size:14px;font-weight:700;border-radius:10px;text-decoration:none">Open my report &rarr;</a><p style="font-size:11px;color:#9CA3AF;margin-top:18px">Link: ${reportUrl}</p></div>`
  });

  if(error) { console.error('Email error:', error); } else { console.log('Email sent!'); }
  console.log('\nReport URL:', reportUrl);
  console.log('\nNOTE: To make the report viewable online, upload the JSON to Render.');
  return token;
}

run().catch(e => { console.error(e.message); process.exit(1); });
