// Nairobi Pulse's vocabulary: topics, answer presets, limits and thresholds.
//
// Read by the function (handlers.mjs imports it) and by the site build
// (ursus_config.py strips the `export default` and reads the rest as JSON),
// so a topic the admin can pick is one the page can draw, and the threshold
// the page explains is the one the server enforces. Keep everything after
// `export default` valid JSON: double quotes, no trailing commas, no comments.
//
// A module rather than a .json file for the same reason as lost and found's:
// Vercel only ships what its file tracer sees imported.
//
//   minDistrictVotes  a district's answers are published only from this many
//                     votes. Below it the map hatches the district and says
//                     how many more it needs - a share of three votes is noise
//                     dressed as a finding, and in a small district it can say
//                     how one person voted.
//   passDays          how long a location check lasts before it is asked again.
//   maxAccuracyMetres a location the device itself is less sure of than this
//                     is a guess from the network, not a position, and is refused.
//   edgeMetres        how far outside the drawn boundary still counts - the
//                     constituency shapes are simplified.
//   keepVotesDays     individual votes are deleted this long after a question
//                     closes; the totals stay.
//   limits.maxLive    how many questions may be open at once, unless the admin
//                     sets another number (Settings, up to 100).
//   prompt            asking readers on every page (pulse-prompt.mjs), unless
//                     the admin sets otherwise: whether to ask at all; who
//                     (connections in Nairobi, anyone in Kenya, or
//                     everyone, for trying it out); after how many seconds of
//                     reading, and again after how many more; at most how many
//                     times a visit; and whether to ask as someone leaves.
//                     `bounds` is what the admin may set each number to.
//
// The ready-made questions are in bank.mjs.

export default {
	"topics": [
		{ "id": "transport", "label": "Getting around", "symbol": "transport" },
		{ "id": "utilities", "label": "Power and water", "symbol": "utilities" },
		{ "id": "housing", "label": "Housing and rent", "symbol": "housing" },
		{ "id": "money", "label": "Money and prices", "symbol": "money" },
		{ "id": "safety", "label": "Safety", "symbol": "rights" },
		{ "id": "environment", "label": "Rubbish, drains and flooding", "symbol": "environment" },
		{ "id": "city", "label": "City life", "symbol": "exploring" },
		{ "id": "health", "label": "Health", "symbol": "health" },
		{ "id": "education", "label": "Schools and learning", "symbol": "education" },
		{ "id": "government", "label": "Government and services", "symbol": "services" },
		{ "id": "culture", "label": "Culture and sport", "symbol": "culture" },
		{ "id": "food", "label": "Food and markets", "symbol": "shopping" }
	],
	"presets": [
		{ "id": "yesno", "label": "Yes or no", "kind": "choice", "options": [{ "label": "Yes" }, { "label": "No" }] },
		{ "id": "yesnounsure", "label": "Yes, no or not sure", "kind": "choice", "options": [{ "label": "Yes" }, { "label": "No" }, { "label": "Not sure" }] },
		{ "id": "agree", "label": "Agree or disagree", "kind": "scale", "options": [{ "label": "Strongly agree", "value": 2 }, { "label": "Agree", "value": 1 }, { "label": "Not sure", "value": 0 }, { "label": "Disagree", "value": -1 }, { "label": "Strongly disagree", "value": -2 }] },
		{ "id": "better", "label": "Better or worse", "kind": "scale", "options": [{ "label": "Better", "value": 1 }, { "label": "About the same", "value": 0 }, { "label": "Worse", "value": -1 }] },
		{ "id": "rating", "label": "Good or bad", "kind": "scale", "options": [{ "label": "Very good", "value": 2 }, { "label": "Good", "value": 1 }, { "label": "Okay", "value": 0 }, { "label": "Bad", "value": -1 }, { "label": "Very bad", "value": -2 }] },
		{ "id": "safe", "label": "Safe or unsafe", "kind": "scale", "options": [{ "label": "Very safe", "value": 2 }, { "label": "Safe", "value": 1 }, { "label": "Not sure", "value": 0 }, { "label": "Unsafe", "value": -1 }, { "label": "Very unsafe", "value": -2 }] },
		{ "id": "custom", "label": "Your own answers", "kind": "choice", "options": [{ "label": "" }, { "label": "" }, { "label": "" }] }
	],
	"limits": {
		"passesPerHour": 30,
		"minOptions": 2,
		"maxOptions": 6,
		"maxChanges": 5,
		"maxLive": 12,
		"questionMax": 140,
		"contextMax": 400,
		"optionMax": 40
	},
	"minDistrictVotes": 10,
	"passDays": 7,
	"maxAccuracyMetres": 5000,
	"edgeMetres": 500,
	"keepVotesDays": 30,
	"prompt": {
		"on": true,
		"audience": "nairobi",
		"delay": 40,
		"again": 150,
		"perVisit": 5,
		"leave": true,
		"audiences": [
			{ "id": "nairobi", "label": "Connections in Nairobi" },
			{ "id": "kenya", "label": "Anyone in Kenya" },
			{ "id": "everyone", "label": "Everyone - for trying it out" }
		],
		"bounds": { "delay": [10, 600], "again": [30, 3600], "perVisit": [1, 20] }
	}
}
