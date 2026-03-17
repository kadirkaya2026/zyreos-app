const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db/init');
const { adminMiddleware } = require('../middleware/auth');

const router = express.Router();

router.use(adminMiddleware);

router.get('/users', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, username, balance, role, is_active, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

router.post('/users', async (req, res) => {
  const { username, password, balance = 0 } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Kullanıcı adı ve şifre gerekli' });

  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      'INSERT INTO users (username, password_hash, balance) VALUES ($1, $2, $3) RETURNING id, username, balance, role, is_active',
      [username, hash, balance]
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Bu kullanıcı adı zaten var' });
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

router.put('/users/:id', async (req, res) => {
  const { username, password, is_active } = req.body;
  try {
    const updates = [];
    const values = [];
    let idx = 1;

    if (username) { updates.push(`username = $${idx++}`); values.push(username); }
    if (password) { const h = await bcrypt.hash(password, 10); updates.push(`password_hash = $${idx++}`); values.push(h); }
    if (is_active !== undefined) { updates.push(`is_active = $${idx++}`); values.push(is_active); }

    if (!updates.length) return res.status(400).json({ error: 'Güncellenecek alan yok' });
    values.push(req.params.id);

    const { rows } = await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, username, balance, role, is_active`,
      values
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

router.post('/users/:id/balance', async (req, res) => {
  const { amount, note } = req.body;
  if (!amount || amount === 0) return res.status(400).json({ error: 'Geçersiz miktar' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'UPDATE users SET balance = balance + $1 WHERE id = $2 RETURNING balance',
      [amount, req.params.id]
    );
    if (!rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Kullanıcı bulunamadı' }); }

    const type = amount > 0 ? 'deposit' : 'withdraw';
    await client.query(
      'INSERT INTO transactions (user_id, type, amount, balance_after, note) VALUES ($1, $2, $3, $4, $5)',
      [req.params.id, type, amount, rows[0].balance, note || 'Admin işlemi']
    );
    await client.query('COMMIT');
    res.json({ balance: rows[0].balance });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Sunucu hatası' });
  } finally {
    client.release();
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    await pool.query('UPDATE users SET is_active = false WHERE id = $1', [req.params.id]);
    res.json({ message: 'Kullanıcı devre dışı bırakıldı' });
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

router.get('/bets', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT bs.*, u.username,
        json_agg(json_build_object(
          'id', b.id, 'match_id', b.match_id, 'selection', b.selection,
          'odds', b.odds, 'status', b.status,
          'home_team', m.home_team, 'away_team', m.away_team, 'league', m.league
        )) as bets
       FROM bet_slips bs
       JOIN users u ON u.id = bs.user_id
       LEFT JOIN bets b ON b.slip_id = bs.id
       LEFT JOIN matches m ON m.id = b.match_id
       GROUP BY bs.id, u.username
       ORDER BY bs.created_at DESC
       LIMIT 200`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const [users, bets, revenue] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM users WHERE role = $1', ['user']),
      pool.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='pending') as pending FROM bet_slips`),
      pool.query(`SELECT COALESCE(SUM(CASE WHEN type='bet' THEN ABS(amount) ELSE 0 END) - SUM(CASE WHEN type='win' THEN amount ELSE 0 END), 0) as profit FROM transactions`)
    ]);
    res.json({
      totalUsers: users.rows[0].count,
      totalBets: bets.rows[0].total,
      pendingBets: bets.rows[0].pending,
      profit: revenue.rows[0].profit
    });
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

module.exports = router;
