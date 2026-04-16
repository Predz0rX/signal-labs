# Signal Labs v2 — AI-Powered Market Intelligence Platform

> **11 real data sources. 16 report modules. 3 export formats. One API call.**

Signal Labs generates comprehensive, data-backed market intelligence reports for any industry in under 60 seconds. Every insight is grounded in real data from government sources (FRED, SEC, BLS), market APIs (Alpha Vantage, NewsAPI), and community signals (Reddit, HackerNews, OpenAlex).

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/Predz0rX/signal-labs.git
cd signal-labs

# 2. Install
npm install

# 3. Configure (minimum viable)
cp .env.example .env
# Edit .env — at minimum set:
#   ANTHROPIC_API_KEY=your-key
#   NEWS_API_KEY=your-key

# 4. Run
npm start

# 5. Test (no API keys needed)
node test-aaa.js
```

Open **http://localhost:3000** and submit the form to generate your first report.

---

## Architecture

```
signal-labs/
├── server.js                        # Express server (CORS, rate limiting, routes)
├── lib/
│   ├── core/                        # Engine
│   │   ├── DataSourceRegistry.js    # Orchestrates 11 sources (rate limit, cache, fallback)
│   │   ├── ReportEngine.js          # Runs 16 modules in priority order
│   │   ├── CacheManager.js          # 2-tier: in-memory (node-cache) + Supabase
│   │   └── ConfidenceScorer.js      # Verified/Estimated/Projected per data point
│   ├── sources/                     # 11 data sources (uniform interface)
│   ├── modules/                     # 16 report modules (each with focused LLM prompt)
│   ├── controllers/                 # reportController + apiController (v1 REST)
│   ├── exporters/                   # PDF (Puppeteer), PPTX (pptxgenjs), XLSX (exceljs)
│   └── scheduler.js                 # Automated weekly/biweekly/monthly reports
├── templates/
│   ├── web-report.html              # Interactive web report with Chart.js
│   └── report.html                  # PDF template
├── public/                          # Dashboard (Supabase auth)
├── migrations/                      # Supabase SQL migrations
└── test-aaa.js                      # Full pipeline test (no API keys needed)
```

---

## Data Sources (11)

| Source | Data | Cost | API Key? |
|--------|------|------|----------|
| **FRED** | GDP, CPI, unemployment, consumer sentiment, yield curve, 500K+ series | Free | Yes |
| **SEC EDGAR** | Public company financials (10-K): revenue, margins, assets | Free | No (User-Agent) |
| **BLS** | Sector employment, YoY growth | Free | No |
| **Alpha Vantage** | Stock prices, sector ETFs, company fundamentals | Free (25/day) | Yes |
| **World Bank** | GDP, population, FDI for 50+ countries | Free | No |
| **NewsAPI** | Industry news, last 7 days | Free (100/day) | Yes |
| **Reddit** | Community sentiment, pain points, trending topics | Free (OAuth) | Yes |
| **HackerNews** | Tech community pulse, competitor mentions | Free (10K/hr) | No |
| **OpenAlex** | Academic research trends, R&D velocity | Free (100K/day) | No |
| **OECD** | International economic indicators, 38 countries | Free | No |
| **Google Trends** | Search interest, velocity, related queries | Free | No |

### Environment Variables

```bash
# Required
ANTHROPIC_API_KEY=         # Claude API
NEWS_API_KEY=              # newsapi.org

# Recommended (free)
FRED_API_KEY=              # fred.stlouisfed.org
ALPHA_VANTAGE_API_KEY=     # alphavantage.co
REDDIT_CLIENT_ID=          # reddit.com/prefs/apps
REDDIT_CLIENT_SECRET=

# Optional
SUPABASE_URL=              # For persistence + auth
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=            # Email delivery
```

5 of 11 sources work with **zero API keys** (BLS, World Bank, HN, OpenAlex, OECD).

---

## Report Modules (16)

### Free Tier (12 modules)
| Module | What it produces | Key sources |
|--------|-----------------|-------------|
| Market Score | Composite 1-100 score from 6+ real indicators | FRED, BLS, Alpha Vantage |
| Market Sizing | TAM/SAM/SOM anchored in GDP + SEC revenues | FRED, World Bank, SEC |
| Trend Analysis | 3 trends cross-referencing 7 sources | All sources |
| Competitive Landscape | 3 competitors with real SEC financials | SEC, Alpha Vantage, HN |
| Signals Radar | 2 signals triangulated from News+HN+Reddit | NewsAPI, HN, Reddit |
| Quick Wins | 3 prioritized actions with timeframes | Google Trends, News |
| Opportunity | #1 strategic opportunity with urgency | All sources |
| Executive Summary | CEO brief with bottom-line callout | FRED, BLS, SEC, World Bank |
| Risk Assessment | 6 risk categories scored 1-10 | FRED, World Bank, OECD |
| Opportunity Radar | 5 micro-trends with velocity scores | HN, Reddit, OpenAlex |
| Customer Intelligence | ICP, pain points, messaging from forums | Reddit, HN, Trends |
| Growth Playbook | 90-day plan: channels, budget, timeline | All sources |

### Premium Tier (4 additional)
| Module | What it produces |
|--------|-----------------|
| Financial Health | SEC benchmark tables, unit economics, funding landscape |
| Investment Readiness | 8-dimension score for startups seeking funding |
| Marketing Intel | Keyword opportunities, content gaps, social strategy |
| Tech Stack Analysis | Emerging tech landscape, research frontier |

---

## API Endpoints

### Public
```
GET  /                              Landing page
GET  /report/:token                 Web report viewer
GET  /report/:token/export/pdf      Download PDF
GET  /report/:token/export/pptx     Download PowerPoint (12 slides)
GET  /report/:token/export/xlsx     Download Excel (10 tabs)
POST /api/report                    Generate free report
GET  /health                        System status + source/module count
```

### API v1 (key-authenticated)
```
POST /api/v1/reports                Create report programmatically
GET  /api/v1/reports                List reports
GET  /api/v1/reports/:token         Get report JSON
GET  /api/v1/reports/:token/export/:format  Export
POST /api/v1/webhooks               Register webhook (report.completed)
GET  /api/v1/webhooks               List webhooks
DELETE /api/v1/webhooks/:id         Delete webhook
```

### Rate Limits
- General: 100 requests / 15 minutes
- Report generation: 10 / hour
- API v1: 30 / minute

---

## Database Setup (Supabase)

Run `migrations/001_aaa_upgrade.sql` in your Supabase SQL editor. This creates:

- `data_cache` — 2-tier caching for API responses
- `report_schedules` — Automated report generation
- `api_keys` — API v1 authentication
- `webhooks` — Event notifications
- `report_versions` — Report history

All tables include Row Level Security (RLS) policies.

---

## Testing

```bash
# Full pipeline test (no API keys needed)
node test-aaa.js

# Tests: module loading, confidence scorer, cache, HN + World Bank live data,
# PPTX generation (230KB), XLSX generation (15KB), mock report saving
```

---

## Deployment

### Render
```bash
# Procfile already configured
npm start
```

### Vercel
```bash
vercel --prod
```

### Docker
```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

---

## Confidence System

Every data point carries metadata:

| Badge | Confidence | Sources |
|-------|-----------|---------|
| **Verified** (green) | > 80% | FRED, SEC EDGAR, BLS, World Bank |
| **Estimated** (yellow) | 50-80% | Alpha Vantage, NewsAPI, HackerNews |
| **Projected** (gray) | < 50% | Reddit, Google Trends, LLM estimates |

Reports display an overall confidence bar and source attribution chips.

---

## License

Proprietary. All rights reserved.
