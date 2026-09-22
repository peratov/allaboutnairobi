# Phase 0: Research & Foundation - Detailed 4-Week Plan

**Goal**: Confirm 70%+ of Kenya data sources are accessible and accurate before starting code.  
**Duration**: 4 weeks (parallel tracks)  
**Go/No-Go Gate**: End of Week 4 → decide to proceed to Phase 1 or pivot

---

## Week 1: Groundwork & Team Setup

### Day 1-2: Repo & Local Build

- [ ] Clone Accra repo (done)
- [ ] Run `mise setup` in accra-source (30 min)
- [ ] Run `mise build` (5 min)
- [ ] Run `mise site` and open http://localhost:8814 (5 min)
- [ ] Read `accra-source/frontend/content/constants.yaml` line by line (30 min)
  - Note: Every entry has `value`, `description` (with URL), `last_verified`, `fail_on`
  - This is what we replicate for Kenya
- [ ] Skim `accra-source/frontend/ursus_config.py` (understand where derived values live) (30 min)

**Deliverable**: Accra site builds and runs locally. You understand the constants structure.

### Day 3-5: Team & Stakeholder Decisions

- [ ] **Assign roles**:
  - Data researcher / content lead
  - Backend engineer (will own data pipelines)
  - Frontend engineer (will adapt UI)
  - Legal/compliance reviewer
  
- [ ] **Make tech decisions**:
  - Separate GitHub repo or branch? (Recommend: separate repo)
  - Domain: allaboutnairobi.com or staging first?
  - Vercel project: new or staging subdomain?
  - Hosting: Vercel (same as Accra) or alternative?
  
- [ ] **Plan partnerships** (see section below):
  - Who reaches out to KNBS? KNBS Director or research department?
  - Who contacts KRA? Tax rates team or public affairs?
  - Who verifies housing data? Real estate agents or online platforms?
  
- [ ] **Set up tracking**:
  - GitHub project or Trello for Phase 0 tasks
  - Spreadsheet tracking data sources (access confirmed: Y/N, contact: name/email, notes)
  - Calendar: schedule outreach calls

**Deliverable**: Team is clear on roles. Decision on repo structure made. Outreach plan assigned.

---

## Week 2-3: Data Source Research & Validation

### Primary Contacts & What to Verify

#### 🔴 CRITICAL (Project blocks if unavailable)

| Source | What You Need | Contact | How to Access | Effort |
| --- | --- | --- | --- | --- |
| **KRA - Kenya Revenue Authority** | Income tax bands, VAT rate, withholding rates, penalties | Tax department public relations or press office | Website: kra.go.ke; Public notices section | 1 call + 1 week for docs |
| **NSSF - National Social Security Fund** | Employee/employer pension contribution rates, benefit formula | NSSF Public Affairs or Customer Services | Website: nssf.or.ke; Act 45 of 2013 | 1 call + 1 week |
| **KNBS - Kenya National Bureau of Statistics** | 2019 or 2024 census data, PxWeb API access | Research & Innovation Department | Website: knbs.or.ke; API docs | Formal data request (2-3 weeks) |
| **EPRA - Energy and Petroleum Regulatory Authority** | Kenya Power tariff bands (residential, commercial), quarterly updates | Tariff & Economics Department | Website: epra.go.ke; Public tariff decisions | 1 call + data download |

#### 🟡 HIGH PRIORITY (Feature quality depends on it)

| Source | What You Need | Contact | How to Access | Effort |
| --- | --- | --- | --- | --- |
| **Kenya Power** | Actual meter rates, cost per kWh by band, connection fees | Customer Service or Public Affairs | Website: kplc.co.ke; Tariff brochures | Call + website download |
| **Safaricom / Airtel / Equity Bank** | M-Pesa limits, fees, USSD codes; bank account requirements | Customer Service (public info) | Website or helpline | Calls + community knowledge |
| **CAK - Communications Authority of Kenya** | FM broadcaster register (licensed stations, frequencies) | Broadcasting Department or register@cak.go.ke | Website: cak.go.ke; PDF download | 1 call + PDF parse |
| **Ministry of Labour** | Minimum wage announcement for current year | Ministry Public Affairs | Website: labour.go.ke; Gazette links | Website download |
| **Kenya Ministry of Health** | List of hospitals, health facilities, SHA coverage | Health Systems Department | Website: health.go.ke + county health offices | 1-2 calls |
| **Nairobi County Government** | Sub-county boundaries, ward data, local services | County Data Management Unit | Website: nairobiinformation.org | 1 call + data request |

#### 🟢 NICE-TO-HAVE (Can scrape or crowd-source if no API)

| Source | What You Need | Contact | How to Access | Effort |
| --- | --- | --- | --- | --- |
| **Housing Data** | Rent ranges by neighborhood (no official index) | Real estate sites + community | Jumia House, Airbnb, Rent wisely, Reddit r/Kenya | Scrape + manual audit |
| **Matatu Routes & Fares** | Main routes, fares, terminals (informal system) | Matatu operators / community | Local knowledge, Google Maps, Uber Eats delivery zones | Community survey |
| **Schools & Universities** | List of schools, tuition costs (if published) | Ministry of Education & County education offices | Website + school websites | Calls + compilation |
| **Radio Stream URLs** | Broadcast feeds for 20+ Nairobi stations | Radio Browser community + direct stations | radiobrower.info + station websites | Verify + test streams |

### Week 2 Execution Plan

**Monday-Tuesday**: Reach out to KNBS, KRA, NSSF, CAK
- **Email template** (adapt):
  ```
  Subject: Data Access Request - All About Nairobi Project
  
  Dear [Agency],
  
  We are building All About Nairobi, a free independent reference site for living in 
  Nairobi (modeled on allaboutberlin.com). We source every figure from official 
  government publications and would like to request access to [specific data - e.g., 
  census data via PxWeb API / licensed FM broadcaster register / published tax rates].
  
  Could we discuss how to access this data reliably and keep it current?
  
  Contact: [Name, Email, Phone]
  ```

**Wednesday-Thursday**: EPRA, Kenya Power, Ministry of Labour contact
- Check websites first (some publish tariffs/rates openly)
- Call if contact phone listed
- Follow up with formal data request if needed

**Friday**: Compile first data source spreadsheet
- Which sources confirmed accessible?
- Which need formal request?
- Which have known blockers?

**Deliverable (Week 2)**: Initial contact with 10+ agencies. Spreadsheet showing access status.

### Week 3 Execution Plan

**Mon-Wed**: Follow up on requests, test access
- [ ] KNBS PxWeb API: Get test account, query 2019 census (population by sub-county)
- [ ] KRA: Confirm 2026 tax brackets and VAT rate from public notice
- [ ] NSSF: Verify contribution rates from official guideline
- [ ] CAK: Download FM register PDF, test parse script
- [ ] Kenya Power: Confirm current tariff by band

**Thu-Fri**: Housing + transport data (community sourcing)
- [ ] Survey 10-20 Nairobi residents: "What housing costs confusion needs a guide?"
- [ ] Map 5-10 major matatu routes manually (Google Maps + locals)
- [ ] Identify neighborhoods with actual rent data (listing sites)

**Deliverable (Week 3)**: 70%+ of critical data sources confirmed. First data pipeline scripts started (radio register parser, etc.).

---

## Week 4: Synthesis & Gate 1 Review

### Final Checklist

**Data Sources** (must-have for Phase 1)
- [ ] KRA tax rates confirmed (source URL, verification date)
- [ ] NSSF rates confirmed
- [ ] EPRA electricity tariff confirmed
- [ ] Kenya Power connection fees confirmed
- [ ] Minimum wage confirmed
- [ ] KNBS census API access granted or alternative source found
- [ ] CAK FM register accessible
- [ ] Housing data plan (scraping vs. manual vs. partnership)
- [ ] Matatu routes map outlined

**Partnerships** (to support ongoing updates)
- [ ] Contact names at KNBS, KRA, CAK, Ministry of Labour
- [ ] Plan for quarterly tariff updates (EPRA)
- [ ] Real estate agent contact (rent band verification)
- [ ] Tech community contact (for fintech, mobile money updates)

**Risks & Mitigations**
- [ ] Show-stopper sources identified (if any)
- [ ] Fallback approaches for missing data documented
- [ ] Cost estimates for data partnerships (if applicable)

**Technical** (code familiarization)
- [ ] Accra repo builds locally
- [ ] Constants system understood
- [ ] Derived values (in ursus_config.py) understood
- [ ] Data pipeline pattern understood (see `scripts/build_radio_data.py`)

### Gate 1 Review: Friday Week 4

**Meeting attendees**: Data lead, tech lead, PM, legal (if applicable)

**Decision criteria**:
- ✅ **GO to Phase 1 if**:
  - 70%+ of critical data sources confirmed
  - No show-stoppers found
  - Team capacity confirmed
  - Budget/timeline acceptable
  
- ❌ **NO-GO if**:
  - Key sources (tax, census, utilities) blocked
  - Cost of data partnerships exceeds budget
  - Team capacity insufficient
  - Legal/compliance issues not solvable

- ⚠️ **CONDITIONAL GO if**:
  - 1-2 sources delayed (make contingency plan)
  - Cost higher than expected (reduce Phase 1 scope)

**If GO**: Proceed to Phase 1 (repo setup). Schedule Phase 1 kickoff.

**If NO-GO**: Document decision. Options: pivot to aggregator model, delay launch, reduce scope.

---

## Week 4 Deliverables (Gate 1 Submission)

### Document 1: Data Source Inventory
**File**: `KENYA_DATA_SOURCES_VERIFIED.md`

```markdown
# Verified Kenya Data Sources

## Tax & Revenue (KRA)
- Income tax bands 2026: [URL], verified [DATE], expires [DATE]
- VAT rate & levies: [URL], verified [DATE]
- Withholding tax: [URL], verified [DATE]

## Pensions (NSSF)
- Contribution rates: [URL/document], verified [DATE]
- Benefit formula: [URL], verified [DATE]

## Census (KNBS)
- 2019 census data: PxWeb API account granted, endpoints tested
- Expected 2024 data: Release date TBD
- Contact: [Name, email, phone]

## Electricity (EPRA + Kenya Power)
- Tariff bands: [Source], verified [DATE], next review [DATE]
- Connection fees: [Source], verified [DATE]

## Housing
- Rent data source: [Manual survey + Jumia House + listing sites], updated quarterly
- Challenges: No official index; we rank by band (like Accra)

## Radio (CAK)
- Licensed broadcasters register: PDF download confirmed, parse script written
- Update frequency: Quarterly or as needed
- Contact: [CAK department]

## Risks & Fallbacks
- [List show-stoppers and mitigation]
```

### Document 2: Phase 1 Kickoff Plan
**File**: `PHASE_1_KICKOFF.md`

Outline:
- Week 1: Repo setup (fork Accra, rename, empty structure)
- Week 2-3: Configure CMS and build pipeline (data loading)
- Week 4-5: Get build green on empty site, establish CI/CD
- By end of Week 5: `mise build` succeeds on Nairobi repo with zero Accra content

### Document 3: Partnership Agreements (if applicable)
**File**: `DATA_PARTNERSHIPS.md`

Any formal agreements with KNBS, KRA, etc. for data access.

### Document 4: Risk Register
**File**: `PHASE_0_RISKS.md`

Example:
```markdown
# Phase 0 Risks & Mitigations

## CRITICAL

### Risk: KNBS census data unavailable
- Probability: Low (data is published)
- Impact: Cannot build district-level demographic map
- Mitigation: Use 2019 census if 2024 delayed; build heatmap later

### Risk: KRA tax rates not officially published
- Probability: Low (rates are public)
- Impact: Cannot build tax calculator
- Mitigation: Get rates from Finance Bill notices; find accountant to verify

## HIGH

### Risk: Housing data source requires bot protection bypass
- Probability: Medium (listing sites use reCAPTCHA)
- Impact: Manual rent surveys only; less granular data
- Mitigation: Partner with property company; community surveys

### Risk: Matatu routes/fares constantly change
- Probability: High (informal system)
- Impact: Data goes stale fast
- Mitigation: Acknowledge in guides; set up quarterly update process

## MEDIUM

### Risk: Radio station streams become unavailable
- Probability: Medium (streams move)
- Impact: Radio feature breaks
- Mitigation: Build fallback to station listing only (no play button)

### Risk: Team member turnover
- Probability: Medium
- Impact: Project delays, knowledge loss
- Mitigation: Document all data sources; pair programming on critical paths
```

---

## Daily Standup Template (Weeks 2-4)

**5 min each day**:
```
Researcher:
- What I contacted today: [Agencies/contacts]
- What I heard back: [Confirmations/blockers]
- What's blocking me: [Waiting on reply / access denied / unclear requirements]

Tech:
- What I'm testing: [Data pipeline / API access]
- What works: [Confirmed access to X]
- What I'm blocked on: [API documentation / contact unresponsive]

Legal/PM:
- Partnerships progressing: [Yes/No/On hold]
- Budget/timeline adjustments needed: [Yes/No]
- Team capacity confirmed: [Yes/No]
```

---

## Success Criteria for Phase 0

✅ **Data**
- [ ] 70%+ of constants sources identified and verified
- [ ] Update frequency for each source documented
- [ ] Expiry dates set (when each figure needs re-checking)
- [ ] Worked examples tested against official sources

✅ **Partnerships**
- [ ] KNBS, KRA, CAK contacts established
- [ ] Quarterly update plan for critical data
- [ ] At least one housing data partner identified

✅ **Code**
- [ ] Accra repo builds locally
- [ ] Data pipeline pattern understood
- [ ] Windows-specific issues (PYTHONUTF8, paths) understood

✅ **Team & Timeline**
- [ ] Phase 0 team confirmed
- [ ] Phase 1 team capacity assessed
- [ ] 6-month budget for full replication estimated and approved

✅ **Risk**
- [ ] No show-stoppers identified
- [ ] Contingency plans for 2-3 high-risk sources
- [ ] Legal/compliance review started

---

## Failure Criteria (→ NO-GO)

❌ **Hard blockers** (project stops):
- Cannot access census data
- KRA tax rates unavailable or unclear
- Major cost barrier discovered (expensive data partnerships)
- Key team member unavailable for extended period

❌ **Soft blockers** (scope reduction):
- Housing data not robust → reduce to rent band model only (like Accra)
- Radio station data sparse → ship without radio feature initially
- Transport data inconsistent → focus on guide, not interactive map

---

## Next Action: Today

**Right now** (30 min):
1. Open `KENYA_DATA_SOURCES.md` (created earlier)
2. Assign each data category to a team member
3. Set up first call/email for Week 1 Monday

**By end of today**:
- [ ] Roles assigned
- [ ] First 3 outreach emails sent
- [ ] Accra repo builds locally
- [ ] Phase 0 calendar published (4-week sprint)

You're doing Phase 0 research starting tomorrow. Let's build this.
