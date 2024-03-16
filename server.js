const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
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

const userSockets = {};

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  const userToken = socket.handshake.query.token;

  try {
    const decodedToken = jwt.verify(userToken, secretKey);
    const userId = decodedToken.cell;

    userSockets[userId] = socket;

    socket.on('sendMessage', async ({ text, recipientId }) => {
      const senderName = decodedToken.name;

      console.log(`User ${senderName} (${userId}) sent a message to ${recipientId}: ${text}`);

      try {
        await db.ref('messages').push({
          senderId: userId,
          senderName,
          recipientId,
          text,
        });
      } catch (error) {
        console.error('Error saving message to database:', error);
      }

      const recipientSocket = userSockets[recipientId];
      if (recipientSocket) {
        recipientSocket.emit('receiveMessage', {
          senderId: userId,
          senderName,
          text,
        });
      } else {
        console.log(`Recipient ${recipientId} is not connected.`);
      }
    });

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.id}`);
      delete userSockets[userId];
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
