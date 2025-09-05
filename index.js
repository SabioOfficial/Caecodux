const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

app.use(express.static("public"));

const rooms = {};

io.on("connection", (socket) => {
    console.log("New client:", socket.id);

    socket.on("joinRoom", (roomCode) => {
        if (!rooms[roomCode]) rooms[roomCode] = [];

        if (rooms[roomCode].length >= 2) {
            socket.emit("roomFull");
            return;
        }

        rooms[roomCode].push(socket.id);
        socket.join(roomCode);

        // role assignment
        const role = rooms[roomCode].length === 1 ? "Guide" : "Blind";
        socket.emit("roleAssigned", role);

        // notify the room !!
        io.to(roomCode).emit("playerJoined", {
            room: roomCode,
            players: rooms[roomCode].length,
        });

        socket.on("disconnect", () => {
            console.log(socket.id, "disconnected");
            rooms[roomCode] = rooms[roomCode].filter((id) => id !== socket.id);
            if (rooms[roomCode].length === 0) delete rooms[roomCode];
            io.to(roomCode).emit("playerLeft", rooms[roomCode].length);
        });
    });
});

httpServer.listen(3000, () => {
    console.log("Server running at http://localhost:3000");
});