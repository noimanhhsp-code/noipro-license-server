// /api/add.js
// API dùng để thêm hoặc cập nhật license vào file data/licenses.json trên GitHub

export default async function handler(req, res) {
  try {
    // Chỉ cho phép POST
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Chỉ hỗ trợ phương thức POST" });
    }

    // --------- ĐỌC BODY THÔ & PARSE JSON (Vercel Node không có req.body) ----------
    let rawBody = "";
    await new Promise((resolve, reject) => {
      req.on("data", (chunk) => {
        rawBody += chunk;
      });
      req.on("end", resolve);
      req.on("error", reject);
    });

    let body = {};
    try {
      body = JSON.parse(rawBody || "{}");
    } catch (e) {
      return res.status(400).json({ error: "Body không phải JSON hợp lệ" });
    }
    // ------------------------------------------------------------------------------

    // Lấy dữ liệu gửi từ admin.html
    const {
      secret,
      machine_id,
      license_key_hash,
      expiry,
      status,
    } = body || {};

    // Kiểm tra đủ dữ liệu chưa
    if (!secret || !machine_id || !license_key_hash || !expiry || !status) {
      return res.status(400).json({ error: "Thiếu tham số bắt buộc" });
    }

    // Bảo vệ: chỉ admin có SECRET đúng mới được ghi
    if (secret !== process.env.ADMIN_SECRET) {
      return res.status(403).json({ error: "Sai ADMIN_SECRET" });
    }

    const repo = process.env.NOIPRO_GH_REPO || "noimanhhsp-code/noipro-license-server";
    const token = process.env.NOIPRO_GH_TOKEN;

    if (!repo || !token) {
      return res.status(500).json({
        error: "Thiếu NOIPRO_GH_REPO hoặc NOIPRO_GH_TOKEN trong environment",
      });
    }

    const [owner, repoName] = repo.split("/");

    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "noipro-license-server",
    };

    const filePath = "data/licenses.json";
    const url = `https://api.github.com/repos/${owner}/${repoName}/contents/${filePath}`;

    // 1. Lấy nội dung licenses.json hiện tại trên GitHub
    const fileResp = await fetch(url, { headers });

    if (!fileResp.ok) {
      const text = await fileResp.text();
      return res.status(500).json({
        error: "Không đọc được licenses.json từ GitHub",
        detail: text,
      });
    }

    const fileJson = await fileResp.json();
    const sha = fileJson.sha; // cần để PUT cập nhật
    const oldContent = Buffer.from(fileJson.content, "base64").toString("utf8");

    let licenses = [];
    try {
      licenses = JSON.parse(oldContent);
      if (!Array.isArray(licenses)) {
        licenses = [];
      }
    } catch (e) {
      // Nếu parse lỗi thì coi như file rỗng
      licenses = [];
    }

    // 2. Tạo bản ghi mới
    const newEntry = {
      license_key_hash,
      machine_id,
      expiry,
      status,
    };

    // Nếu đã tồn tại cùng machine_id + license_key_hash thì cập nhật, không thì thêm mới
    const idx = licenses.findIndex(
      (x) =>
        x.machine_id === machine_id &&
        x.license_key_hash === license_key_hash
    );

    if (idx >= 0) {
      licenses[idx] = newEntry;
    } else {
      licenses.push(newEntry);
    }

    const newContent = JSON.stringify(licenses, null, 2);
    const newContentBase64 = Buffer.from(newContent, "utf8").toString("base64");

    // 3. Ghi ngược lại lên GitHub bằng API PUT
    const updateResp = await fetch(url, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        message: "Add / update license from NOIPRO Admin",
        content: newContentBase64,
        sha, // sha cũ để GitHub biết là cập nhật
      }),
    });

    if (!updateResp.ok) {
      const text = await updateResp.text();
      return res.status(500).json({
        error: "Không cập nhật được licenses.json lên GitHub",
        detail: text,
      });
    }

    const updateJson = await updateResp.json();

    return res.status(200).json({
      success: true,
      message: "Đã thêm/cập nhật license vào GitHub!",
      commit: updateJson.commit && updateJson.commit.sha,
    });
  } catch (err) {
    console.error("API /api/add error:", err);
    return res.status(500).json({ error: "Lỗi máy chủ", detail: String(err) });
  }
}
