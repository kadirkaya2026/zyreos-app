const { createClient } = require('redis');

let client;

async function initRedis() {
  client = createClient({ url: process.env.REDIS_URL });
  client.on('error', (err) => console.error('Redis error:', err));
  await client.connect();
  console.log('Redis connected');
}

function getRedis() {
  return client;
}

module.exports = { initRedis, getRedis };
