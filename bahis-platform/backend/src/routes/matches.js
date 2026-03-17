const express = require('express');
const { getRedis } = require('../db/redis');
const { pool } = require('../db/init');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  try {
    const redis = getRedis();
    const cached = await redis.get('matches:all');
    if (cached) return res.json(JSON.parse(cached));

    const { rows } = await pool.query(
      `SELECT * FROM matches WHERE status IN ('upcoming','live') ORDER BY start_time ASC LIMIT 200`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

router.get('/live', authMiddleware, async (req, res) => {
  try {
    const redis = getRedis();
    const cached = await redis.get('matches:live');
    if (cached) return res.json(JSON.parse(cached));

    const { rows } = await pool.query(
      `SELECT * FROM matches WHERE status = 'live' ORDER BY start_time ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

router.get('/sport/:sport', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM matches WHERE sport = $1 AND status IN ('upcoming','live') ORDER BY start_time ASC`,
      [req.params.sport]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

router.get('/league/:league', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM matches WHERE league = $1 AND status IN ('upcoming','live') ORDER BY start_time ASC`,
      [req.params.league]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM matches WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Maç bulunamadı' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

module.exports = router;
