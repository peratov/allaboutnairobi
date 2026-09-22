# All About Accra Codebase Audit

Cloned: https://github.com/peratov/allaboutaccra.git (25 commits, active development)

## Architecture Summary

**Generator**: Ursus (Python SSG) + Jinja2 templates  
**Content**: Markdown + YAML in git (no database)  
**Hosting**: Vercel (static output)  
**Local dev**: Docker Compose + Caddy  
**Frontend code**: Plain ES modules (no framework) + custom elements  

**Key principle**: Every figure lives in `content/constants.yaml` with source URL and expiry date. Linters fail the build on stale figures.

---

## Reusability Analysis (By Component)

### ✅ Fully Reusable (80-95% — minimal edits)

| Component | Files | Effort | Why Reusable |
| --- | --- | --- | --- |
| **Generator & Config System** | `ursus_config.py` | 1-2 days | Structure is generic; only constant names change (GHS → KES, etc.) |
| **Linting Pipeline** | `extensions/linters/` | 0 days | Works on any city; checks for stale figures, dead links, metadata |
| **Build System** | `mise.toml`, Dockerfile, vercel.json | 1 day | Scripts are reusable; update domain and environment variables |
| **Content Models** | `extensions/context_processors/` | 2 days | Collections, glossary, sitemap, feed all generic |
| **UI Components** | `templates/js/components/` | 5 days | Radio player, map, dashboard, search, theme toggle → swap data only |
| **Service Worker** | `templates/sw.js` | 0 days | Cache strategy unchanged |
| **CI/CD & Deployment** | `.github/workflows/`, vercel.json | 1 day | Daily rebuild logic unchanged |
| **Design System** (base styles, tokens, layout) | `templates/css/` | 3 days | Swap color palette and fonts; layout patterns reusable |
| **Home page layout** | `templates/index.html.jinja` | 3 days | Refresh cards and hero copy |
| **Authentication & User System** | (None exists) | — | No existing auth to adapt |

**Subtotal Effort**: ~2-3 weeks of frontend work to adapt existing systems

### ⚠️ Partially Reusable (40-70% — structural patterns, data rewrites)

| Component | Files | Reuse % | Effort | Notes |
| --- | --- | --- | --- | --- |
| **Calculators (Tax, VAT, Salary, etc.)** | `templates/js/tools/`, `templates/js/utils/tax.mjs` | 70% | 3-4 weeks | Engine/UI reusable; all formulas and constants rewrite for KRA rules |
| **Map System** | `templates/js/components/accra-map.mjs`, `scripts/build_map_data.py` | 60% | 4-5 weeks | Component patterns reusable; all GIS data, boundaries, census data new |
| **Data Dashboard** | `templates/js/components/data-dashboard.mjs`, `scripts/build_dashboard_data.py` | 70% | 2-3 weeks | Chart drawing reusable; all World Bank data stays same, add Kenya indicators |
| **Flight Map** | `scripts/build_flight_map.py` | 50% | 1-2 weeks | SVG patterns reusable; all route data new (JKIA routes replace Kotoka) |
| **Events Calendar** | `content/events-calendar.yaml`, `extensions/release.py` | 90% | 1 week | Infrastructure reusable; only events data new |
| **Radio Player** | `templates/js/components/radio-player.mjs`, `scripts/build_radio_data.py` | 80% | 2-3 weeks | Player component reusable; all KE station data, CAK register, stream URLs new |
| **Night Out Planner** | `templates/js/utils/nightplan.mjs`, `scripts/build_nightlife_data.py` | 20% | 3-4 weeks | Engine logic useful for reference; all venue data, Nairobi transport, time data new |
| **Business Viability Checker** | `templates/js/utils/viability.mjs`, `scripts/build_districts_stats.py` | 30% | 3-4 weeks | Scoring logic useful; all district data, trade profiles new for Nairobi sub-counties |

**Subtotal Effort**: ~6-7 weeks of data pipeline and formula work

### ❌ Needs Complete Rewrite (0-20%)

| Component | Why | New Effort |
| --- | --- | --- |
| **All Content** | Every guide is Accra-specific (taxes, housing, transport, healthcare, etc.) | 4-6 weeks (content team) |
| **Glossary** | Accra has 113 local terms; Nairobi will have different ones (Swahili, Sheng, institutions) | 1-2 weeks (content team) |
| **Constants** | Every figure (tax bands, minimum wage, electricity tariff, fees, etc.) is Ghana-specific | 2-3 weeks (research + data team) |
| **Localization** | Swahili vs Twi/Ga; Kenya English conventions; currency formatting | 1-2 weeks |
| **Data Pipelines** | Source every Nairobi figure from scratch (KRA, KNBS, CAK, Kenya Power, etc.) | 4-5 weeks |
| **Symbol Set** | Replace Adinkra (Akan) with Kenyan symbols (Maasai? Beadwork? TBD) | 2-3 weeks (design) |
| **Navigation/Hero** | Nairobi-specific links, imagery, neighborhoods | 1-2 weeks |

**Subtotal Effort**: ~7-9 weeks of content and data engineering

---

## Directory Structure (For Reference)

```
frontend/
  ursus_config.py              ← Config + Ghana-specific arithmetic (REWRITE)
  content/
    constants.yaml             ← Every figure (REWRITE)
    collections.yaml           ← Collection order (REUSE structure, new titles)
    guides/                    ← 157 Accra guides (REWRITE all)
    glossary/                  ← 113 Accra terms (REWRITE all)
    newsletter/                ← Accra newsletters (REUSE structure)
    events-calendar.yaml       ← Accra events (REWRITE)
    geo/                       ← Generated data (REWRITE)
      map-summary.yaml         ← Accra districts (REWRITE for Nairobi sub-counties)
      census.yaml              ← 2021 Ghana census (REWRITE for Kenya census)
      noise.yaml               ← Accra noise model (REWRITE)
      rent-bands.yaml          ← Accra rent by district (REWRITE)
      indicators-summary.yaml  ← World Bank data (Kenya same, Accra-specific differ)
      flights-summary.yaml     ← Kotoka routes (REWRITE for JKIA)
      radio.yaml               ← Accra FM stations (REWRITE for Nairobi)
      nightlife.yaml           ← Accra venues (REWRITE)
  
  templates/
    _layout.html.jinja         ← Site shell, CSP, analytics (UPDATE domain, currency)
    index.html.jinja           ← Home page (REWRITE copy, refresh hero)
    guides/, glossary/, ...    ← Entry templates (REUSE)
    js/
      components/              ← Custom elements (REUSE, swap data)
        accra-map.mjs          ← Map component (REUSE)
        radio-player.mjs       ← Radio player (REUSE)
        data-dashboard.mjs     ← Charts (REUSE)
      tools/                   ← Calculators (REUSE engine, rewrite formulas)
        salary-calculator.mjs  ← Tax calculator (REWRITE for KRA)
        vat-calculator.mjs     ← VAT calculator (REWRITE)
      utils/
        tax.mjs                ← Ghana tax logic (REWRITE for Kenya)
        customs.mjs            ← Import duty (REWRITE)
        viability.mjs          ← District ranking (REUSE logic)
        nightplan.mjs          ← Evening planner (REUSE logic)
    css/                       ← Stylesheet (UPDATE palette if desired)
  
  extensions/
    context_processors/        ← Add context (REUSE)
    renderers/                 ← Build outputs (REUSE)
    linters/                   ← Quality gates (REUSE)
  
  scripts/
    build_map_data.py          ← Map generator (REWRITE data sources)
    build_dashboard_data.py    ← Data fetcher (KEEP as-is, Kenya data)
    build_radio_data.py        ← Radio scraper (REWRITE for CAK)
    build_flight_map.py        ← Route map (REWRITE routes)
    build_nightlife_data.py    ← Venue list (REWRITE)

proxy/Caddyfile               ← Local dev (UPDATE domain)
.github/workflows/            ← CI/CD (UPDATE hook URL)
```

---

## Total Replication Effort Breakdown

| Phase | Component | Dev-Weeks | Why It Takes This Long |
| --- | --- | --- | --- |
| **Phase 0: Research** | Data source validation + partnerships | 3-4 | Waiting for agencies (KNBS, KRA, CAK) + verifying access |
| **Phase 1: Setup** | Repo fork, rename, empty structure, build green | 1-2 | Straightforward if data sources confirmed |
| **Phase 2: Constants** | All Kenya figures + ursus_config.py rewrite | 2-3 | Research + testing against official worked examples |
| **Phase 2b: Core Guides** | Housing, tax, mobile money, banking, healthcare, transport | 3-5 | Writing, sourcing, internal links, Glossary entries |
| **Phase 3: Data Pipelines** | Map, census, dashboard, radio, flights, events, nightlife | 4-5 | Build scripts + fetching/validating data from each source |
| **Phase 3b: Calculators** | Salary, VAT, withholding, import duty, rent, loan, cost-of-living | 2-3 | Test each against official worked examples (KRA, etc.) |
| **Phase 4: Features** | Night planner, viability checker, currency converter | 2-3 | Adapt logic to Nairobi venues and districts |
| **Phase 5: Polish** | Localization, testing, Kenya compliance review | 2-3 | Swahili QA, data accuracy audit, privacy law compliance |
| **Phase 6: Launch** | Soft launch, bugfixes, go-live | 1-2 | Beta feedback, critical fixes |
| **TOTAL** | | **22-30** | Majority is data sourcing and content, not code |

---

## Strategy: Phased Content-First Replication

Instead of "fork and rename and build empty," the plan recommends:

1. **Start Phase 0 TODAY**: Research Kenya data sources (parallel with codebase familiarization)
2. **Do setup minimal**: Get repo building on empty Nairobi structure
3. **Constants first** (Phase 2): No guides ship until every figure is sourced and dated
4. **Guides in order** (Phase 2b): Housing, then tax, then others—each depends on constants
5. **Data pipeline last** (Phase 3): Map, dashboard, etc., are nice-to-have after guides + calculators ship

This prevents the "shipped wrong tax rate" problem (Accra had it for 9 months).

---

## Known Traps & Workarounds (From CLAUDE.md)

### Windows-Specific
- **UTF-8 required**: Every Python invocation needs `PYTHONUTF8=1` (set in mise.toml)
- **Path separators**: Custom extension `portable_uris.py` normalizes backslashes to forward slashes (critical on Windows)
- **Template loading**: Custom extension `portable_jinja.py` fixes Jinja's Windows path handling

### Data & Accuracy
- **Rounding mismatch**: Python rounds half-to-even; browsers round half-up. Worked examples must match calculator results to the last pesewa (or Shilling for Kenya)
- **Derived figures**: If a tax threshold is computed, compute it **once** in ursus_config.py, never in a guide and never twice
- **Stale figures**: A constant with a passed `fail_on` date must fail the build, or it lives on silently (VAT law change in Jan 2026 was not caught until April on Accra site)

### Deployment & Routing
- **Canonical URL**: Must always be `www` host; apex redirects permanently (301/308)
- **cleanUrls**: Must be `true` in vercel.json, or every internal link 404s
- **CSP security**: Default is `default-src 'self'`; widening for `/radio` or `/drive` is path-scoped, not site-wide
- **Service worker cache**: Never use `immutable` on versioned assets (`/js/*`); a stale worker serves old rules forever

### Content & Scheduling
- **Scheduled pages**: Must be scheduled at **build time**, not at publish time. `RELEASE_DATE=2026-12-15 mise build` shows site as of that date
- **Glossary slug collision**: Entry filenames **must** be the lowercased-hyphenated slug of their term, or wikilinks break
- **Table of contents**: Auto-generated; do NOT add manually or it duplicates on narrow screens

---

## Next Steps: Start NOW

### Week 1: Phase 0 Parallel Tracks

**Track A: Code Familiarization** (2-3 days)
- [ ] Set up local Accra build (`mise setup`, `mise build`)
- [ ] Read every `.md` in `frontend/templates/` and `content/guides/` first page (skim pattern)
- [ ] Test a calculator locally (change a tax rate in constants.yaml, rebuild, verify it shows in UI)
- [ ] Run `mise lint` and understand each linter rule

**Track B: Data Source Research** (Ongoing, weeks 1-4)
- [ ] Create issue for each Kenya data source (KRA, KNBS, EPRA, etc.) and track access
- [ ] Contact agencies: KNBS PxWeb API access, KRA tax tables, CAK FM register, etc.
- [ ] Document where each figure will come from and update frequency
- [ ] Identify show-stopper sources (if housing data is blocked, feature scope changes)

**Track C: Team & Decisions** (Days 1-3)
- [ ] Name the person/team who will own content (guides, glossary)
- [ ] Name the person/team who will own data (constants, pipelines)
- [ ] Decide: separate branch vs. separate repo (recommend separate repo to avoid merge conflicts)
- [ ] Set up Vercel project for allaboutnairobi.com staging domain

### Week 2-4: Phase 0 Deep Dive → Gate 1 Review

- [ ] 70%+ of data sources confirmed accessible
- [ ] Estimated effort and cost clear
- [ ] Kenya partnerships identified (KNBS, KRA, health NGOs, housing data)
- [ ] **Gate 1 decision**: "Go to Phase 1 or pivot scope?"

---

## Immediate Action: Set Up Local Build

To get started **today**:

```bash
cd C:\Users\kenra\allaboutnairobi\accra-source
mise setup
mise build
mise site  # Start local server on :8814
```

Then:
1. Open `frontend/content/constants.yaml` and see the structure (source, last_verified, fail_on)
2. Look at `frontend/ursus_config.py` lines 100-200 to see how constants are loaded
3. Open `frontend/content/guides/first-week-in-accra.md` to see content structure
4. Run `mise lint` to understand the linter output

That 30-minute exploration will reveal:
- How constants propagate to guides and calculators
- Why the build fails on stale data
- What data we need to research first

---

## Decision Point: How to Structure Nairobi Repo

**Option A: Separate Repository (Recommended)**
- Pros: Independent GitHub history, independent CI/CD, no confusion about which site
- Cons: Can't easily copy Accra guides for reference
- **Effort**: 1-2 extra days to set up new repo from scratch

**Option B: Separate Branch in Same Repo**
- Pros: Easy to reference Accra patterns, reduce setup
- Cons: Merge conflicts, need discipline to keep branches separate
- **Effort**: Slightly faster initial setup

**Recommendation**: **Option A** (separate repo). The sites will diverge significantly (data, content, partnerships). Keeping them separate prevents accidental changes to Accra while building Nairobi.

---

## Files to Bookmark (Reference During Build)

- **PRODUCT.md** (in Accra repo) - the whole product spec
- **CLAUDE.md** (in Accra repo) - engineering decisions and traps
- **content/constants.yaml** - study the structure (source, dates, fail_on)
- **ursus_config.py** - where Ghana arithmetic lives (will become Kenya arithmetic)
- **templates/js/utils/tax.mjs** - the calculator formulas (will become KRA rules)
- **scripts/build_radio_data.py** - example data pipeline (refactor for CAK register)

---

## Go / No-Go Gate Summary

**Gate 0 (Today)**: Can we access the Accra repo and build it locally?  
**Gate 1 (Week 4)**: Can we confirm 70%+ of Kenya data sources?  
**Gate 2 (Week 9)**: Is the Nairobi repo building and linting on empty structure?  
**Gate 3 (Week 17)**: Core features (guides, constants, calculators) complete?  
**Gate 4 (Week 26)**: Ready to launch?

Each gate can kill the project if the answer is "no" — that is the point.

---

**Status**: Ready to begin Phase 0 research and code familiarization.
