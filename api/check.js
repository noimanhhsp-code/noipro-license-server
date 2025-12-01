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

  // Tìm license theo KEY_HASH
  const record = licenses[keyHash];

  if (!record) {
    return res.status(404).json({
      status: "error",
      reason: "KEY_NOT_FOUND",
      message: "Key không tồn tại"
    });
  }

  // So sánh machine dạng CHUỖI THƯỜNG, không hash
  if (record.machine !== machine.trim()) {
    return res.status(401).json({
      status: "error",
      reason: "INVALID_MACHINE",
      message: "Sai máy kích hoạt"
    });
  }

  // Hợp lệ
  return res.status(200).json({
    status: "success",
    message: "License hợp lệ",
    expire: record.expire
  });
};
