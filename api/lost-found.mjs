// Vercel builds functions from api/ under the project's Root Directory. This
// repository carries a vercel.json at the root and one under frontend/, so it
// deploys whichever way the dashboard is set; when the Root Directory is the
// repository root, this is the file Vercel finds. The function itself lives in
// frontend/api/ - this only points at it, and file tracing follows the import.
export { default } from '../frontend/api/lost-found.mjs';
