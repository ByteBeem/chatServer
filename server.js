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

// Function to update user's online status and last seen time
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

// Function to periodically update last seen time for offline users
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
  
    // Log new connections
    console.log('New connection with userId:', userId);

    // Store user's socket based on userId
    if (userId) {
        updateUserStatus(userId, true);
    
        // Log when a user comes online
        console.log(`User ${userId} is now online.`);

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
            delete offlineMessages[userId]; 
        }
    }

    // Handle sending messages
    socket.on('sendMessage', async ({ text, recipientId, senderId, createdAt }) => {
        console.log(`User ${userId} sent a message to ${recipientId}: ${text}`);

        // Generate chatId from senderId and recipientId
        const chatId = [senderId, recipientId].sort().join('_'); 
        try {
            // Push message to the appropriate chatId node
            await db.ref(`messages/${chatId}`).push({
                senderId: senderId,
                recipientId: recipientId,
                message: text,
                createdAt: createdAt,
            });
        } catch (error) {
            console.error('Error saving message to database:', error);
        }

        // Emit message to recipient if online, otherwise store it as offline message
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

    // Handle 'getOfflineMessageDetails' event
    socket.on('getOfflineMessageDetails', () => {
      console.log("Yes i am here");
        const offlineMsgs = offlineMessages[userId];
        if (offlineMsgs && offlineMsgs.length > 0) {
            console.log(`Offline messages for user ${userId}:`, offlineMsgs); 
            socket.emit('offlineMessageDetails', { count: offlineMsgs.length, senderIds: offlineMsgs.map(msg => msg.senderId) });
        }
    });

    // Handle disconnection and remove the socket from userSockets
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${userId}`);
        updateUserStatus(userId, false);
    });
});


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
