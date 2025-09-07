const socket = io();
const joinBtn = document.getElementById('joinBtn');
const roomInput = document.getElementById('roomInput');
const statusEl = document.getElementById('status');
const playersEl = document.getElementById('players');

const lobbyDiv = document.querySelector('.lobby-div');
const roomDiv = document.querySelector('.room-div');

roomDiv.style.display = 'none';

joinBtn.addEventListener('click', () => {
    const roomCode = roomInput.value.trim();
    if (roomCode) { // please don't crash my server pookie
        socket.emit("joinRoom", roomCode);
    }
});

socket.on("roomFull", () => {
    statusEl.innerText = "❌ Room is full. Try another code.";
    lobbyDiv.style.display = "block";
    roomDiv.style.display = "none";
});

socket.on("roleAssigned", (role) => {
    lobbyDiv.style.display = "none";
    roomDiv.style.display = "block";
    statusEl.textContent = `You are the ${role}`;
    statusEl.innerHTML = `You are the <b>${role}</b>`;
});

socket.on("playerJoined", (data) => {
    playersEl.innerText = `Players in room: ${data.players}`;
});

socket.on("playerLeft", (count) => {
    playersEl.innerText = `Players in room: ${count}`;
});