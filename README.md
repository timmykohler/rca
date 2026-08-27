# Resources & Claims Analysis Tool
### Halbert Hargrove — Internal Planning Tool  
**Version 1.1** · FastAPI + React · Python 3.10+ · Node 18+

A full-stack retirement readiness calculator built on the **funded ratio framework**:

> Pittman, S. (2015). *"Use Your Client's Funded Ratio to Simplify and Improve Retirement Planning Decisions."* The Journal of Retirement, Fall 2015.

---

## Quick Start

### Prerequisites
- Python 3.10+  
- Node.js 18+

### Production (single server)
```bash
chmod +x start.sh
./start.sh
# App at http://localhost:8000
# API docs at http://localhost:8000/docs
```

### Development (hot reload)
```bash
chmod +x dev.sh
./dev.sh
# Frontend: http://localhost:5173
# Backend:  http://localhost:8000
```

### Run Tests
```bash
cd backend
pip install -r requirements.txt
pytest tests/ -v
```

---

## Features

| Feature | Details |
|---|---|
| **Manual Input** | Full data-entry form — portfolio, spending goals, SS, pensions, annuities, private assets, future savings |
| **MGP XML Import** | Upload MoneyGuidePro XML export → auto-map all fields → review → calculate |
| **Funded Ratio Engine** | Pittman (2015) Eq. 1–3 · SSA 2022 life tables · TIPS yield curve |
| **Results Dashboard** | Funded ratio gauge · Sankey flow chart · pie breakdowns · benchmark comparison |
| **Scenario Comparison** | Side-by-side what-if analysis (spending ±10%, delay SS, retire later, custom) |
| **PDF Export** | Branded ReportLab report with full breakdown table |
| **Yield Curve Settings** | Live TIPS curve viewer · manual per-term override · FRED auto-update script |

---

## Project Structure

```
rca-tool/
├── backend/
│   ├── main.py                   # FastAPI app, all routers registered
│   ├── models.py                 # Pydantic input/output models
│   ├── requirements.txt          # fastapi, uvicorn, reportlab, httpx, pytest
│   ├── yield_curve.py            # FRED TIPS fetcher (run with --save to patch)
│   ├── engine/
│   │   └── actuarial.py          # Core calculation engine (Pittman Eq. 1–3)
│   ├── routers/
│   │   ├── calculate.py          # POST /api/calculate
│   │   ├── xml_import.py         # POST /api/import-xml
│   │   ├── report.py             # POST /api/report  (PDF)
│   │   └── yield_curve.py        # GET/POST/DELETE /api/yield-curve
│   └── tests/
│       └── test_actuarial.py     # 30+ unit + integration tests
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── ManualInputPage.jsx    # Full input form
│       │   ├── XmlImportPage.jsx      # MGP drag-drop upload + review
│       │   ├── ResultsPage.jsx        # Dashboard with Sankey + charts
│       │   ├── ScenarioPage.jsx       # Side-by-side what-if comparison
│       │   └── SettingsPage.jsx       # Yield curve viewer + FRED instructions
│       ├── components/
│       │   ├── FormFields.jsx         # Input, Select, Toggle, SectionCard, etc.
│       │   ├── InvestorInfoSection.jsx
│       │   ├── PortfolioSection.jsx
│       │   ├── SpendingGoalsSection.jsx
│       │   └── IncomeSections.jsx     # SS, Pension, Annuity, Other, Savings, Private
│       ├── hooks/
│       │   └── useResultsStore.jsx    # Session-scoped result state
│       └── utils/
│           ├── api.js                 # Axios client (calculate, import, report)
│           └── format.js             # Dollar/percent formatters + status metadata
├── sample_mgp_export.xml         # Test file — Smith family (John 65, Jane 63)
├── rca-tool.service              # systemd unit for Linux server deployment
├── update_yields.sh              # Monthly cron script — FRED fetch + service restart
├── start.sh                      # Production: build frontend → start server
└── dev.sh                        # Development: hot-reload both servers
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/calculate` | Run funded ratio calculation |
| `POST` | `/api/import-xml` | Parse MoneyGuidePro XML → PlanInput JSON |
| `POST` | `/api/report` | Generate branded PDF report |
| `GET`  | `/api/yield-curve` | Get active real TIPS yield curve |
| `POST` | `/api/yield-curve/override` | Set manual yield curve override |
| `DELETE` | `/api/yield-curve/override` | Clear override, revert to embedded |
| `GET`  | `/api/health` | Health check |

Full interactive docs: `http://localhost:8000/docs`

---

## Calculation Methodology

### Spending Liability — Pittman Eq. (1)
```
L = Σ [ D_t × p_t / (1 + r_t)^t ]
```
- `D_t` — real spending in period t  
- `p_t` — survival probability (SSA 2022 Period Life Tables, male + female)  
- `r_t` — real TIPS yield for maturity t (interpolated from embedded curve)

### Human Capital / Future Savings — Eq. (2)
```
HC = Σ [ C_t / (1 + r_t)^t ]
```
No mortality discount — assumes life insurance covers pre-retirement death.

### Funded Ratio — Eq. (3)
```
FR = (Portfolio After-Tax + Private Assets + SS PV + Pension PV + Annuity PV + HC) 
     ÷ Total Spending Liability
```

### Maximum Sustainable Withdrawal Rate — Eq. (8)
```
Withdrawal Rate ≤ 1 / Annuity Factor
```

---

## MoneyGuidePro XML Field Mapping

| MGP Element | RCA Field | Notes |
|---|---|---|
| `Client` DOB / Age | `investor_age` | Age computed from DOB if provided |
| `CoClient` | `co_investor_*` | Full joint-life mortality support |
| `IncomeTaxRate` | `effective_income_tax_rate` | Handles `24` or `0.24` formats |
| `Asset` | `portfolio_assets` | Maps account type strings to enum |
| `Goal` | `spending_goals` | Includes AnnualIncrease as adj% |
| `SocialSecurityBenefit` | `social_security` | COLA, start age, owner |
| `Pension` | `pensions` | Survivorship % and start age |
| `Annuity` | `annuities` | Income annuities (not deferred) |
| `Contribution` | `future_savings` | Pre-tax / Roth / taxable type |
| `RealEstate` | `private_assets` | Net of mortgage, tax on gain |

---

## Yield Curve Updates

### Manual override (via Settings tab)
Edit yields directly in the UI — changes persist for the server session.

### Automated via FRED
```bash
# Get a free API key at fred.stlouisfed.org/docs/api/api_key.html
export FRED_API_KEY=your_key_here

# Preview current yields
cd backend && python yield_curve.py

# Update actuarial.py in-place
python yield_curve.py --save

# Schedule monthly (1st of month, 6 AM) — add to crontab
0 6 1 * * /opt/rca-tool/update_yields.sh >> /var/log/rca-yields.log 2>&1
```

FRED series: `DFII5` (5yr), `DFII7` (7yr), `DFII10` (10yr), `DFII20` (20yr), `DFII30` (30yr).

---

## Production Deployment (Linux)

```bash
# 1. Install to /opt
sudo cp -r rca-tool /opt/rca-tool
sudo chown -R youruser:youruser /opt/rca-tool

# 2. Edit the service file
sudo nano /opt/rca-tool/rca-tool.service
# Set User= and WorkingDirectory= to your actual user and path

# 3. Create env file
sudo mkdir -p /etc/rca-tool
echo "FRED_API_KEY=your_key" | sudo tee /etc/rca-tool/env

# 4. Install and start service
sudo cp /opt/rca-tool/rca-tool.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable rca-tool
sudo systemctl start rca-tool

# 5. Check status
sudo systemctl status rca-tool
sudo journalctl -u rca-tool -f
```

---

## Mortality Tables

Uses **SSA 2022 Period Life Tables** (Social Security Area Population).  
Source: SSA 2025 Trustees Report, Table 4.C6. Ages 0–119, male and female.

---

*© Halbert Hargrove. Internal use only. Not investment, tax, or legal advice.*  
*Based on Pittman, S. (2015), The Journal of Retirement, Fall 2015.*

---

## Deployment Options

### Option 1 — Local network (simplest)
Run on one machine, share the IP with your team over the office network.
```
.\start.bat          # Windows
./start.sh           # Mac/Linux
```
Find your IP: `ipconfig` (Windows) or `ifconfig` (Mac). Share `http://192.168.x.x:8000`.

---

### Option 2 — Docker (recommended for a dedicated server)
Requires Docker Desktop installed.
```bash
docker build -t rca-tool .
docker run -d -p 8000:8000 -e FRED_API_KEY=your_key --name rca rca-tool
```
Open `http://localhost:8000`. To share on your network, use your machine's IP instead.

Update after code changes:
```bash
docker build -t rca-tool . && docker stop rca && docker rm rca && docker run -d -p 8000:8000 --name rca rca-tool
```

---

### Option 3 — Vercel (frontend) + Railway (backend)
For a public URL accessible outside your office network.

**Backend → Railway:**
1. Create a new Railway project, deploy from GitHub
2. Set the root directory to `backend/`
3. Railway will use `backend/Dockerfile.backend` automatically
4. Add environment variable: `FRED_API_KEY=your_key`
5. Copy the Railway public URL (e.g. `https://rca-backend.up.railway.app`)

**Frontend → Vercel:**
1. `cd frontend && vercel`
2. In Vercel dashboard → Project Settings → Environment Variables:
   Add `VITE_API_URL = https://rca-backend.up.railway.app`
3. Redeploy

---

### FRED API Key (for live yield curves)
Get a free key at https://fred.stlouisfed.org/docs/api/api_key.html
Set it as `FRED_API_KEY` environment variable, then click "Refresh from FRED" in Settings.
