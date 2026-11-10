// The shilling's exchange rates. Like the other functions here, this only
// points at the real one under frontend/api/, because Vercel builds functions
// from the repository root - see "Deployment" in CLAUDE.md.
export { default } from '../frontend/api/fx.mjs';
