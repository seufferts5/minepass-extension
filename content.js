// MinePass - Content Script
// Detects login forms, injects overlay, runs Minesweeper challenge

(function () {
  'use strict';

  if (window.__minepassInjected) return;
  window.__minepassInjected = true;

  // ── Form detection ──────────────────────────────────────────────────────────

  function findLoginForms() {
    const pwFields = Array.from(document.querySelectorAll('input[type="password"]'))
      .filter(el => el.offsetParent !== null); // visible only
    return pwFields;
  }

  function injectButtons() {
    const pwFields = findLoginForms();
    pwFields.forEach(pw => {
      if (pw.dataset.minepassInjected) return;
      pw.dataset.minepassInjected = 'true';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'minepass-trigger-btn';
      btn.innerHTML = '&#128163; MinePass';
      btn.title = 'Autofill with MinePass';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openOverlay(pw);
      });

      // Insert after the password field
      if (pw.parentNode) {
        pw.insertAdjacentElement('afterend', btn);
      }
    });
  }

  // Watch for dynamically added forms (SPAs)
  const observer = new MutationObserver(() => injectButtons());
  observer.observe(document.body, { childList: true, subtree: true });

  // Initial scan after DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectButtons);
  } else {
    injectButtons();
  }

  // ── Overlay lifecycle ───────────────────────────────────────────────────────

  let currentPwField = null;

  function openOverlay(pwField) {
    if (document.getElementById('minepass-overlay')) return;
    currentPwField = pwField;

    const overlay = document.createElement('div');
    overlay.id = 'minepass-overlay';
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeOverlay();
    });

    const modal = document.createElement('div');
    modal.id = 'minepass-modal';

    const closeBtn = document.createElement('span');
    closeBtn.id = 'minepass-close';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', closeOverlay);

    const title = document.createElement('h2');
    title.textContent = '💣 MinePass';

    const subtitle = document.createElement('span');
    subtitle.className = 'mp-subtitle';
    subtitle.textContent = 'Win Minesweeper to unlock your password';

    modal.appendChild(closeBtn);
    modal.appendChild(title);
    modal.appendChild(subtitle);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Check session status then proceed
    browser.runtime.sendMessage({ type: 'GET_SESSION_STATUS' }).then(({ unlocked }) => {
      if (!unlocked) {
        showLockedMessage(modal);
      } else {
        startChallenge(modal);
      }
    });
  }

  function closeOverlay() {
    const overlay = document.getElementById('minepass-overlay');
    if (overlay) overlay.remove();
    currentPwField = null;
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  }

  function showLockedMessage(modal) {
    const msg = document.createElement('span');
    msg.id = 'minepass-message';
    msg.className = 'info';
    msg.innerHTML = '🔒 MinePass is locked.<br>Click the extension icon in your toolbar to unlock with your master password first.';
    modal.appendChild(msg);
  }

  // ── Minesweeper ─────────────────────────────────────────────────────────────

  const ROWS = 9, COLS = 9, MINES = 10;

  let board = [];
  let gameState = 'idle'; // idle | playing | won | lost
  let minesLeft = MINES;
  let timerInterval = null;
  let elapsedSeconds = 0;
  let firstClick = true;

  function startChallenge(modal) {
    // Status bar
    const statusBar = document.createElement('div');
    statusBar.id = 'minepass-status-bar';

    const mineCounter = document.createElement('span');
    mineCounter.id = 'minepass-mine-count';
    mineCounter.textContent = '💣 ' + MINES;

    const resetBtn = document.createElement('span');
    resetBtn.id = 'minepass-reset-btn';
    resetBtn.textContent = '😐';
    resetBtn.title = 'New game';
    resetBtn.addEventListener('click', () => resetGame(modal));

    const timer = document.createElement('span');
    timer.id = 'minepass-timer';
    timer.textContent = '⏱ 0';

    statusBar.appendChild(mineCounter);
    statusBar.appendChild(resetBtn);
    statusBar.appendChild(timer);
    modal.appendChild(statusBar);

    // Message area
    const msgArea = document.createElement('span');
    msgArea.id = 'minepass-message';
    msgArea.className = 'info';
    msgArea.textContent = 'Left-click to reveal • Right-click to flag';
    modal.appendChild(msgArea);

    // Board
    const boardEl = document.createElement('div');
    boardEl.id = 'minepass-board';
    modal.appendChild(boardEl);

    initBoard();
    renderBoard(boardEl);
  }

  function initBoard() {
    board = [];
    for (let r = 0; r < ROWS; r++) {
      board[r] = [];
      for (let c = 0; c < COLS; c++) {
        board[r][c] = {
          mine: false, revealed: false, flagged: false, adjacent: 0
        };
      }
    }
    gameState = 'idle';
    minesLeft = MINES;
    firstClick = true;
    elapsedSeconds = 0;
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  }

  function placeMines(safeRow, safeCol) {
    let placed = 0;
    while (placed < MINES) {
      const r = Math.floor(Math.random() * ROWS);
      const c = Math.floor(Math.random() * COLS);
      // Don't place on first-clicked cell or its neighbors
      if (Math.abs(r - safeRow) <= 1 && Math.abs(c - safeCol) <= 1) continue;
      if (board[r][c].mine) continue;
      board[r][c].mine = true;
      placed++;
    }
    // Calculate adjacency counts
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (board[r][c].mine) continue;
        let count = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && board[nr][nc].mine) count++;
          }
        }
        board[r][c].adjacent = count;
      }
    }
  }

  function renderBoard(boardEl) {
    boardEl.innerHTML = '';
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = document.createElement('div');
        cell.className = 'mp-cell';
        cell.dataset.r = r;
        cell.dataset.c = c;
        updateCellEl(cell, board[r][c]);

        cell.addEventListener('click', () => handleReveal(r, c));
        cell.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          handleFlag(r, c);
        });

        boardEl.appendChild(cell);
      }
    }
  }

  function updateCellEl(el, cell) {
    el.className = 'mp-cell';
    el.textContent = '';

    if (!cell.revealed) {
      if (cell.flagged) {
        el.classList.add('flagged');
        el.textContent = '🚩';
      } else {
        el.classList.add('hidden');
      }
      return;
    }

    el.classList.add('revealed');
    if (cell.mine) {
      el.textContent = '💣';
      return;
    }
    if (cell.adjacent > 0) {
      el.textContent = cell.adjacent;
      el.classList.add('mp-n' + cell.adjacent);
    }
  }

  function refreshBoard() {
    const boardEl = document.getElementById('minepass-board');
    if (!boardEl) return;
    const cells = boardEl.querySelectorAll('.mp-cell');
    cells.forEach(el => {
      const r = parseInt(el.dataset.r);
      const c = parseInt(el.dataset.c);
      updateCellEl(el, board[r][c]);
    });
  }

  function handleReveal(r, c) {
    if (gameState === 'won' || gameState === 'lost') return;
    const cell = board[r][c];
    if (cell.revealed || cell.flagged) return;

    if (firstClick) {
      firstClick = false;
      placeMines(r, c);
      gameState = 'playing';
      startTimer();
    }

    reveal(r, c);
    refreshBoard();
    checkWin();
  }

  function reveal(r, c) {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return;
    const cell = board[r][c];
    if (cell.revealed || cell.flagged) return;
    cell.revealed = true;

    if (cell.mine) {
      gameState = 'lost';
      revealAllMines(r, c);
      return;
    }

    if (cell.adjacent === 0) {
      // Flood fill
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          reveal(r + dr, c + dc);
        }
      }
    }
  }

  function revealAllMines(hitR, hitC) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (board[r][c].mine) {
          board[r][c].revealed = true;
          // Mark the one that was hit
          if (r === hitR && c === hitC) {
            board[r][c]._hit = true;
          }
        }
      }
    }
  }

  function handleFlag(r, c) {
    if (gameState === 'won' || gameState === 'lost') return;
    if (gameState === 'idle') return; // can't flag before first reveal
    const cell = board[r][c];
    if (cell.revealed) return;

    cell.flagged = !cell.flagged;
    minesLeft += cell.flagged ? -1 : 1;

    const counter = document.getElementById('minepass-mine-count');
    if (counter) counter.textContent = '💣 ' + minesLeft;

    refreshBoard();
  }

  function checkWin() {
    if (gameState === 'lost') {
      onLoss();
      return;
    }
    const unrevealed = board.flat().filter(c => !c.revealed && !c.mine);
    if (unrevealed.length === 0) {
      gameState = 'won';
      onWin();
    }
  }

  function startTimer() {
    const timerEl = document.getElementById('minepass-timer');
    timerInterval = setInterval(() => {
      elapsedSeconds++;
      if (timerEl) timerEl.textContent = '⏱ ' + elapsedSeconds;
      if (elapsedSeconds >= 999) clearInterval(timerInterval);
    }, 1000);
  }

  function onWin() {
    clearInterval(timerInterval);
    const resetBtn = document.getElementById('minepass-reset-btn');
    if (resetBtn) resetBtn.textContent = '😎';

    const msgArea = document.getElementById('minepass-message');
    if (msgArea) {
      msgArea.className = 'success';
      msgArea.textContent = '🎉 You win! Fetching credentials...';
    }

    // Auto-flag remaining mines
    board.flat().filter(c => !c.revealed).forEach(c => (c.flagged = true));
    refreshBoard();

    // Fetch credentials for this site
    const site = window.location.href;
    browser.runtime.sendMessage({ type: 'GET_CREDENTIALS_FOR_SITE', site }).then(({ matches, error }) => {
      if (error || !matches) {
        if (msgArea) {
          msgArea.className = 'error';
          msgArea.textContent = error === 'locked'
            ? '🔒 Session expired. Click the extension icon to unlock again.'
            : '❌ Could not fetch credentials.';
        }
        return;
      }
      if (matches.length === 0) {
        if (msgArea) {
          msgArea.className = 'info';
          msgArea.innerHTML = 'No saved credentials for this site.<br>Add them via the extension popup.';
        }
        return;
      }
      if (matches.length === 1) {
        autofill(matches[0]);
        closeOverlay();
      } else {
        showCredentialPicker(matches, msgArea);
      }
    });
  }

  function onLoss() {
    clearInterval(timerInterval);
    refreshBoard();

    const resetBtn = document.getElementById('minepass-reset-btn');
    if (resetBtn) resetBtn.textContent = '😵';

    const msgArea = document.getElementById('minepass-message');
    if (msgArea) {
      msgArea.className = 'error';
      msgArea.textContent = '💥 Boom! Try again.';
    }
  }

  function resetGame(modal) {
    // Remove old board and status bar, re-init
    const old = modal.querySelector('#minepass-board');
    const oldStatus = modal.querySelector('#minepass-status-bar');
    const oldMsg = modal.querySelector('#minepass-message');
    if (old) old.remove();
    if (oldStatus) oldStatus.remove();
    if (oldMsg) oldMsg.remove();
    const picker = modal.querySelector('#minepass-cred-list');
    if (picker) picker.remove();

    initBoard();
    startChallenge(modal);
  }

  function showCredentialPicker(matches, msgArea) {
    if (msgArea) {
      msgArea.className = 'success';
      msgArea.textContent = '✅ Won! Choose which account to fill:';
    }

    const modal = document.getElementById('minepass-modal');
    if (!modal) return;

    const list = document.createElement('div');
    list.id = 'minepass-cred-list';

    matches.forEach(cred => {
      const item = document.createElement('div');
      item.className = 'mp-cred-item';

      const labelEl = document.createElement('div');
      labelEl.className = 'mp-cred-item-label';
      labelEl.textContent = cred.label || new URL(cred.site).hostname;

      const userEl = document.createElement('div');
      userEl.className = 'mp-cred-item-user';
      userEl.textContent = cred.username;

      item.appendChild(labelEl);
      item.appendChild(userEl);
      item.addEventListener('click', () => {
        autofill(cred);
        closeOverlay();
      });

      list.appendChild(item);
    });

    modal.appendChild(list);
  }

  // ── Autofill ────────────────────────────────────────────────────────────────

  function autofill(cred) {
    if (!currentPwField) return;

    // Find associated username field (look for email/text input preceding pw field)
    const form = currentPwField.closest('form') || currentPwField.parentElement;
    const inputs = form ? Array.from(form.querySelectorAll('input')) : [];
    const userField = inputs.find(inp =>
      ['text', 'email', 'tel'].includes(inp.type) && inp !== currentPwField
    );

    function setNativeValue(el, value) {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    if (userField && cred.username) {
      setNativeValue(userField, cred.username);
    }
    setNativeValue(currentPwField, cred.password);
    currentPwField.focus();
  }

})();
