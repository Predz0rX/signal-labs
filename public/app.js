const { createClient } = supabase;
const config = window.SIGNAL_LABS_CONFIG;
const client = createClient(config.supabaseUrl, config.supabaseAnonKey);

const views = {
  dashboard: document.getElementById('dashboardView'),
  account: document.getElementById('accountView'),
  plans: document.getElementById('plansView'),
};

const titles = {
  dashboard: ['Client dashboard', 'Your reports'],
  account: ['Account', 'Your access details'],
  plans: ['Plans', 'Signal Labs plans'],
};

const pageEyebrow = document.getElementById('pageEyebrow');
const pageTitle = document.getElementById('pageTitle');
const loadingState = document.getElementById('loadingState');
const userEmailEl = document.getElementById('userEmail');
const signOutBtn = document.getElementById('signOutBtn');

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function setView(name) {
  Object.entries(views).forEach(([key, node]) => {
    node.classList.toggle('hidden', key !== name);
  });
  document.querySelectorAll('.nav-link').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === name);
  });
  const [eyebrow, title] = titles[name];
  pageEyebrow.textContent = eyebrow;
  pageTitle.textContent = title;
}

function getReportMeta(report) {
  const meta = report.meta || report.payload?.meta || {};
  return {
    token: report.token || meta.token,
    industry: report.industry || meta.industry || 'Unknown industry',
    company: report.company || meta.company || 'Signal Labs report',
    createdAt: report.created_at || meta.createdAt || null,
    stage: report.stage || meta.stage || '—',
    country: report.country || meta.country || '—',
  };
}

function renderReports(reports) {
  const list = document.getElementById('reportsList');
  const empty = document.getElementById('reportsEmpty');
  list.innerHTML = '';

  if (!reports.length) {
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  reports.forEach((report) => {
    const meta = getReportMeta(report);
    const article = document.createElement('article');
    article.className = 'report-card';
    article.innerHTML = `
      <div class="report-card-head">
        <div>
          <p class="eyebrow">${meta.industry}</p>
          <h3>${meta.company || 'Market report'}</h3>
        </div>
        <span class="pill mono">${meta.token?.slice(0, 8) || 'report'}</span>
      </div>
      <div class="detail-grid compact">
        <div class="detail-item"><span>Created</span><strong>${formatDate(meta.createdAt)}</strong></div>
        <div class="detail-item"><span>Stage</span><strong>${meta.stage || '—'}</strong></div>
        <div class="detail-item"><span>Country</span><strong>${meta.country || '—'}</strong></div>
      </div>
      <div class="report-card-actions">
        <a class="button button-primary" href="/report/${meta.token}">Open report</a>
        <a class="button button-secondary" href="/report/${meta.token}/export/pptx" title="Download PowerPoint" style="font-size:11px;padding:6px 12px">PPTX</a>
        <a class="button button-secondary" href="/report/${meta.token}/export/xlsx" title="Download Excel" style="font-size:11px;padding:6px 12px">XLSX</a>
        <a class="button button-secondary" href="/report/${meta.token}/export/pdf" title="Download PDF" style="font-size:11px;padding:6px 12px">PDF</a>
      </div>
    `;
    list.appendChild(article);
  });
}

function updateMetrics(reports) {
  const latest = reports[0] ? getReportMeta(reports[0]) : null;
  document.getElementById('metricReports').textContent = String(reports.length);
  document.getElementById('metricIndustry').textContent = latest?.industry || '—';
  document.getElementById('metricDate').textContent = latest ? formatDate(latest.createdAt) : '—';
  document.getElementById('accountReportCount').textContent = String(reports.length);
}

async function loadDashboard(session) {
  const email = session.user.email;
  const userId = session.user.id;

  userEmailEl.textContent = email;
  document.getElementById('accountEmail').textContent = email;
  document.getElementById('accountUserId').textContent = userId;
  document.getElementById('accountLastSignIn').textContent = formatDate(session.user.last_sign_in_at);

  const { data, error } = await client
    .from('reports')
    .select('token, email, payload')
    .eq('email', email);

  const reports = (data || []).sort((a, b) => {
    const aDate = new Date(getReportMeta(a).createdAt || 0).getTime();
    const bDate = new Date(getReportMeta(b).createdAt || 0).getTime();
    return bDate - aDate;
  });

  if (error) {
    throw error;
  }

  renderReports(reports);
  updateMetrics(reports);
}

async function ensureSession() {
  if (!config.supabaseUrl.includes('supabase.co') || config.supabaseAnonKey.startsWith('YOUR_')) {
    loadingState.innerHTML = '<p>Supabase client env vars are missing. Add SIGNAL_LABS_SUPABASE_URL and SIGNAL_LABS_SUPABASE_ANON_KEY.</p>';
    return;
  }

  const { data, error } = await client.auth.getSession();
  if (error) throw error;

  const session = data.session;
  if (!session) {
    window.location.href = '/auth';
    return;
  }

  await loadDashboard(session);
  loadingState.classList.add('hidden');
  setView('dashboard');
}

document.querySelectorAll('.nav-link').forEach((button) => {
  button.addEventListener('click', () => setView(button.dataset.view));
});

signOutBtn.addEventListener('click', async () => {
  await client.auth.signOut();
  window.location.href = '/auth';
});

client.auth.onAuthStateChange((_event, session) => {
  if (!session) {
    window.location.href = '/auth';
  }
});

ensureSession().catch((error) => {
  loadingState.innerHTML = `<p>${error.message || 'Could not load dashboard.'}</p>`;
});
