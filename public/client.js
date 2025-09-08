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
	if (roomCode) {
		socket.emit("joinRoom", roomCode, name);
	}
});

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
	statusEl.innerHTML = `You are the <b>${r}</b>`;
	roleDisplay.textContent = r;
});

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
		if (serverPath) {
			path = serverPath.map(pt => ({ x: pt.x * gameCanvas.width, y: pt.y * gameCanvas.height }));
		}
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
	path = normalizedPath.map(pt => ({ x: pt.x * gameCanvas.width, y: pt.y * gameCanvas.height }));
	if (role === "Guide") drawGuideView();
});

socket.on("cursorUpdate", (pos) => {
	blindCursor = {
		x: pos.x * gameCanvas.width,
		y: pos.y * gameCanvas.height
	};
	if (role === 'Guide') drawGuideView();
});

function showToast(message, duration = 1500) {
	const toastContainer = document.getElementById('toast-container') || (() => {
		const c = document.createElement('div');
		c.id = 'toast-container';
		Object.assign(c.style, {
			position: 'fixed',
			top: '1rem',
			right: '1rem',
			display: 'flex',
			flexDirection: 'column',
			gap: '0.5rem',
			zIndex: '9999'
		});
		document.body.appendChild(c);
		return c;
	})();
	const toast = document.createElement('div');
	toast.className = 'toast';
	toast.textContent = message;
	toastContainer.appendChild(toast);
	toast.style.animationDuration = `${duration}ms`;
	setTimeout(() => toast.remove(), duration);
	return toast;
}

function renderPlayers(players, ownerId) {
	playersEl.innerHTML = "";
	const header = document.createElement('div');
	header.textContent = `Players in room (${players.length}):`;
	playersEl.appendChild(header);
	const list = document.createElement("ul");
	players.forEach(player => {
		const li = document.createElement("li");
		li.textContent = player.name + (player.id === ownerId ? " 👑" : "");
		list.appendChild(li);
	});
	playersEl.appendChild(list);
}

function setupHiDPICanvas(canvas, ctx) {
	const dpr = window.devicePixelRatio || 1;
	const rect = canvas.getBoundingClientRect();
	canvas.width = Math.max(1, Math.floor(rect.width * dpr));
	canvas.height = Math.max(1, Math.floor(rect.height * dpr));
	canvas.style.width = rect.width + "px";
	canvas.style.height = rect.height + "px";
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function catmullRom2bezier(points) {
	if (!points || points.length < 2) return [];
	const beziers = [];
	for (let i = 0; i < points.length - 1; i++) {
		const p0 = i > 0 ? points[i - 1] : points[i];
		const p1 = points[i];
		const p2 = points[i + 1];
		const p3 = i + 2 < points.length ? points[i + 2] : p2;
		const cp1x = p1.x + (p2.x - p0.x) / 6;
		const cp1y = p1.y + (p2.y - p0.y) / 6;
		const cp2x = p2.x - (p3.x - p1.x) / 6;
		const cp2y = p2.y - (p3.y - p1.y) / 6;
		beziers.push({
			from: p1,
			cp1: { x: cp1x, y: cp1y },
			cp2: { x: cp2x, y: cp2y },
			to: p2
		});
	}
	return beziers;
}

function drawSmoothPath(ctx, points) {
	if (!points || points.length < 2) return;
	const beziers = catmullRom2bezier(points);
	ctx.save();
	ctx.globalAlpha = 0.95;
	const grad = ctx.createLinearGradient(points[0].x, points[0].y, points[points.length - 1].x, points[points.length - 1].y);
	grad.addColorStop(0, "rgba(255,255,255,0.98)");
	grad.addColorStop(0.5, "rgba(180,220,255,0.92)");
	grad.addColorStop(1, "rgba(140,190,255,0.88)");
	ctx.strokeStyle = grad;
	ctx.lineWidth = 6;
	ctx.lineJoin = "round";
	ctx.lineCap = "round";
	ctx.shadowColor = "rgba(30,150,255,0.18)";
	ctx.shadowBlur = 18;
	ctx.beginPath();
	ctx.moveTo(points[0].x, points[0].y);
	for (let b of beziers) {
		ctx.bezierCurveTo(b.cp1.x, b.cp1.y, b.cp2.x, b.cp2.y, b.to.x, b.to.y);
	}
	ctx.stroke();
	ctx.restore();
	ctx.save();
	ctx.globalAlpha = 0.28;
	ctx.strokeStyle = "rgba(255,255,255,0.06)";
	ctx.lineWidth = 20;
	ctx.beginPath();
	ctx.moveTo(points[0].x, points[0].y);
	for (let b of beziers) {
		ctx.bezierCurveTo(b.cp1.x, b.cp1.y, b.cp2.x, b.cp2.y, b.to.x, b.to.y);
	}
	ctx.stroke();
	ctx.restore();
}

function drawCursor(ctx, x, y, angle = 0, color = "#FF6B6B") {
	ctx.save();
	ctx.translate(x, y);
	ctx.rotate(angle);
	ctx.globalCompositeOperation = "source-over";
	ctx.shadowColor = "rgba(255,90,90,0.55)";
	ctx.shadowBlur = 16;
	ctx.fillStyle = color;
	ctx.beginPath();
	ctx.moveTo(0, -12);
	ctx.lineTo(10, 10);
	ctx.lineTo(0, 6);
	ctx.lineTo(-10, 10);
	ctx.closePath();
	ctx.fill();
	ctx.restore();
	ctx.save();
	ctx.translate(x, y);
	ctx.rotate(angle);
	ctx.strokeStyle = "rgba(255,255,255,0.14)";
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(0, -12);
	ctx.lineTo(10, 10);
	ctx.lineTo(0, 6);
	ctx.lineTo(-10, 10);
	ctx.closePath();
	ctx.stroke();
	ctx.restore();
}

function findTangentAngleOnPath(points, t = 0) {
	if (!points || points.length < 2) return 0;
	const total = points.length - 1;
	const idx = Math.min(total - 1, Math.max(0, Math.floor(t * total)));
	const a = points[idx];
	const b = points[idx + 1] || a;
	return Math.atan2(b.y - a.y, b.x - a.x);
}

function clearCanvasBackground() {
	ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
	const grd = ctx.createLinearGradient(0, 0, gameCanvas.width, gameCanvas.height);
	grd.addColorStop(0, "rgba(0,0,0,0.14)");
	grd.addColorStop(1, "rgba(0,0,0,0.26)");
	ctx.fillStyle = grd;
	ctx.fillRect(0, 0, gameCanvas.width, gameCanvas.height);
}

function initGame() {
	initGameCanvas();
}

function initGameCanvas() {
	setupHiDPICanvas(gameCanvas, ctx);
	clearCanvasBackground();
	if (role === "Guide") {
		socket.emit("requestPath");
	}
	if (!mouseListenerAdded) {
		mouseListenerAdded = true;
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
	if (role === "Guide") {
		drawGuideView();
	} else {
		drawBlindView();
	}
}

function drawGuideView() {
	setupHiDPICanvas(gameCanvas, ctx);
	clearCanvasBackground();
	if (role === "Guide" && path && path.length > 0) {
		drawSmoothPath(ctx, path);
	}
	if (blindCursor) {
		const px = blindCursor.x;
		const py = blindCursor.y;
		const angle = path && path.length > 1 ? findTangentAngleOnPath(path, 0.5) : 0;
		drawCursor(ctx, px, py, angle, "#FF6B6B");
	}
}

function drawBlindView() {
	setupHiDPICanvas(gameCanvas, ctx);
	clearCanvasBackground();
	if (blindCursor) {
		const px = blindCursor.x;
		const py = blindCursor.y;
		drawCursor(ctx, px, py, 0, "#FF6B6B");
	}
	if (path && path.length > 1) {
		ctx.save();
		ctx.globalAlpha = 0.06;
		drawSmoothPath(ctx, path);
		ctx.restore();
	}
}