// api/check.js
const crypto = require("crypto");
const licenses = require("../data/licenses.json");

// Hàm băm SHA-256 cho license key
function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

module.exports = (req, res) => {
  try {
    const { machine, key } = req.query;

    // 1. Thiếu tham số
    if (!machine || !key) {
      return res.status(400).json({
        status: "lỗi",
        lý_do: "MISSING_PARAMS",
        message: "Thiếu machine hoặc key",
      });
    }

    const keyHash = sha256(key.trim());

    // 2. Tìm license theo hash của key
    const lic = licenses.find(
      (item) =>
        item.license_key_hash === keyHash &&
        (!item.machine_id || item.machine_id === machine)
    );

    if (!lic) {
      return res.status(400).json({
        status: "lỗi",
        lý_do: "KEY_NOT_FOUND",
        message: "Khóa không tồn tại",
      });
    }

    // 3. Máy không khớp (phòng trường hợp muốn cho phép machine_id rỗng)
    if (lic.machine_id && lic.machine_id !== machine) {
      return res.status(400).json({
        status: "lỗi",
        lý_do: "INVALID_MACHINE",
        message: "Sai máy kích hoạt",
      });
    }

    // 4. Khóa bị khóa
    if (lic.status !== "active") {
      return res.status(400).json({
        status: "lỗi",
        lý_do: "INACTIVE",
        message: "Khóa đã bị khóa hoặc không hoạt động",
      });
    }

    // 5. Hết hạn
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    if (lic.expiry && today > lic.expiry) {
      return res.status(400).json({
        status: "lỗi",
        lý_do: "EXPIRED",
        message: "Giấy phép đã hết hạn",
      });
    }

    // 6. OK
    return res.json({
      status: "thành công",
      message: "Giấy phép hợp lệ",
      expire: lic.expiry || null,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      status: "lỗi",
      lý_do: "SERVER_ERROR",
      message: "Lỗi máy chủ nội bộ",
    });
  }
};
