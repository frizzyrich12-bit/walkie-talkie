const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const MAX_USERS = 7;
const rooms = {};
const COLORS = ["#FF6B6B","#FFD93D","#6BCB77","#4D96FF","#FF922B","#CC5DE8","#20C997"];

app.use(express.static(path.join(__dirname)));

io.on("connection", (socket) => {
  socket.on("join-room", ({ roomId, userName }) => {
    leaveCurrentRoom(socket);
    if (!rooms[roomId]) rooms[roomId] = { users: new Map() };
    const room = rooms[roomId];
    if (room.users.size >= MAX_USERS) { socket.emit("room-full"); return; }
    const usedColors = [...room.users.values()].map(u => u.color);
    const color = COLORS.find(c => !usedColors.includes(c)) || COLORS[0];
    room.users.set(socket.id, { name: userName, color, socketId: socket.id });
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.emit("room-joined", { users: [...room.users.values()], yourId: socket.id });
    socket.to(roomId).emit("user-joined", { socketId: socket.id, name: userName, color });
  });

  socket.on("offer", ({ to, offer }) => io.to(to).emit("offer", { from: socket.id, offer }));
  socket.on("answer", ({ to, answer }) => io.to(to).emit("answer", { from: socket.id, answer }));
  socket.on("ice-candidate", ({ to, candidate }) => io.to(to).emit("ice-candidate", { from: socket.id, candidate }));

  socket.on("ptt-start", () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const user = rooms[roomId]?.users.get(socket.id);
    socket.to(roomId).emit("user-talking", { socketId: socket.id, name: user?.name });
  });

  socket.on("ptt-stop", () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    socket.to(roomId).emit("user-silent", { socketId: socket.id });
  });

  socket.on("disconnect", () => leaveCurrentRoom(socket));
});

function leaveCurrentRoom(socket) {
  const roomId = socket.data.roomId;
  if (!roomId || !rooms[roomId]) return;
  rooms[roomId].users.delete(socket.id);
  socket.to(roomId).emit("user-left", { socketId: socket.id });
  socket.leave(roomId);
  if (rooms[roomId].users.size === 0) delete rooms[roomId];
  socket.data.roomId = null;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Walkie-Talkie running on port ${PORT}`));
