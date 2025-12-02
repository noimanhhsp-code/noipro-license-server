// api/add.js
// Thêm hoặc cập nhật license vào file licenses.json trên GitHub
// Chỉ gọi được nếu có ?secret=ADMIN_SECRET

const LICENSE_FILE_PATH = 'licenses.json'; // đường dẫn file trong repo NOIPRO_GH_REPO

// Lấy env
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const REPO = process.env.NOIPRO_GH_REPO;      // ví dụ "nguyenvannoi/noipro-license-data"
const TOKEN = process.env.NOIPRO_GH_TOKEN;

// Header chung gọi GitHub API
const ghHeaders = {
  'Accept': 'application/vnd.github+json',
  'Authorization': `Bearer ${TOKEN}`,
  'X-GitHub-Api-Version': '2022-11-28'
};

// Đọc body JSON từ request (POST)
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';

    req.on('data', chunk => {
      data += chunk;
      if (data.length > 1e6) {
        // tránh DOS
        req.destroy();
        reject(new Error('Body too large'));
      }
    });

    req.on('end', () => {
      try {
        const json = data ? JSON.parse(data) : {};
        resolve(json);
      } catch (err) {
        reject(err);
      }
    });

    req.on('error', reject);
  });
}

// Đọc file licenses.json từ GitHub
async function fetchLicensesFromGitHub() {
  const url = `https://api.github.com/repos/${REPO}/contents/${LICENSE_FILE_PATH}`;

  const resp = await fetch(url, { headers: ghHeaders });

  if (resp.status === 404) {
    // Chưa có file → coi như rỗng
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

// Ghi lại file licenses.json lên GitHub
async function saveLicensesToGitHub(licenses, sha) {
  const url = `https://api.github.com/repos/${REPO}/contents/${LICENSE_FILE_PATH}`;

  const jsonContent = JSON.stringify({ licenses }, null, 2);
  const base64Content = Buffer.from(jsonContent, 'utf8').toString('base64');

  const body = {
    message: 'Update licenses.json via Noipro license server',
    content: base64Content
  };

  if (sha) {
    // update file
    body.sha = sha;
  }

  const resp = await fetch(url, {
    method: 'PUT',
    headers: {
      ...ghHeaders,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`GitHub PUT failed: ${resp.status} - ${text}`);
  }

  return resp.json();
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    if (!ADMIN_SECRET || !REPO || !TOKEN) {
      return res.status(500).json({ ok: false, error: 'Missing environment variables' });
    }

    // Kiểm tra admin secret trên URL: /api/add?secret=...
    const { secret } = req.query || {};
    if (!secret || secret !== ADMIN_SECRET) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    // Đọc dữ liệu JSON từ body
    const body = await readJsonBody(req);
    const { key, machineId, expiresAt, note } = body;

    if (!key) {
      return res.status(400).json({ ok: false, error: 'Missing field: key' });
    }

    // Đọc file licenses.json từ GitHub
    const { licenses, sha } = await fetchLicensesFromGitHub();

    const nowIso = new Date().toISOString();
    const idx = licenses.findIndex(lc => lc.key === key);

    let mode;
    let license;

    if (idx === -1) {
      // Tạo mới
      license = {
        key,
        machineId: machineId || '',
        expiresAt: expiresAt || '',
        note: note || '',
        createdAt: nowIso,
        updatedAt: nowIso
      };
      licenses.push(license);
      mode = 'CREATED';
    } else {
      // Cập nhật
      const old = licenses[idx];
      license = {
        ...old,
        machineId: machineId !== undefined ? machineId : old.machineId,
        expiresAt: expiresAt !== undefined ? expiresAt : old.expiresAt,
        note: note !== undefined ? note : old.note,
        updatedAt: nowIso
      };
      licenses[idx] = license;
      mode = 'UPDATED';
    }

    // Ghi ngược lên GitHub
    await saveLicensesToGitHub(licenses, sha);

    return res.status(200).json({
      ok: true,
      mode,
      license
    });
  } catch (err) {
    console.error('add.js error:', err);
    return res.status(500).json({ ok: false, error: err.message || 'Internal server error' });
  }
};
