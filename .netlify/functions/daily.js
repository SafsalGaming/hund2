const admin = require("firebase-admin");
const { DateTime } = require("luxon");

let inited = false;

function initAdmin() {
  if (inited) return;

  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL
  });

  inited = true;
}

const WORD_POOL = [
  // המאגר שלך (חייב לפחות 100)
  "apple","brick","cable","dance","eagle","flame",
  // ...
];

function pickUnique(pool, k) {
  if (pool.length < k) throw new Error("WORD_POOL must have at least 100 words");
  const used = new Set();
  const out = [];
  while (out.length < k) {
    const w = pool[Math.floor(Math.random() * pool.length)];
    if (!used.has(w)) { used.add(w); out.push(w); }
  }
  return out;
}

exports.handler = async () => {
  try {
    initAdmin();
    const db = admin.database();

    const today = DateTime.now().setZone("Asia/Jerusalem").toFormat("yyyy-LL-dd");
    const ref = db.ref("daily/current");

    // Transaction = נעילה אטומית (מונע דריסות במקביל)
    const result = await ref.transaction((cur) => {
      if (cur && cur.date === today && Array.isArray(cur.words) && cur.words.length === 100) {
        return; // no change
      }
      const words = pickUnique(WORD_POOL, 100);
      return { date: today, words };
    }, { applyLocally: false });

    const val = result.snapshot.val();

    return {
      statusCode: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
      body: JSON.stringify(val)
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: String(e) }) };
  }
};
