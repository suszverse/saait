/**
 * Seed data for the Butwal cluster, taken from design round 1 so the site
 * looks like the Figma screens. Wedding dates are a sample of Falgun 2083
 * from the design; the operator maintains the real list (section 4).
 * Prices are rupees here and converted to paisa on insert.
 */
export const CITIES = [
  { slug: "butwal", name: "Butwal", nameNp: "बुटवल", cluster: "rupandehi", lat: 27.7006, lng: 83.4483 },
  { slug: "bhairahawa", name: "Bhairahawa", nameNp: "भैरहवा", cluster: "rupandehi", lat: 27.5059, lng: 83.4517 },
  { slug: "lumbini", name: "Lumbini", nameNp: "लुम्बिनी", cluster: "rupandehi", lat: 27.484, lng: 83.276 },
  { slug: "tansen", name: "Tansen", nameNp: "तानसेन", cluster: "rupandehi", lat: 27.8673, lng: 83.5467 },
] as const;

export type SeedPlace = {
  slug: string;
  name: string;
  nameNp: string;
  kind: "district" | "municipality" | "ward" | "chowk" | "venue";
  lat: number;
  lng: number;
  district: "Rupandehi" | "Palpa" | "Nawalparasi West";
  /** Nearest CITIES entry, for the "near Butwal" grouping; districts have none. */
  city?: (typeof CITIES)[number]["slug"];
};

/**
 * Places a client can type in the venue field for the Rupandehi cluster.
 * Coordinates are approximate town-centre points, good enough for distance
 * sorting. Venues are fictional names on real chowks; none is a real business.
 */
export const PLACES: SeedPlace[] = [
  // Districts
  { slug: "rupandehi", name: "Rupandehi", nameNp: "रुपन्देही", kind: "district", lat: 27.6, lng: 83.4, district: "Rupandehi" },
  { slug: "palpa", name: "Palpa", nameNp: "पाल्पा", kind: "district", lat: 27.87, lng: 83.55, district: "Palpa" },
  { slug: "nawalparasi-west", name: "Nawalparasi West", nameNp: "नवलपरासी पश्चिम", kind: "district", lat: 27.6, lng: 83.7, district: "Nawalparasi West" },
  // Municipalities
  { slug: "butwal", name: "Butwal", nameNp: "बुटवल", kind: "municipality", lat: 27.7006, lng: 83.4483, district: "Rupandehi", city: "butwal" },
  { slug: "bhairahawa", name: "Bhairahawa / Siddharthanagar", nameNp: "भैरहवा / सिद्धार्थनगर", kind: "municipality", lat: 27.5059, lng: 83.4517, district: "Rupandehi", city: "bhairahawa" },
  { slug: "tilottama", name: "Tilottama", nameNp: "तिलोत्तमा", kind: "municipality", lat: 27.629, lng: 83.46, district: "Rupandehi", city: "butwal" },
  { slug: "devdaha", name: "Devdaha", nameNp: "देवदह", kind: "municipality", lat: 27.678, lng: 83.55, district: "Rupandehi", city: "butwal" },
  { slug: "sainamaina", name: "Sainamaina", nameNp: "सैनामैना", kind: "municipality", lat: 27.694, lng: 83.37, district: "Rupandehi", city: "butwal" },
  { slug: "lumbini-sanskritik", name: "Lumbini", nameNp: "लुम्बिनी", kind: "municipality", lat: 27.484, lng: 83.276, district: "Rupandehi", city: "lumbini" },
  { slug: "manigram", name: "Manigram", nameNp: "मणिग्राम", kind: "ward", lat: 27.615, lng: 83.455, district: "Rupandehi", city: "butwal" },
  { slug: "sunwal", name: "Sunwal", nameNp: "सुनवल", kind: "municipality", lat: 27.668, lng: 83.621, district: "Nawalparasi West", city: "butwal" },
  { slug: "bardaghat", name: "Bardaghat", nameNp: "बर्दघाट", kind: "municipality", lat: 27.556, lng: 83.743, district: "Nawalparasi West", city: "butwal" },
  { slug: "tansen", name: "Tansen", nameNp: "तानसेन", kind: "municipality", lat: 27.8673, lng: 83.5467, district: "Palpa", city: "tansen" },
  // Butwal chowks and neighbourhoods
  { slug: "traffic-chowk-butwal", name: "Traffic Chowk, Butwal", nameNp: "ट्राफिक चोक, बुटवल", kind: "chowk", lat: 27.7006, lng: 83.4483, district: "Rupandehi", city: "butwal" },
  { slug: "milan-chowk-butwal", name: "Milan Chowk, Butwal", nameNp: "मिलन चोक, बुटवल", kind: "chowk", lat: 27.6935, lng: 83.465, district: "Rupandehi", city: "butwal" },
  { slug: "butwal-buspark", name: "Butwal Buspark", nameNp: "बुटवल बसपार्क", kind: "chowk", lat: 27.6985, lng: 83.4595, district: "Rupandehi", city: "butwal" },
  { slug: "golpark-butwal", name: "Golpark, Butwal", nameNp: "गोलपार्क, बुटवल", kind: "chowk", lat: 27.695, lng: 83.466, district: "Rupandehi", city: "butwal" },
  { slug: "kalikanagar-butwal", name: "Kalikanagar, Butwal", nameNp: "कालिकानगर, बुटवल", kind: "ward", lat: 27.685, lng: 83.46, district: "Rupandehi", city: "butwal" },
  { slug: "devinagar-butwal", name: "Devinagar, Butwal", nameNp: "देवीनगर, बुटवल", kind: "ward", lat: 27.709, lng: 83.468, district: "Rupandehi", city: "butwal" },
  { slug: "yogikuti-butwal", name: "Yogikuti, Butwal", nameNp: "योगिकुटी, बुटवल", kind: "chowk", lat: 27.676, lng: 83.465, district: "Rupandehi", city: "butwal" },
  // Landmarks
  { slug: "lumbini-mayadevi-temple", name: "Lumbini Mayadevi Temple", nameNp: "लुम्बिनी मायादेवी मन्दिर", kind: "venue", lat: 27.4696, lng: 83.2755, district: "Rupandehi", city: "lumbini" },
  // Party palaces and banquets (fictional names)
  { slug: "hotel-avenue-traffic-chowk", name: "Hotel Avenue, Traffic Chowk", nameNp: "होटल एभेन्यू, ट्राफिक चोक", kind: "venue", lat: 27.7012, lng: 83.4476, district: "Rupandehi", city: "butwal" },
  { slug: "royal-party-palace-golpark", name: "Royal Party Palace, Golpark", nameNp: "रोयल पार्टी प्यालेस, गोलपार्क", kind: "venue", lat: 27.6958, lng: 83.4672, district: "Rupandehi", city: "butwal" },
  { slug: "kalika-party-palace-kalikanagar", name: "Kalika Party Palace, Kalikanagar", nameNp: "कालिका पार्टी प्यालेस, कालिकानगर", kind: "venue", lat: 27.6842, lng: 83.4612, district: "Rupandehi", city: "butwal" },
  { slug: "tinau-garden-banquet-devinagar", name: "Tinau Garden Banquet, Devinagar", nameNp: "तिनाउ गार्डेन ब्याङ्क्वेट, देवीनगर", kind: "venue", lat: 27.7102, lng: 83.4694, district: "Rupandehi", city: "butwal" },
  { slug: "siddhartha-banquet-bhairahawa", name: "Siddhartha Banquet, Bhairahawa", nameNp: "सिद्धार्थ ब्याङ्क्वेट, भैरहवा", kind: "venue", lat: 27.5071, lng: 83.4538, district: "Rupandehi", city: "bhairahawa" },
  { slug: "lumbini-grand-banquet-bhairahawa", name: "Lumbini Grand Banquet, Bhairahawa", nameNp: "लुम्बिनी ग्रान्ड ब्याङ्क्वेट, भैरहवा", kind: "venue", lat: 27.5112, lng: 83.449, district: "Rupandehi", city: "bhairahawa" },
  { slug: "mayadevi-party-palace-bhairahawa", name: "Mayadevi Party Palace, Bhairahawa", nameNp: "मायादेवी पार्टी प्यालेस, भैरहवा", kind: "venue", lat: 27.5024, lng: 83.4561, district: "Rupandehi", city: "bhairahawa" },
  { slug: "shreenagar-view-banquet-tansen", name: "Shreenagar View Banquet, Tansen", nameNp: "श्रीनगर भ्यु ब्याङ्क्वेट, तानसेन", kind: "venue", lat: 27.8702, lng: 83.5489, district: "Palpa", city: "tansen" },
];

export const CATEGORIES = [
  { slug: "wedding-photo", name: "Wedding photography", shortName: "Wedding photo" },
  { slug: "wedding-film", name: "Wedding video and cinematic", shortName: "Wedding film" },
  { slug: "pre-wedding", name: "Engagement and pre-wedding", shortName: "Pre-wedding" },
  { slug: "event", name: "Event and corporate", shortName: "Event" },
  { slug: "portrait", name: "Portrait and studio", shortName: "Portrait" },
  { slug: "product", name: "Product and food", shortName: "Product" },
  { slug: "reels", name: "Social content, reels and UGC", shortName: "Reels" },
  { slug: "drone", name: "Drone", shortName: "Drone" },
  { slug: "editing", name: "Editing only", shortName: "Editing" },
] as const;

/** BS Falgun 2083 days marked saait in the design round. */
export const SAAIT_FALGUN_2083 = [5, 7, 12, 14, 19, 21, 26];

type Pkg = {
  category: (typeof CATEGORIES)[number]["slug"];
  name: string;
  summary: string;
  price: number;
  hours: number;
  shooters: number;
  photos?: number;
  filmMinutes?: number;
  album?: boolean;
  delivery: number;
  peak: number;
  inclusions: string[];
  addons?: { name: string; price: number }[];
};

export type SeedProvider = {
  slug: string;
  displayName: string;
  businessName?: string;
  kind: "freelancer" | "studio";
  /** Required for freelancers: the "Crew A3-417" name a business sees instead of theirs. */
  alias?: string;
  city: (typeof CITIES)[number]["slug"];
  phone: string;
  since: number;
  rating: number;
  ratingCount: number;
  completed: number;
  responseMinutes: number;
  capacity: number;
  plan: "free" | "pro" | "studio";
  kyc: "verified" | "submitted" | "rejected" | "reverification_due" | "registered";
  kycRejections?: number;
  pan?: string;
  citizenship?: string;
  vatRegistered?: boolean;
  payout?: { method: string; name: string; number: string };
  tones: string[];
  photoCount: number;
  bio: string;
  categories: Pkg["category"][];
  packages: Pkg[];
};

const TONES = ["#D9D4CB", "#C7C9CF", "#CFC9D6", "#E0DCD3", "#BFC3C9"];
const rot = (i: number) => [...TONES.slice(i % 5), ...TONES.slice(0, i % 5)];

const weddingTrio = (base: number, peak: number[], extra: Partial<Pkg> = {}): Pkg[] => [
  { category: "wedding-photo", name: "Basic", summary: "One photographer for the main ceremony.", price: base, hours: 8, shooters: 1, photos: 300, delivery: 21, peak: peak[0], inclusions: ["1 photographer", "300 edited photos"], ...extra },
  { category: "wedding-photo", name: "Standard", summary: "Photo and highlight film, two shooters.", price: Math.round(base * 1.85 / 1000) * 1000, hours: 10, shooters: 2, photos: 500, filmMinutes: 5, delivery: 30, peak: peak[1], inclusions: ["2 shooters", "photo and highlight film", "500 photos"], ...extra },
  { category: "wedding-photo", name: "Premium", summary: "Cinematic film, drone, album included.", price: Math.round(base * 3.4 / 1000) * 1000, hours: 12, shooters: 3, photos: 800, filmMinutes: 15, album: true, delivery: 45, peak: peak[2], inclusions: ["3 shooters", "cinematic film", "drone", "album"], ...extra },
];

const ADDONS = [
  { name: "Drone coverage", price: 12_000 },
  { name: "Extra hour", price: 4_000 },
];

export const PROVIDERS: SeedProvider[] = [
  {
    slug: "shrestha-studio", displayName: "Shrestha Studio", businessName: "Shrestha Studio Pvt. Ltd.", kind: "studio", city: "butwal",
    phone: "+9779857000001", since: 2009, rating: 4.9, ratingCount: 61, completed: 38, responseMinutes: 60, capacity: 3, plan: "pro",
    kyc: "verified", pan: "601234567", citizenship: "27-01-62-00101", vatRegistered: true,
    payout: { method: "bank", name: "Shrestha Studio Pvt. Ltd.", number: "0101••••2231" }, tones: rot(0), photoCount: 48,
    bio: "Family studio in Butwal since 2009. Weddings, portraits and the backup shooter on Falgun dates.",
    categories: ["wedding-photo", "wedding-film", "portrait", "event"],
    packages: [
      { category: "wedding-photo", name: "Basic", summary: "One photographer for the main ceremony.", price: 35_000, hours: 8, shooters: 1, photos: 300, delivery: 21, peak: 5_000, inclusions: ["1 photographer", "8 hours", "300 edited photos", "21 days"], addons: ADDONS },
      { category: "wedding-photo", name: "Standard", summary: "Photo and highlight film, two shooters.", price: 65_000, hours: 10, shooters: 2, photos: 500, filmMinutes: 5, delivery: 30, peak: 8_000, inclusions: ["2 shooters", "photo and highlight film", "500 photos", "30 days"], addons: ADDONS },
      { category: "wedding-photo", name: "Premium", summary: "Cinematic film, drone, album included.", price: 120_000, hours: 12, shooters: 3, photos: 800, filmMinutes: 15, album: true, delivery: 45, peak: 0, inclusions: ["3 shooters", "cinematic film", "drone", "album", "45 days"], addons: [ADDONS[1]] },
      { category: "event", name: "Half day", summary: "Corporate or family event, one photographer.", price: 15_000, hours: 4, shooters: 1, photos: 150, delivery: 7, peak: 0, inclusions: ["1 photographer", "4 hours", "150 photos"] },
    ],
  },
  {
    slug: "prakash-films", displayName: "Prakash Films", kind: "studio", city: "bhairahawa",
    phone: "+9779857000002", since: 2014, rating: 4.8, ratingCount: 40, completed: 22, responseMinutes: 180, capacity: 2, plan: "pro",
    kyc: "verified", pan: "602345678", citizenship: "27-02-70-00211", payout: { method: "khalti", name: "Prakash Adhikari", number: "98••••1102" },
    tones: rot(1), photoCount: 36, bio: "Wedding films and photography from Bhairahawa.",
    categories: ["wedding-photo", "wedding-film"],
    packages: weddingTrio(48_000, [0, 0, 0], { addons: ADDONS }),
  },
  {
    slug: "anita-gurung-photography", displayName: "Anita Gurung Photography", kind: "studio", city: "butwal",
    phone: "+9779857000003", since: 2019, rating: 4.7, ratingCount: 12, completed: 6, responseMinutes: 120, capacity: 1, plan: "pro",
    kyc: "verified", pan: "301245678", citizenship: "27-01-71-00412", payout: { method: "khalti", name: "Anita Gurung", number: "98••••4471" },
    tones: rot(2), photoCount: 24, bio: "Candid wedding and portrait photographer in Butwal.",
    categories: ["wedding-photo", "portrait"],
    packages: weddingTrio(22_000, [3_000, 5_000, 0]).slice(0, 2),
  },
  // Anita is verified and on a plan because the Results screen shows her as
  // a bookable provider; the Admin screen's use of her name as a pending
  // submission is a mockup inconsistency (docs/design/figma.md).
  // More verified providers so the free-on-date list is realistic. Clients
  // only see studios on a paid plan (leakage proposal section 13), so the
  // verified freelancers here are crew for later hiring tasks, and the
  // free-plan studio stands for a business whose plan has lapsed.
  ...([
    ["himal-captures", "Himal Captures", "butwal", "studio", "pro", 4.8, 33, 19, 28_000, 4_000],
    ["lens-of-lumbini", "Lens of Lumbini", "lumbini", "studio", "pro", 4.6, 21, 11, 30_000, 4_000],
    ["tansen-frames", "Tansen Frames", "tansen", "studio", "pro", 4.7, 18, 9, 26_000, 3_000],
    ["sapana-studio", "Sapana Studio", "butwal", "studio", "pro", 4.5, 27, 15, 40_000, 6_000],
    ["rupandehi-weddings", "Rupandehi Weddings", "bhairahawa", "studio", "studio", 4.6, 44, 25, 55_000, 8_000],
    ["bikash-thapa-films", "Bikash Thapa Films", "butwal", "studio", "pro", 4.9, 15, 8, 60_000, 0],
    ["golden-hour-nepal", "Golden Hour Nepal", "butwal", "freelancer", "free", 4.4, 9, 4, 18_000, 2_000, "Crew C4-821"],
    ["siddhartha-photo", "Siddhartha Photo", "bhairahawa", "studio", "free", 4.5, 30, 17, 25_000, 3_000],
    ["mandap-moments", "Mandap Moments", "butwal", "studio", "pro", 4.7, 26, 14, 38_000, 5_000],
    ["pixel-and-palki", "Pixel and Palki", "lumbini", "freelancer", "free", 4.3, 7, 3, 20_000, 2_000, "Crew R3-055"],
    ["sindoor-stories", "Sindoor Stories", "butwal", "studio", "studio", 4.8, 19, 12, 70_000, 10_000],
  ] as const).map(([slug, name, city, kind, plan, rating, count, done, base, peak, alias], i): SeedProvider => ({
    slug, displayName: name, kind, alias, city,
    phone: `+97798570001${String(i).padStart(2, "0")}`, since: 2012 + (i % 9), rating, ratingCount: count, completed: done,
    responseMinutes: 60 + (i % 4) * 60, capacity: kind === "studio" ? 2 : 1, plan,
    kyc: "verified", pan: `70${String(1000000 + i * 7919).slice(0, 7)}`, citizenship: `27-0${(i % 9) + 1}-7${i % 10}-0${String(500 + i)}`,
    payout: { method: "esewa", name, number: `98••••${String(3000 + i)}` }, tones: rot(i + 3), photoCount: 12 + i * 3,
    bio: "Wedding and event photography in the Butwal cluster.",
    categories: ["wedding-photo", "event"],
    packages: weddingTrio(base, [peak, Math.round(peak * 1.6), 0]),
  })),
  // KYC queue for the operator desk (Figma screen 8). None of these are public.
  {
    slug: "ramesh-thapa-films", displayName: "Ramesh Thapa Films", kind: "studio", city: "bhairahawa", phone: "+9779857000201",
    since: 2016, rating: 0, ratingCount: 0, completed: 0, responseMinutes: 0, capacity: 2, plan: "free",
    kyc: "submitted", kycRejections: 1, pan: "603456789", citizenship: "27-03-68-00933",
    payout: { method: "bank", name: "Ramesh Thapa", number: "0203••••9911" }, tones: rot(1), photoCount: 0, bio: "", categories: ["wedding-photo", "wedding-film"],
    packages: weddingTrio(45_000, [6_000, 9_000, 0]),
  },
  {
    slug: "kiran-rai", displayName: "Kiran Rai", kind: "freelancer", alias: "Crew K1-204", city: "butwal", phone: "+9779857000202",
    since: 2021, rating: 0, ratingCount: 0, completed: 0, responseMinutes: 0, capacity: 1, plan: "free",
    kyc: "submitted", pan: "604567890", citizenship: "27-01-75-01200",
    payout: { method: "esewa", name: "Kiran Rai", number: "98••••5512" }, tones: rot(2), photoCount: 0, bio: "", categories: ["wedding-photo", "event"],
    packages: weddingTrio(20_000, [2_000, 4_000, 0]).slice(0, 2),
  },
  {
    slug: "lumbini-wedding-co", displayName: "Lumbini Wedding Co.", kind: "studio", city: "lumbini", phone: "+9779857000203",
    since: 2018, rating: 0, ratingCount: 0, completed: 0, responseMinutes: 0, capacity: 3, plan: "free",
    kyc: "submitted", pan: "605678901", citizenship: "27-04-66-00777",
    payout: { method: "bank", name: "Lumbini Wedding Co.", number: "0405••••3301" }, tones: rot(3), photoCount: 0, bio: "", categories: ["wedding-photo"],
    packages: weddingTrio(50_000, [7_000, 10_000, 0]),
  },
  {
    slug: "sabina-shrestha", displayName: "Sabina Shrestha", kind: "freelancer", alias: "Crew S2-310", city: "butwal", phone: "+9779857000204",
    since: 2017, rating: 4.6, ratingCount: 14, completed: 9, responseMinutes: 120, capacity: 1, plan: "free",
    kyc: "reverification_due", pan: "606789012", citizenship: "27-01-69-00654",
    payout: { method: "khalti", name: "Sabina Shrestha", number: "98••••8820" }, tones: rot(4), photoCount: 18, bio: "", categories: ["wedding-photo"],
    packages: weddingTrio(24_000, [3_000, 5_000, 0]).slice(0, 2),
  },
];

/** The family studio team runs the operator desk. */
export const OPERATORS = [{ phone: "+9779857099001", name: "Susan Shrestha", role: "operator" as const }];
export const DEMO_CLIENT = { phone: "+9779812345678", name: "Sunita Sharma" };
