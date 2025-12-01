// /api/check.js
const crypto = require("crypto");
const licenses = require("../data/licenses.json");

// Băm SHA-256 cho KEY
function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

module.exports = (req, res) => {
  const { machine, key } = req.query;

  if (!machine || !key) {
    return res.status(400).json({
      status: "error",
      reason: "MISSING_PARAMS",
      message: "Thiếu machine hoặc key"
    });
  }

  const keyHash = sha256(key.trim());
  const record = licenses[keyHash];

  if (!record) {
    return res.status(404).json({
      status: "error",
      reason: "KEY_NOT_FOUND",
      message: "Key không tồn tại"
    });
  }

  // Nếu có status = "blocked" thì chặn luôn
  if (record.status === "blocked") {
    return res.status(403).json({
      status: "error",
      reason: "LICENSE_BLOCKED",
      message: "Giấy phép đã bị khoá"
    });
  }

  // So sánh machine dạng chuỗi thường (không hash)
  if (record.machine !== machine.trim()) {
    return res.status(401).json({
      status: "error",
      reason: "INVALID_MACHINE",
      message: "Sai máy kích hoạt"
    });
  }

  return res.status(200).json({
    status: "success",
    message: "Giấy phép hợp lệ",
    expire: record.expire
  });
};
