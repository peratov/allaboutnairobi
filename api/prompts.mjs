// How readers meet the site's prompts. Like api/play.mjs beside it, this only
// points at the real one under frontend/api/, because Vercel builds functions
// from the repository root - see "Deployment" in CLAUDE.md.
export { default } from '../frontend/api/prompts.mjs';
