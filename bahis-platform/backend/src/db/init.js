const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        balance DECIMAL(12,2) DEFAULT 0.00,
        role VARCHAR(10) DEFAULT 'user',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS matches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        external_id VARCHAR(100) UNIQUE,
        sport VARCHAR(50) NOT NULL,
        league VARCHAR(100),
        home_team VARCHAR(100) NOT NULL,
        away_team VARCHAR(100) NOT NULL,
        start_time TIMESTAMP NOT NULL,
        status VARCHAR(20) DEFAULT 'upcoming',
        odds_json JSONB,
        score_json JSONB,
        result VARCHAR(10),
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS bet_slips (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id),
        stake DECIMAL(12,2) NOT NULL,
        total_odds DECIMAL(10,4),
        potential_win DECIMAL(12,2),
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW(),
        settled_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS bets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        slip_id UUID REFERENCES bet_slips(id),
        user_id UUID REFERENCES users(id),
        match_id UUID REFERENCES matches(id),
        selection VARCHAR(20) NOT NULL,
        odds DECIMAL(8,4) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id),
        type VARCHAR(20) NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        balance_after DECIMAL(12,2),
        note TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      INSERT INTO users (username, password_hash, role)
      SELECT 'admin', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin'
      WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'admin');
    `);
    console.log('Database initialized');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };
