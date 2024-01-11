const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const randomColor = require('randomcolor');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const storage = multer.memoryStorage();
const path = require('path');
const fs = require('fs');
const firebase = require("firebase-admin");

const secretKey = process.env.secret_key || "DonaldMxolisiRSA04?????";

const app = express();
app.use(cors());
app.use(express.json());

const firebaseServiceAccount = require("./firebase.json");

firebase.initializeApp({
  credential: firebase.credential.cert(firebaseServiceAccount),
  databaseURL: "https://peermine-843bb-default-rtdb.firebaseio.com",
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
  console.log("token", token);

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



    if (user) {
    const Username = user[Object.keys(user)[0]].name;
    const Usersurname = user[Object.keys(user)[0]].surname;
    const Usercell = user[Object.keys(user)[0]].cell;
    const Userpassword = user[Object.keys(user)[0]].password;
    const Userbalance = user[Object.keys(user)[0]].balance;
      

      // Generate a random color for the user
      const userColor = randomColor();
      userColors[userId] = userColor;

      // Fetch all messages from the database
      const messageSnapshot = await db.ref('messages').once('value');
      const messages = messageSnapshot.val() || {};

      const messageRows = Object.values(messages);

      // Send the user their name, color, and all messages
      res.json({ name: Username, color: userColor, messages: messageRows });
    } else {
      res.status(404).json({ error: 'User not found' });
    }
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

    // Generate a random color for the user
    const userColor = randomColor();
    userColors[userId] = userColor;

    // Send the user their color
    socket.emit('user-color', { color: userColor });

    socket.on('user-message', async (data) => {
      const { type, message } = data;
      const text = message.text;
      const username = message.name;

      console.log(`User message from ${username}: ${text}`);

      try {
        // Insert the message into Firebase Realtime Database
        await db.ref('messages').push({
          username: username,
          text: text,
          color: userColor,
        });
      } catch (error) {
        console.error('Error saving message to database:', error);
      }

      // Broadcast the message to all connected users
      io.emit('chat-message', {
        username: username,
        text,
        color: userColor,
      });
    });

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.id}`);
      // Remove the user's color when they disconnect
      delete userColors[userId];
    });
  } catch (error) {
    console.error('Error decoding user token:', error);
    socket.disconnect();
  }
});

    server.listen(3000, () => {
  console.log('Server listening on port 3000');
});

