const socket = io();
const joinBtn = document.getElementById('joinBtn');
const nameInput = document.getElementById('nameInput');
const roomInput = document.getElementById('roomInput');
const statusEl = document.getElementById('status');
const playersEl = document.getElementById('players');
const startBtn = document.getElementById('startBtn');

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

socket.on("joinFailed", (reason) => {
    showToast(reason);
});

socket.on("roleAssigned", (role) => {
    lobbyDiv.style.display = "none";
    roomDiv.style.display = "flex";
    statusEl.textContent = `You are the ${role}`;
    statusEl.innerHTML = `You are the <b>${role}</b>`;
});

// holy shit revamped code for player name update
socket.on("playerJoined", (data) => {
    renderPlayers(data.players);
    if (data.players.length >= 2) {startBtn.style.display = 'block'} else {startBtn.style.display = 'none'};
});

socket.on("playerLeft", (data) => {
    renderPlayers(data.players);
    if (data.players.length >= 2) {startBtn.style.display = 'block'} else {startBtn.style.display = 'none'};
});

startBtn.addEventListener('click', () => {
    socket.emit("startGame");
});

socket.on("startGame", () => {
    roomDiv.style.display = "none";
    gameDiv.style.display = "flex";
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

function initGame() {
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, gameCanvas.width, gameCanvas.height);

    ctx.fillStyle = "white";
    ctx.font = "32px National Park";
    ctx.fillText("Game Started!", 300, 300);
}

function renderPlayers(players) {
    playersEl.innerHTML = "";
    const header = document.createElement('div');
    header.textContent = `Players in room (${players.length}):`;
    playersEl.appendChild(header);

    const list = document.createElement("ul");
    players.forEach(name => {
        const li = document.createElement("li");
        li.textContent = name;
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