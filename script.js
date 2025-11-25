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

// Física
const DT = 1/60;
const FRICTION = 0.992;       // atrito geral
const SPRING_K = 0.75;        // restituição colisão
const BALL_FRICTION = 0.994;  // bola desliza mais
const MAX_SPEED = 320;        // px/s jogadores
const SPRINT_SPEED = 420;     // sprint
const ACC = 900;              // aceleração

// Entidades
function makePlayer(x, y, color) {
  return {
    x, y,
    vx: 0, vy: 0,
    r: 18,
    color,
    sprint: false,
    name: color === '#3b82f6' ? 'Azul' : 'Vermelho'
  };
}
function makeBall() {
  return { x: W/2, y: H/2, vx: 0, vy: 0, r: 10, color: '#f1f5f9' };
}

let pA = makePlayer(W/2 - 160, H/2, '#3b82f6');
let pB = makePlayer(W/2 + 160, H/2, '#ef4444');
let ball = makeBall();

let scoreA = 0, scoreB = 0;

// Input
const keys = new Set();
window.addEventListener('keydown', e => {
  keys.add(e.code);
  if (e.code === 'ShiftLeft') pA.sprint = true;
  if (e.code === 'ControlRight') pB.sprint = true;
});
window.addEventListener('keyup', e => {
  keys.delete(e.code);
  if (e.code === 'ShiftLeft') pA.sprint = false;
  if (e.code === 'ControlRight') pB.sprint = false;
});

resetBtn.addEventListener('click', resetGame);

function resetGame() {
  scoreA = 0; scoreB = 0;
  scoreAEl.textContent = scoreA;
  scoreBEl.textContent = scoreB;
  respawn(true);
  statusEl.textContent = 'Pronto';
}

// Lógica de movimento jogador
function controlPlayer(p, up, left, down, right) {
  let ax = 0, ay = 0;
  if (keys.has(up)) ay -= ACC;
  if (keys.has(down)) ay += ACC;
  if (keys.has(left)) ax -= ACC;
  if (keys.has(right)) ax += ACC;

  p.vx += ax * DT;
  p.vy += ay * DT;

  const max = p.sprint ? SPRINT_SPEED : MAX_SPEED;
  const v = Math.hypot(p.vx, p.vy);
  if (v > max) {
    const s = max / v;
    p.vx *= s; p.vy *= s;
  }

  p.vx *= FRICTION;
  p.vy *= FRICTION;

  p.x += p.vx * DT;
  p.y += p.vy * DT;

  // Limites do campo (com margens)
  const m = field.margin;
  if (p.x - p.r < m) { p.x = m + p.r; p.vx = -p.vx * SPRING_K; }
  if (p.x + p.r > W - m) { p.x = W - m - p.r; p.vx = -p.vx * SPRING_K; }
  // áreas de gol: permitir entrar um pouco, mas não sair do canvas
  const top = m, bottom = H - m;
  if (p.y - p.r < top) { p.y = top + p.r; p.vy = -p.vy * SPRING_K; }
  if (p.y + p.r > bottom) { p.y = bottom - p.r; p.vy = -p.vy * SPRING_K; }
}

// Colisão círculo-círculo
function collide(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  const minDist = a.r + b.r;
  if (dist <= 0 || dist >= minDist) return;
  const nx = dx / dist, ny = dy / dist;
  const overlap = minDist - dist;
  const sep = overlap / 2;
  a.x -= nx * sep; a.y -= ny * sep;
  b.x += nx * sep; b.y += ny * sep;

  // Transferência simples de velocidade (impulso)
  const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
  const velAlongNormal = rvx * nx + rvy * ny;
  const impulse = velAlongNormal * SPRING_K;
  a.vx += impulse * nx; a.vy += impulse * ny;
  b.vx -= impulse * nx; b.vy -= impulse * ny;
}

// Bola
function updateBall() {
  ball.vx *= BALL_FRICTION;
  ball.vy *= BALL_FRICTION;
  ball.x += ball.vx * DT;
  ball.y += ball.vy * DT;

  const m = field.margin;
  // Laterais (não considerar gol)
  const goalHalf = field.goalWidth / 2;

  // Limites superior/inferior
  if (ball.y - ball.r < m) { ball.y = m + ball.r; ball.vy = -ball.vy * SPRING_K; }
  if (ball.y + ball.r > H - m) { ball.y = H - m - ball.r; ball.vy = -ball.vy * SPRING_K; }

  // Checagem de gol (esquerda/direita)
  if (ball.x - ball.r < m) {
    const cy = H/2;
    if (Math.abs(ball.y - cy) <= goalHalf) {
      // Gol para Vermelho (lado esquerdo é gol do Azul sofrido)
      scoreB++; scoreBEl.textContent = scoreB;
      flashStatus('Gol do Vermelho!');
      respawn(false);
      return;
    } else {
      ball.x = m + ball.r; ball.vx = -ball.vx * SPRING_K;
    }
  }
  if (ball.x + ball.r > W - m) {
    const cy = H/2;
    if (Math.abs(ball.y - cy) <= goalHalf) {
      // Gol para Azul
      scoreA++; scoreAEl.textContent = scoreA;
      flashStatus('Gol do Azul!');
      respawn(true);
      return;
    } else {
      ball.x = W - m - ball.r; ball.vx = -ball.vx * SPRING_K;
    }
  }
}

// Respawn após gol
function respawn(kickLeft) {
  ball = makeBall();
  pA = makePlayer(W/2 - 160, H/2, '#3b82f6');
  pB = makePlayer(W/2 + 160, H/2, '#ef4444');
  // Bola recebe pequeno impulso na direção do time que vai sair
  ball.vx = kickLeft ? -180 : 180;
  ball.vy = 0;
}

// HUD
function flashStatus(text) {
  statusEl.textContent = text;
  setTimeout(() => statusEl.textContent = 'Pronto', 1200);
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

  // Área do gol (aberturas)
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

  // Marcação das traves (parte dentro)
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
  drawCircle(ball.x, ball.y, ball.r, '#f1f5f9');
  drawCircle(pA.x, pA.y, pA.r, '#3b82f6');
  drawCircle(pB.x, pB.y, pB.r, '#ef4444');
}

// Loop principal
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;

  // Controles
  controlPlayer(pA, 'KeyW', 'KeyA', 'KeyS', 'KeyD');
  controlPlayer(pB, 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight');

  // Colisões
  collide(pA, pB);
  collide(pA, ball);
  collide(pB, ball);

  // Atualiza bola
  updateBall();

  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
