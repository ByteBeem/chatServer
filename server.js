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

const updateUserStatus = (userId, online) => {
    if (online) {
        userSockets[userId] = { online: true, lastSeen: new Date() };
    } else {
        const userData = userSockets[userId];
        if (userData) {
            userData.online = false;
            userSockets[userId] = userData;
        }
    }
};

const updateOfflineUsersLastSeen = () => {
    const currentTime = new Date();
    for (const [userId, userData] of Object.entries(userSockets)) {
        if (!userData.online) {
            const lastSeenTime = userData.lastSeen;
            const offlineDurationInSeconds = Math.floor((currentTime - lastSeenTime) / 1000);
            console.log(`User ${userId} was last seen ${offlineDurationInSeconds} seconds ago`);
        }
    }
};

io.on('connection', (socket) => {
    const userId = socket.handshake.query.userId;
  
    console.log('New connection with userId:', userId);

    if (userId) {
        updateUserStatus(userId, true);
    
        console.log(`User ${userId} is now online.`);

        const offlineMsgs = offlineMessages[userId];
        if (offlineMsgs && offlineMsgs.length > 0) {
            console.log(`Offline messages for user ${userId}:`, offlineMsgs);
            offlineMsgs.forEach(({ senderId, text, createdAt }) => {
                socket.emit('receiveMessage', {
                    senderId,
                    text,
                    createdAt
                });
            });
          
        }
    }

  socket.on('sendMessage', async ({ text, recipientId, senderId, createdAt }) => {
    console.log(`User ${userId} sent a message to ${recipientId}: ${text}`);

    const chatId = [senderId, recipientId].sort().join('_'); 
    try {
        await db.ref(`messages/${chatId}`).push({
            senderId: senderId,
            recipientId: recipientId,
            message: text,
            createdAt: createdAt,
        });
    } catch (error) {
        console.error('Error saving message to database:', error);
    }

    const recipientSocket = userSockets[recipientId];
    if (recipientSocket && recipientSocket.connected) { // Check if recipientSocket is valid and connected
        recipientSocket.emit('receiveMessage', {
            senderId: senderId,
            text: text,
        });
    } else {
        console.log(`Recipient ${recipientId} is not connected.`);
        if (!offlineMessages[recipientId]) {
            offlineMessages[recipientId] = [];
        }
        offlineMessages[recipientId].push({ senderId, text, createdAt });
    }
});


    socket.on('getOfflineMessageDetails', () => {
      console.log("getOfflineMessageDetails trickered");
        const offlineMsgs = offlineMessages[userId];
      console.log('offline details',offlineMsgs);
        if (offlineMsgs && offlineMsgs.length > 0) {
            const senderIds = offlineMsgs.map(msg => msg.senderId);
            socket.emit('offlineMessageDetails', { count: offlineMsgs.length, senderIds });
        }
        delete offlineMessages[userId]; 
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${userId}`);
        updateUserStatus(userId, false);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
