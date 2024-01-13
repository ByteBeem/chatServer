const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const randomColor = require('randomcolor');
const jwt = require('jsonwebtoken');
const firebase = require('firebase-admin');

const secretKey = process.env.secret_key || 'DonaldMxolisiRSA04?????';

const app = express();

const corsOptionsServer = {
  origin: ['https://peermine.vercel.app', 'https://www.shopient.co.za'],
  credentials: true,
  exposedHeaders: ['Content-Length', 'X-Content-Type-Options', 'X-Frame-Options'],
};

app.use(cors(corsOptionsServer));

app.use((req, res, next) => {
  const allowedOrigins = ['https://peermine.vercel.app', 'https://www.shopient.co.za'];
  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }

  res.header('Access-Control-Allow-Credentials', true);

  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).json({});
  }

  next();
});

app.use(express.json());

const firebaseServiceAccount = require('./firebase.json');

firebase.initializeApp({
  credential: firebase.credential.cert(firebaseServiceAccount),
  databaseURL: 'https://peermine-843bb-default-rtdb.firebaseio.com',
});

const db = firebase.database();

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

const userColors = {};

app.post('/userChat', async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Token is required' });
  }

  try {
    const decodedToken = jwt.verify(token, secretKey);
    const userId = decodedToken.cell;

    const snapshot = await db.ref('users').orderByChild('cell').equalTo(decodedToken.cell).once('value');
    const user = snapshot.val();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { name, surname, cell, password, balance } = user[Object.keys(user)[0]];

    const userColor = randomColor();
    userColors[userId] = userColor;

    const messageSnapshot = await db.ref('messages').once('value');
    const messages = messageSnapshot.val() || {};
    const messageRows = Object.values(messages);

    res.json({ name, color: userColor, messages: messageRows });
  } catch (error) {
    console.error('Error fetching user name:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  const userToken = socket.handshake.query.token;

  try {
    const decodedToken = jwt.verify(userToken, secretKey);
    const userId = decodedToken.cell;

    const userColor = randomColor();
    userColors[userId] = userColor;

    socket.emit('user-color', { color: userColor });

    socket.on('user-message', async (data) => {
      const { type, message } = data;
      const { text, name } = message;

      console.log(`User message from ${name}: ${text}`);

      try {
        await db.ref('messages').push({
          username: name,
          text,
          color: userColor,
        });
      } catch (error) {
        console.error('Error saving message to database:', error);
      }

      io.emit('chat-message', {
        username: name,
        text,
        color: userColor,
      });
    });

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.id}`);
      delete userColors[userId];
    });
  } catch (error) {
    console.error('Error decoding user token:', error);
    socket.disconnect();
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

