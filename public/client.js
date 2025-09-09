let role = null;
let path = null;
let blindCursor = null;
let mouseListenerAdded = false;
let measuring = false;
let lastAccuracy = null;
let currentRoom = null;
let MAX_ACCEPT_DISTANCE = 40;
let pathSamplePoints = null;
let pathVisited = null;
const PATH_SAMPLES = 300;

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

const measureOverlay = document.createElement('div');
measureOverlay.id = 'measure-overlay';
Object.assign(measureOverlay.style, {
	position: 'fixed',
	right: '20px',
	top: '20px',
	padding: '8px 12px',
	background: 'rgba(0,0,0,0.6)',
	color: '#fff',
	borderRadius: '8px',
	fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto',
	fontSize: '1rem',
	zIndex: 9998,
	pointerEvents: 'none',
	display: 'none',
});
document.body.appendChild(measureOverlay);

const holdHint = document.createElement('div');
holdHint.id = 'hold-hint';
holdHint.textContent = 'Hold mouse button to measure accuracy';
Object.assign(holdHint.style, {
	position: 'fixed',
	left: '50%',
	top: '12px',
	transform: 'translateX(-50%)',
	padding: '6px 10px',
	background: 'rgba(0,0,0,0.45)',
	color: '#fff',
	borderRadius: '8px',
	fontSize: '0.9rem',
	zIndex: 9998,
	pointerEvents: 'none',
	display: 'none'
});
document.body.appendChild(holdHint);

joinBtn.addEventListener('click', () => {
	const name = nameInput.value.trim();
	const roomCode = roomInput.value.trim();
    if (!roomCode) return;
    currentRoom = roomCode;
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

	if (role === 'Blind') {
		if (!path || path.length === 0) {
			initGame();
		} else {
			drawBlindView();
		}
	}
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
	if (serverPath) {
		path = serverPath.map(pt => ({ x: pt.x * gameCanvas.width, y: pt.y * gameCanvas.height }));
	}
	roomDiv.style.display = "none";
	gameDiv.style.display = "flex";

	if (data.difficulty) {
		showToast(`Difficulty Level ${data.difficulty}`, 2000);
	}

	if (role === 'Blind') {
		if (path && path.length) drawBlindView();
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

socket.on('blindAccuracy', ({ playerId, accuracy }) => {
	showToast(`${playerId === socket.id ? 'You' : 'Blind'} scored ${(accuracy*100).toFixed(0)}%`, 2600);
});

socket.on('levelUp', ({ difficulty, path: serverPath }) => {
	setTimeout(() => {
		showToast(`Difficulty Level ${difficulty}`, 2000);

		path = serverPath.map(pt => ({
			x: pt.x * gameCanvas.width,
			y: pt.y * gameCanvas.height
		}));

		initGame();
	}, 2000);
});

socket.on("pathData", (normalizedPath) => {
	if (!normalizedPath) return;
	path = normalizedPath.map(pt => ({ x: pt.x * gameCanvas.width, y: pt.y * gameCanvas.height }));
    pathSamplePoints = sampleFullPath(path, PATH_SAMPLES);
    pathVisited = new Array(pathSamplePoints.length).fill(false);
	drawGuideView();
	drawBlindView();
});

socket.on("cursorUpdate", (pos) => {
	if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') {
		blindCursor = null;
	} else {
		blindCursor = {
			x: pos.x * gameCanvas.width,
			y: pos.y * gameCanvas.height,
			active: true
		};
	}
	if (role === 'Guide') drawGuideView();
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

socket.on('accuracyResult', ({ room, accuracy }) => { // this doesnt work but oh well
	const roomCode = socket.data.room || room;
	if (!roomCode || !rooms[roomCode]) return;

	// sanitize accuracy
	const acc = typeof accuracy === 'number' ? Math.max(0, Math.min(1, accuracy)) : 0;

	// broadcast final accuracy to room so both clients can show it
	io.to(roomCode).emit('blindAccuracy', { playerId: socket.id, accuracy: acc });

	const PASS_THRESHOLD = 0.8;

	if (acc >= PASS_THRESHOLD) {
		setTimeout(() => {
			const room = rooms[roomCode];
			if (!room) return;
			// notify and fucking nuke the players out of the room
			room.players.forEach(p => {
				const s = io.sockets.sockets.get(p.id);
				if (s) {
					try {
						s.emit('gameEnded', { reason: 'Completed the path' });
						s.disconnect(true);
					} catch (e) { /* ignore because why not */ }
				}
			});
			delete rooms[roomCode];
		}, 800);
	} else {
		io.to(roomCode).emit('gameIncomplete', {
			playerId: socket.id,
			accuracy: acc,
			required: PASS_THRESHOLD
		});
	}
});

socket.on('gameIncomplete', ({ playerId, accuracy, required }) => {
	const who = playerId === socket.id ? 'You' : 'Blind';
	showToast(`${who} scored ${(accuracy*100).toFixed(0)}% — need ${(required*100).toFixed(0)}% to finish`, 3500);
	if (role === 'Blind') {
		pathVisited = new Array(pathSamplePoints ? pathSamplePoints.length : PATH_SAMPLES).fill(false);
		lastAccuracy = null;
		measureOverlay.style.display = 'none';
		holdHint.style.display = 'block';
	}
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
	ctx.setTransform(1, 0, 0, 1, 0, 0);
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
	ctx.lineWidth = scaleForCanvas(6);
	ctx.lineJoin = "round";
	ctx.lineCap = "round";
	ctx.shadowColor = "rgba(30,150,255,0.18)";
	ctx.shadowBlur = scaleForCanvas(8);
	ctx.beginPath();
	ctx.moveTo(points[0].x, points[0].y);
	for (let b of beziers) ctx.bezierCurveTo(b.cp1.x, b.cp1.y, b.cp2.x, b.cp2.y, b.to.x, b.to.y);
	ctx.stroke();
	ctx.restore();

	ctx.save();
	ctx.globalAlpha = 0.28;
	ctx.strokeStyle = "rgba(255,255,255,0.06)";
	ctx.lineWidth = scaleForCanvas(18);
	ctx.beginPath();
	ctx.moveTo(points[0].x, points[0].y);
	for (let b of beziers) ctx.bezierCurveTo(b.cp1.x, b.cp1.y, b.cp2.x, b.cp2.y, b.to.x, b.to.y);
	ctx.stroke();
	ctx.restore();
}

function drawCursor(ctx, x, y, angle = 0, color = "#FF6B6B") {
	const size = scaleForCanvas(12);
	ctx.save();
	ctx.translate(x, y);
	ctx.rotate(angle);
	ctx.shadowColor = "rgba(255,90,90,0.55)";
	ctx.shadowBlur = scaleForCanvas(6);
	ctx.fillStyle = color;
	ctx.beginPath();
	ctx.moveTo(0, -size);
	ctx.lineTo(size * 0.9, size);
	ctx.lineTo(0, size * 0.5);
	ctx.lineTo(-size * 0.9, size);
	ctx.closePath();
	ctx.fill();
	ctx.strokeStyle = "rgba(255,255,255,0.12)";
	ctx.lineWidth = 1;
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
	document.body.offsetHeight;

	setupHiDPICanvas(gameCanvas, ctx);
	clearCanvasBackground();

    MAX_ACCEPT_DISTANCE = Math.max(40, Math.min(gameCanvas.width, gameCanvas.height) * 0.08);

	if (role === "Guide") {
		socket.emit("requestPath");
	}
	if (!mouseListenerAdded) {
        mouseListenerAdded = true;

        gameCanvas.addEventListener('mousemove', (e) => {
            const rect = gameCanvas.getBoundingClientRect();
            const pos = {
                x: (e.clientX - rect.left) / rect.width,
                y: (e.clientY - rect.top) / rect.height
            };
            const pixelPos = { x: pos.x * gameCanvas.width, y: pos.y * gameCanvas.height };

            if (role === "Blind") {
                const posToSend = (Number.isFinite(pos.x) && Number.isFinite(pos.y)) ? pos : null;
                socket.emit("cursorMove", posToSend);
                blindCursor = pos;

                if (measuring && pathSamplePoints && pathSamplePoints.length) {
                    let nearestIdx = -1;
                    let bestSq = Infinity;
                    for (let i = 0; i < pathSamplePoints.length; i++) {
                        const dx = pathSamplePoints[i].x - pixelPos.x;
                        const dy = pathSamplePoints[i].y - pixelPos.y;
                        const dsq = dx*dx + dy*dy;
                        if (dsq < bestSq) {
                            bestSq = dsq;
                            nearestIdx = i;
                        }
                    }
                    const thr = MAX_ACCEPT_DISTANCE;
                    if (bestSq <= thr*thr) {
                        const radius = Math.max(1, Math.round(pathSamplePoints.length * 0.01));
                        const start = Math.max(0, nearestIdx - radius);
                        const end = Math.min(pathSamplePoints.length - 1, nearestIdx + radius);
                        for (let k = start; k <= end; k++) pathVisited[k] = true;
                    }
                    const visitedCount = pathVisited.reduce((s, v) => s + (v ? 1 : 0), 0);
                    const provisional = visitedCount / pathVisited.length;
                    lastAccuracy = provisional;
                    measureOverlay.style.display = 'block';
                    measureOverlay.textContent = `Accuracy: ${(provisional * 100).toFixed(0)}%`;
                }
                drawBlindView();
            } else {
                blindCursor = pos;
                drawGuideView();
            }
        });

        gameCanvas.addEventListener('mousedown', (e) => {
            if (role !== 'Blind' || gameDiv.style.display !== 'flex') return;
            measuring = true;
            lastAccuracy = null;
            measureOverlay.style.display = 'block';
            holdHint.style.display = 'none';
        });

        window.addEventListener('mouseup', (e) => {
           if (!measuring) return;
            measuring = false;
            let finalAccuracy = 0;
            if (pathVisited && pathVisited.length) {
                const visitedCount = pathVisited.reduce((s, v) => s + (v ? 1 : 0), 0);
                finalAccuracy = visitedCount / pathVisited.length;
            } else if (lastAccuracy != null) {
                finalAccuracy = lastAccuracy;
            } else {
                finalAccuracy = 0;
            }
            lastAccuracy = finalAccuracy;
            measureOverlay.textContent = `Final: ${(finalAccuracy * 100).toFixed(0)}%`;
            const room = currentRoom;
            socket.emit('accuracyResult', { room: room || null, accuracy: finalAccuracy });
            pathVisited = new Array(pathSamplePoints ? pathSamplePoints.length : PATH_SAMPLES).fill(false);
            if (gameDiv.style.display === 'flex') {
                setTimeout(() => {
                    measureOverlay.style.display = 'none';
                    if (role === 'Blind') holdHint.style.display = 'block';
                }, 1300);
            }
        });

        gameCanvas.addEventListener('mouseleave', () => {
            if (role === 'Blind') {
                socket.emit('cursorMove', null);
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
		drawStartMarker(ctx, path[0]);
	}
	if (blindCursor && blindCursor.active) {
		const px = blindCursor.x;
		const py = blindCursor.y;
		const angle = path && path.length > 1 ? findTangentAngleOnPath(path, 0.5) + Math.PI / 2 : 0;
		drawCursor(ctx, px, py, angle, "#FF6B6B");
	}
}

function drawBlindView() {
	setupHiDPICanvas(gameCanvas, ctx);
	clearCanvasBackground();

	if (path && path.length) drawStartMarker(ctx, path[0]);
}

function drawStartMarker(ctx, pt) {
	if (!pt) return;
	const outerR = scaleForCanvas(28);
	const innerR = scaleForCanvas(18);
	const centerR = scaleForCanvas(6);
	ctx.save();
	ctx.globalAlpha = 0.95;
	ctx.beginPath();
	ctx.fillStyle = 'rgba(60,160,255,0.12)';
	ctx.arc(pt.x, pt.y, outerR, 0, Math.PI * 2);
	ctx.fill();
	ctx.beginPath();
	ctx.fillStyle = 'rgba(60,160,255,0.28)';
	ctx.arc(pt.x, pt.y, innerR, 0, Math.PI * 2);
	ctx.fill();
	ctx.beginPath();
	ctx.fillStyle = '#7FD1FF';
	ctx.arc(pt.x, pt.y, centerR, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = 'rgba(255,255,255,0.95)';
	ctx.font = `${Math.max(10, Math.round(12 * Math.min(gameCanvas.width / 1600, gameCanvas.height / 900)))}px National Park, system-ui, sans-serif`;
	ctx.textAlign = 'center';
	ctx.fillText('START', pt.x, pt.y - outerR - 8);
	ctx.restore();
}

function computeAccuracyForPixelPos(pixelPos, pixelPath) {
	const beziers = catmullRom2bezier(pixelPath);
	let bestDistSq = Infinity;

	function sampleBezierDistSq(b) {
		const STEPS = 48;
		for (let i = 0; i <= STEPS; i++) {
			const t = i / STEPS;
			const mt = 1 - t;
			const x = mt*mt*mt*b.from.x + 3*mt*mt*t*b.cp1.x + 3*mt*t*t*b.cp2.x + t*t*t*b.to.x;
			const y = mt*mt*mt*b.from.y + 3*mt*mt*t*b.cp1.y + 3*mt*t*t*b.cp2.y + t*t*t*b.to.y;
			const dx = x - pixelPos.x;
			const dy = y - pixelPos.y;
			const dsq = dx * dx + dy * dy;
			if (dsq < bestDistSq) bestDistSq = dsq;
		}
	}

	for (let b of beziers) sampleBezierDistSq(b);

	const dist = Math.sqrt(bestDistSq || 0);
	const raw = 1 - (dist / Math.max(1, MAX_ACCEPT_DISTANCE));
	return Math.max(0, Math.min(1, raw));
}

function scaleForCanvas(v) {
	const ref = Math.min(gameCanvas.width, gameCanvas.height);
	return Math.max(1, Math.round((v / 900) * ref * 3));
}

function sampleFullPath(points, samples = PATH_SAMPLES) {
	if (!points || points.length < 2) return [];
	const beziers = catmullRom2bezier(points);
	const pts = [];
	const segCount = beziers.length;
	if (segCount === 0) return pts;
	for (let i = 0; i < segCount; i++) {
		const b = beziers[i];
		const segSamples = Math.max(1, Math.floor(samples / segCount));
		for (let s = 0; s < segSamples; s++) {
			const t = s / segSamples;
			const mt = 1 - t;
			const x = mt*mt*mt*b.from.x + 3*mt*mt*t*b.cp1.x + 3*mt*t*t*b.cp2.x + t*t*t*b.to.x;
			const y = mt*mt*mt*b.from.y + 3*mt*mt*t*b.cp1.y + 3*mt*t*t*b.cp2.y + t*t*t*b.to.y;
			pts.push({ x, y });
		}
	}
	const last = beziers[beziers.length - 1];
	if (last) pts.push({ x: last.to.x, y: last.to.y });
	if (pts.length > samples) return pts.slice(0, samples);
	while (pts.length < samples) pts.push(pts[pts.length - 1]);
	return pts;
}