// MinePass - Popup UI

(async function () {
  'use strict';

  // ── DOM refs ────────────────────────────────────────────────────────────────
  const header          = document.getElementById('header');
  const panelLock       = document.getElementById('panel-lock');
  const panelVault      = document.getElementById('panel-vault');
  const panelEdit       = document.getElementById('panel-edit');

  const lockTitle       = document.getElementById('lock-title');
  const lockSub         = document.getElementById('lock-sub');
  const masterPwInput   = document.getElementById('master-pw');
  const masterPwConfirm = document.getElementById('master-pw-confirm');
  const lockConfirmWrap = document.getElementById('lock-confirm-wrap');
  const lockMsg         = document.getElementById('lock-msg');
  const btnUnlock       = document.getElementById('btn-unlock');
  const toggleMasterPw  = document.getElementById('toggle-master-pw');

  const entryList       = document.getElementById('entry-list');
  const btnAddNew       = document.getElementById('btn-add-new');
  const btnLock         = document.getElementById('btn-lock');

  const editTitle       = document.getElementById('edit-title');
  const editId          = document.getElementById('edit-id');
  const editSite        = document.getElementById('edit-site');
  const editLabel       = document.getElementById('edit-label');
  const editUsername    = document.getElementById('edit-username');
  const editPassword    = document.getElementById('edit-password');

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function msg(el, text, type) {
    el.textContent = text;
    el.className = 'msg show ' + type;
  }
  function clearMsg(el) { el.className = 'msg'; el.textContent = ''; }

  function showPanel(name) {
    panelLock.style.display  = name === 'lock'  ? 'block' : 'none';
    panelVault.style.display = name === 'vault' ? 'block' : 'none';
    panelEdit.style.display  = name === 'edit'  ? 'block' : 'none';
    header.style.display     = name !== 'lock'  ? 'flex'  : 'none';
  }

  function send(message) {
    return browser.runtime.sendMessage(message);
  }

  // ── Startup: determine which panel to show ───────────────────────────────────
  const initStatus = await send({ type: 'IS_VAULT_INITIALIZED' });
  if (!initStatus.initialized) {
    // First time setup
    lockTitle.textContent = 'Create Master Password';
    lockSub.textContent   = 'This password encrypts your vault. Don\'t forget it.';
    lockConfirmWrap.style.display = 'block';
    btnUnlock.textContent = 'Create Vault';
  }

  const sessionStatus = await send({ type: 'GET_SESSION_STATUS' });
  if (sessionStatus.unlocked) {
    showPanel('vault');
    loadVault();
  } else {
    showPanel('lock');
  }

  // ── Lock panel ───────────────────────────────────────────────────────────────
  toggleMasterPw.addEventListener('click', () => {
    masterPwInput.type = masterPwInput.type === 'password' ? 'text' : 'password';
  });

  masterPwInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnUnlock.click();
  });
  masterPwConfirm.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnUnlock.click();
  });

  btnUnlock.addEventListener('click', async () => {
    clearMsg(lockMsg);
    const pw = masterPwInput.value;
    if (!pw) { msg(lockMsg, 'Enter your master password.', 'error'); return; }

    const isFirstTime = lockConfirmWrap.style.display !== 'none';
    if (isFirstTime) {
      if (pw !== masterPwConfirm.value) {
        msg(lockMsg, 'Passwords do not match.', 'error');
        return;
      }
      if (pw.length < 8) {
        msg(lockMsg, 'Password must be at least 8 characters.', 'error');
        return;
      }
    }

    btnUnlock.disabled = true;
    btnUnlock.textContent = 'Unlocking…';

    const result = await send({ type: 'UNLOCK_SESSION', password: pw });
    btnUnlock.disabled = false;
    btnUnlock.textContent = isFirstTime ? 'Create Vault' : 'Unlock';

    if (result.success) {
      masterPwInput.value = '';
      masterPwConfirm.value = '';
      showPanel('vault');
      loadVault();
    } else {
      msg(lockMsg, result.error || 'Incorrect password.', 'error');
      masterPwInput.focus();
    }
  });

  // ── Vault panel ──────────────────────────────────────────────────────────────
  btnLock.addEventListener('click', async () => {
    await send({ type: 'LOCK_SESSION' });
    // Reset lock panel to unlock mode
    lockTitle.textContent = 'Unlock MinePass';
    lockSub.textContent   = 'Enter your master password';
    lockConfirmWrap.style.display = 'none';
    btnUnlock.textContent = 'Unlock';
    showPanel('lock');
    masterPwInput.focus();
  });

  btnAddNew.addEventListener('click', () => {
    openEditPanel(null);
  });

  async function loadVault() {
    const result = await send({ type: 'GET_ALL_CREDENTIALS' });
    if (result.error) {
      showPanel('lock');
      return;
    }
    renderEntries(result.entries);
  }

  function renderEntries(entries) {
    if (!entries || entries.length === 0) {
      entryList.innerHTML = '<div class="empty-state">No credentials saved yet.<br>Click <strong>+ Add</strong> to add your first.</div>';
      return;
    }

    entryList.innerHTML = '';
    entries.forEach(entry => {
      const item = document.createElement('div');
      item.className = 'entry-item';
      item.innerHTML = `
        <div class="entry-info">
          <div class="entry-site">${escHtml(entry.label || entry.site)}</div>
          <div class="entry-user">${escHtml(entry.username)}</div>
        </div>
        <span class="entry-del" title="Delete" data-id="${escHtml(entry.id)}">🗑</span>
      `;

      item.querySelector('.entry-info').addEventListener('click', () => openEditPanel(entry));
      item.querySelector('.entry-del').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('Delete this credential?')) return;
        await send({ type: 'DELETE_CREDENTIAL', id: entry.id });
        loadVault();
      });

      entryList.appendChild(item);
    });
  }

  // ── Edit panel ───────────────────────────────────────────────────────────────
  function openEditPanel(entry) {
    clearMsg(editMsg);
    if (entry) {
      editTitle.textContent   = 'Edit Credential';
      editId.value            = entry.id || '';
      editSite.value          = entry.site || '';
      editLabel.value         = entry.label || '';
      editUsername.value      = entry.username || '';
      editPassword.value      = entry.password || '';
      btnDelete.style.display = 'inline-flex';
    } else {
      editTitle.textContent   = 'New Credential';
      editId.value            = '';
      editSite.value          = '';
      editLabel.value         = '';
      editUsername.value      = '';
      editPassword.value      = '';
      btnDelete.style.display = 'none';
    }
    showPanel('edit');

    // Pre-fill URL from active tab if adding new
    if (!entry) {
      browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
        if (tabs[0] && tabs[0].url && !tabs[0].url.startsWith('about:')) {
          try {
            const url = new URL(tabs[0].url);
            editSite.value = url.origin;
          } catch {}
        }
      });
    }
  }

  toggleEditPw.addEventListener('click', () => {
    editPassword.type = editPassword.type === 'password' ? 'text' : 'password';
  });

  // Handle type change
  const editUsernameLabel = document.querySelector('label[for="edit-username"]');
  const editPasswordLabel = document.querySelector('label[for="edit-password"]');
  editType.addEventListener('change', () => {
    const isApiKey = editType.value === 'api_key';
    editUsernameLabel.textContent = isApiKey ? 'API Key Name (optional)' : 'Username / Email';
    editPasswordLabel.textContent = isApiKey ? 'API Key' : 'Password';
    editUsername.placeholder = isApiKey ? 'e.g. OpenAI API Key' : 'username@example.com';
    editPassword.placeholder = isApiKey ? 'sk-...' : 'Password';
  });

  btnBack.addEventListener('click', () => {
    showPanel('vault');
    loadVault();
  });

  btnSave.addEventListener('click', async () => {
    clearMsg(editMsg);
    const site     = editSite.value.trim();
    const username = editUsername.value.trim();
    const password = editPassword.value;

    if (!site)     { msg(editMsg, 'Site URL is required.', 'error'); return; }
    if (!username) { msg(editMsg, 'Username is required.', 'error'); return; }
    if (!password) { msg(editMsg, 'Password is required.', 'error'); return; }

    const entry = {
      id:       editId.value || null,
      site:     site,
      label:    editLabel.value.trim(),
      username: username,
      password: password
    };

    btnSave.disabled = true;
    const result = await send({ type: 'SAVE_CREDENTIAL', entry });
    btnSave.disabled = false;

    if (result.error) {
      msg(editMsg, 'Error: ' + result.error, 'error');
    } else {
      msg(editMsg, 'Saved!', 'success');
      setTimeout(() => { showPanel('vault'); loadVault(); }, 700);
    }
  });

  btnDelete.addEventListener('click', async () => {
    const id = editId.value;
    if (!id) return;
    if (!confirm('Delete this credential? This cannot be undone.')) return;
    await send({ type: 'DELETE_CREDENTIAL', id });
    showPanel('vault');
    loadVault();
  });

  // ── Utils ────────────────────────────────────────────────────────────────────
  function escHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

})();
