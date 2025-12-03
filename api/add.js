// api/add.js
// Thêm / cập nhật license trong data/licenses.json trên GitHub.

const ADMIN_SECRET = process.env.ADMIN_SECRET;
const GH_REPO = process.env.NOIPRO_GH_REPO;
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
      return { json: { licenses: [] }, sha: null };
    }
    throw err;
  }
}

async function saveLicenses(json, sha) {
  const content = Buffer.from(JSON.stringify(json, null, 2), "utf8").toString("base64");
  const body = {
    message: "Update licenses.json via add API",
    content,
    branch: "main"
  };
  if (sha) body.sha = sha;
  return githubRequest("PUT", LICENSE_FILE_PATH, body);
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "GET") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }

    const q = req.query || {};
    const secret = q.secret;
    const key = (q.key || "").trim();
    const mid = (q.machineId || q.machine || "").trim();
    const expiresAt = q.expiresAt || "";
    const note = q.note || "";

    if (!ADMIN_SECRET || secret !== ADMIN_SECRET) {
      res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
      return;
    }
    if (!key || !mid) {
      res.status(400).json({ ok: false, error: "MISSING_KEY_OR_MACHINE" });
      return;
    }

    const { json, sha } = await loadLicenses();
    const list = json.licenses || [];
    const now = new Date().toISOString();

    const idx = list.findIndex(l => (l.key || "").trim() === key);
    let mode = "CREATED";

    if (idx >= 0) {
      // Cập nhật license cũ
      list[idx].machineId = mid;
      if (expiresAt) list[idx].expiresAt = expiresAt;
      list[idx].note = note;
      list[idx].updatedAt = now;
      mode = "UPDATED";
    } else {
      list.push({
        key,
        machineId: mid,
        expiresAt,
        note,
        createdAt: now,
        updatedAt: now,
        revoked: false
      });
    }

    json.licenses = list;
    await saveLicenses(json, sha);

    const lic = list.find(l => l.key === key);
    res.status(200).json({ ok: true, mode, license: lic });
  } catch (err) {
    console.error("add error:", err);
    res.status(500).json({ ok: false, error: String(err) });
  }
};
