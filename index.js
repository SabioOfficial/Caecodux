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
        // prevents multi joining and wondering what the fuck is going on
        if (socket.data.room) {
            socket.emit("alreadyInRoom", socket.data.room);
            return;
        }

        if (!rooms[roomCode]) rooms[roomCode] = [];

        // max 2 players ok i know you dont have friends though so this will never happen
        if (rooms[roomCode].length >= 2) {
            socket.emit("roomFull");
            return;
        }

        // prevent duplicate socket ids
        if (!rooms[roomCode].includes(socket.id)) {
            rooms[roomCode].push(socket.id);
        }

        socket.join(roomCode);
        // 2nd fix to my stupid logica
        socket.data.room = roomCode;

        // role assignment
        const role = rooms[roomCode].length === 1 ? "Guide" : "Blind";
        socket.emit("roleAssigned", role);

        // notify the room !!
        io.to(roomCode).emit("playerJoined", {
            room: roomCode,
            players: rooms[roomCode].length,
        });
    });

    // oops this wasnt supposed to be nested in the joinRoom socket
    socket.on("disconnect", () => {
        console.log(socket.id, "disconnected");

        // 2nd fix to my stupid logica
        const roomCode = socket.data.room;
        if (!roomCode || !rooms[roomCode]) return;

        rooms[roomCode] = rooms[roomCode].filter((id) => id !== socket.id);

        if (rooms[roomCode].length === 0) { // fixes my stupid logic
            delete rooms[roomCode];
        } else {
            io.to(roomCode).emit("playerLeft", rooms[roomCode].length);
        }
    });
});

httpServer.listen(3000, () => {
    console.log("Server running at http://localhost:3000");
});