require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { initDB } = require('./db/init');
const { initRedis } = require('./db/redis');
const { startOddsPolling } = require('./services/oddsService');
const { startSettleService } = require('./services/settleService');

const authRoutes = require('./routes/auth');
const matchRoutes = require('./routes/matches');
const betRoutes = require('./routes/bets');
const accountRoutes = require('./routes/account');
const adminRoutes = require('./routes/admin');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use(rateLimit({ windowMs: 60000, max: 200 }));

app.set('io', io);

app.use('/auth', authRoutes);
app.use('/matches', matchRoutes);
app.use('/bets', betRoutes);
app.use('/account', accountRoutes);
app.use('/admin', adminRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});

const PORT = process.env.PORT || 4000;

async function start() {
  await initDB();
  await initRedis();
  startOddsPolling(io);
  startSettleService();
  server.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
}

start().catch(console.error);
