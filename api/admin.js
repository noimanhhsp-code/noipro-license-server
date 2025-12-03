// api/admin.js
// Quản trị license: list, delete, revoke, unrevoke.

const ADMIN_SECRET = process.env.ADMIN_SECRET;
const GH_REPO = process.env.NOIPRO_GH_REPO;   // ví dụ "noimanhhsp-code/noipro-license-server"
const GH_TOKEN = process.env.NOIPRO_GH_TOKEN;
const LICENSE_FILE_PATH = "data/licenses.json";

async function githubRequest(method, path, body) {
  const url = `https://api.github.com/repos/${GH_REPO}/contents/${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      "Authorization": `Bearer ${GH_TOKEN}`,
      "Accept": "application/vnd.github+json",
      "User-Agent": "noipro-license-server"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub ${method} failed: ${res.status} - ${text}`);
  }
  return res.json();
}

async function loadLicenses() {
  try {
    const data = await githubRequest("GET", LICENSE_FILE_PATH);
    const content = Buffer.from(data.content, "base64").toString("utf8");
    const json = JSON.parse(content || "{}");
    return { json, sha: data.sha };
  } catch (err) {
    if (String(err).includes("404")) {
      // nếu chưa có file, coi như rỗng
      return { json: { licenses: [] }, sha: null };
    }
    throw err;
  }
}

async function saveLicenses(json, sha) {
  const content = Buffer.from(JSON.stringify(json, null, 2), "utf8").toString("base64");
  const body = {
    message: "Update licenses.json via admin API",
    content,
    branch: "main"
  };
  if (sha) body.sha = sha;
  return githubRequest("PUT", LICENSE_FILE_PATH, body);
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "GET" && req.method !== "POST") {
      res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
      return;
    }

    const q = req.query || {};
    const secret = q.secret;
    if (!ADMIN_SECRET || secret !== ADMIN_SECRET) {
      res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
      return;
    }

    // GET: trả danh sách
    if (req.method === "GET") {
      const { json } = await loadLicenses();
      res.status(200).json({ ok: true, licenses: json.licenses || [] });
      return;
    }

    // POST: delete / revoke / unrevoke
    let body = req.body || {};
    if (typeof body === "string") {
      try { body = JSON.parse(body || "{}"); } catch { body = {}; }
    }

    const action = body.action;
    const key = (body.key || "").trim();

    if (!action || !key) {
      res.status(400).json({ ok: false, error: "MISSING_ACTION_OR_KEY" });
      return;
    }

    const { json, sha } = await loadLicenses();
    const list = json.licenses || [];
    const idx = list.findIndex(l => (l.key || "").trim() === key);

    if (idx === -1) {
      res.status(404).json({ ok: false, error: "KEY_NOT_FOUND" });
      return;
    }

    const now = new Date().toISOString();

    if (action === "delete") {
      list.splice(idx, 1);
    } else if (action === "revoke") {
      list[idx].revoked = true;
      list[idx].updatedAt = now;
      list[idx].revokedAt = now;
    } else if (action === "unrevoke") {
      list[idx].revoked = false;
      list[idx].updatedAt = now;
    } else {
      res.status(400).json({ ok: false, error: "UNKNOWN_ACTION" });
      return;
    }

    json.licenses = list;
    await saveLicenses(json, sha);

    res.status(200).json({ ok: true, action, key });
  } catch (err) {
    console.error("admin error:", err);
    res.status(500).json({ ok: false, error: String(err) });
  }
};
