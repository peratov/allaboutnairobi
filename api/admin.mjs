// The admin function. Like api/lost-found.mjs beside it, this only points at
// the real one under frontend/api/, because Vercel builds functions from the
// repository root - see "Deployment" in CLAUDE.md.
export { default } from '../frontend/api/admin.mjs';
