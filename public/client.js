let role = null;
let path = null;
let blindCursor = null;
let mouseListenerAdded = false;

const socket = io();
const joinBtn = document.getElementById('joinBtn');
const nameInput = document.getElementById('nameInput');
const roomInput = document.getElementById('roomInput');
const statusEl = document.getElementById('status');
const playersEl = document.getElementById('players');
const startBtn = document.getElementById('startBtn');
const roleDisplay = document.getElementById('roleDisplay');

const lobbyDiv = document.querySelector('.lobby-div');
const roomDiv = document.querySelector('.room-div');
const gameDiv = document.querySelector('.game-div');
const gameCanvas = document.getElementById('gameCanvas');
const ctx = gameCanvas.getContext("2d");

roomDiv.style.display = 'none';
gameDiv.style.display = 'none';

joinBtn.addEventListener('click', () => {
    const name = nameInput.value.trim();
    const roomCode = roomInput.value.trim();
    if (roomCode) { // please don't crash my server pookie
        socket.emit("joinRoom", roomCode, name);
    }
});

// normalize everything into this shitty socket... emitter... thingy. whatever you call it
socket.on("joinFailed", (reason) => {
    showToast(reason);
});

socket.on("youAreOwner", () => {
    startBtn.style.display = 'block';
});

socket.on("roleAssigned", (r) => {
    role = r;
    lobbyDiv.style.display = "none";
    roomDiv.style.display = "flex";
    statusEl.textContent = `You are the ${r}`;
    statusEl.innerHTML = `You are the <b>${r}</b>`;
    roleDisplay.textContent = r;
});

// holy shit revamped code for player name update
socket.on("playerJoined", (data) => {
    renderPlayers(data.players, data.owner);
});

socket.on("playerLeft", (data) => {
    renderPlayers(data.players, data.owner);
});

startBtn.addEventListener('click', () => {
    socket.emit("startGame");
});

socket.on("startGame", (data = {}) => {
    const serverPath = data.path;
    roomDiv.style.display = "none";
    gameDiv.style.display = "flex";

    if (role === "Guide") {
        path = serverPath;
    }

    initGame();
});

socket.on("gameEnded", ({ reason }) => {
    showToast(reason || "Game ended", 5000);

    gameDiv.style.display = "none";
    roomDiv.style.display = "none";
    lobbyDiv.style.display = "flex";

    playersEl.innerHTML = "";
    statusEl.textContent = "Not connected";

    socket.data = {};
});

socket.on("pathData", (normalizedPath) => {
    path = normalizedPath.map(pt => ({
        x: pt.x * gameCanvas.width,
        y: pt.y * gameCanvas.height
    }));
    if (role === "Guide") drawGuideView();
});

socket.on("cursorUpdate", (pos) => {
    blindCursor = {
        x: pos.x * gameCanvas.width,
        y: pos.y * gameCanvas.height
    };
    if (role === 'Guide') drawGuideView();
});

function initGame() {
    initGameCanvas();
}

function initGameCanvas() {
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, gameCanvas.width, gameCanvas.height);

    if (role === "Guide") {
        socket.emit("requestPath");
    }

    gameCanvas.addEventListener("mousemove", (e) => {
        const rect = gameCanvas.getBoundingClientRect();
        const pos = {
            x: (e.clientX - rect.left) / rect.width,
            y: (e.clientY - rect.top) / rect.height
        };

        if (role === "Blind") {
            socket.emit("cursorMove", pos);
            blindCursor = pos;
            drawBlindView();
        }
    });
}

function drawGuideView() {
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, gameCanvas.width, gameCanvas.height);

    if (role === "Guide" && path) {
        ctx.strokeStyle = "white";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) {
            ctx.lineTo(path[i].x, path[i].y);
        }
        ctx.stroke();
    }

    if (blindCursor) {
        ctx.fillStyle = "red";
        ctx.beginPath();
        ctx.arc(blindCursor.x, blindCursor.y, 8, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawBlindView() {
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, gameCanvas.width, gameCanvas.height);

    if (blindCursor) {
        ctx.fillStyle = "red";
        ctx.beginPath();
        ctx.arc(blindCursor.x, blindCursor.y, 8, 0, Math.PI * 2);
        ctx.fill();
    }
}

function renderPlayers(players, ownerId) {
    playersEl.innerHTML = "";
    const header = document.createElement('div');
    header.textContent = `Players in room (${players.length}):`;
    playersEl.appendChild(header);

    const list = document.createElement("ul");
    players.forEach(player => {
        const li = document.createElement("li");
        li.textContent = player.name;
        if (player.id === ownerId) {
            li.textContent += " 👑";
        }
        list.appendChild(li);
    });
    playersEl.appendChild(list);
}

// borrowed this from client of making
const toastContainer = document.createElement('div');
toastContainer.id = 'toast-container';
Object.assign(toastContainer.style, {
    position: 'fixed',
    top: '1rem',
    right: '1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    zIndex: '9999'
});
document.body.appendChild(toastContainer);

function showToast(message, duration = 1500) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toastContainer.appendChild(toast);
    toast.style.animationDuration = `${duration}ms`;
    setTimeout(() => toast.remove(), duration);
    return toast;
}