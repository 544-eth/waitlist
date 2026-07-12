const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 4173;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const WAITLIST_FILE = path.join(DATA_DIR, "waitlist.json");
const SESSIONS = new Map();

const QUESTS = ["follow", "like", "retweet", "telegram"];
const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(WAITLIST_FILE)) fs.writeFileSync(WAITLIST_FILE, "[]\n");
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Request body is too large."));
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON."));
      }
    });
  });
}

function getSession(id) {
  if (!id || !SESSIONS.has(id)) {
    const sessionId = crypto.randomUUID();
    const session = { id: sessionId, completed: [] };
    SESSIONS.set(sessionId, session);
    return session;
  }
  return SESSIONS.get(id);
}

function canVerify(session, quest) {
  const index = QUESTS.indexOf(quest);
  if (index === -1) return false;
  return QUESTS.slice(0, index).every(item => session.completed.includes(item));
}

function hasWalletValue(wallet) {
  return wallet.trim().length >= 6 && wallet.trim().length <= 120;
}

async function handleApi(req, res) {
  try {
    if (req.method === "GET" && req.url === "/api/session") {
      const session = getSession();
      return sendJson(res, 200, { sessionId: session.id, completed: session.completed });
    }

    if (req.method === "POST" && req.url === "/api/verify") {
      const body = await parseBody(req);
      const session = getSession(body.sessionId);
      const quest = String(body.quest || "");

      if (!canVerify(session, quest)) {
        return sendJson(res, 409, {
          ok: false,
          message: "Complete the previous quest before verifying this one.",
          completed: session.completed
        });
      }

      if (!session.completed.includes(quest)) session.completed.push(quest);
      return sendJson(res, 200, {
        ok: true,
        sessionId: session.id,
        completed: session.completed,
        message: "Quest confirmed."
      });
    }

    if (req.method === "POST" && req.url === "/api/waitlist") {
      ensureDataFile();
      const body = await parseBody(req);
      const session = getSession(body.sessionId);
      const wallet = String(body.wallet || "").trim();

      if (!QUESTS.every(quest => session.completed.includes(quest))) {
        return sendJson(res, 403, {
          ok: false,
          message: "All quests must be verified before joining the waitlist."
        });
      }

      if (!hasWalletValue(wallet)) {
        return sendJson(res, 422, {
          ok: false,
          message: "Enter your Ethereum wallet address."
        });
      }

      const entries = JSON.parse(fs.readFileSync(WAITLIST_FILE, "utf8"));
      const existing = entries.find(entry => entry.wallet.toLowerCase() === wallet.toLowerCase());

      if (!existing) {
        entries.push({
          wallet,
          sessionId: session.id,
          quests: session.completed,
          createdAt: new Date().toISOString()
        });
        fs.writeFileSync(WAITLIST_FILE, `${JSON.stringify(entries, null, 2)}\n`);
      }

      return sendJson(res, 200, {
        ok: true,
        message: existing ? "Wallet is already on the waitlist." : "Wallet added to the waitlist."
      });
    }
  } catch (error) {
    return sendJson(res, 400, { ok: false, message: error.message });
  }

  sendJson(res, 404, { ok: false, message: "Not found." });
}

function serveStatic(req, res) {
  const requestPath = req.url === "/" ? "/index.html" : decodeURIComponent(req.url.split("?")[0]);
  const filePath = path.normalize(path.join(PUBLIC_DIR, requestPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      return res.end("Not found");
    }

    const type = CONTENT_TYPES[path.extname(filePath)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(content);
  });
}

ensureDataFile();

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) return handleApi(req, res);
  serveStatic(req, res);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`CREEDZ waitlist running at http://localhost:${PORT}`);
});