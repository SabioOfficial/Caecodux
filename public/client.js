const socket = io();
const joinBtn = document.getElementById('joinBtn');
const nameInput = document.getElementById('nameInput');
const roomInput = document.getElementById('roomInput');
const joinStatus = document.getElementById('joinStatus');
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
joinStatus.style.visibility = 'hidden';

joinBtn.addEventListener('click', () => {
    const name = nameInput.value.trim();
    const roomCode = roomInput.value.trim();
    if (roomCode) { // please don't crash my server pookie
        socket.emit("joinRoom", roomCode, name);
    }
});

socket.on("roomFull", () => {
    renderJoinStatus("Room Full");
    lobbyDiv.style.display = "flex";
    roomDiv.style.display = "none";
});

socket.on("roomInProgress", () => {
    renderJoinStatus("Game already in progress");
    lobbyDiv.style.display = "flex";
    roomDiv.style.display = "none";
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
    alert(reason || "Game ended");

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

function renderJoinStatus(text) { // i dont know why this took so much lines but it works (I DONT CARE THE SHAKING ANIMATION DOESNT WORK FUCK YOU)
    if (!joinStatus) {
        console.warn("renderJoinStatus: joinStatus element not found");
        return;
    }

    joinStatus.innerText = text;
    joinStatus.style.visibility = 'visible';

    // remove previous animation classes so we can restart the animations without fucking the entire rendering
    joinStatus.classList.remove('horizontal-shaking', 'red-flash');
    // idk how this shit worked by ok
    void joinStatus.offsetWidth;

    let expectedCount = 0;
    let endedCount = 0;

    function handleEnd(e) {
        // ignore animation events from children :heavysob:
        if (e.target !== joinStatus) return;

        endedCount++;
        if (endedCount >= expectedCount) {
            // cleanup
            joinStatus.classList.remove('horizontal-shaking', 'red-flash');
            joinStatus.removeEventListener('animationend', handleEnd);
        }
    }

    // add listener first to avoid shit breaking
    joinStatus.addEventListener('animationend', handleEnd);

    // trigger the animations omg
    joinStatus.classList.add('horizontal-shaking', 'red-flash');

    // i love frames
    requestAnimationFrame(() => {
        const computed = getComputedStyle(joinStatus);
        expectedCount = computed.animationName
            .split(',')
            .map(s => s.trim())
            .filter(n => n && n !== 'none')
            .length;

        // fallback 💀
        if (expectedCount === 0) {
            setTimeout(() => {
                joinStatus.classList.remove('horizontal-shaking', 'red-flash');
                joinStatus.removeEventListener('animationend', handleEnd);
            }, 800);
        }
    });
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