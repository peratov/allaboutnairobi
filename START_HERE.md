# All About Nairobi - START HERE

You are building a comprehensive reference site for living in Nairobi, replicating All About Accra's model across **22-26 weeks** with a team of **5 people**.

---

## 📋 What's Ready to Go

This directory contains everything you need to start:

| File | Purpose | Status |
| --- | --- | --- |
| **START_HERE.md** | This file | ✅ |
| **NAIROBI_EQUIVALENCE_MAP.md** | Accra → Nairobi institution mappings | ✅ |
| **ACCRA_CODEBASE_AUDIT.md** | What we reuse vs. rewrite (detailed) | ✅ |
| **PHASE_0_DETAILED_PLAN.md** | 4-week research plan with Kenya contacts | ✅ |
| **KENYA_DATA_SOURCES.md** | Comprehensive data source tracker | ✅ |
| **accra-source/** | Cloned All About Accra repo | ✅ |

---

## 🚀 Quick Start (Today - Right Now)

### Step 1: Get the Accra Build Running (30 min)
```bash
cd C:\Users\kenra\allaboutnairobi\accra-source
mise setup
mise build
mise site
# Opens http://localhost:8814
```

### Step 2: Assign Phase 0 Roles

You need 4 people (can overlap):
- **Data Researcher**: Will reach out to KRA, KNBS, CAC, etc. (see PHASE_0_DETAILED_PLAN.md)
- **Content Lead**: Will write guides, source housing/transport data
- **Backend Engineer**: Will adapt data pipelines and calculators
- **Frontend Engineer**: Will update UI components and templates

### Step 3: Schedule Phase 0 Kickoff Call

**Agenda** (1 hour):
- Confirm team roles and capacity
- Review Phase 0 research plan (4 weeks)
- Assign data sources (each person takes 3-4 categories)
- Set up Slack/shared tracking
- Schedule first stakeholder check-ins

**Outcome**: Data researcher reaches out to KRA, KNBS, CAK, Kenya Power by Monday.

---

## 📊 The Path Forward: 6 Months, 5 People

```
PHASE 0: Research       Week 1-4    ← START HERE (you are here)
  ↓ (Gate 1: Data sources confirmed)
PHASE 1: Setup          Week 5-9    (Fork repo, rename, empty structure)
  ↓ (Gate 2: Build green)
PHASE 2: Core Content   Week 10-18  (Guides, constants, calculators)
  ↓ (Gate 3: MVP features working)
PHASE 3: Data & Features Week 19-23 (Map, dashboard, radio, events)
  ↓ (Gate 4: All features complete)
PHASE 4: Launch Prep    Week 24-26  (Kenya compliance, soft launch, go-live)
```

**Effort**: ~99 developer-weeks total (mostly data research and content writing, not code)

**Critical**: Phase 0 is the gate. If Kenya data sources are blocked, the project stalls.

---

## 🎯 What Reuses vs. Rewrites (The Honest Math)

### Reusable (60-80%)
- Generator, build system, linters, CI/CD (Ursus + extensions)
- UI components (map, radio player, dashboard) - data only swaps
- Service worker, PWA install, theme toggle
- Design system & CSS patterns

### Needs Rewrite (0-30%)
- All content (guides, glossary) - 157 Accra guides → 150+ Nairobi guides
- All constants (tax, wages, utilities) - Ghana figures → Kenya figures
- Calculators (tax formulas are completely different)
- Data pipelines (sources are different for every feature)

**Result**: 60% code reuse, 0% content reuse. Most work is data and writing.

---

## ⚠️ Known Traps (Learn Now, Avoid Later)

From CLAUDE.md (Accra team's experience):

1. **Stale figures sink silently**: Accra had wrong VAT rates for 9 months because a constant expired and nothing re-checked it. Solution: Linters fail the build on stale figures.

2. **Rounding destroys calculators**: Python rounds differently than JavaScript. Worked examples in guides must match calculator results to the shilling, or it's a bug.

3. **Deployment breaks silently**: A JSON error in vercel.json breaks the deploy, but Vercel keeps serving the old site. Always run `mise check-deploy` to confirm the live site has your changes.

4. **CSP is tight on purpose**: The site's security policy is `default-src 'self'`—no Google Fonts, no external maps. Widening it breaks the privacy promise. Path-scope exceptions for `/radio` and `/drive` only.

5. **Scheduled publishing is build-time, not runtime**: A guide scheduled to publish on Oct 1 does NOT appear at midnight Oct 1. It appears when the daily GitHub Action rebuilds the site. Plan for a few hours of delay.

---

## 📞 Phase 0: Who to Call

**By end of Week 1, your data researcher should have called or emailed:**

| Agency | What | Primary Contact | Backup |
| --- | --- | --- | --- |
| **KRA** | Tax rates, VAT, withholding | kra.go.ke/contact | Tax Policy Dept phone line |
| **NSSF** | Pension contribution rates | nssf.or.ke/contact | Public Affairs |
| **KNBS** | Census data, PxWeb API | knbs.or.ke/data-services | Director's office |
| **EPRA** | Electricity tariffs | epra.go.ke/tariffs | Tariff Economics Dept |
| **Kenya Power** | Actual meter rates | kplc.co.ke/customer-service | Public Affairs |
| **CAK** | FM broadcaster register | cak.go.ke/broadcasting | Broadcasting Department |
| **Ministry of Labour** | Minimum wage | labour.go.ke/announcements | Public Relations |

**Email template**: See PHASE_0_DETAILED_PLAN.md (provided)

---

## 🔑 Key Decision: Repo Structure

**Option A: Separate GitHub Repo** (Recommended)
- New repo: `github.com/[user]/allaboutnairobi`
- Independent CI/CD, independent history
- No risk of accidentally changing Accra while building Nairobi
- Slightly more setup time

**Option B: Separate Branch**
- Branch: `allaboutnairobi` in same Accra repo
- Faster initial setup
- Risk of merge conflicts, needs discipline
- Easier to reference Accra patterns

**Recommendation**: Option A (separate repo). Clean separation.

**Decision time**: Make this choice at Phase 0 kickoff (tomorrow ideally).

---

## 📋 Phase 0 Success = These 4 Deliverables

By end of Week 4 (end of Phase 0), you should have:

1. **Data Source Inventory** (`KENYA_DATA_SOURCES_VERIFIED.md`)
   - 70%+ of critical sources confirmed with URLs and dates
   - Update frequency for each
   - Expiry dates when figures will need re-checking

2. **Partnership Agreements**
   - KNBS API account (or alternative access)
   - KRA contacts + public rates confirmed
   - CAK FM register accessible
   - Real estate partner for housing data

3. **Risk Register** (`PHASE_0_RISKS.md`)
   - Show-stoppers identified (if any)
   - Mitigation plans for top 3 risks
   - Contingency budget

4. **Phase 1 Ready** (`PHASE_1_KICKOFF.md`)
   - Accra repo understood (build runs locally)
   - Data pipeline pattern understood
   - Team capacity confirmed
   - Timeline & budget approved by stakeholders

**Gate 1 decision**: "Do we have enough to build, or do we pivot scope?"

---

## 🚪 Doors Into the Code

**If you're a developer** starting work:
1. Read ACCRA_CODEBASE_AUDIT.md (understand what reuses, what rewrites)
2. Clone and build accra-source locally
3. Study `constants.yaml` structure (30 min)
4. Read ursus_config.py lines 1-200 (45 min)
5. Understand how guides reference constants (grep for `{{` in guides/)

**If you're a data researcher**:
1. Read PHASE_0_DETAILED_PLAN.md (this is your roadmap)
2. Read NAIROBI_EQUIVALENCE_MAP.md (learn the institutions)
3. Read KENYA_DATA_SOURCES.md (data sources you'll need to find)
4. Start making calls Week 1 Monday

**If you're a content writer**:
1. Read `accra-source/frontend/content/guides/first-week-in-accra.md` (structure & style)
2. Read NAIROBI_EQUIVALENCE_MAP.md section 2 (which topics change shape)
3. Don't start writing yet (wait for Phase 2, after constants are done)
4. In the meantime, research: housing, transport, tax, healthcare in Nairobi

---

## 💬 At a Glance: Why This Will Work

1. **Proven model**: All About Accra exists and works. You're not inventing from scratch.
2. **Code reusable**: 60-80% of the engineering transfers to Nairobi.
3. **Honest data approach**: Every figure gets a source URL and expiry date. Linters enforce it.
4. **Realistic timeline**: 6 months for a team of 5 is achievable; 3 months would not be.
5. **Clear gates**: At the end of each phase, you decide to continue or pivot. No surprises.

---

## 🆘 If You Get Stuck

- **Code questions**: Check CLAUDE.md in accra-source (explains every trap)
- **Architecture questions**: Read PRODUCT.md (the whole spec is there)
- **Data source missing**: See PHASE_0_DETAILED_PLAN.md for fallback strategies
- **Timeline pressure**: Document the scope cut and move to "soft launch with MVP"

---

## ✅ Checklist: Ready to Start?

- [ ] Accra repo cloned and builds locally
- [ ] Read ACCRA_CODEBASE_AUDIT.md (understand what's reusable)
- [ ] Read PHASE_0_DETAILED_PLAN.md (your 4-week research plan)
- [ ] Team roles assigned (or planned for tomorrow's meeting)
- [ ] GitHub repo repo decision made (separate vs. branch)
- [ ] First outreach emails scheduled (Week 1 Monday)
- [ ] Stakeholder sign-off on timeline & budget

If all checked: **You're ready. Go schedule Phase 0 kickoff for tomorrow.**

---

## 📞 First Action (Next 2 Hours)

1. **Share this folder** with your team (email link or Slack)
2. **Schedule kickoff call** for tomorrow (1 hour)
3. **Data researcher**: Review PHASE_0_DETAILED_PLAN.md, prep questions for KRA/KNBS
4. **Tech lead**: Run accra-source build, confirm it works locally
5. **PM/legal**: Review timeline and budget, confirm team capacity

---

**Timeline starts**: Tomorrow at kickoff.  
**Gate 1 review**: 4 weeks from tomorrow (Phase 0 complete).  
**Go/No-Go decision**: End of week 4.

Let's build All About Nairobi. 🚀
