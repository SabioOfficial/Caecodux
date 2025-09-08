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

    socket.on("joinRoom", (roomCode, name) => {
        if (!name.trim()) {
            socket.emit("joinFailed", "Enter a name");
            return;
        }

        // prevents multi joining and wondering what the fuck is going on
        if (socket.data.room) {
            socket.emit("joinFailed", "You're already in a room");
            return;
        }

        // initialize room with players + inGame flag || THIS IS A CRY FOR HELP
        if (!rooms[roomCode]) rooms[roomCode] = { players: [], inGame: false };
        const room = rooms[roomCode];

        // please dont join mid-game. not that ur able to anyways lmao
        if (room.inGame) {
            socket.emit("joinFailed", "The room is closed");
            return;
        }

        // max 2 players ok i know you dont have friends though so this will never happen
        if (room.players.length >= 2) {
            socket.emit("joinFailed", "The room is full");
            return;
        }

        // add player with name :shocked:
        const player = { id: socket.id, name: name || `Player-${socket.id.slice(0, 4)}` };
        room.players.push(player);

        socket.join(roomCode);
        socket.data.room = roomCode;
        socket.data.name = player.name;

        // DELETE THAT DAMN ROLE ASSIGNMENT CODE 🗣️🗣️🗣️
        assignRoles(roomCode);

        // send updated list of names
        const playerNames = room.players.map(p => p.name);
        io.to(roomCode).emit("playerJoined", { players: playerNames });
    });

    socket.on("startGame", () => {
        const roomCode = socket.data.room;
        if (!roomCode || !rooms[roomCode]) return;

        const room = rooms[roomCode];
        if (room.players.length === 2) {
            room.inGame = true;
            io.to(roomCode).emit("startGame");
        }
    });

    // oops this wasnt supposed to be nested in the joinRoom socket
    socket.on("disconnect", () => {
        console.log(socket.id, "disconnected");

        // 2nd fix to my stupid logica
        const roomCode = socket.data.room;
        if (!roomCode || !rooms[roomCode]) return;

        // fuck you new logic
        const room = rooms[roomCode];
        room.players = room.players.filter(p => p.id !== socket.id);

        if (room.players.length === 0) { // fixes my stupid logic
            delete rooms[roomCode];
        } else {
            if (room.inGame) {
                io.to(roomCode).emit("gameEnded", { reason: "A player disconnected" });
                room.players.forEach(p => {
                    const s = io.sockets.sockets.get(p.id);
                    if (s) {
                        s.data.room = null;
                    }
                });
                delete rooms[roomCode];
            } else {
                const playerNames = room.players.map(p => p.name);
                // oops i forgot to actually use playerNames
                io.to(roomCode).emit("playerLeft", { players: playerNames });
                assignRoles(roomCode);
            }
        }
    });
});

function assignRoles(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;

    room.players.forEach((player, index) => {
        const role = index === 0 ? "Guide" : "Blind";
        const s = io.sockets.sockets.get(player.id);
        if (s) {
            s.emit("roleAssigned", role);
        }
    });
}

// to localhost this shit of a website
httpServer.listen(3000, () => {
    console.log("Server running at http://localhost:3000");
});