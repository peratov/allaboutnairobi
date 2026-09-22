# Kenya Data Sources Research

This document tracks primary sources for every figure that will go into `content/constants.yaml` and guides. Every entry must have an official source and verification date.

## Phase 2: Constants (Before any calculator or money guide ships)

### Taxation (KRA - Kenya Revenue Authority)

| Item | Need | Source | Status | Verified | Expires |
| --- | --- | --- | --- | --- | --- |
| Income tax bands 2026 | Current tax brackets and rates | KRA official site / Finance Bill 2026 | [ ] | [ ] | 2027-01-01 |
| VAT rate | Standard VAT rate | KRA VAT guide | [ ] | [ ] | 2027-01-01 |
| VAT levies | Sugar levy, plastic levy, etc. | KRA / Finance Bill | [ ] | [ ] | 2027-01-01 |
| Withholding tax rates | On payments to non-residents | KRA withholding guide | [ ] | [ ] | 2027-01-01 |
| Penalty interest rate | Tax late payment interest | KRA regulations | [ ] | [ ] | 2027-01-01 |

### Pensions (NSSF - National Social Security Fund)

| Item | Need | Source | Status | Verified | Expires |
| --- | --- | --- | --- | --- | --- |
| Employee contribution rate | % of gross salary | NSSF Act / website | [ ] | [ ] | 2027-01-01 |
| Employer contribution rate | % of gross salary | NSSF Act | [ ] | [ ] | 2027-01-01 |
| Contribution ceiling | Max pensionable salary | NSSF regulations | [ ] | [ ] | 2027-01-01 |
| Benefit formula | How monthly pension is calculated | NSSF benefits guide | [ ] | [ ] | TBD |

### Wages & Labour

| Item | Need | Source | Status | Verified | Expires |
| --- | --- | --- | --- | --- | --- |
| Minimum wage (Nairobi) | National minimum wage or Nairobi-specific | Ministry of Labour gazette | [ ] | [ ] | Annual |
| National insurance (NHIF or SHA?) | Health insurance contributions | SHA or current provider docs | [ ] | [ ] | Annual |

### Utilities

| Item | Need | Source | Status | Verified | Expires |
| --- | --- | --- | --- | --- | --- |
| Electricity tariff (EPRA) | Cost per kWh by band | EPRA tariff decision / Kenya Power | [ ] | [ ] | Quarterly |
| Water rates | Cost per m³ by band | Nairobi City Water tariff | [ ] | [ ] | Annual |
| Internet providers | Common plans and costs | ISP websites (Safaricom, Airtel, Zuku, etc.) | [ ] | [ ] | Quarterly |

### Government Fees

| Item | Need | Source | Status | Verified | Expires |
| --- | --- | --- | --- | --- | --- |
| Passport fees | New, renewal, expedited | State Department Immigration | [ ] | [ ] | Annual |
| National ID fees | New, replacement | IEBC or State Department | [ ] | [ ] | Annual |
| Business registration | Sole trader, partnership, company | CAC / eCitizen | [ ] | [ ] | Annual |

### Currency

| Item | Need | Source | Status | Verified | Expires |
| --- | --- | --- | --- | --- | --- |
| Exchange rate KES/USD | For dual-currency display | User-set, not API (per PRODUCT.md 2.5) | [ ] | [ ] | User driven |

---

## Phase 3: Core Guides (Ongoing research as you write)

### Housing Guide

| Item | Need | Source | Status | Notes |
| --- | --- | --- | --- | --- |
| Rent bands by neighbourhood | 5-band ranking (no official index) | Local knowledge, listings sites (Airbnb, Booking, property sites) | [ ] | Like Accra: admit data doesn't exist, rank by band |
| Typical deposits/advances | What landlords actually ask for | Tenant interviews, Reddit, Facebook groups | [ ] | Kenya law allows how much? |
| Tenancy agreement | Legal template | Kenya Law Reform Commission or Bar Association | [ ] | |
| Eviction process | How it works | Kenya landlord-tenant law | [ ] | |

### Mobile Money & Banking

| Item | Need | Source | Status | Notes |
| --- | --- | --- | --- | --- |
| M-Pesa limits & fees | Transaction limits, SMS charges, agent fees | Safaricom official | [ ] | Document USSD codes (*334#) |
| Bank account opening | Documents needed (ID, address, etc.) | Individual bank requirements (KCB, Equity, DTB, etc.) | [ ] | Compare 3 major banks |
| Airtime transfer | How to send airtime via M-Pesa | Safaricom / Airtel instructions | [ ] | Common use case |
| Bill payments | MPESA bills shortcodes | Safaricom list | [ ] | What utilities accept M-Pesa? |

### Employment & Taxes

| Item | Need | Source | Status | Notes |
| --- | --- | --- | --- | --- |
| Income tax payroll | How employer withholds (PAYE) | KRA PAYE guide | [ ] | Worked example from calculator |
| Freelance withholding | Tax on payments to contractors | KRA non-resident withholding | [ ] | Common pain point |
| Work permits | For foreign residents | Immigration, Ministry of Labour | [ ] | Cost, process, duration |
| National Service | Is it mandatory? How long? | State Department / USHCDC | [ ] | If applicable |

### Transport (Matatus)

| Item | Need | Source | Status | Notes |
| --- | --- | --- | --- | --- |
| Matatu routes & fares | Major routes, typical costs | Local knowledge, Google Maps, community | [ ] | Informal system; document main routes |
| Route art & numbering system | How routes are identified | Matatu operators, locals | [ ] | Culture guide vs practical guide |
| Bus companies | Larger operators (Easy Coach, Jatco, etc.) | Company websites | [ ] | When to take matatu vs bus |
| Ride-hailing apps | Uber, Bolt, InDriver presence | App stores / company sites | [ ] | Coverage areas, typical costs |

### Health Insurance (SHA or current provider)

| Item | Need | Source | Status | Notes |
| --- | --- | --- | --- | --- |
| SHA enrollment | How to register (digital ID? SMS?) | SHA website (recently launched) | [ ] | **CRITICAL**: Recently replaced NHIF—research current process |
| SHA benefits | What's covered, copays | SHA official documents | [ ] | |
| Private insurance | Major providers (AAR, CIC, Britam, etc.) | Insurance websites | [ ] | Cost comparison for expats |
| Hospitals & clinics | Major facilities by area | Hospital listings (Google, WHO) | [ ] | Which take SHA vs cash? |

### Markets & Shopping

| Item | Need | Source | Status | Notes |
| --- | --- | --- | --- | --- |
| Food markets | Locations (Maasai Market, City Market, etc.) | Local knowledge | [ ] | What to buy where, safety tips |
| Malls | Shopping centres in Nairobi | Real estate guides | [ ] | Which are main ones? |
| Supermarkets | Major chains (Safaricom, Carrefour, Nakumatt legacy, etc.) | Retailer websites | [ ] | Online delivery options? |

### Languages

| Item | Need | Source | Status | Notes |
| --- | --- | --- | --- | --- |
| Main languages | Swahili, Sheng, English, others | Sociolinguistic reality | [ ] | Which to teach? Sheng slang guide? |
| Basic phrases | Survival Swahili | Phrasebook / locals | [ ] | Common greetings, useful words |

---

## Phase 4: Data Features (Complex data pipelines)

### Map & Census

| Data | Source | API/Format | Status | Notes |
| --- | --- | --- | --- | --- |
| County boundaries | geoBoundaries ADM1 | GeoJSON or downloadable | [ ] | Verify all 47 counties |
| Sub-county boundaries | geoBoundaries ADM2 or KNBS data | GeoJSON | [ ] | Nairobi has 17 sub-counties |
| Census 2019 data | KNBS Population Census | PxWeb API or downloadable | [ ] | Population, age, sex, employment |
| Census 2024 | KNBS (if released) | TBD | [ ] | Check KNBS website for 2024 data |
| Districts/landmarks | Geocoded places | Wikipedia, OSM, KNBS | [ ] | Named landmarks in Nairobi |

### Data Dashboard

| Series | Need | Source | Status | Notes |
| --- | --- | --- | --- | --- |
| Population (Kenya, Nairobi) | Historical series | World Bank, KNBS | [ ] | Annual 1980–2026 |
| GDP (Kenya) | Real GDP growth | World Bank | [ ] | Real growth rate |
| Inflation (Kenya) | CPI inflation | World Bank | [ ] | Annual |
| Exchange rate (KES/USD) | Historical USD/KES | World Bank, Central Bank of Kenya | [ ] | Annual average |
| Education enrollment | School & university enrollment rates | World Bank | [ ] | By level |
| Life expectancy | Kenya & Nairobi | World Bank, WHO | [ ] | |
| Urbanization | % urban in Kenya | World Bank | [ ] | |

### Radio Stations

| Data | Source | Status | Notes |
| --- | --- | --- | --- |
| Licensed broadcasters | Communications Authority FM register | [ ] | Download and parse official register |
| Stream URLs | Community Radio Browser or individual stations | [ ] | Verify live audio HTTPS streams |
| Station metadata | Language, format (music, news, talk) | Stations' websites | [ ] | For filtering |

### Flights

| Data | Source | Status | Notes |
| --- | --- | --- | --- |
| JKIA nonstop routes | Airport Wikipedia page + airline sites | [ ] | Type in manually; parse, don't scrape |
| Route coordinates | OpenFlights database | [ ] | Destination city coordinates |
| Coastlines | Natural Earth | [ ] | For map background |

### Events

| Data | Source | Status | Notes |
| --- | --- | --- | --- |
| Public holidays | `holidays` Python library (Kenya module) | [ ] | Correct against official gazette |
| Annual fixtures | Madaraka Day, Jamhuri Day, Nairobi Marathon, film festival, etc. | Official sources | [ ] | Curated; verify dates before posting |

---

## Verification Checklist (Before Ship)

For every constant, every figure, every data source:

- [ ] **Primary source only**: Not a blog, not a summary—official source (KRA, KNBS, CAK, etc.)
- [ ] **Dated**: Last verified date recorded in constants.yaml
- [ ] **Expiry set**: `fail_on` date marked so linter catches if it goes stale
- [ ] **Worked example tested**: If a tax calculator exists, test against KRA's own worked example to the shilling
- [ ] **Linked**: Description has URL to source
- [ ] **Unique per city**: Not national figures passed off as Nairobi (per PRODUCT.md 2.2: say "Kenya" if it's national)

---

## Legend

- **[ ]** Unchecked (not yet researched)
- **Status**: [ ] = todo, [x] = done, [!] = blocked
- **Expires**: When this figure will definitely go stale and must be re-verified

**Next step**: Assign these to someone who can research each category deeply. Phase 2 does not start until these sources are found and verified.
