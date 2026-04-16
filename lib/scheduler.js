/**
 * Report Scheduler — polls Supabase `report_schedules` table and triggers auto-generation.
 *
 * Supabase table required:
 * CREATE TABLE report_schedules (
 *   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   email TEXT NOT NULL,
 *   industry TEXT NOT NULL,
 *   company TEXT,
 *   country TEXT DEFAULT 'United States',
 *   frequency TEXT NOT NULL CHECK (frequency IN ('weekly','biweekly','monthly')),
 *   stage TEXT,
 *   team TEXT,
 *   pains JSONB DEFAULT '[]',
 *   decision TEXT,
 *   competitors TEXT,
 *   advantage TEXT,
 *   tier TEXT DEFAULT 'free',
 *   next_run_at TIMESTAMPTZ NOT NULL,
 *   last_run_at TIMESTAMPTZ,
 *   last_token TEXT,
 *   active BOOLEAN DEFAULT true,
 *   created_at TIMESTAMPTZ DEFAULT now()
 * );
 */

const FREQUENCY_MS = {
  weekly: 7 * 24 * 60 * 60 * 1000,
  biweekly: 14 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

let supabase = null;
let reportController = null;
let intervalId = null;

function init({ supabaseClient, controller }) {
  supabase = supabaseClient;
  reportController = controller;
}

function start(pollIntervalMs = 60000) {
  if (!supabase) {
    console.warn('[scheduler] No Supabase client — scheduler disabled');
    return;
  }
  console.log(`[scheduler] Started. Polling every ${pollIntervalMs / 1000}s`);
  intervalId = setInterval(() => tick().catch(err => console.error('[scheduler] tick error:', err.message)), pollIntervalMs);
  tick().catch(err => console.error('[scheduler] initial tick error:', err.message));
}

function stop() {
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
}

async function tick() {
  const now = new Date().toISOString();
  const { data: dueSchedules, error } = await supabase
    .from('report_schedules')
    .select('*')
    .eq('active', true)
    .lte('next_run_at', now)
    .order('next_run_at', { ascending: true })
    .limit(5);

  if (error) {
    console.error('[scheduler] Query error:', error.message);
    return;
  }
  if (!dueSchedules || dueSchedules.length === 0) return;

  for (const schedule of dueSchedules) {
    try {
      console.log(`[scheduler] Processing schedule ${schedule.id} for ${schedule.email} (${schedule.industry})`);

      const result = await reportController.processReport({
        email: schedule.email,
        industry: schedule.industry,
        company: schedule.company || '',
        country: schedule.country || 'United States',
        stage: schedule.stage || '',
        team: schedule.team || '',
        pains: schedule.pains || [],
        decision: schedule.decision || '',
        competitorsList: schedule.competitors || '',
        advantage: schedule.advantage || '',
        tier: schedule.tier || 'free'
      });

      // Calculate next run
      const nextRun = new Date(Date.now() + (FREQUENCY_MS[schedule.frequency] || FREQUENCY_MS.monthly));

      await supabase.from('report_schedules').update({
        last_run_at: new Date().toISOString(),
        last_token: result.token,
        next_run_at: nextRun.toISOString()
      }).eq('id', schedule.id);

      console.log(`[scheduler] Done: ${schedule.id} -> ${result.token}. Next: ${nextRun.toISOString()}`);
    } catch (err) {
      console.error(`[scheduler] Failed schedule ${schedule.id}:`, err.message);
    }
  }
}

module.exports = { init, start, stop };
