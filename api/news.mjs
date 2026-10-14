// The newsletter's function. Like api/pulse.mjs beside it, this only points at
// the real one under frontend/api/, because Vercel builds functions from the
// repository root - see "Deployment" in CLAUDE.md.
export { default } from '../frontend/api/news.mjs';
