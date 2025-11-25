const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const scoreAEl = document.getElementById('scoreA');
const scoreBEl = document.getElementById('scoreB');
const statusEl = document.getElementById('status');
const resetBtn = document.getElementById('resetBtn');

const W = canvas.width, H = canvas.height;

// Campo e gols
const field = {
  margin: 40,
  centerCircleR: 60,
  goalWidth: 140,
  goalDepth: 18
};

// Física (ajustada para “peso” estilo Haxball)
const DT = 1/60;
const PLAYER_FRICTION = 0.990;
const BALL_FRICTION = 0.996;     // bola “escorrega” mas sem ser hiper sensível
const RESTITUTION = 0.30;        // quanto da velocidade é “devolvida” em colisões passivas
const MAX_SPEED = 330;           // velocidade máx. jogadores
const ACC = 900;                 // aceleração base
const SPRINT_SPEED = 420;        // opcional: sprint mantendo Haxball-like
const PLAYER_MASS = 1.8;
const BALL_MASS = 2.4;

// Chute
const KICK_RADIUS = 32;          // distância máxima para chute
const KICK_POWER = 560;          // força do chute
const KICK_COOLDOWN = 280;       // ms entre chutes
const KICK_ANGLE_HELP = 0.35;    // ajuda a direcionar levemente ao gol/movimento

// Entidades
function makePlayer(x, y, color, name) {
  return {
    x, y,
    vx: 0, vy: 0,
    r: 18,
    color,
    name,
    lastKick: 0
  };
}
function makeBall() {
  return { x: W/2, y: H/2, vx: 0, vy: 0, r: 10, color: '#f1f5f9' };
}

let pA = makePlayer(W/2 - 160, H/2, '#3b82f6', 'Azul');
let pB = makePlayer(W/2 + 160, H/2, '#ef4444', 'Vermelho');
let ball = makeBall();

let scoreA = 0, scoreB = 0;

// Input
const keys = new Set();
window.addEventListener('keydown', e => keys.add(e.code));
window.addEventListener('keyup', e => keys.delete(e.code));

resetBtn.addEventListener('click', resetGame);

function resetGame() {
  scoreA = 0; scoreB = 0;
  scoreAEl.textContent = scoreA;
  scoreBEl.textContent = scoreB;
  respawn(true);
  statusEl.textContent = 'Pronto';
}

// Controle de jogador
function controlPlayer(p, up, left, down, right, kickKey) {
  let ax = 0, ay = 0;
  if (keys.has(up)) ay -= ACC;
  if (keys.has(down)) ay += ACC;
  if (keys.has(left)) ax -= ACC;
  if (keys.has(right)) ax += ACC;

  p.vx += ax * DT;
  p.vy += ay * DT;

  // Limitador de velocidade
  const v = Math.hypot(p.vx, p.vy);
  const max = MAX_SPEED;
  if (v > max) {
    const s = max / v;
    p.vx *= s; p.vy *= s;
  }

  // Atrito
  p.vx *= PLAYER_FRICTION;
  p.vy *= PLAYER_FRICTION;

  // Movimento
  p.x += p.vx * DT;
  p.y += p.vy * DT;

  // Limites
  const m = field.margin;
  const top = m, bottom = H - m;
  if (p.x - p.r < m) { p.x = m + p.r; p.vx = -p.vx * RESTITUTION; }
  if (p.x + p.r > W - m) { p.x = W - m - p.r; p.vx = -p.vx * RESTITUTION; }
  if (p.y - p.r < top) { p.y = top + p.r; p.vy = -p.vy * RESTITUTION; }
  if (p.y + p.r > bottom) { p.y = bottom - p.r; p.vy = -p.vy * RESTITUTION; }

  // Chute
  if (keys.has(kickKey)) tryKick(p);
}

// Chute estilo Haxball
function tryKick(p) {
  const now = performance.now();
  if (now - p.lastKick < KICK_COOLDOWN) return;

  const dx = ball.x - p.x, dy = ball.y - p.y;
  const dist = Math.hypot(dx, dy);
  if (dist > KICK_RADIUS + ball.r) return;

  // Direção do chute: mistura vetor para a bola e vetor de movimento do jogador
  let ndx = dx/dist, ndy = dy/dist;
  const pv = Math.hypot(p.vx, p.vy);
  if (pv > 20) {
    const mvx = p.vx / pv, mvy = p.vy / pv;
    ndx = normalizeX(ndx * (1 - KICK_ANGLE_HELP) + mvx * KICK_ANGLE_HELP);
    ndy = normalizeY(ndy * (1 - KICK_ANGLE_HELP) + mvy * KICK_ANGLE_HELP);
  }

  // Impulso
  const impulse = KICK_POWER;
  ball.vx += ndx * impulse / BALL_MASS;
  ball.vy += ndy * impulse / BALL_MASS;

  // Leve recuo do jogador (sensação de impacto)
  p.vx -= ndx * (impulse * 0.25) / PLAYER_MASS;
  p.vy -= ndy * (impulse * 0.25) / PLAYER_MASS;

  p.lastKick = now;
  flashStatus(`Chute do ${p.name}!`);
}

function normalizeX(x){ return x / Math.hypot(x, 1e-9); }
function normalizeY(y){ return y / Math.hypot(1e-9, y); }

// Colisão com massa (jogadores/bola)
function collideDiscs(a, b, mA, mB) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  const minDist = a.r + b.r;
  if (dist <= 0 || dist >= minDist) return;

  const nx = dx / dist, ny = dy / dist;
  const overlap = minDist - dist;

  // Separação proporcional à massa (mais leve se afasta mais)
  const totalMass = mA + mB;
  const sepA = overlap * (mB / totalMass);
  const sepB = overlap * (mA / totalMass);
  a.x -= nx * sepA; a.y -= ny * sepA;
  b.x += nx * sepB; b.y += ny * sepB;

  // Impulso ao longo da normal (restituição baixa para bola menos sensível)
  const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
  const velAlongNormal = rvx * nx + rvy * ny;

  // Se afastando, não aplica
  if (velAlongNormal > 0) return;

  const e = RESTITUTION; // coeficiente de restituição
  const j = -(1 + e) * velAlongNormal / (1/mA + 1/mB);

  const ix = j * nx, iy = j * ny;
  a.vx -= ix / mA; a.vy -= iy / mA;
  b.vx += ix / mB; b.vy += iy / mB;
}

// Bola
function updateBall() {
  ball.vx *= BALL_FRICTION;
  ball.vy *= BALL_FRICTION;
  ball.x += ball.vx * DT;
  ball.y += ball.vy * DT;

  const m = field.margin;
  const goalHalf = field.goalWidth / 2;

  // Bordas superior/inferior
  if (ball.y - ball.r < m) { ball.y = m + ball.r; ball.vy = -ball.vy * RESTITUTION; }
  if (ball.y + ball.r > H - m) { ball.y = H - m - ball.r; ball.vy = -ball.vy * RESTITUTION; }

  // Laterais e checagem de gol
  if (ball.x - ball.r < m) {
    const cy = H/2;
    if (Math.abs(ball.y - cy) <= goalHalf) {
      scoreB++; scoreBEl.textContent = scoreB;
      flashStatus('Gol do Vermelho!');
      respawn(false);
      return;
    } else {
      ball.x = m + ball.r; ball.vx = -ball.vx * RESTITUTION;
    }
  }
  if (ball.x + ball.r > W - m) {
    const cy = H/2;
    if (Math.abs(ball.y - cy) <= goalHalf) {
      scoreA++; scoreAEl.textContent = scoreA;
      flashStatus('Gol do Azul!');
      respawn(true);
      return;
    } else {
      ball.x = W - m - ball.r; ball.vx = -ball.vx * RESTITUTION;
    }
  }
}

// Respawn após gol
function respawn(kickLeft) {
  ball = makeBall();
  pA = makePlayer(W/2 - 160, H/2, '#3b82f6', 'Azul');
  pB = makePlayer(W/2 + 160, H/2, '#ef4444', 'Vermelho');
  // Kickoff leve
  ball.vx = kickLeft ? -220 / BALL_MASS : 220 / BALL_MASS;
  ball.vy = 0;
}

// HUD
function flashStatus(text) {
  statusEl.textContent = text;
  clearTimeout(flashStatus._t);
  flashStatus._t = setTimeout(() => statusEl.textContent = 'Pronto', 1200);
}

// Renderização do campo
function drawField() {
  ctx.clearRect(0,0,W,H);

  const m = field.margin;
  ctx.strokeStyle = '#e6f2e6';
  ctx.lineWidth = 2;

  // Retângulo de jogo
  ctx.strokeRect(m, m, W - 2*m, H - 2*m);

  // Linha do meio
  ctx.beginPath();
  ctx.moveTo(W/2, m);
  ctx.lineTo(W/2, H - m);
  ctx.stroke();

  // Círculo central
  ctx.beginPath();
  ctx.arc(W/2, H/2, field.centerCircleR, 0, Math.PI*2);
  ctx.stroke();

  // Aberturas de gol
  const goalHalf = field.goalWidth/2;
  // Esquerda
  ctx.beginPath();
  ctx.moveTo(m, H/2 - goalHalf);
  ctx.lineTo(m, m);
  ctx.moveTo(m, H - m);
  ctx.lineTo(m, H/2 + goalHalf);
  ctx.stroke();
  // Direita
  ctx.beginPath();
  ctx.moveTo(W - m, H/2 - goalHalf);
  ctx.lineTo(W - m, m);
  ctx.moveTo(W - m, H - m);
  ctx.lineTo(W - m, H/2 + goalHalf);
  ctx.stroke();

  // Traves internas
  ctx.fillStyle = '#dbeafe';
  ctx.fillRect(m - field.goalDepth, H/2 - goalHalf, field.goalDepth, field.goalWidth);
  ctx.fillRect(W - m, H/2 - goalHalf, field.goalDepth, field.goalWidth);
}

// Desenhar entidades
function drawCircle(x,y,r,color,stroke='#00000030') {
  ctx.beginPath();
  ctx.arc(x,y,r,0,Math.PI*2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 3;
  ctx.stroke();
}

function render() {
  drawField();
  // Sombra simples para sensação de profundidade
  ctx.save();
  ctx.globalAlpha = 0.9;
  drawCircle(ball.x, ball.y, ball.r, '#f1f5f9');
  drawCircle(pA.x, pA.y, pA.r, '#3b82f6');
  drawCircle(pB.x, pB.y, pB.r, '#ef4444');
  ctx.restore();
}

// Loop principal
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000); // clamp por segurança
  last = now;

  // Controles
  controlPlayer(pA, 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space');
  controlPlayer(pB, 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'ShiftRight');

  // Colisões (massa diferente para bola e jogadores)
  collideDiscs(pA, pB, PLAYER_MASS, PLAYER_MASS);
  collideDiscs(pA, ball, PLAYER_MASS, BALL_MASS);
  collideDiscs(pB, ball, PLAYER_MASS, BALL_MASS);

  // Atualiza bola
  updateBall();

  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
