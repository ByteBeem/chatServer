const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const firebase = require('firebase-admin');

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
  databaseURL: "https://jobs4life-d6926-default-rtdb.asia-southeast1.firebasedatabase.app",
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

  socket.on('sendMessage', async ({ text, recipientId , senderId}) => {
    console.log(`User ${socket.id} sent a message to ${recipientId}: ${text}`);

    try {
      await db.ref('messages').push({
        senderId: senderId,
        reciever : recipientId,
        message:text,
        createdAt: new Date(),
      });
    } catch (error) {
      console.error('Error saving message to database:', error);
    }

    const recipientSocket = userSockets[recipientId];
    if (recipientSocket) {
      recipientSocket.emit('receiveMessage', {
        senderId: socket.id,
        senderName: 'Anonymous',
        text,
      });
    } else {
      console.log(`Recipient ${recipientId} is not connected.`);
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    delete userSockets[socket.id];
  });

  userSockets[socket.id] = socket;
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
