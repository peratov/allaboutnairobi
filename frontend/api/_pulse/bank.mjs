// Nairobi Pulse's question bank: a hundred questions ready to switch on.
//
// The admin lists every one with an On/Off switch (see admin.mjs). Switching
// one on writes it as a question - live, its answers from `preset` or its own
// `options` - and remembers which bank entry it came from by `key`, so it is
// never written twice; switching it off closes it, or returns it to a draft
// if nobody voted. The bank itself is never shown to the public.
//
// The questions follow the rules the page explains: about everyday Nairobi,
// answerable by anyone in it, likely to differ from one constituency to the
// next, and asked neutrally - a `context` line adds what a voter needs and
// never an argument for one answer. No party politics, no religion, no
// ethnicity, and no figure that would need a source.
//
// `key` is permanent once a question has been switched on: it is how the admin
// finds the question again. Change the wording freely; add new entries at the
// end. scripts/check_pulse.mjs checks every entry against the rules a question
// written in the admin must pass. Keep everything after `export default`
// valid JSON.

export default [
	{
		"key": "should-boda-bodas-be-allowed-in-nairobi-s-cbd",
		"topic": "transport",
		"text": "Should boda bodas be allowed in Nairobi's CBD?",
		"preset": "yesnounsure",
		"context": "Motorbike taxis are restricted in the city centre but carry people all over the rest of Nairobi."
	},
	{
		"key": "compared-with-a-year-ago-is-getting-around-nairo",
		"topic": "transport",
		"text": "Compared with a year ago, is getting around Nairobi better or worse?",
		"preset": "better"
	},
	{
		"key": "how-do-you-mostly-get-to-work-or-school",
		"topic": "transport",
		"text": "How do you mostly get to work or school?",
		"preset": "custom",
		"options": [
			"Matatu",
			"Walking",
			"Ride-hailing",
			"My own car",
			"Boda boda",
			"Bus or train"
		]
	},
	{
		"key": "how-long-does-your-usual-trip-to-work-or-school",
		"topic": "transport",
		"text": "How long does your usual trip to work or school take?",
		"preset": "custom",
		"options": [
			"Under 30 minutes",
			"30 minutes to an hour",
			"One to two hours",
			"More than two hours"
		],
		"context": "One way, on a normal weekday."
	},
	{
		"key": "how-safe-do-you-feel-in-a-matatu",
		"topic": "transport",
		"text": "How safe do you feel in a matatu?",
		"preset": "safe"
	},
	{
		"key": "matatus-and-buses-should-have-their-own-lanes-on",
		"topic": "transport",
		"text": "Matatus and buses should have their own lanes on Nairobi's main roads.",
		"preset": "agree",
		"context": "Even if it means less room for cars."
	},
	{
		"key": "how-would-you-rate-the-roads-in-your-area",
		"topic": "transport",
		"text": "How would you rate the roads in your area?",
		"preset": "rating",
		"context": "The roads you use every day, near where you are now."
	},
	{
		"key": "would-you-use-a-commuter-train-if-it-ran-often-a",
		"topic": "transport",
		"text": "Would you use a commuter train if it ran often and on time from your area?",
		"preset": "yesnounsure"
	},
	{
		"key": "how-easy-is-it-to-cross-the-main-road-near-you-o",
		"topic": "transport",
		"text": "How easy is it to cross the main road near you on foot?",
		"preset": "custom",
		"options": [
			"Easy",
			"Takes care",
			"Dangerous"
		]
	},
	{
		"key": "how-has-your-power-supply-been-this-past-week",
		"topic": "utilities",
		"text": "How has your power supply been this past week?",
		"preset": "rating",
		"context": "Think of the lights in your own home, not the news."
	},
	{
		"key": "can-you-find-drinking-water-you-trust-in-your-ar",
		"topic": "utilities",
		"text": "Can you find drinking water you trust in your area?",
		"preset": "custom",
		"options": [
			"Yes, easily",
			"With some effort",
			"No"
		]
	},
	{
		"key": "how-often-does-water-run-from-your-tap",
		"topic": "utilities",
		"text": "How often does water run from your tap?",
		"preset": "custom",
		"options": [
			"Every day",
			"A few days a week",
			"Rarely",
			"We have no tap"
		]
	},
	{
		"key": "what-do-you-mostly-drink-at-home",
		"topic": "utilities",
		"text": "What do you mostly drink at home?",
		"preset": "custom",
		"options": [
			"Bottled or dispenser water",
			"Tap water",
			"Boiled or filtered water",
			"Borehole water",
			"Water from a vendor"
		]
	},
	{
		"key": "do-your-electricity-tokens-buy-less-than-they-di",
		"topic": "utilities",
		"text": "Do your electricity tokens buy less than they did three months ago?",
		"preset": "custom",
		"options": [
			"A lot less",
			"A little less",
			"About the same",
			"More"
		]
	},
	{
		"key": "what-keeps-you-going-when-the-power-goes-off",
		"topic": "utilities",
		"text": "What keeps you going when the power goes off?",
		"preset": "custom",
		"options": [
			"A generator",
			"Solar",
			"An inverter or batteries",
			"Nothing - we wait"
		]
	},
	{
		"key": "how-reliable-is-your-internet-where-you-live",
		"topic": "utilities",
		"text": "How reliable is your internet where you live?",
		"preset": "rating",
		"context": "Mobile data or a home connection, whichever you use most."
	},
	{
		"key": "water-vendors-prices-should-be-controlled-during",
		"topic": "utilities",
		"text": "Water vendors' prices should be controlled during shortages.",
		"preset": "agree"
	},
	{
		"key": "did-you-have-to-pay-more-than-two-months-deposit",
		"topic": "housing",
		"text": "Did you have to pay more than two months' deposit for your current home?",
		"preset": "yesnounsure"
	},
	{
		"key": "how-much-of-your-income-goes-on-rent",
		"topic": "housing",
		"text": "How much of your income goes on rent?",
		"preset": "custom",
		"options": [
			"Under a quarter",
			"A quarter to a half",
			"More than half",
			"I don't pay rent"
		]
	},
	{
		"key": "finding-a-place-to-rent-in-your-area-has-got-har",
		"topic": "housing",
		"text": "Finding a place to rent in your area has got harder this year.",
		"preset": "agree"
	},
	{
		"key": "do-you-rent-own-or-live-in-a-family-home",
		"topic": "housing",
		"text": "Do you rent, own, or live in a family home?",
		"preset": "custom",
		"options": [
			"Rent",
			"Own",
			"Family home",
			"Something else"
		]
	},
	{
		"key": "did-you-get-your-full-deposit-back-when-you-last",
		"topic": "housing",
		"text": "Did you get your full deposit back when you last moved out?",
		"preset": "yesnounsure"
	},
	{
		"key": "how-would-you-rate-the-condition-of-your-home",
		"topic": "housing",
		"text": "How would you rate the condition of your home?",
		"preset": "rating"
	},
	{
		"key": "have-you-ever-paid-an-agent-for-a-place-you-neve",
		"topic": "housing",
		"text": "Have you ever paid an agent for a place you never got?",
		"preset": "yesno"
	},
	{
		"key": "does-your-street-flood-when-it-rains-heavily",
		"topic": "housing",
		"text": "Does your street flood when it rains heavily?",
		"preset": "custom",
		"options": [
			"Never",
			"Sometimes",
			"Every heavy rain"
		]
	},
	{
		"key": "would-you-move-further-out-of-the-city-for-cheap",
		"topic": "housing",
		"text": "Would you move further out of the city for cheaper rent?",
		"preset": "yesnounsure"
	},
	{
		"key": "how-are-you-managing-financially-compared-with-a",
		"topic": "money",
		"text": "How are you managing financially compared with a year ago?",
		"preset": "better"
	},
	{
		"key": "do-you-pay-with-m-pesa-more-than-cash",
		"topic": "money",
		"text": "Do you pay with M-Pesa more than cash?",
		"preset": "custom",
		"options": [
			"Mostly M-Pesa",
			"About half and half",
			"Mostly cash"
		]
	},
	{
		"key": "has-someone-tried-to-scam-you-through-m-pesa",
		"topic": "money",
		"text": "Has someone tried to scam you through M-Pesa?",
		"preset": "custom",
		"options": [
			"Yes, and it worked",
			"Yes, but I caught it",
			"No"
		]
	},
	{
		"key": "do-you-manage-to-save-part-of-your-income-each-m",
		"topic": "money",
		"text": "Do you manage to save part of your income each month?",
		"preset": "custom",
		"options": [
			"Yes",
			"Some months",
			"No"
		]
	},
	{
		"key": "do-you-use-fuliza-or-a-mobile-loan-most-months",
		"topic": "money",
		"text": "Do you use Fuliza or a mobile loan most months?",
		"preset": "yesno"
	},
	{
		"key": "do-you-have-a-side-hustle-as-well-as-your-main-w",
		"topic": "money",
		"text": "Do you have a side hustle as well as your main work?",
		"preset": "yesno"
	},
	{
		"key": "how-hard-is-it-to-borrow-money-for-a-small-busin",
		"topic": "money",
		"text": "How hard is it to borrow money for a small business?",
		"preset": "custom",
		"options": [
			"Easy",
			"Hard",
			"Impossible",
			"I have never tried"
		]
	},
	{
		"key": "after-rent-and-food-what-do-you-spend-most-on",
		"topic": "money",
		"text": "After rent and food, what do you spend most on?",
		"preset": "custom",
		"options": [
			"Transport",
			"School fees",
			"Phone and data",
			"Power and water",
			"Supporting family",
			"Health"
		]
	},
	{
		"key": "are-prices-rising-faster-than-your-income",
		"topic": "money",
		"text": "Are prices rising faster than your income?",
		"preset": "custom",
		"options": [
			"Much faster",
			"A little faster",
			"About the same",
			"No, my income is keeping up"
		]
	},
	{
		"key": "do-you-belong-to-a-chama",
		"topic": "money",
		"text": "Do you belong to a chama?",
		"preset": "yesno"
	},
	{
		"key": "how-safe-do-you-feel-walking-in-your-area-after",
		"topic": "safety",
		"text": "How safe do you feel walking in your area after dark?",
		"preset": "safe",
		"context": "Your own street and the roads around it."
	},
	{
		"key": "has-your-area-felt-safer-or-less-safe-this-year",
		"topic": "safety",
		"text": "Has your area felt safer or less safe this year?",
		"preset": "custom",
		"options": [
			"Safer",
			"About the same",
			"Less safe"
		]
	},
	{
		"key": "do-you-trust-the-police-to-help-if-you-report-a",
		"topic": "safety",
		"text": "Do you trust the police to help if you report a crime?",
		"preset": "yesnounsure"
	},
	{
		"key": "are-the-street-lights-on-your-street-working",
		"topic": "safety",
		"text": "Are the street lights on your street working?",
		"preset": "custom",
		"options": [
			"All of them",
			"Some of them",
			"None of them",
			"There are no street lights"
		]
	},
	{
		"key": "would-you-let-a-child-walk-to-school-alone-in-yo",
		"topic": "safety",
		"text": "Would you let a child walk to school alone in your area?",
		"preset": "yesnounsure"
	},
	{
		"key": "has-anyone-in-your-household-had-a-phone-snatche",
		"topic": "safety",
		"text": "Has anyone in your household had a phone snatched this year?",
		"preset": "yesno"
	},
	{
		"key": "does-your-area-have-a-residents-association-or-c",
		"topic": "safety",
		"text": "Does your area have a residents' association or community security?",
		"preset": "yesnounsure"
	},
	{
		"key": "how-safe-do-you-feel-on-nairobi-s-roads-as-a-ped",
		"topic": "safety",
		"text": "How safe do you feel on Nairobi's roads as a pedestrian?",
		"preset": "safe"
	},
	{
		"key": "is-rubbish-collected-regularly-on-your-street",
		"topic": "environment",
		"text": "Is rubbish collected regularly on your street?",
		"preset": "custom",
		"options": [
			"Yes, every week",
			"Sometimes",
			"No, hardly ever"
		]
	},
	{
		"key": "how-bad-was-flooding-in-your-area-this-rainy-sea",
		"topic": "environment",
		"text": "How bad was flooding in your area this rainy season?",
		"preset": "custom",
		"options": [
			"No flooding",
			"Some flooding",
			"Bad flooding",
			"Our home flooded"
		]
	},
	{
		"key": "are-the-drains-near-your-home-blocked",
		"topic": "environment",
		"text": "Are the drains near your home blocked?",
		"preset": "custom",
		"options": [
			"Clear",
			"Partly blocked",
			"Badly blocked"
		]
	},
	{
		"key": "burning-rubbish-should-be-fined",
		"topic": "environment",
		"text": "Burning rubbish should be fined.",
		"preset": "agree"
	},
	{
		"key": "how-do-you-get-rid-of-your-rubbish",
		"topic": "environment",
		"text": "How do you get rid of your rubbish?",
		"preset": "custom",
		"options": [
			"A collection company",
			"A private collector",
			"We burn it",
			"We take it to a dump"
		]
	},
	{
		"key": "how-clean-is-your-neighbourhood",
		"topic": "environment",
		"text": "How clean is your neighbourhood?",
		"preset": "rating"
	},
	{
		"key": "would-you-sort-plastic-from-other-rubbish-if-it",
		"topic": "environment",
		"text": "Would you sort plastic from other rubbish if it were collected separately?",
		"preset": "yesnounsure"
	},
	{
		"key": "is-noise-a-problem-where-you-live",
		"topic": "environment",
		"text": "Is noise a problem where you live?",
		"preset": "custom",
		"options": [
			"Not at all",
			"Sometimes",
			"Often",
			"All the time"
		],
		"context": "Churches, bars, generators, traffic - whatever it is."
	},
	{
		"key": "the-nairobi-river-should-be-cleaned-up-before-ne",
		"topic": "environment",
		"text": "The Nairobi River should be cleaned up before new building goes near it.",
		"preset": "agree"
	},
	{
		"key": "do-you-visit-karura-the-arboretum-or-another-for",
		"topic": "environment",
		"text": "Do you visit Karura, the Arboretum or another forest in the city?",
		"preset": "yesnounsure"
	},
	{
		"key": "would-you-recommend-your-neighbourhood-to-a-frie",
		"topic": "city",
		"text": "Would you recommend your neighbourhood to a friend moving to Nairobi?",
		"preset": "yesnounsure"
	},
	{
		"key": "what-do-you-like-most-about-nairobi",
		"topic": "city",
		"text": "What do you like most about Nairobi?",
		"preset": "custom",
		"options": [
			"The people",
			"The food",
			"The nightlife",
			"The parks and wildlife",
			"The opportunities",
			"The weather"
		]
	},
	{
		"key": "nairobi-is-a-good-place-to-raise-children",
		"topic": "city",
		"text": "Nairobi is a good place to raise children.",
		"preset": "agree"
	},
	{
		"key": "are-there-enough-parks-and-playgrounds-near-you",
		"topic": "city",
		"text": "Are there enough parks and playgrounds near you?",
		"preset": "yesnounsure"
	},
	{
		"key": "some-streets-in-nairobi-should-be-closed-to-cars",
		"topic": "city",
		"text": "Some streets in Nairobi should be closed to cars on weekends.",
		"preset": "agree",
		"context": "For markets, walking and play."
	},
	{
		"key": "will-you-still-live-in-nairobi-five-years-from-n",
		"topic": "city",
		"text": "Will you still live in Nairobi five years from now?",
		"preset": "custom",
		"options": [
			"Definitely",
			"Probably",
			"Probably not",
			"Definitely not"
		]
	},
	{
		"key": "how-friendly-are-your-neighbours",
		"topic": "city",
		"text": "How friendly are your neighbours?",
		"preset": "rating"
	},
	{
		"key": "what-does-nairobi-need-most",
		"topic": "city",
		"text": "What does Nairobi need most?",
		"preset": "custom",
		"options": [
			"Jobs",
			"Housing",
			"Transport",
			"Clean streets",
			"Safety",
			"Healthcare"
		]
	},
	{
		"key": "are-you-registered-with-sha",
		"topic": "health",
		"text": "Are you registered with SHA?",
		"preset": "custom",
		"options": [
			"Yes, and it works",
			"Yes, but I have had problems",
			"No",
			"Not sure"
		]
	},
	{
		"key": "how-long-did-you-wait-the-last-time-you-went-to",
		"topic": "health",
		"text": "How long did you wait the last time you went to a hospital or clinic?",
		"preset": "custom",
		"options": [
			"Under an hour",
			"One to three hours",
			"Half a day",
			"A whole day or more"
		]
	},
	{
		"key": "how-would-you-rate-the-clinic-or-hospital-neares",
		"topic": "health",
		"text": "How would you rate the clinic or hospital nearest you?",
		"preset": "rating",
		"context": "The one you would actually go to."
	},
	{
		"key": "can-you-see-a-doctor-when-you-need-to",
		"topic": "health",
		"text": "Can you see a doctor when you need to?",
		"preset": "custom",
		"options": [
			"Usually",
			"Sometimes",
			"Rarely"
		]
	},
	{
		"key": "is-getting-treatment-under-sha-better-or-worse-t",
		"topic": "health",
		"text": "Is getting treatment under SHA better or worse than it was under NHIF?",
		"preset": "better"
	},
	{
		"key": "do-you-buy-medicine-without-a-prescription",
		"topic": "health",
		"text": "Do you buy medicine without a prescription?",
		"preset": "custom",
		"options": [
			"Often",
			"Sometimes",
			"Never"
		]
	},
	{
		"key": "is-healthcare-in-your-area-better-or-worse-than",
		"topic": "health",
		"text": "Is healthcare in your area better or worse than a year ago?",
		"preset": "better"
	},
	{
		"key": "do-you-have-private-health-insurance-as-well-as",
		"topic": "health",
		"text": "Do you have private health insurance as well as SHA?",
		"preset": "yesnounsure"
	},
	{
		"key": "how-would-you-rate-the-schools-in-your-area",
		"topic": "education",
		"text": "How would you rate the schools in your area?",
		"preset": "rating"
	},
	{
		"key": "the-move-to-the-cbe-curriculum-is-going-well",
		"topic": "education",
		"text": "The move to the CBE curriculum is going well.",
		"preset": "agree",
		"context": "Competency-Based Education, which replaced 8-4-4."
	},
	{
		"key": "do-children-in-your-area-travel-far-to-school",
		"topic": "education",
		"text": "Do children in your area travel far to school?",
		"preset": "custom",
		"options": [
			"No",
			"A short trip",
			"A long trip"
		]
	},
	{
		"key": "school-fees-and-levies-are-harder-to-afford-this",
		"topic": "education",
		"text": "School fees and levies are harder to afford this year.",
		"preset": "agree"
	},
	{
		"key": "do-you-pay-for-tuition-or-extra-classes-for-your",
		"topic": "education",
		"text": "Do you pay for tuition or extra classes for your children?",
		"preset": "custom",
		"options": [
			"Yes",
			"Sometimes",
			"No",
			"No children at school"
		]
	},
	{
		"key": "every-school-should-teach-coding",
		"topic": "education",
		"text": "Every school should teach coding.",
		"preset": "agree"
	},
	{
		"key": "is-a-university-degree-worth-the-cost-today",
		"topic": "education",
		"text": "Is a university degree worth the cost today?",
		"preset": "yesnounsure"
	},
	{
		"key": "what-should-the-county-fix-first",
		"topic": "government",
		"text": "What should the county fix first?",
		"preset": "custom",
		"options": [
			"Roads",
			"Drains and flooding",
			"Rubbish",
			"Street lights",
			"Traffic",
			"Housing"
		]
	},
	{
		"key": "how-would-you-rate-the-services-nairobi-city-cou",
		"topic": "government",
		"text": "How would you rate the services Nairobi City County gives your area?",
		"preset": "rating"
	},
	{
		"key": "do-you-know-who-your-ward-s-mca-is",
		"topic": "government",
		"text": "Do you know who your ward's MCA is?",
		"preset": "yesno"
	},
	{
		"key": "have-you-been-asked-for-a-bribe-to-get-a-public",
		"topic": "government",
		"text": "Have you been asked for a bribe to get a public service this year?",
		"preset": "yesno",
		"context": "Anonymous, like every answer here."
	},
	{
		"key": "how-was-your-last-experience-with-an-ecitizen-se",
		"topic": "government",
		"text": "How was your last experience with an eCitizen service?",
		"preset": "rating"
	},
	{
		"key": "hawkers-should-be-moved-off-the-pavements",
		"topic": "government",
		"text": "Hawkers should be moved off the pavements.",
		"preset": "agree"
	},
	{
		"key": "do-you-trust-the-county-to-spend-land-rates-and",
		"topic": "government",
		"text": "Do you trust the county to spend land rates and fees well?",
		"preset": "yesnounsure"
	},
	{
		"key": "have-you-got-your-maisha-card-yet",
		"topic": "government",
		"text": "Have you got your Maisha Card yet?",
		"preset": "custom",
		"options": [
			"Yes",
			"Applied, still waiting",
			"No",
			"No plans to change my old ID"
		]
	},
	{
		"key": "would-you-go-to-a-public-participation-meeting-a",
		"topic": "government",
		"text": "Would you go to a public participation meeting about your area?",
		"preset": "yesnounsure"
	},
	{
		"key": "will-you-watch-afcon-2027-at-a-stadium-in-nairob",
		"topic": "culture",
		"text": "Will you watch AFCON 2027 at a stadium in Nairobi?",
		"preset": "yesno",
		"context": "Kenya co-hosts with Uganda and Tanzania in June and July 2027."
	},
	{
		"key": "which-sport-do-you-follow-most",
		"topic": "culture",
		"text": "Which sport do you follow most?",
		"preset": "custom",
		"options": [
			"Football",
			"Athletics",
			"Rugby",
			"Basketball",
			"Cricket",
			"None"
		]
	},
	{
		"key": "do-you-support-a-kenyan-premier-league-club",
		"topic": "culture",
		"text": "Do you support a Kenyan Premier League club?",
		"preset": "yesno"
	},
	{
		"key": "what-music-do-you-listen-to-most",
		"topic": "culture",
		"text": "What music do you listen to most?",
		"preset": "custom",
		"options": [
			"Gengetone",
			"Bongo Flava",
			"Afrobeats",
			"Gospel",
			"Benga",
			"Something else"
		]
	},
	{
		"key": "nairobi-needs-more-spaces-for-live-music-and-the",
		"topic": "culture",
		"text": "Nairobi needs more spaces for live music and theatre.",
		"preset": "agree"
	},
	{
		"key": "how-often-do-you-get-out-of-the-city-for-a-weeke",
		"topic": "culture",
		"text": "How often do you get out of the city for a weekend?",
		"preset": "custom",
		"options": [
			"Every month",
			"A few times a year",
			"Rarely",
			"Never"
		]
	},
	{
		"key": "nairobi-is-doing-enough-to-protect-its-old-build",
		"topic": "culture",
		"text": "Nairobi is doing enough to protect its old buildings.",
		"preset": "agree",
		"context": "The CBD's colonial-era buildings, the railway, the old markets and the rest."
	},
	{
		"key": "have-food-prices-at-your-market-gone-up-this-mon",
		"topic": "food",
		"text": "Have food prices at your market gone up this month?",
		"preset": "custom",
		"options": [
			"Up a lot",
			"Up a little",
			"About the same",
			"Down"
		]
	},
	{
		"key": "what-is-your-go-to-cheap-meal",
		"topic": "food",
		"text": "What is your go-to cheap meal?",
		"preset": "custom",
		"options": [
			"Ugali and sukuma",
			"Chapati and beans",
			"Githeri",
			"Pilau",
			"Chips",
			"Nyama choma"
		]
	},
	{
		"key": "how-often-do-you-buy-cooked-food",
		"topic": "food",
		"text": "How often do you buy cooked food?",
		"preset": "custom",
		"options": [
			"Every day",
			"A few times a week",
			"Once a week or less",
			"Rarely"
		]
	},
	{
		"key": "where-do-you-buy-most-of-your-food",
		"topic": "food",
		"text": "Where do you buy most of your food?",
		"preset": "custom",
		"options": [
			"A market",
			"A supermarket",
			"A mama mboga",
			"A neighbourhood duka"
		]
	},
	{
		"key": "do-you-grow-any-food-at-home",
		"topic": "food",
		"text": "Do you grow any food at home?",
		"preset": "yesno",
		"context": "Even sukuma in a sack counts."
	},
	{
		"key": "is-street-food-in-your-area-safe-to-eat",
		"topic": "food",
		"text": "Is street food in your area safe to eat?",
		"preset": "yesnounsure"
	},
	{
		"key": "what-do-you-cook-with-at-home",
		"topic": "food",
		"text": "What do you cook with at home?",
		"preset": "custom",
		"options": [
			"Gas",
			"Charcoal",
			"Electricity",
			"Paraffin",
			"I don't cook"
		]
	}
];
