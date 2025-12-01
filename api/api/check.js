// api/check.js
const crypto = require("crypto");
const licenses = require("../data/licenses.json");

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

  const lic = licenses.find(l => l.license_key_hash === keyHash);

  if (!lic) {
    return res.status(200).json({
      status: "invalid",
      reason: "LICENSE_NOT_FOUND"
    });
  }

  if (lic.status === "blocked") {
    return res.status(200).json({
      status: "invalid",
      reason: "LICENSE_BLOCKED"
    });
  }

  const todayStr = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

  if (todayStr > lic.expiry) {
    return res.status(200).json({
      status: "expired",
      expiry: lic.expiry
    });
  }

  // chưa gán máy nào -> kích hoạt lần đầu
  if (!lic.machine_id || lic.machine_id === "") {
    return res.status(200).json({
      status: "valid_first_time",
      bind_machine: machine,
      expiry: lic.expiry
    });
  }

  // đã gán nhưng khác máy -> sai
  if (lic.machine_id !== machine) {
    return res.status(200).json({
      status: "invalid",
      reason: "MACHINE_MISMATCH"
    });
  }

  // hợp lệ
  return res.status(200).json({
    status: "valid",
    expiry: lic.expiry
  });
};
