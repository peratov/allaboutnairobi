# All About Nairobi: Institution & Data Source Map

Based on All About Accra PRODUCT.md section 9, here are the Nairobi equivalents that will shape every feature.

## 1. Core Institutions (from PRODUCT.md section 9.1)

| Area | Institution | Notes |
| --- | --- | --- |
| **Tax authority** | KRA (Kenya Revenue Authority) | Income tax bands, VAT, withholding tax |
| **National ID** | National ID, Maisha Namba, eCitizen | Digital ID is recent; verify current use |
| **Mobile money** | M-Pesa (Safaricom, primary), Airtel Money | M-Pesa is the economy; far deeper than Accra's MoMo |
| **Bank identity** | National ID / KRA PIN | BVN equivalent |
| **Pensions** | NSSF (National Social Security Fund) | State scheme; verify contribution rates |
| **Health insurance** | SHA (Social Health Authority, replaced NHIF in 2024) | **Recently reformed** - primary source critical |
| **Electricity** | Kenya Power; tariffs by EPRA | Check current tariff bands |
| **Water** | Nairobi City Water and Sewerage Company | Ask about suburban districts |
| **Broadcasting regulator** | Communications Authority of Kenya (CAK) | For radio stations register |
| **Statistics office** | KNBS (Kenya National Bureau of Statistics) | Has PxWeb API for census |
| **Business registration** | Business Registration Service (via eCitizen) | Online system |
| **Main airport** | Jomo Kenyatta International (NBO) | Routes to type from Wikipedia |
| **Local government** | Nairobi City County, 17 sub-counties, wards | Different structure than Accra's 29 districts |

## 2. Features That Change Shape (from PRODUCT.md section 9.2)

| Feature | Accra approach | Nairobi approach | Action |
| --- | --- | --- | --- |
| **Housing costs** | Rent advance (1–2 years, unlawful above 6 months) | Deposit of 1–2 months is norm; different pain point | Research what renters actually pay and complain about |
| **Transport** | Trotros (minibuses, named art) | Matatus (minibuses, route numbers, art); JMTC regulations | Ask locals about routes, fares, pain points |
| **Power** | Dumsor (outages branded as policy) | Kenya Power outages and tokens; generators common | Understand tariff by neighbourhood/band |
| **Mobile money** | MoMo (app-based, new) | M-Pesa (USSD and app, 20+ year history, deeply embedded) | Document M-Pesa processes, airtime transfers, bill pay |
| **Food** | Chop bars, waakye, kenkey | Nyama choma, ugali, mandazi, mutura | List local food and where to get it |
| **Languages** | Twi, Ga | Swahili, Sheng, English | Decide which languages the glossary covers |
| **Icons** | Adinkra (Akan symbols by proverb) | **TBD**: Kenyan symbol set chosen for meaning, not appearance | Research Maasai/Kenyan/East African symbol systems |

## 3. Data Sources to Verify (Critical Path)

### Phase 2: Constants (must complete before any guide or calculator)
- [ ] KRA income tax bands for 2026 (official gazette or website)
- [ ] VAT rate and levies (KRA)
- [ ] NSSF contribution rates (employee & employer)
- [ ] Minimum wage for Nairobi (Ministry of Labour / gazette)
- [ ] EPRA electricity tariff (current bands; check if by district or uniform)
- [ ] Key government fees (national ID, business registration, passport)
- [ ] SHA health insurance premiums (recently changed; get official rates)
- [ ] Exchange rate (which pair? KES/USD primary?)

### Phase 3: Core Guides (research as you write)
- [ ] Housing: current rent ranges by neighbourhood (no official index)
- [ ] Matatu fares and routes (informal system; get from locals)
- [ ] Bank account opening (documents needed, online vs branch)
- [ ] M-Pesa limits and fees (Safaricom official)
- [ ] eCitizen platform for business registration (test it)
- [ ] Maisha Namba digital ID rollout status (check current adoption)
- [ ] Work permits for foreigners (immigration rules)

### Phase 4: Data Features
- [ ] **Map**: Boundaries on geoBoundaries (ADM1=counties, ADM2=subcounties)
- [ ] **Census**: KNBS PxWeb API (2019 census; 2024 may be available)
- [ ] **Noise**: OpenStreetMap road/premises data for model
- [ ] **Dashboard**: World Bank Indicators (same API as Accra)
- [ ] **Radio**: CAK FM register (licensed broadcasters) + stream URLs
- [ ] **Flights**: JKIA routes from Wikipedia; OpenFlights for coordinates
- [ ] **Events**: Holidays library (correct against official gazette); curate annual events

## 4. Risks to Mitigate

1. **Institutions reformed recently** (SHA replaced NHIF in 2024): verify all social scheme docs against latest source
2. **Nairobi is a devolved city**: some services are county-level (health, water, local governance)—may need to distinguish county vs national
3. **M-Pesa ecosystem is vast**: document what's relevant to newcomers; avoid over-documenting
4. **No official rent index**: like Accra, must rank by band and be honest about it
5. **Matatu system is informal**: routes change, fares vary by demand; need community input to keep current

## 5. Nairobi-Specific Advantages (from PRODUCT.md section 9.3)

- Kenya's statistics are relatively well-published; KNBS may have richer data than GSS
- World Bank API works identically
- Large diaspora means from-abroad guides transfer directly
- Established tech scene (fintech, startups) may make guides more relevant

## 6. Nairobi-Specific Challenges (from PRODUCT.md section 9.4)

- Kenya's institutions have been reformed recently (health insurance, digital ID, school curriculum); expect more re-verification
- Neither city's rents are published officially; rent-band approach works but requires local knowledge
- Matatu routes and fares change frequently; need ongoing maintenance

---

**Next**: Wait for Plan agent to return detailed phase breakdown, then start Phase 1 repo setup.
