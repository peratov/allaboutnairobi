// The site's owner, and the only person the admin lets in.
//
// Written here rather than read from the environment on purpose: the owner is
// a decision about the site, not a setting of one deployment, and an
// environment variable is one more place somebody could quietly add a second
// address. Changing it is a commit, with a name on it.

// Empty until the site owner's Google account is chosen: an empty address
// matches nobody, so the admin stays locked rather than open.
export const OWNER_EMAIL = '';
