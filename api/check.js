// /api/check.js
const crypto = require("crypto");
const licenses = require("../data/licenses.json");

// Hàm băm SHA-256
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
    const machineHash = sha256(machine.trim());

    // Kiểm tra key tồn tại không
    const record = licenses[keyHash];

    if (!record) {
        return res.status(404).json({
            status: "error",
            reason: "KEY_NOT_FOUND",
            message: "Key không tồn tại"
        });
    }

    // Kiểm tra machine có khớp không
    if (record.machine !== machineHash) {
        return res.status(401).json({
            status: "error",
            reason: "INVALID_MACHINE",
            message: "Sai máy kích hoạt"
        });
    }

    return res.status(200).json({
        status: "success",
        message: "License hợp lệ",
        expire: record.expire
    });
};
