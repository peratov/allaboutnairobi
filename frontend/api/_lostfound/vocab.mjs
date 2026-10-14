// Lost and found's vocabulary: categories, kinds of place, limits.
//
// Read by the function (handlers.mjs imports it) and by the site build
// (ursus_config.py strips the `export default` and reads the rest as
// JSON), so a category the form offers is always one the server accepts.
// Keep everything after `export default` valid JSON: double quotes, no
// trailing commas, no comments.
//
// A module rather than a .json file because Vercel only ships what its
// file tracer can see imported, and it did not follow a require() of the
// JSON: the function crashed on load in production with the file missing.

export default {
	"categories": [
		{
			"id": "phone",
			"label": "Phone"
		},
		{
			"id": "wallet",
			"label": "Wallet or purse"
		},
		{
			"id": "documents",
			"label": "ID card or documents"
		},
		{
			"id": "keys",
			"label": "Keys"
		},
		{
			"id": "bag",
			"label": "Bag or luggage"
		},
		{
			"id": "electronics",
			"label": "Laptop, tablet, other electronics"
		},
		{
			"id": "jewellery",
			"label": "Jewellery or watch"
		},
		{
			"id": "clothing",
			"label": "Clothing or shoes"
		},
		{
			"id": "glasses",
			"label": "Glasses"
		},
		{
			"id": "pet",
			"label": "Pet"
		},
		{
			"id": "child",
			"label": "Child's things"
		},
		{
			"id": "other",
			"label": "Something else"
		}
	],
	"placeKinds": [
		{
			"id": "mall",
			"label": "Shopping mall"
		},
		{
			"id": "transport",
			"label": "Station, terminal or airport"
		},
		{
			"id": "market",
			"label": "Market"
		},
		{
			"id": "hospital",
			"label": "Hospital or clinic"
		},
		{
			"id": "school",
			"label": "School or university"
		},
		{
			"id": "worship",
			"label": "Place of worship"
		},
		{
			"id": "venue",
			"label": "Restaurant, bar or venue"
		},
		{
			"id": "office",
			"label": "Office, bank or business"
		},
		{
			"id": "other",
			"label": "Somewhere else"
		}
	],
	"limits": {
		"itemDays": 60,
		"placeItemDays": 90,
		"titleMax": 80,
		"detailsMax": 600,
		"placeTextMax": 120,
		"messageMax": 600,
		"itemsPerHour": 5,
		"claimsPerHour": 10,
		"flagsPerHour": 20,
		"joinsPerHour": 3,
		"eventsPerHour": 3,
		"pageSize": 24
	}
};
