const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { pool } = require('../db/init');

const router = express.Router();

const loginLimiter = rateLimit({ windowMs: 60000, max: 10, message: { error: 'Çok fazla deneme' } });

router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Kullanıcı adı ve şifre gerekli' });

  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE username = $1 AND is_active = true', [username]);
    if (!rows.length) return res.status(401).json({ error: 'Geçersiz kullanıcı adı veya şifre' });

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Geçersiz kullanıcı adı veya şifre' });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: { id: user.id, username: user.username, role: user.role, balance: user.balance }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

router.post('/refresh', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token gerekli' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const newToken = jwt.sign(
      { id: decoded.id, username: decoded.username, role: decoded.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    res.json({ token: newToken });
  } catch {
    res.status(401).json({ error: 'Geçersiz token' });
  }
});

module.exports = router;
