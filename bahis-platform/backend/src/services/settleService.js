const { pool } = require('../db/init');

async function settleFinishedMatches() {
  try {
    const { rows: finishedMatches } = await pool.query(
      `SELECT * FROM matches WHERE status = 'finished' AND result IS NOT NULL`
    );

    for (const match of finishedMatches) {
      const { rows: pendingBets } = await pool.query(
        `SELECT b.*, bs.stake, bs.total_odds, bs.potential_win, bs.user_id as slip_user_id
         FROM bets b
         JOIN bet_slips bs ON bs.id = b.slip_id
         WHERE b.match_id = $1 AND b.status = 'pending'`,
        [match.id]
      );

      for (const bet of pendingBets) {
        const won = bet.selection === match.result;
        await pool.query('UPDATE bets SET status = $1 WHERE id = $2', [won ? 'won' : 'lost', bet.id]);
      }

      const { rows: slips } = await pool.query(
        `SELECT bs.* FROM bet_slips bs WHERE bs.status = 'pending'
         AND bs.id IN (SELECT DISTINCT slip_id FROM bets WHERE match_id = $1)`,
        [match.id]
      );

      for (const slip of slips) {
        const { rows: slipBets } = await pool.query(
          'SELECT * FROM bets WHERE slip_id = $1', [slip.id]
        );

        const allSettled = slipBets.every(b => b.status !== 'pending');
        if (!allSettled) continue;

        const allWon = slipBets.every(b => b.status === 'won');
        const newStatus = allWon ? 'won' : 'lost';

        await pool.query(
          'UPDATE bet_slips SET status = $1, settled_at = NOW() WHERE id = $2',
          [newStatus, slip.id]
        );

        if (allWon) {
          const client = await pool.connect();
          try {
            await client.query('BEGIN');
            const { rows } = await client.query(
              'UPDATE users SET balance = balance + $1 WHERE id = $2 RETURNING balance',
              [slip.potential_win, slip.user_id]
            );
            await client.query(
              `INSERT INTO transactions (user_id, type, amount, balance_after, note) VALUES ($1, 'win', $2, $3, $4)`,
              [slip.user_id, slip.potential_win, rows[0].balance, `Kupon kazandı #${slip.id.slice(0, 8)}`]
            );
            await client.query('COMMIT');
          } catch (err) {
            await client.query('ROLLBACK');
            console.error('Settle error:', err);
          } finally {
            client.release();
          }
        }
      }
    }
  } catch (err) {
    console.error('Settle service error:', err);
  }
}

function startSettleService() {
  setInterval(settleFinishedMatches, 60000);
  console.log('Settle service started');
}

module.exports = { startSettleService };
