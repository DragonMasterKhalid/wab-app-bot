require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');
const { Low, JSONFile } = require('lowdb');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || `http://localhost:${PORT}`;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin-token';

// setup lowdb
const file = path.join(__dirname, 'db.json');
const adapter = new JSONFile(file);
const db = new Low(adapter);

(async ()=> {
  await db.read();
  db.data = db.data || { users: [], admins: [], tasks: [], ads: [], withdraws: [] };
  await db.write();
})();

// serve static web files
app.use(express.static(path.join(__dirname, '..', 'web')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// basic endpoints
app.get('/', (req, res) => {
  res.send('Telegram Web Bot Starter - visit /user or /admin');
});

app.get('/user', async (req, res) => {
  // user panel page (served from web/user.html)
  res.sendFile(path.join(__dirname, '..', 'web', 'user.html'));
});

app.get('/admin', (req, res) => {
  const token = req.query.token;
  if (token !== ADMIN_TOKEN) return res.status(401).send('Unauthorized: missing admin token');
  res.sendFile(path.join(__dirname, '..', 'web', 'admin.html'));
});

// sample simple API for admin to view users
app.get('/api/users', async (req, res) => {
  const token = req.query.token;
  if (token !== ADMIN_TOKEN) return res.status(401).json({ error: 'Unauthorized' });
  await db.read();
  res.json(db.data.users || []);
});

// sample endpoint: register user (called by web app when opened)
app.post('/api/register', async (req, res) => {
  // expected { user_id, name }
  const { user_id, name } = req.body;
  await db.read();
  if (!db.data.users.find(u => u.user_id === user_id)) {
    db.data.users.push({ user_id, name, createdAt: new Date().toISOString(), balance: 0 });
    await db.write();
  }
  res.json({ ok: true });
});

// start Telegram bot (uses polling for easy start)
const botToken = process.env.BOT_TOKEN;
if (!botToken) {
  console.warn('BOT_TOKEN missing in .env — bot will not start');
} else {
  const bot = new Telegraf(botToken);

  bot.start((ctx) => {
    const userId = ctx.from.id;
    const webAppUrl = `${HOST}/user?user_id=${userId}`;
    ctx.reply('Welcome! Click the web app to open your panel', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Open User Panel', web_app: { url: webAppUrl } }],
          [{ text: 'Open in Browser', url: webAppUrl }]
        ]
      }
    });
  });

  // example command for admin to get quick stats (if user id is admin)
  bot.command('admin', async (ctx) => {
    // naive check: compare ctx.from.id with saved admins in db
    await db.read();
    const isAdmin = (db.data.admins || []).includes(ctx.from.id);
    if (!isAdmin) return ctx.reply('You are not admin.');
    const usersCount = (db.data.users || []).length;
    ctx.reply(`Users: ${usersCount}`);
  });

  bot.launch();
  console.log('Bot started (polling).');
}

// server listen
app.listen(PORT, () => {
  console.log(`Server running on ${HOST}`);
});
