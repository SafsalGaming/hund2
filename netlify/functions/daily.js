const admin = require("firebase-admin");
const { DateTime } = require("luxon");

const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

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

const WORDS_URL =
  "https://raw.githubusercontent.com/tabatkins/wordle-list/main/words";

function pickUnique(pool, k) {
  if (pool.length < k) throw new Error("Not enough words in pool");
  const used = new Set();
  const out = [];
  while (out.length < k) {
    const w = pool[Math.floor(Math.random() * pool.length)];
    if (!used.has(w)) {
      used.add(w);
      out.push(w);
    }
  }
  return out;
}

function tx(ref, updateFn, applyLocally = false) {
  return new Promise((resolve, reject) => {
    ref.transaction(
      updateFn,
      (error, committed, snapshot) => {
        if (error) reject(error);
        else resolve({ committed, snapshot });
      },
      applyLocally
    );
  });
}

exports.handler = async () => {
  try {
    initAdmin();
    const db = admin.database();

    const today = DateTime.now()
      .setZone("Asia/Jerusalem")
      .toFormat("yyyy-LL-dd");

    // למשוך מאגר מילים מחוץ ל-transaction
    const res = await fetch(WORDS_URL);
    if (!res.ok) throw new Error("Failed to fetch word list");

    const text = await res.text();
    const pool = text
      .split("\n")
      .map(w => w.trim())
      .filter(Boolean);

    const ref = db.ref("daily/current");

    const result = await tx(ref, (cur) => {
      if (
        cur &&
        cur.date === today &&
        Array.isArray(cur.words) &&
        cur.words.length === 100
      ) {
        return; // לא משנים
      }
      const words = pickUnique(pool, 100);
      return { date: today, words };
    }, false);

    const val = result.snapshot.val();
    if (!val || !Array.isArray(val.words) || val.words.length !== 100) {
      throw new Error("No daily words available after transaction");
    }

    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store"
      },
      body: JSON.stringify(val)
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: String(e) }) };
  }
};
