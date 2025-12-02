// api/add.js
// Thêm hoặc cập nhật license vào file licenses.json trên GitHub
// Cho phép gọi bằng POST (body JSON) hoặc GET (query) – đều phải có ?secret=ADMIN_SECRET

const LICENSE_FILE_PATH = 'data/licenses.json';

const ADMIN_SECRET = process.env.ADMIN_SECRET;
const REPO = process.env.NOIPRO_GH_REPO;
const TOKEN = process.env.NOIPRO_GH_TOKEN;

const ghHeaders = {
  'Accept': 'application/vnd.github+json',
  'Authorization': `Bearer ${TOKEN}`,
  'X-GitHub-Api-Version': '2022-11-28'
};

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';

    req.on('data', chunk => {
      data += chunk;
      if (data.length > 1e6) {
        req.destroy();
        reject(new Error('Body too large'));
      }
    });

    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(err);
      }
    });

    req.on('error', reject);
  });
}

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
  } catch {
    parsed = { licenses: [] };
  }

  const licenses = Array.isArray(parsed.licenses) ? parsed.licenses : [];
  return { licenses, sha: data.sha };
}

async function saveLicensesToGitHub(licenses, sha) {
  const url = `https://api.github.com/repos/${REPO}/contents/${LICENSE_FILE_PATH}`;

  const jsonContent = JSON.stringify({ licenses }, null, 2);
  const base64Content = Buffer.from(jsonContent, 'utf8').toString('base64');

  const body = {
    message: 'Update licenses.json via Noipro license server',
    content: base64Content
  };
  if (sha) body.sha = sha;

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
    if (req.method !== 'POST' && req.method !== 'GET') {
      res.setHeader('Allow', 'POST, GET');
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    if (!ADMIN_SECRET || !REPO || !TOKEN) {
      return res.status(500).json({ ok: false, error: 'Missing environment variables' });
    }

    const { secret } = req.query || {};
    if (!secret || secret !== ADMIN_SECRET) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    let body;
    if (req.method === 'POST') {
      body = await readJsonBody(req);
    } else {
      // GET: đọc luôn từ query cho dễ test
      const { key, machineId, machine, expiresAt, note } = req.query || {};
      body = {
        key,
        machineId: machineId || machine,
        expiresAt,
        note
      };
    }

    const { key, machineId, expiresAt, note } = body;

    if (!key) {
      return res.status(400).json({ ok: false, error: 'Missing field: key' });
    }

    const { licenses, sha } = await fetchLicensesFromGitHub();

    const nowIso = new Date().toISOString();
    const idx = licenses.findIndex(lc => lc.key === key);

    let mode;
    let license;

    if (idx === -1) {
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

    await saveLicensesToGitHub(licenses, sha);

    return res.status(200).json({ ok: true, mode, license });
  } catch (err) {
    console.error('add.js error:', err);
    return res.status(500).json({ ok: false, error: err.message || 'Internal server error' });
  }
};
