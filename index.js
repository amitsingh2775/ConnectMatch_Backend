const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { redisClient, publisher, preferenceSubscriber, messageSubscriber } = require("./redisClient");
const setupSocketHandlers = require("./socketHandlers");
const createSubscriberForPreference = require("./preferenceSubscriber");
require('dotenv').config();
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
  cors: { 
    origin: "https://connectmatch.vercel.app",
    methods: ["GET", "POST"],
    credentials: true 
  },
  pingInterval: 60000,
  pingTimeout: 20000,
});

const port = process.env.PORT || 3000;

app.use(cors({
  origin: "https://connectmatch.vercel.app",
  methods: ["GET", "POST"],
  credentials: true,
}));
app.use(express.json());
app.get("/", (req, res) => res.send("Redis-based chat server is running!"));

io.on("connection", (socket) => {
  setupSocketHandlers(io, socket, redisClient);
});

// Setup message and reaction subscribers
(async () => {
  messageSubscriber.pSubscribe("chat-room:*", async (message, channel) => {
    const chatEvent = JSON.parse(message);
    io.to(chatEvent.roomID).emit("receive_message", {
      sender: chatEvent.sender,
      message: chatEvent.message,
      timestamp: chatEvent.timestamp || new Date(),
      id: chatEvent.id,
      reactions: chatEvent.reactions || {},
    });

    await redisClient.rPush(`messages:${chatEvent.roomID}`, JSON.stringify(chatEvent));
    await redisClient.lTrim(`messages:${chatEvent.roomID}`, -100, -1);
  });

  messageSubscriber.pSubscribe("reaction:*", async (message, channel) => {
    const reactionEvent = JSON.parse(message);
    io.to(reactionEvent.roomId).emit("reaction_added", {
      messageId: reactionEvent.messageId,
      emoji: reactionEvent.emoji,
      reactions: reactionEvent.reactions,
    });
  });
})();

["Coding", "Science", "Music", "Jobs"].forEach((preference) => {
  createSubscriberForPreference(preference, io, redisClient);
});

server.listen(port, () => console.log(`Server running on http://localhost:${port}`));
