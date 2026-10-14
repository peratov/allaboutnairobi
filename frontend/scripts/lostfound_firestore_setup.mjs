// Prints the commands that set up lost and found's database on Google Cloud,
// to paste into Cloud Shell (shell.cloud.google.com), which has gcloud and is
// already signed in as you. Nothing here runs anything or touches a secret:
// it only writes text.
//
//   node scripts/lostfound_firestore_setup.mjs <project-id> [location]
//   (or: mise lostfound-firestore <project-id>)
//
// The location defaults to europe-west2, London: the nearest Google region to
// Accra with Firestore, and beside lhr1, the Vercel region the function is
// pinned to in vercel.json. If you choose another, move the function too, and
// change "Where it is kept" in content/terms.md.
//
// The indexes come from api/_lostfound/firestore.indexes.json - the same file
// check_lostfound.mjs holds every query to - so what is created here is
// exactly what the code was tested against.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const [project, location = 'europe-west2'] = process.argv.slice(2);
if (!project || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project)) {
	console.error('Usage: node scripts/lostfound_firestore_setup.mjs <project-id> [location]\n\nThe project id is the lowercase one, e.g. allaboutaccra-lostfound.');
	process.exit(1);
}

const { indexes } = JSON.parse(readFileSync(path.join(here, '..', 'api', '_lostfound', 'firestore.indexes.json'), 'utf8'));
const account = `lostfound@${project}.iam.gserviceaccount.com`;

const lines = [
	'# Lost and found on Firestore. Paste into Cloud Shell; it takes a few minutes.',
	'set -e',
	`gcloud config set project ${project}`,
	'gcloud services enable firestore.googleapis.com',
	'',
	'# The database. Native mode; the (default) database is the one with the free tier.',
	'# A project made in the Firebase console may have one already, so this keeps it.',
	`gcloud firestore databases describe --database='(default)' --format='value(locationId,type)' 2>/dev/null \\`,
	`  || gcloud firestore databases create --location=${location} --type=firestore-native`,
	'',
	'# The indexes every query needs. They build in the background. One that exists',
	'# already says so and is left alone.',
	...indexes.map((index) => [
		'gcloud firestore indexes composite create --async',
		`--collection-group=${index.collectionGroup}`,
		`--query-scope=${index.queryScope}`,
		...index.fields.map((f) => `--field-config=field-path=${f.fieldPath},order=${f.order.toLowerCase()}`),
		'|| true',
	].join(' ')),
	'',
	'# One account for the function, allowed to read and write documents and nothing else.',
	`gcloud iam service-accounts describe ${account} >/dev/null 2>&1 \\`,
	`  || gcloud iam service-accounts create lostfound --display-name="allaboutaccra lost and found"`,
	`gcloud projects add-iam-policy-binding ${project} --member=serviceAccount:${account} --role=roles/datastore.user --condition=None`,
	'',
	'# Its key, base64 on one line, for Vercel. Copy it, then delete the files.',
	`gcloud iam service-accounts keys create lostfound-key.json --iam-account=${account}`,
	'base64 -w0 lostfound-key.json > lostfound-key.b64 && cat lostfound-key.b64 && echo',
	'',
	'# After pasting it into Vercel as FIRESTORE_CREDENTIALS:',
	'#   rm lostfound-key.json lostfound-key.b64',
	'',
	'# Check the indexes have finished (STATE READY) before switching it on:',
	'gcloud firestore indexes composite list --format="table(name.basename(),state)"',
];

console.log(lines.join('\n'));
