const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const QUESTS = ["follow", "like", "retweet", "telegram"];
const DATA_DIR = path.join(process.cwd(), "data");
const WAITLIST_FILE = path.join(DATA_DIR, "waitlist.json");

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function parseCompleted(completed) {
  if (!Array.isArray(completed)) return [];
  return completed.filter(quest => QUESTS.includes(quest));
}

function canConfirm(completed, quest) {
  const index = QUESTS.indexOf(quest);
  if (index === -1) return false;
  return QUESTS.slice(0, index).every(item => completed.includes(item));
}

function hasWalletValue(wallet) {
  return wallet.trim().length >= 6 && wallet.trim().length <= 120;
}

function createSessionId() {
  return crypto.randomUUID();
}

async function saveWaitlistEntry(entry) {
  if (process.env.WAITLIST_WEBHOOK_URL) {
    const response = await fetch(process.env.WAITLIST_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...entry,
        secret: process.env.WAITLIST_WEBHOOK_SECRET
      })
    });

    if (!response.ok) {
      throw new Error("Wallet storage webhook rejected the request.");
    }

    return;
  }

  if (process.env.VERCEL) {
    throw new Error("Connect a storage webhook or database before collecting wallets on Vercel.");
  }

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(WAITLIST_FILE)) fs.writeFileSync(WAITLIST_FILE, "[]\n");

  const entries = JSON.parse(fs.readFileSync(WAITLIST_FILE, "utf8"));
  const existing = entries.find(item => item.wallet.toLowerCase() === entry.wallet.toLowerCase());

  if (!existing) {
    entries.push(entry);
    fs.writeFileSync(WAITLIST_FILE, `${JSON.stringify(entries, null, 2)}\n`);
  }
}

module.exports = {
  QUESTS,
  canConfirm,
  createSessionId,
  hasWalletValue,
  parseCompleted,
  saveWaitlistEntry,
  sendJson
};