# All About Nairobi - Complete Setup

## ✅ What's Ready (Created Today)

All documentation, planning, and the Accra source code for reference are ready in this directory.

### 📚 Documentation (Read in This Order)

1. **START_HERE.md** ← Start here (9 min read)
   - Quick overview of the 6-month plan
   - Who to call, what to do today
   - Success checklist

2. **ACCRA_CODEBASE_AUDIT.md** (15 min read)
   - What percentage of code reuses (60-80%)
   - What needs complete rewrite (data, content, formulas)
   - Known traps from Accra team

3. **PHASE_0_DETAILED_PLAN.md** (20 min read)
   - Your 4-week research roadmap
   - Concrete Kenya contacts (KRA, KNBS, CAK, etc.)
   - Week-by-week execution plan
   - Gate 1 review criteria

4. **NAIROBI_EQUIVALENCE_MAP.md** (10 min read)
   - Accra → Nairobi institution mappings
   - Which features change shape (housing, transport, etc.)
   - Data source priorities

5. **KENYA_DATA_SOURCES.md** (Reference)
   - Comprehensive tracker of all figures you'll need
   - Primary sources to research
   - Verification checklist

6. **PHASE_1_SETUP.md** (Reference)
   - What Phase 1 (fork and rename) looks like
   - Read after Phase 0 is approved

### 💾 Source Code

- **accra-source/** (5.8 MB)
  - Full All About Accra codebase (GitHub: peratov/allaboutaccra)
  - Ready to build and run locally
  - Reference for patterns, constants structure, data pipelines
  - Clone and build it: `cd accra-source && mise setup && mise build`

### 🎯 What Happens Next

**This week**:
1. Share START_HERE.md with your team
2. Schedule Phase 0 kickoff (1 hour, tomorrow ideally)
3. Assign data researcher to start PHASE_0_DETAILED_PLAN.md Week 1 tasks
4. Get Accra repo building locally (30 min)

**Week 1-4** (Phase 0):
- Data researcher reaches out to KRA, KNBS, CAK, Kenya Power, etc.
- Tech team studies Accra codebase and data pipelines
- Content team researches Nairobi context (housing, transport, healthcare)
- Compile data source inventory
- **Gate 1 decision at end of Week 4**: "Do we have enough data to proceed?"

**If GO**: Proceed to Phase 1 (fork repo, rename, empty structure)

---

## 📊 The Plan at a Glance

| Phase | Duration | What | Gate |
| --- | --- | --- | --- |
| **0: Research** | Weeks 1-4 | Validate Kenya data sources; confirm partnerships | 70%+ data sources accessible? |
| **1: Setup** | Weeks 5-9 | Fork repo, rename, empty structure, build green | Builds and lints clean? |
| **2: Core** | Weeks 10-18 | Write guides; populate constants; build calculators | MVP features working? |
| **3: Features** | Weeks 19-23 | Map, dashboard, radio, events, advanced tools | All features complete? |
| **4: Launch** | Weeks 24-26 | Kenya compliance review, soft launch, go-live | Ready to launch? |

**Total**: 6 months, ~5 people, ~99 developer-weeks  
**Cost**: Mostly staff time + data partnerships (if applicable)

---

## 🚀 Your Next 2 Hours

### For Everyone
- [ ] Read START_HERE.md (9 min)
- [ ] Skim ACCRA_CODEBASE_AUDIT.md (skim the reusability table)
- [ ] Share folder link with team

### For Data Researcher
- [ ] Read PHASE_0_DETAILED_PLAN.md carefully (20 min)
- [ ] Bookmark the Kenya contacts table
- [ ] Prep email template (provided in PHASE_0_DETAILED_PLAN.md)

### For Tech Lead
- [ ] Follow "Quick Start" in START_HERE.md (30 min to build Accra locally)
- [ ] Read ACCRA_CODEBASE_AUDIT.md sections on reusability
- [ ] Confirm team capacity (are we 5 FTE for 6 months?)

### For PM/Manager
- [ ] Read START_HERE.md carefully
- [ ] Review timeline in ACCRA_CODEBASE_AUDIT.md
- [ ] Confirm budget and stakeholder approval for 6-month commitment
- [ ] Schedule Phase 0 kickoff for tomorrow morning

---

## 📞 Who to Call This Week (Phase 0 Kickoff)

**Attendees** (1 hour):
- Data researcher/content lead
- Tech lead
- Project manager
- Anyone else with stakeholder authority

**Agenda**:
1. Review timeline (6 months, phases 0-4) - 10 min
2. Confirm team roles and capacity - 10 min
3. Assign data research categories (each person takes 3-4) - 10 min
4. Confirm repo structure decision (separate repo vs. branch) - 5 min
5. Schedule first stakeholder check-in (Week 2) - 5 min
6. Data researcher: First 3 outreach calls scheduled for Week 1 Monday - 5 min

**Outcome**: Data researcher starts calls on Monday. Project officially kickoff.

---

## ⚠️ Critical Success Factors

**Phase 0 Gate** (Week 4): Must confirm 70%+ of data sources are accessible, or project stalls

**High-risk sources** (contact first):
- KRA income tax rates and VAT
- NSSF pension contribution rates
- KNBS census data (PxWeb API)
- EPRA electricity tariffs
- CAK FM broadcaster register

**If any of these are blocked**: Document as a show-stopper and pivot scope

---

## 🔗 Links & References

**All About Accra**:
- Live site: https://allaboutaccra.com
- GitHub repo: https://github.com/peratov/allaboutaccra
- PRODUCT.md (in accra-source): Full product spec

**Kenya Government Sources**:
- KRA: https://kra.go.ke
- KNBS: https://knbs.or.ke (with PxWeb API)
- CAK: https://cak.go.ke (FM register under broadcasting)
- EPRA: https://epra.go.ke
- Kenya Power: https://kplc.co.ke

---

## 📝 Document Map

```
allaboutnairobi/
├── README.md (you are here)
├── START_HERE.md ← Read first
├── ACCRA_CODEBASE_AUDIT.md (understand what reuses)
├── PHASE_0_DETAILED_PLAN.md (your 4-week research plan)
├── NAIROBI_EQUIVALENCE_MAP.md (institution mappings)
├── KENYA_DATA_SOURCES.md (comprehensive data tracker)
├── PHASE_1_SETUP.md (read after Phase 0 approved)
├── accra-source/ (reference codebase, 5.8 MB)
│   ├── frontend/
│   │   ├── content/constants.yaml (study this!)
│   │   ├── ursus_config.py (where Ghana math lives)
│   │   ├── templates/ (component patterns)
│   │   ├── scripts/ (data pipeline examples)
│   │   └── extensions/ (linters, processors)
│   ├── PRODUCT.md (full product spec)
│   ├── CLAUDE.md (engineering decisions & traps)
│   └── .claude/ (configuration)
└── accra-source/.git/ (full git history)
```

---

## 🎓 Learning Path (If New to Project)

**Day 1** (1 hour):
- Read START_HERE.md
- Build Accra locally (`mise build`)
- Understand: Generator (Ursus) + Content (Markdown/YAML) + No backend

**Day 2** (2 hours):
- Study `constants.yaml` structure
- Read ursus_config.py (how constants become guides and calculators)
- Understand: "No number is ever typed into a guide"

**Day 3** (1.5 hours):
- Read one guide in `content/guides/` (e.g., `first-week-in-accra.md`)
- Read matching linter in `extensions/linters/`
- Understand: How content is validated at build time

**By end of Week 1**:
- Can build Accra locally
- Understand constants system
- Know what Phase 0 data research entails
- Ready to contribute to Nairobi build

---

## ❓ FAQ

**Q: Why start with Phase 0 research instead of coding?**  
A: If Kenya data sources are blocked, the whole project stalls. Finding out at Week 9 (after repo setup) costs you time. Finding out at Week 4 (end of Phase 0) lets you pivot or negotiate early.

**Q: Can we start with just the guides and skip the map/radio/etc?**  
A: Yes. Skip Phase 3 (advanced features) initially. But guides depend on constants, so Phase 2 can't start until Phase 0 confirms tax rates, housing, etc.

**Q: How long will Phase 0 really take?**  
A: 4 weeks assumes you reach government agencies and get responses. Some agencies are slower. If KNBS takes 3 weeks to grant API access, that's fine—you proceed with what you have.

**Q: What if we can't access housing data?**  
A: Use Accra's model: 5-band ranking by neighborhood (no cedi figures), label it "estimated," and be honest. Works fine.

**Q: Do we need Vercel or can we host elsewhere?**  
A: Anywhere works. Vercel is free tier + easy deploys. Your choice.

**Q: What if we run out of time?**  
A: Ship MVP (guides + glossary + calculators). Skip Phase 3 (map, radio, etc.) and release them later. Better to ship 80% on time than 100% late.

---

## 📞 Support

**If you get stuck**:
- Check ACCRA_CODEBASE_AUDIT.md "Known Traps" section
- Read CLAUDE.md in accra-source (very detailed)
- Review PHASE_0_DETAILED_PLAN.md "Risk & Mitigation" section

**Questions about specific Kenya data**:
- Check PHASE_0_DETAILED_PLAN.md contacts table
- Email the agency directly (template provided)
- Ask r/Kenya on Reddit if informal (matatu routes, rent ranges)

---

## ✨ You've Got This

You have:
- ✅ Proven model (Accra codebase)
- ✅ Clear roadmap (6 months, 5 phases)
- ✅ Specific data sources (contacts provided)
- ✅ Known traps and workarounds
- ✅ Go/no-go gates (pivot early if needed)

**Next action**: Schedule Phase 0 kickoff for tomorrow morning. Data researcher starts calls on Monday.

---

**Prepared**: 22 September 2026  
**Status**: Ready to begin Phase 0 (Research & Foundation)  
**Next milestone**: Gate 1 review (end of Week 4)

Let's build All About Nairobi. 🚀
