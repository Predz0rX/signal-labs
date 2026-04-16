require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// New modular architecture
const reportController = require('./lib/controllers/reportController');

const input = JSON.parse(process.argv[2] || '{}');
const { email, industry, company, country, stage, team, pains, decision, competitorsList, advantage } = input;

const reportsDir = path.join(__dirname, 'reports');
const leadsFile = path.join(__dirname, 'leads', 'leads.json');
if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
if (!fs.existsSync(path.dirname(leadsFile))) fs.mkdirSync(path.dirname(leadsFile), { recursive: true });
if (!fs.existsSync(leadsFile)) fs.writeFileSync(leadsFile, '[]');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

// Initialize the modular engine
reportController.init({
  supabaseClient: supabase,
  reportsDirectory: reportsDir,
  leadsFilePath: leadsFile
});

(async () => {
  try {
    const result = await reportController.processReport({
      email, industry, company, country, stage, team, pains, decision, competitorsList, advantage
    });
    console.log(`[worker] Report completed: ${result.token} -> ${email}`);
  } catch (err) {
    console.error('[worker] Fatal:', err && err.stack ? err.stack : err);
    process.exitCode = 1;
  }
})();
