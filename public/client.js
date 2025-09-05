const socket = io();
const joinBtn = document.getElementById('joinBtn');
const roomInput = document.getElementById('roomInput');
const statusEl = document.getElementById('status');
const playersEl = document.getElementById('players');

joinBtn.addEventListener('click', () => {
    const roomCode = roomInput.value.trim();
    if (roomCode) { // please don't crash my server pookie
        socket.emit("joinRoom", roomCode);
    }
});

socket.on("roomFull", () => {
    statusEl.innerText = "❌ Room is full. Try another code.";
});

socket.on("roleAssigned", (role) => {
    statusEl.innerText = `✅ You are the ${role}`;
});

socket.on("playerJoined", (data) => {
    playersEl.innerText = `Players in room: ${data.players}`;
});

socket.on("playerLeft", (count) => {
    playersEl.innerText = `Players in room: ${count}`;
});