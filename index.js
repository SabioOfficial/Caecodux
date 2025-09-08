const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

app.use(express.static("public"));

const BASE_W = 1600;
const BASE_H = 900;
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
        if (!rooms[roomCode]) rooms[roomCode] = { players: [], inGame: false, owner: null };
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

        if (!room.owner) {
            room.owner = socket.id;
            socket.emit("youAreOwner");
        }

        // DELETE THAT DAMN ROLE ASSIGNMENT CODE 🗣️🗣️🗣️
        assignRoles(roomCode);

        // send updated list of names
        io.to(roomCode).emit("playerJoined", { players: room.players, owner: room.owner });
    });

    socket.on("startGame", () => {
        const roomCode = socket.data.room;
        if (!roomCode || !rooms[roomCode]) return;
        const room = rooms[roomCode];

        if (room.owner !== socket.id) {
            socket.emit("startFailed", "Lack of permissions (403)");
            return;
        }

        if (room.players.length === 2) {
            room.inGame = true;
            assignRoles(roomCode);
            io.to(roomCode).emit("startGame", { path: room.path || null });
        }
    });

    socket.on("requestPath", () => {
        const roomCode = socket.data.room;
        if (!roomCode || !rooms[roomCode]) return;
        const room = rooms[roomCode];

        if (socket.data.role === "Guide") {
            const raw = generatePath(BASE_W, BASE_H);
            const normalized = raw.map(p => ({ x: p.x / BASE_W, y: p.y / BASE_H }));
            room.path = normalized;
            socket.emit("pathData", normalized);
        }
    });

    socket.on("cursorMove", (pos) => {
        const roomCode = socket.data.room;
        if (!roomCode) return;

        const room = rooms[roomCode];
        if (!room) return;

        room.players.forEach(p => {
            if (p.id !== socket.id) {
                const s = io.sockets.sockets.get(p.id);
                if (s) s.emit("cursorUpdate", pos);
            }
        });
    });

    function generatePath(width, height) {
        const numPoints = 8;
        const margin = 50;
        const points = [];

        for (let i = 0; i < numPoints; i++) {
            points.push({
                x: Math.floor(
                    margin + Math.random() * (width - margin * 2)
                ),
                y: Math.floor(
                    margin + (i / (numPoints - 1)) * (height - margin * 2)
                )
            });
        }

        return points;
    }

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
                // refresh "who's the owner"
                if (room.owner === socket.id) {
                    room.owner = room.players[0].id;
                    const newOwner = io.sockets.sockets.get(room.owner);
                    if (newOwner) newOwner.emit("youAreOwner");
                }

                io.to(roomCode).emit("playerJoined", { players: room.players, owner: room.owner });

                // asign roles
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
            s.data.role = role;
            s.emit("roleAssigned", role);
        }
    });
}

// to localhost this shit of a website
httpServer.listen(3000, () => {
    console.log("Server running at http://localhost:3000");
});