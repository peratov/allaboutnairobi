# Phase 1: Fork and Rename - Setup Checklist

**Scope**: Establish empty site structure, rename all Accra references to Nairobi, get build/lint/deploy working.
**Effort**: Days (if starting from All About Accra repo)
**Blocking**: Everything else depends on this passing green.

## Steps

### 1.1 Repository Setup
- [ ] **Have All About Accra repo** (public clone or provided)
- [ ] **Create Nairobi as a new branch or separate repo**
  - Option A: Fork and create `allaboutnairobi` branch
  - Option B: Separate repo entirely
  - **Decision**: TBD by Plan agent

### 1.2 Rename Site Identity
- [ ] Site name: Accra → Nairobi
- [ ] Domain: `www.allaboutnairobi.com` (or staging domain for now)
- [ ] Currency: GHS (cedis filter) → KES (shillings filter)
- [ ] Analytics IDs: GA_MEASUREMENT_ID, CLARITY_PROJECT_ID (or empty for now)
- [ ] Contact email: Set or leave placeholder
- [ ] Social handle (X): Set or leave placeholder
- [ ] Newsletter provider: Set or leave empty

### 1.3 Configuration Files
- [ ] `vercel.json`: Update domain redirects, CSP hosts
- [ ] `.env` / environment variables: DOMAIN, CONTACT_EMAIL, NEWSLETTER_*, GA_*, etc.
- [ ] `ursus_config.py`: Update site name, currency filter name, derived values (will be rewritten in Phase 2)
- [ ] `frontend/templates/_layout.html`: Update site name, header title, favicon reference
- [ ] `CLAUDE.md`: Update for Nairobi context (or create new)

### 1.4 Empty Content Structure
- [ ] `content/guides/`: Delete all Accra guides, keep one example (e.g., `_example-guide.md`)
- [ ] `content/glossary/`: Delete all Accra terms, keep one example
- [ ] `content/constants.yaml`: Empty (will be populated in Phase 2)
- [ ] `content/collections.yaml`: Empty or keep example structure
- [ ] `content/newsletter/`: Clear out old issues

### 1.5 Design System & Symbols
- [ ] Replace `build_icons.py`: Swap Adinkra for a Nairobi/Kenyan symbol set
  - **Research needed**: What symbol system? Maasai patterns? Beadwork? Kenyan national symbols?
  - Generate new SVG icon set or find public Kenyan symbol library
- [ ] Update colour palette (if desired; can keep Accra's for now)
- [ ] Update theme token names if needed

### 1.6 Build and Lint
- [ ] Install dependencies (Python, Node, Docker if needed)
- [ ] **Run `mise build`**: Should succeed on empty site
- [ ] **Run `mise lint`**: Should pass (no stale constants, no undefined glossary links on empty site)
- [ ] **Run `mise check-crawl`**: Verify structure is correct
- [ ] HTML output should render: home, 404, sitemap, robots.txt, llms.txt

### 1.7 Deployment
- [ ] Set up Vercel project (or use existing for staging)
- [ ] Deploy empty site to staging URL
- [ ] Verify canonical host and redirects work
- [ ] Confirm `mise check-deploy` passes

### 1.8 Documentation
- [ ] Create `README.md` or update with Nairobi build instructions
- [ ] Document any local build differences (Docker Compose, local dev server)
- [ ] Note data source URLs for Phase 2

## Definition of Done (Phase 1)
- [ ] Git repo building and passing all linters on main branch
- [ ] Empty site deployed to staging
- [ ] Canonical host confirmed
- [ ] Ready to start Phase 2 (constants) without blocking issues
- [ ] Team can clone repo and run `mise build` successfully

## Risks
- **Build system unfamiliar**: Ursus, Jinja2, custom extensions may need learning curve
- **Python/Node versions**: Ensure local environment matches production
- **Design system**: Choosing new symbol set may require research or creative input
- **Vercel config**: Domain/CSP setup could have gotchas (see PRODUCT.md section 10 lessons)

## Next Phase Gate
✅ **Go to Phase 2** only if:
1. Repo builds and passes lint on empty site
2. Staging deploy succeeds
3. All Accra references removed or renamed
4. Ready to research and populate Kenya constants
