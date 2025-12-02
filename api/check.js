// api/check.js
// Kiểm tra license trong licenses.json trên GitHub
// Client (Noipro) sẽ gọi: /api/check?key=...&machineId=...

const LICENSE_FILE_PATH = 'data/licenses.json';

const REPO = process.env.NOIPRO_GH_REPO;
const TOKEN = process.env.NOIPRO_GH_TOKEN;

const ghHeaders = {
  'Accept': 'application/vnd.github+json',
  'Authorization': `Bearer ${TOKEN}`,
  'X-GitHub-Api-Version': '2022-11-28'
};

// Đọc file licenses.json từ GitHub
async function fetchLicensesFromGitHub() {
  const url = `https://api.github.com/repos/${REPO}/contents/${LICENSE_FILE_PATH}`;

  const resp = await fetch(url, { headers: ghHeaders });

  if (resp.status === 404) {
    return { licenses: [], sha: null };
  }

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`GitHub GET failed: ${resp.status} - ${text}`);
  }

  const data = await resp.json();
  const content = Buffer.from(data.content, data.encoding || 'base64').toString('utf8');

  let parsed;
  try {
    parsed = content ? JSON.parse(content) : { licenses: [] };
  } catch (e) {
    parsed = { licenses: [] };
  }

  const licenses = Array.isArray(parsed.licenses) ? parsed.licenses : [];
  return { licenses, sha: data.sha };
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    if (!REPO || !TOKEN) {
      return res.status(500).json({ ok: false, error: 'Missing environment variables' });
    }

    const { key, machineId, machine } = req.query || {};
    const mid = machineId || machine;

    if (!key) {
      return res.status(400).json({ ok: false, error: 'Missing query param: key' });
    }

    const { licenses } = await fetchLicensesFromGitHub();

    const lic = licenses.find(lc => lc.key === key);

    if (!lic) {
      return res.status(200).json({
        ok: false,
        status: 'KEY_NOT_FOUND'
      });
    }

    // Kiểm tra máy (nếu license đã gán máy)
    if (lic.machineId && mid && lic.machineId !== mid) {
      return res.status(200).json({
        ok: false,
        status: 'MACHINE_MISMATCH',
        registeredMachineId: lic.machineId
      });
    }

    // Nếu license có machineId nhưng client không gửi machineId
    if (lic.machineId && !mid) {
      return res.status(200).json({
        ok: false,
        status: 'MACHINE_REQUIRED',
        registeredMachineId: lic.machineId
      });
    }

    // Kiểm tra hạn
    if (lic.expiresAt) {
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      if (today > lic.expiresAt) {
        return res.status(200).json({
          ok: false,
          status: 'EXPIRED',
          expiresAt: lic.expiresAt
        });
      }
    }

    // Nếu qua tất cả kiểm tra → hợp lệ
    return res.status(200).json({
      ok: true,
      status: 'VALID',
      key: lic.key,
      machineId: lic.machineId || '',
      expiresAt: lic.expiresAt || '',
      note: lic.note || ''
    });
  } catch (err) {
    console.error('check.js error:', err);
    return res.status(500).json({ ok: false, error: err.message || 'Internal server error' });
  }
};
