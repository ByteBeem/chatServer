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
const offlineMessages = {};

io.on('connection', (socket) => {
  const userId = socket.handshake.query.userId;
    
  console.log('New connection with userId:', userId);

  // Store user's socket based on userId
  if (userId) {
    userSockets[userId] = socket;
    
    // If the user has offline messages, emit them to the client
    const offlineMsgs = offlineMessages[userId];
    if (offlineMsgs && offlineMsgs.length > 0) {
      console.log(`Offline messages for user ${userId}:`, offlineMsgs); // Log offline messages
      offlineMsgs.forEach(({ senderId, text, createdAt }) => {
        socket.emit('receiveMessage', {
          senderId,
          text,
          createdAt
        });
      });
      delete offlineMessages[userId]; // Remove offline messages after sending
    }
  }

  socket.on('sendMessage', async ({ text, recipientId, senderId, createdAt }) => {
    console.log(`User ${userId} sent a message to ${recipientId}: ${text}`);

    try {
      await db.ref('messages').push({
        senderId: senderId,
        reciever: recipientId,
        message: text,
        createdAt: createdAt,
      });
    } catch (error) {
      console.error('Error saving message to database:', error);
    }

    const recipientSocket = userSockets[recipientId];
    if (recipientSocket) {
      recipientSocket.emit('receiveMessage', {
        senderId: senderId,
        text: text,
      });
    } else {
      console.log(`Recipient ${recipientId} is not connected.`);
      // Store message for offline user
      if (!offlineMessages[recipientId]) {
        offlineMessages[recipientId] = [];
      }
      offlineMessages[recipientId].push({ senderId, text, createdAt });
    }
  });

  // When user comes back online, check for stored messages and send them
  socket.on('checkOfflineMessages', () => {
    const offlineMsgs = offlineMessages[userId];
    if (offlineMsgs && offlineMsgs.length > 0) {
      console.log(`Offline messages for user ${userId}:`, offlineMsgs); // Log offline messages
      offlineMsgs.forEach(({ senderId, text, createdAt }) => {
        socket.emit('receiveMessage', {
          senderId,
          text,
          createdAt
        });
      });
      delete offlineMessages[userId];
    }
  });

  // Handle disconnection and remove the socket from userSockets
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${userId}`);
    delete userSockets[userId];
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
