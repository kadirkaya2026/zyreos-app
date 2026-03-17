const express = require('express');
const { pool } = require('../db/init');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.get('/balance', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT balance FROM users WHERE id = $1', [req.user.id]);
    res.json({ balance: rows[0]?.balance || 0 });
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

router.get('/transactions', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

module.exports = router;
