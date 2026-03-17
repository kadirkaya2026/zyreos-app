const express = require('express');
const { pool } = require('../db/init');
const { authMiddleware } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

const router = express.Router();
const betLimiter = rateLimit({ windowMs: 60000, max: 30 });

router.post('/', authMiddleware, betLimiter, async (req, res) => {
  const { selections, stake } = req.body;

  if (!selections?.length || !stake || stake <= 0) {
    return res.status(400).json({ error: 'Geçersiz kupon verisi' });
  }
  if (stake < 1) return res.status(400).json({ error: 'Minimum bahis 1 TL' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userRes = await client.query('SELECT balance FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);
    if (!userRes.rows.length) throw new Error('Kullanıcı bulunamadı');

    const balance = parseFloat(userRes.rows[0].balance);
    if (balance < stake) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Yetersiz bakiye' });
    }

    let totalOdds = 1;
    const matchDetails = [];

    for (const sel of selections) {
      const matchRes = await client.query(
        `SELECT * FROM matches WHERE id = $1 AND status IN ('upcoming','live')`,
        [sel.matchId]
      );
      if (!matchRes.rows.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Maç bulunamadı veya kapandı: ${sel.matchId}` });
      }
      const match = matchRes.rows[0];
      const odds = match.odds_json?.[sel.selection];
      if (!odds) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Geçersiz seçim: ${sel.selection}` });
      }
      totalOdds *= parseFloat(odds);
      matchDetails.push({ match, selection: sel.selection, odds: parseFloat(odds) });
    }

    const potentialWin = parseFloat((stake * totalOdds).toFixed(2));

    await client.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [stake, req.user.id]);

    const slipRes = await client.query(
      `INSERT INTO bet_slips (user_id, stake, total_odds, potential_win) VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.id, stake, totalOdds.toFixed(4), potentialWin]
    );
    const slip = slipRes.rows[0];

    for (const det of matchDetails) {
      await client.query(
        `INSERT INTO bets (slip_id, user_id, match_id, selection, odds) VALUES ($1, $2, $3, $4, $5)`,
        [slip.id, req.user.id, det.match.id, det.selection, det.odds]
      );
    }

    const balRes = await client.query('SELECT balance FROM users WHERE id = $1', [req.user.id]);
    await client.query(
      `INSERT INTO transactions (user_id, type, amount, balance_after, note) VALUES ($1, 'bet', $2, $3, $4)`,
      [req.user.id, -stake, balRes.rows[0].balance, `Kupon #${slip.id.slice(0, 8)}`]
    );

    await client.query('COMMIT');
    res.json({ slip, message: 'Kupon oluşturuldu' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: err.message || 'Sunucu hatası' });
  } finally {
    client.release();
  }
});

router.get('/my', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT bs.*, 
        json_agg(json_build_object(
          'id', b.id, 'match_id', b.match_id, 'selection', b.selection,
          'odds', b.odds, 'status', b.status,
          'home_team', m.home_team, 'away_team', m.away_team,
          'league', m.league, 'start_time', m.start_time
        )) as bets
       FROM bet_slips bs
       LEFT JOIN bets b ON b.slip_id = bs.id
       LEFT JOIN matches m ON m.id = b.match_id
       WHERE bs.user_id = $1
       GROUP BY bs.id
       ORDER BY bs.created_at DESC
       LIMIT 50`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

module.exports = router;
