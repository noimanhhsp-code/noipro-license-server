// api/check.js
// API cho NOIPRO kiểm tra license.

const GH_REPO = process.env.NOIPRO_GH_REPO;
const GH_TOKEN = process.env.NOIPRO_GH_TOKEN;
const LICENSE_FILE_PATH = "data/licenses.json";

async function githubRequest(method, path) {
  const url = `https://api.github.com/repos/${GH_REPO}/contents/${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      "Authorization": `Bearer ${GH_TOKEN}`,
      "Accept": "application/vnd.github+json",
      "User-Agent": "noipro-license-server"
    }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub GET failed: ${res.status} - ${text}`);
  }
  return res.json();
}

async function loadLicenses() {
  try {
    const data = await githubRequest("GET", LICENSE_FILE_PATH);
    const content = Buffer.from(data.content, "base64").toString("utf8");
    const json = JSON.parse(content || "{}");
    return json.licenses || [];
  } catch (err) {
    if (String(err).includes("404")) {
      return [];
    }
    throw err;
  }
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "GET") {
      res.status(405).json({ ok: false, status: "METHOD_NOT_ALLOWED" });
      return;
    }

    const q = req.query || {};
    const key = (q.key || "").trim();
    const mid = (q.machineId || q.machine || "").trim();

    if (!key || !mid) {
      res.status(400).json({ ok: false, status: "MISSING_KEY_OR_MACHINE" });
      return;
    }

    const list = await loadLicenses();
    const lic = list.find(l => (l.key || "").trim() === key);

    if (!lic) {
      res.status(200).json({ ok: false, status: "KEY_NOT_FOUND" });
      return;
    }

    // Thu hồi
    if (lic.revoked) {
      res.status(200).json({
        ok: false,
        status: "REVOKED",
        key: lic.key,
        machineId: lic.machineId,
        note: lic.note || ""
      });
      return;
    }

    // Sai máy
    if ((lic.machineId || "").trim() !== mid) {
      res.status(200).json({
        ok: false,
        status: "MACHINE_MISMATCH",
        key: lic.key,
        registeredMachineId: lic.machineId || ""
      });
      return;
    }

    // Hết hạn
    if (lic.expiresAt) {
      const today = new Date().toISOString().slice(0, 10);
      if (lic.expiresAt < today) {
        res.status(200).json({
          ok: false,
          status: "EXPIRED",
          key: lic.key,
          machineId: lic.machineId,
          expiresAt: lic.expiresAt
        });
        return;
      }
    }

    // Hợp lệ
    res.status(200).json({
      ok: true,
      status: "VALID",
      key: lic.key,
      machineId: lic.machineId,
      expiresAt: lic.expiresAt || "",
      note: lic.note || ""
    });
  } catch (err) {
    console.error("check error:", err);
    res.status(500).json({ ok: false, status: "SERVER_ERROR", error: String(err) });
  }
};
