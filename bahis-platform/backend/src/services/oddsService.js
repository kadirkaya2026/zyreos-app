const axios = require('axios');
const { pool } = require('../db/init');
const { getRedis } = require('../db/redis');

const LEAGUE_NAMES = {
  'soccer_turkey_super_league': 'SÜPER LİG',
  'soccer_epl': 'PREMIER LEAGUE',
  'soccer_spain_la_liga': 'LA LİGA',
  'soccer_germany_bundesliga': 'BUNDESLIGA',
  'soccer_italy_serie_a': 'SERIE A',
  'soccer_france_ligue_one': 'LIGUE 1',
  'soccer_uefa_champs_league': 'ŞAMPİYONLAR LİGİ',
  'soccer_uefa_europa_league': 'AVRUPA LİGİ',
  'soccer_efl_champ': 'CHAMPIONSHIP',
  'soccer_england_league1': 'LEAGUE ONE',
  'soccer_germany_bundesliga2': 'BUNDESLIGA 2',
  'soccer_italy_serie_b': 'SERIE B',
  'soccer_france_ligue_two': 'LIGUE 2',
  'soccer_spain_segunda_division': 'LA LİGA 2',
  'soccer_netherlands_eredivisie': 'EREDIVISIE',
  'soccer_portugal_primeira_liga': 'PRİMEİRA LİG',
  'soccer_belgium_first_div': 'BELÇIKA 1. LİG',
  'soccer_argentina_primera_division': 'ARJANTİN LİGİ',
  'soccer_brazil_campeonato': 'BREZİLYA LİGİ',
  'soccer_mexico_ligamx': 'LİGA MX',
  'soccer_greece_super_league': 'YUNAN SÜPERLİG',
  'soccer_denmark_superliga': 'DANİMARKA LİGİ',
  'soccer_norway_eliteserien': 'NORVEÇ LİGİ',
  'soccer_sweden_allsvenskan': 'İSVEÇ LİGİ',
  'soccer_australia_aleague': 'A-LEAGUE',
  'soccer_japan_j_league': 'J-LEAGUE',
  'soccer_korea_kleague1': 'K-LEAGUE',
  'soccer_poland_ekstraklasa': 'POLONYA LİGİ',
  'soccer_austria_bundesliga': 'AVUSTURYA LİGİ',
};

async function fetchAllSports(io) {
  if (!process.env.ODDS_API_KEY || process.env.ODDS_API_KEY === 'your_odds_api_key_here') {
    await generateDemoMatches(io);
    return;
  }

  try {
    const sportsRes = await axios.get('https://api.the-odds-api.com/v4/sports/', {
      params: { apiKey: process.env.ODDS_API_KEY },
      timeout: 10000
    });
    const activeSoccer = sportsRes.data
      .filter(s => s.group === 'Soccer' && s.active)
      .map(s => s.key);
    return activeSoccer;
  } catch (err) {
    console.error('Sports list error:', err.message);
    return Object.keys(LEAGUE_NAMES);
  }
}

async function fetchAndStoreOdds(io) {
  if (!process.env.ODDS_API_KEY || process.env.ODDS_API_KEY === 'your_odds_api_key_here') {
    await generateDemoMatches(io);
    return;
  }

  const sports = await fetchAllSports(io);
  const allMatches = [];

  for (const sport of sports) {
    try {
      const res = await axios.get(`https://api.the-odds-api.com/v4/sports/${sport}/odds`, {
        params: {
          apiKey: process.env.ODDS_API_KEY,
          regions: 'eu',
          markets: 'h2h,totals,btts,draw_no_bet',
          oddsFormat: 'decimal',
        },
        timeout: 10000
      });

      if (!res.data?.length) continue;

      const leagueName = LEAGUE_NAMES[sport] || sport.replace('soccer_', '').replace(/_/g, ' ').toUpperCase();

      for (const event of res.data) {
        const oddsJson = {};

        for (const bookmaker of (event.bookmakers || [])) {
          for (const market of (bookmaker.markets || [])) {
            if (market.key === 'h2h') {
              market.outcomes.forEach(o => {
                if (o.name === event.home_team) oddsJson['home'] = o.price;
                else if (o.name === event.away_team) oddsJson['away'] = o.price;
                else oddsJson['draw'] = o.price;
              });
            }
            if (market.key === 'totals') {
              market.outcomes.forEach(o => {
                const point = o.point || 2.5;
                if (o.name === 'Over') oddsJson[`over_${point}`] = o.price;
                if (o.name === 'Under') oddsJson[`under_${point}`] = o.price;
              });
            }
            if (market.key === 'btts') {
              market.outcomes.forEach(o => {
                if (o.name === 'Yes') oddsJson['btts_yes'] = o.price;
                if (o.name === 'No') oddsJson['btts_no'] = o.price;
              });
            }
            if (market.key === 'draw_no_bet') {
              market.outcomes.forEach(o => {
                if (o.name === event.home_team) oddsJson['dnb_home'] = o.price;
                if (o.name === event.away_team) oddsJson['dnb_away'] = o.price;
              });
            }
          }
          if (oddsJson['home']) break;
        }

        if (!oddsJson['home']) continue;

        const { rows: inserted } = await pool.query(
          `INSERT INTO matches (external_id, sport, league, home_team, away_team, start_time, odds_json)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (external_id) DO UPDATE
             SET odds_json = $7,
                 status = CASE WHEN NOW() > $6 THEN 'live' ELSE 'upcoming' END
           RETURNING *`,
          [event.id, 'Futbol', leagueName, event.home_team, event.away_team, event.commence_time, JSON.stringify(oddsJson)]
        );
        if (inserted[0]) allMatches.push(inserted[0]);
      }

      await new Promise(r => setTimeout(r, 200));

    } catch (err) {
      if (err.response?.status === 422) continue;
      console.error(`Odds fetch error [${sport}]:`, err.message);
    }
  }

  if (allMatches.length) {
    const redis = getRedis();
    await redis.setEx('matches:all', 60, JSON.stringify(allMatches));
    if (io) io.emit('odds_update', { matches: allMatches });
    console.log(`Odds updated: ${allMatches.length} matches from ${sports.length} leagues`);
  }
}

async function generateDemoMatches(io) {
  const demoMatches = [
    { external_id: 'demo_1', league: 'SÜPER LİG', home: 'Galatasaray', away: 'Fenerbahçe', home_odds: 2.10, draw_odds: 3.20, away_odds: 3.50 },
    { external_id: 'demo_2', league: 'SÜPER LİG', home: 'Beşiktaş', away: 'Trabzonspor', home_odds: 1.85, draw_odds: 3.40, away_odds: 4.00 },
    { external_id: 'demo_3', league: 'PREMIER LEAGUE', home: 'Manchester City', away: 'Arsenal', home_odds: 1.75, draw_odds: 3.80, away_odds: 4.50 },
    { external_id: 'demo_4', league: 'PREMIER LEAGUE', home: 'Liverpool', away: 'Chelsea', home_odds: 1.90, draw_odds: 3.50, away_odds: 4.00 },
    { external_id: 'demo_5', league: 'LA LİGA', home: 'Real Madrid', away: 'Barcelona', home_odds: 2.20, draw_odds: 3.30, away_odds: 3.10 },
    { external_id: 'demo_6', league: 'SERIE A', home: 'Inter Milan', away: 'AC Milan', home_odds: 2.00, draw_odds: 3.25, away_odds: 3.75 },
    { external_id: 'demo_7', league: 'BUNDESLIGA', home: 'Bayern Munich', away: 'Borussia Dortmund', home_odds: 1.60, draw_odds: 4.00, away_odds: 5.50 },
    { external_id: 'demo_8', league: 'ŞAMPİYONLAR LİGİ', home: 'PSG', away: 'Bayern Munich', home_odds: 2.50, draw_odds: 3.20, away_odds: 2.90 },
  ];

  const redis = getRedis();
  const now = new Date();

  for (const m of demoMatches) {
    const startTime = new Date(now.getTime() + Math.random() * 48 * 3600000);
    const oddsJson = { home: m.home_odds, draw: m.draw_odds, away: m.away_odds, over_2_5: 1.85, under_2_5: 1.95 };
    await pool.query(
      `INSERT INTO matches (external_id, sport, league, home_team, away_team, start_time, odds_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (external_id) DO UPDATE SET odds_json = $7`,
      [m.external_id, 'Futbol', m.league, m.home, m.away, startTime, JSON.stringify(oddsJson)]
    );
  }

  const { rows } = await pool.query(`SELECT * FROM matches WHERE status IN ('upcoming','live')`);
  await redis.setEx('matches:all', 30, JSON.stringify(rows));
  if (io) io.emit('odds_update', { matches: rows });
  console.log('Demo matches generated/updated');
}

function startOddsPolling(io) {
  fetchAndStoreOdds(io);
  setInterval(() => fetchAndStoreOdds(io), 60000);
  console.log('Odds polling started (all leagues)');
}

module.exports = { startOddsPolling };
