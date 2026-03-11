const DIFFICULTIES = {
  easy: { gridSize: 8, words: 5, hints: 3, time: 180 },
  medium: { gridSize: 10, words: 6, hints: 2, time: 180 },
  hard: { gridSize: 12, words: 8, hints: 1, time: 180 }
};

const DIRECTIONS = [
  { row: 0, col: 1 },
  { row: 0, col: -1 },
  { row: 1, col: 0 },
  { row: -1, col: 0 },
  { row: 1, col: 1 },
  { row: 1, col: -1 },
  { row: -1, col: 1 },
  { row: -1, col: -1 }
];

const WORD_BANK = [
  "VISION", "RETINA", "FOCUS", "OPTIC", "PUPIL", "LENS", "CORNEA", "IRIS",
  "SCAN", "CLARITY", "SHARPNESS", "GLANCE", "TARGET", "PATTERN", "TRACK",
  "SIGNAL", "NEURON", "BALANCE", "MOTION", "MEMORY", "ATTENTION", "ANGLES",
  "THERAPY", "HEALTH", "PRECISION", "REFLEX", "DEPTH", "DETAIL", "FILTER",
  "BRAIN", "SIGHT", "VISUAL", "LASER", "STIMULUS", "MEDICAL"
];

const state = {
  difficulty: "medium",
  gridSize: 10,
  words: [],
  grid: [],
  placements: new Map(),
  foundWords: new Set(),
  selectedCells: [],
  isSelecting: false,
  score: 0,
  comboCount: 1,
  lastFoundAt: 0,
  timeLeft: 180,
  timerId: null,
  hintsLeft: 2,
  previousSignature: ""
};

const elements = {
  particlesCanvas: document.getElementById("particlesCanvas"),
  difficultySelect: document.getElementById("difficultySelect"),
  hintBtn: document.getElementById("hintBtn"),
  newGameBtn: document.getElementById("newGameBtn"),
  retryBtn: document.getElementById("retryBtn"),
  grid: document.getElementById("grid"),
  boardArea: document.getElementById("boardArea"),
  selectionLine: document.getElementById("selectionLine"),
  wordList: document.getElementById("wordList"),
  progressLabel: document.getElementById("progressLabel"),
  selectionPreview: document.getElementById("selectionPreview"),
  scoreValue: document.getElementById("scoreValue"),
  comboValue: document.getElementById("comboValue"),
  timerValue: document.getElementById("timerValue"),
  hintValue: document.getElementById("hintValue"),
  toastMessage: document.getElementById("toastMessage"),
  gameOverModal: document.getElementById("gameOverModal"),
  finalScore: document.getElementById("finalScore"),
  finalWords: document.getElementById("finalWords")
};

let resizeParticles = () => {};

function init() {
  initParticles();
  attachEvents();
  applyDifficulty();
  startGame();
}

function attachEvents() {
  elements.difficultySelect.addEventListener("change", (event) => {
    state.difficulty = event.target.value;
    applyDifficulty();
    startGame();
  });

  elements.newGameBtn.addEventListener("click", startGame);
  elements.retryBtn.addEventListener("click", () => {
    closeGameOver();
    startGame();
  });
  elements.hintBtn.addEventListener("click", useHint);

  elements.grid.addEventListener("pointerdown", (event) => {
    const cell = event.target.closest(".grid-cell");
    if (!cell || state.timeLeft <= 0) {
      return;
    }
    beginSelection(cell);
  });

  elements.grid.addEventListener("pointermove", (event) => {
    if (!state.isSelecting) {
      return;
    }
    const cell = resolveCellFromPoint(event.clientX, event.clientY);
    updateSelection(cell);
  });

  window.addEventListener("pointerup", finishSelection);
  window.addEventListener("pointercancel", finishSelection);
  window.addEventListener("resize", () => {
    resizeParticles();
    if (state.isSelecting && state.selectedCells.length) {
      drawSelectionLine(state.selectedCells[0], state.selectedCells[state.selectedCells.length - 1]);
    }
  });
}

function applyDifficulty() {
  const config = DIFFICULTIES[state.difficulty];
  state.gridSize = config.gridSize;
  state.timeLeft = config.time;
  state.hintsLeft = config.hints;
}

function startGame() {
  resetStateForRound();
  buildPuzzle();
  renderWords();
  renderGrid();
  updateHud();
  startTimer();
}

function resetStateForRound() {
  const config = DIFFICULTIES[state.difficulty];
  stopTimer();
  closeGameOver();
  hideSelectionLine();
  clearToast();
  state.gridSize = config.gridSize;
  state.words = getRoundWords(config.words);
  state.grid = [];
  state.placements = new Map();
  state.foundWords = new Set();
  state.selectedCells = [];
  state.isSelecting = false;
  state.score = 0;
  state.comboCount = 1;
  state.lastFoundAt = 0;
  state.timeLeft = config.time;
  state.hintsLeft = config.hints;
  elements.selectionPreview.textContent = "Drag to select a word";
  elements.grid.style.setProperty("--grid-size", String(state.gridSize));
}

function getRoundWords(count) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const words = shuffle([...WORD_BANK]).filter((word) => word.length <= state.gridSize).slice(0, count);
    const signature = [...words].sort().join("|");
    if (words.length === count && signature !== state.previousSignature) {
      state.previousSignature = signature;
      return words;
    }
  }

  const fallback = shuffle([...WORD_BANK]).filter((word) => word.length <= state.gridSize).slice(0, count);
  state.previousSignature = [...fallback].sort().join("|");
  return fallback;
}

function buildPuzzle() {
  const sortedWords = [...state.words].sort((a, b) => b.length - a.length);

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const grid = createEmptyGrid(state.gridSize);
    const placements = new Map();
    let success = true;

    for (const word of sortedWords) {
      const placement = placeWord(grid, word, state.gridSize);
      if (!placement) {
        success = false;
        break;
      }
      placements.set(word, placement);
    }

    if (success) {
      fillEmptyCells(grid);
      state.grid = grid;
      state.placements = placements;
      return;
    }
  }

  throw new Error("Unable to generate puzzle.");
}

function createEmptyGrid(size) {
  return Array.from({ length: size }, () => Array(size).fill(""));
}

function placeWord(grid, word, size) {
  const attempts = [];

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      for (const direction of DIRECTIONS) {
        attempts.push({ row, col, direction });
      }
    }
  }

  shuffle(attempts);

  for (const attempt of attempts) {
    if (!canPlaceWord(grid, word, attempt.row, attempt.col, attempt.direction, size)) {
      continue;
    }

    const cells = [];
    for (let index = 0; index < word.length; index += 1) {
      const row = attempt.row + attempt.direction.row * index;
      const col = attempt.col + attempt.direction.col * index;
      grid[row][col] = word[index];
      cells.push(`${row}-${col}`);
    }
    return { cells, direction: attempt.direction };
  }

  return null;
}

function canPlaceWord(grid, word, startRow, startCol, direction, size) {
  for (let index = 0; index < word.length; index += 1) {
    const row = startRow + direction.row * index;
    const col = startCol + direction.col * index;

    if (row < 0 || row >= size || col < 0 || col >= size) {
      return false;
    }

    const current = grid[row][col];
    if (current && current !== word[index]) {
      return false;
    }
  }

  return true;
}

function fillEmptyCells(grid) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let row = 0; row < grid.length; row += 1) {
    for (let col = 0; col < grid.length; col += 1) {
      if (!grid[row][col]) {
        grid[row][col] = alphabet[Math.floor(Math.random() * alphabet.length)];
      }
    }
  }
}

function renderWords() {
  elements.wordList.innerHTML = "";
  state.words.forEach((word) => {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "word-pill";
    pill.dataset.word = word;
    pill.textContent = word;
    elements.wordList.appendChild(pill);
  });
}

function renderGrid() {
  elements.grid.innerHTML = "";
  const fragment = document.createDocumentFragment();

  state.grid.forEach((row, rowIndex) => {
    row.forEach((letter, colIndex) => {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "grid-cell";
      cell.dataset.row = String(rowIndex);
      cell.dataset.col = String(colIndex);
      cell.dataset.key = `${rowIndex}-${colIndex}`;
      cell.textContent = letter;
      cell.style.animationDelay = `${(rowIndex * state.gridSize + colIndex) * 9}ms`;
      fragment.appendChild(cell);
    });
  });

  elements.grid.appendChild(fragment);
}

function updateHud() {
  elements.progressLabel.textContent = `${state.foundWords.size} / ${state.words.length} Found`;
  elements.hintValue.textContent = String(state.hintsLeft);
  setAnimatedValue(elements.scoreValue, String(state.score));
  setAnimatedValue(elements.comboValue, `x${state.comboCount}`);
  elements.timerValue.textContent = formatTime(state.timeLeft);
  elements.timerValue.classList.toggle("danger", state.timeLeft <= 10);
}

function setAnimatedValue(element, value) {
  if (element.textContent === value) {
    return;
  }

  element.textContent = value;
  element.classList.remove("bump");
  void element.offsetWidth;
  element.classList.add("bump");
  window.setTimeout(() => element.classList.remove("bump"), 180);
}

function startTimer() {
  stopTimer();
  state.timerId = window.setInterval(() => {
    state.timeLeft -= 1;
    updateHud();

    if (state.timeLeft <= 0) {
      state.timeLeft = 0;
      updateHud();
      handleGameOver();
    }
  }, 1000);
}

function stopTimer() {
  if (state.timerId) {
    window.clearInterval(state.timerId);
    state.timerId = null;
  }
}

function handleGameOver() {
  stopTimer();
  state.isSelecting = false;
  state.selectedCells = [];
  clearTemporarySelection();
  hideSelectionLine();
  elements.selectionPreview.textContent = "Round complete";
  elements.finalScore.textContent = String(state.score);
  elements.finalWords.textContent = `${state.foundWords.size} / ${state.words.length}`;
  elements.gameOverModal.classList.add("open");
  elements.gameOverModal.setAttribute("aria-hidden", "false");
}

function closeGameOver() {
  elements.gameOverModal.classList.remove("open");
  elements.gameOverModal.setAttribute("aria-hidden", "true");
}

function beginSelection(cell) {
  clearTemporarySelection();
  state.selectedCells = [cell];
  state.isSelecting = true;
  cell.classList.add("selected");
  drawSelectionLine(cell, cell);
  updateSelectionPreview();
}

function updateSelection(cell) {
  if (!cell) {
    return;
  }

  const startCell = state.selectedCells[0];
  const path = getLinearPath(startCell, cell);
  if (!path.length) {
    return;
  }

  clearTemporarySelection();
  state.selectedCells = path;
  state.selectedCells.forEach((pathCell) => pathCell.classList.add("selected"));
  drawSelectionLine(startCell, path[path.length - 1]);
  updateSelectionPreview();
}

function finishSelection() {
  if (!state.isSelecting) {
    return;
  }

  const candidate = state.selectedCells.map((cell) => cell.textContent).join("");
  const reversed = [...candidate].reverse().join("");
  const match = state.words.find((word) => word === candidate || word === reversed);

  if (match && validateSelection(match, state.selectedCells)) {
    if (state.foundWords.has(match)) {
      showToast(`${match} already found`);
      clearTemporarySelection();
    } else {
      markWordFound(match);
    }
  } else {
    clearTemporarySelection();
  }

  state.isSelecting = false;
  state.selectedCells = [];
  hideSelectionLine();
  updateSelectionPreview();
}

function getLinearPath(startCell, endCell) {
  const startRow = Number(startCell.dataset.row);
  const startCol = Number(startCell.dataset.col);
  const endRow = Number(endCell.dataset.row);
  const endCol = Number(endCell.dataset.col);
  const rowDelta = endRow - startRow;
  const colDelta = endCol - startCol;
  const stepRow = Math.sign(rowDelta);
  const stepCol = Math.sign(colDelta);
  const isHorizontal = rowDelta === 0 && colDelta !== 0;
  const isVertical = colDelta === 0 && rowDelta !== 0;
  const isDiagonal = Math.abs(rowDelta) === Math.abs(colDelta) && rowDelta !== 0;
  const isSingle = rowDelta === 0 && colDelta === 0;

  if (!(isHorizontal || isVertical || isDiagonal || isSingle)) {
    return [];
  }

  const steps = Math.max(Math.abs(rowDelta), Math.abs(colDelta));
  const path = [];

  for (let index = 0; index <= steps; index += 1) {
    const row = startRow + stepRow * index;
    const col = startCol + stepCol * index;
    const cell = getCell(row, col);
    if (!cell) {
      return [];
    }
    path.push(cell);
  }

  return path;
}

function getCell(row, col) {
  return elements.grid.querySelector(`[data-key="${row}-${col}"]`);
}

function validateSelection(word, selectedCells) {
  const placement = state.placements.get(word);
  if (!placement || placement.cells.length !== selectedCells.length) {
    return false;
  }

  const selectedKeys = selectedCells.map((cell) => cell.dataset.key);
  const forward = placement.cells.every((cellKey, index) => cellKey === selectedKeys[index]);
  const reverse = [...placement.cells].reverse().every((cellKey, index) => cellKey === selectedKeys[index]);
  return forward || reverse;
}

function markWordFound(word) {
  const now = Date.now();
  const quickChain = now - state.lastFoundAt <= 4500;
  state.comboCount = quickChain ? Math.min(state.comboCount + 1, 4) : 1;
  state.lastFoundAt = now;

  let points = 10;
  if (state.comboCount >= 2) {
    points += 5 * (state.comboCount - 1);
    showToast(`Combo x${state.comboCount}! +${points}`);
  } else {
    showToast(`Found ${word} +10`);
  }

  state.score += points;
  state.foundWords.add(word);

  const placement = state.placements.get(word);
  placement.cells.forEach((cellKey) => {
    const cell = elements.grid.querySelector(`[data-key="${cellKey}"]`);
    if (cell) {
      cell.classList.remove("selected");
      cell.classList.add("found", "explode");
      window.setTimeout(() => cell.classList.remove("explode"), 440);
    }
  });

  const pill = elements.wordList.querySelector(`[data-word="${word}"]`);
  if (pill) {
    pill.classList.add("found");
  }

  updateHud();

  if (state.foundWords.size === state.words.length) {
    stopTimer();
    showToast("Board cleared. New challenge loaded.");
    window.setTimeout(startGame, 1200);
  }
}

function useHint() {
  if (state.hintsLeft <= 0 || state.timeLeft <= 0) {
    showToast("No hints available.");
    return;
  }

  const remaining = state.words.filter((word) => !state.foundWords.has(word));
  if (!remaining.length) {
    return;
  }

  const word = remaining[Math.floor(Math.random() * remaining.length)];
  const placement = state.placements.get(word);
  const firstCell = elements.grid.querySelector(`[data-key="${placement.cells[0]}"]`);

  state.hintsLeft -= 1;
  updateHud();
  showToast(`Hint: starts with ${word[0]}`);

  if (firstCell) {
    firstCell.classList.add("hint");
    window.setTimeout(() => firstCell.classList.remove("hint"), 1600);
  }
}

function updateSelectionPreview() {
  const current = state.selectedCells.map((cell) => cell.textContent).join("");
  elements.selectionPreview.textContent = current || "Drag to select a word";
}

function clearTemporarySelection() {
  elements.grid.querySelectorAll(".grid-cell.selected").forEach((cell) => {
    cell.classList.remove("selected");
  });
}

function drawSelectionLine(startCell, endCell) {
  const boardRect = elements.boardArea.getBoundingClientRect();
  const startRect = startCell.getBoundingClientRect();
  const endRect = endCell.getBoundingClientRect();
  const x1 = startRect.left + startRect.width / 2 - boardRect.left;
  const y1 = startRect.top + startRect.height / 2 - boardRect.top;
  const x2 = endRect.left + endRect.width / 2 - boardRect.left;
  const y2 = endRect.top + endRect.height / 2 - boardRect.top;
  const length = Math.hypot(x2 - x1, y2 - y1);
  const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;

  elements.selectionLine.style.left = `${x1}px`;
  elements.selectionLine.style.top = `${y1 - 4}px`;
  elements.selectionLine.style.width = `${length}px`;
  elements.selectionLine.style.transform = `rotate(${angle}deg)`;
  elements.selectionLine.style.opacity = "1";
}

function hideSelectionLine() {
  elements.selectionLine.style.opacity = "0";
  elements.selectionLine.style.width = "0px";
}

function resolveCellFromPoint(clientX, clientY) {
  const target = document.elementFromPoint(clientX, clientY);
  return target?.closest(".grid-cell") || null;
}

function showToast(message) {
  elements.toastMessage.textContent = message;
  elements.toastMessage.classList.add("show");
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    elements.toastMessage.classList.remove("show");
  }, 1800);
}

function clearToast() {
  elements.toastMessage.classList.remove("show");
}

function formatTime(totalSeconds) {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function shuffle(array) {
  for (let index = array.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [array[index], array[swapIndex]] = [array[swapIndex], array[index]];
  }
  return array;
}

function initParticles() {
  const canvas = elements.particlesCanvas;
  const context = canvas.getContext("2d");
  const particles = [];
  const particleCount = 36;

  function seedParticles() {
    particles.length = 0;
    for (let index = 0; index < particleCount; index += 1) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        radius: Math.random() * 2.4 + 0.8,
        speedX: (Math.random() - 0.5) * 0.18,
        speedY: (Math.random() - 0.5) * 0.18,
        alpha: Math.random() * 0.6 + 0.15
      });
    }
  }

  function render() {
    context.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach((particle) => {
      particle.x += particle.speedX;
      particle.y += particle.speedY;

      if (particle.x < 0) particle.x = canvas.width;
      if (particle.x > canvas.width) particle.x = 0;
      if (particle.y < 0) particle.y = canvas.height;
      if (particle.y > canvas.height) particle.y = 0;

      context.beginPath();
      context.fillStyle = `rgba(69, 208, 213, ${particle.alpha})`;
      context.shadowBlur = 16;
      context.shadowColor = "rgba(69, 208, 213, 0.35)";
      context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      context.fill();
    });

    window.requestAnimationFrame(render);
  }

  resizeParticles = function resizeParticlesImpl() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    seedParticles();
  };

  resizeParticles();
  render();
}

init();
