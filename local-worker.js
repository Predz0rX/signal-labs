require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// New modular architecture
const reportController = require('./lib/controllers/reportController');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing Supabase env vars');
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const reportsDir = path.join(__dirname, 'reports');
const leadsFile = path.join(__dirname, 'leads', 'leads.json');
if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

// Initialize the modular engine
reportController.init({
  supabaseClient: supabase,
  reportsDirectory: reportsDir,
  leadsFilePath: leadsFile
});

async function processOne(job) {
  const payload = job.payload || {};
  await reportController.processReport({ ...payload, requestId: job.id });
}

async function tick() {
  const { data: jobs, error } = await supabase
    .from('report_requests')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) { console.error('[local-worker] read error', error.message); return; }
  if (!jobs || !jobs.length) return;
  const job = jobs[0];
  const { error: claimError } = await supabase.from('report_requests').update({ status: 'processing', started_at: new Date().toISOString() }).eq('id', job.id).eq('status', 'pending');
  if (claimError) { console.error('[local-worker] claim error', claimError.message); return; }
  try { await processOne(job); }
  catch (err) {
    console.error('[local-worker] fail', err && err.message ? err.message : err);
    await supabase.from('report_requests').update({ status: 'failed', error_message: String(err.message || err), completed_at: new Date().toISOString() }).eq('id', job.id);
  }
}

console.log('[local-worker] v2 (modular engine) Started. Polling every 15s...');
setInterval(() => tick().catch(err => console.error(err)), 15000);
tick().catch(err => console.error(err));
