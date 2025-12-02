// api/admin.js
// Serverless function cho Vercel: /api/admin

module.exports = (req, res) => {
  const ADMIN_SECRET = process.env.ADMIN_SECRET;

  // Lấy ?secret=... từ URL
  const { secret } = req.query || {};

  if (!secret || secret !== ADMIN_SECRET) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  // Sau này sẽ thêm logic đọc/ghi license ở đây.
  // Hiện tại chỉ trả về JSON để test.
  return res.status(200).json({
    ok: true,
    message: 'Admin API OK',
  });
};
