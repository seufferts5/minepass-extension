// MinePass - Background Service Worker
// Handles vault encryption/decryption and session management

const STORAGE_KEY = 'minepass_vault';
const SESSION_KEY = 'minepass_session_key';

// ── Crypto helpers ──────────────────────────────────────────────────────────

function bufToB64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function b64ToBuf(b64) {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

async function encryptData(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(JSON.stringify(obj))
  );
  return { iv: bufToB64(iv), data: bufToB64(encrypted) };
}

async function decryptData(key, { iv, data }) {
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBuf(iv) },
    key,
    b64ToBuf(data)
  );
  return JSON.parse(new TextDecoder().decode(decrypted));
}

// ── Session key (stored as raw bytes in browser.storage.session) ────────────

async function getSessionKey() {
  const result = await browser.storage.session.get(SESSION_KEY);
  if (!result[SESSION_KEY]) return null;
  return crypto.subtle.importKey(
    'raw', b64ToBuf(result[SESSION_KEY]),
    { name: 'AES-GCM', length: 256 },
    false, ['encrypt', 'decrypt']
  );
}

async function setSessionKey(cryptoKey) {
  const raw = await crypto.subtle.exportKey('raw', cryptoKey);
  await browser.storage.session.set({ [SESSION_KEY]: bufToB64(raw) });
}

async function clearSessionKey() {
  await browser.storage.session.remove(SESSION_KEY);
}

// ── Raw vault I/O ────────────────────────────────────────────────────────────

async function loadRawVault() {
  const result = await browser.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || null;
}

async function saveRawVault(rawVault) {
  await browser.storage.local.set({ [STORAGE_KEY]: rawVault });
}

// ── Message dispatcher ───────────────────────────────────────────────────────

browser.runtime.onMessage.addListener((message) => {
  return handleMessage(message);
});

async function handleMessage(message) {
  switch (message.type) {

    case 'IS_VAULT_INITIALIZED': {
      const vault = await loadRawVault();
      return { initialized: vault !== null };
    }

    case 'UNLOCK_SESSION': {
      const { password } = message;
      const rawVault = await loadRawVault();

      if (!rawVault) {
        // First-time setup: create vault
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const key = await deriveKey(password, salt);
        const encrypted = await encryptData(key, { entries: [] });
        await saveRawVault({ salt: bufToB64(salt), ...encrypted });
        await setSessionKey(key);
        return { success: true, firstTime: true };
      }

      try {
        const salt = b64ToBuf(rawVault.salt);
        const key = await deriveKey(password, salt);
        await decryptData(key, rawVault); // verify password is correct
        await setSessionKey(key);
        return { success: true, firstTime: false };
      } catch {
        return { success: false, error: 'Incorrect password' };
      }
    }

    case 'LOCK_SESSION': {
      await clearSessionKey();
      return { success: true };
    }

    case 'GET_SESSION_STATUS': {
      const key = await getSessionKey();
      return { unlocked: key !== null };
    }

    case 'GET_ALL_CREDENTIALS': {
      const key = await getSessionKey();
      if (!key) return { error: 'locked' };
      const raw = await loadRawVault();
      const vault = await decryptData(key, raw);
      // Return site + username only (no passwords) for listing
      return {
        entries: vault.entries.map(({ id, site, username, label }) =>
          ({ id, site, username, label: label || '' }))
      };
    }

    case 'GET_CREDENTIALS_FOR_SITE': {
      const key = await getSessionKey();
      if (!key) return { error: 'locked' };
      const { site } = message;

      let reqHost = '';
      try { reqHost = new URL(site).hostname.replace(/^www\./, ''); } catch { reqHost = site; }

      const raw = await loadRawVault();
      const vault = await decryptData(key, raw);
      const matches = vault.entries.filter(e => {
        try {
          const eHost = new URL(e.site).hostname.replace(/^www\./, '');
          return eHost === reqHost || reqHost.endsWith('.' + eHost) || eHost.endsWith('.' + reqHost);
        } catch {
          return e.site.includes(reqHost);
        }
      });
      // Return full credentials for autofill
      return { matches };
    }

    case 'SAVE_CREDENTIAL': {
      const key = await getSessionKey();
      if (!key) return { error: 'locked' };
      const { entry } = message;
      const raw = await loadRawVault();
      const vault = await decryptData(key, raw);

      if (entry.id) {
        const idx = vault.entries.findIndex(e => e.id === entry.id);
        if (idx >= 0) vault.entries[idx] = entry;
        else vault.entries.push(entry);
      } else {
        entry.id = crypto.randomUUID();
        vault.entries.push(entry);
      }

      const encrypted = await encryptData(key, vault);
      await saveRawVault({ salt: raw.salt, ...encrypted });
      return { success: true, id: entry.id };
    }

    case 'DELETE_CREDENTIAL': {
      const key = await getSessionKey();
      if (!key) return { error: 'locked' };
      const raw = await loadRawVault();
      const vault = await decryptData(key, raw);
      vault.entries = vault.entries.filter(e => e.id !== message.id);
      const encrypted = await encryptData(key, vault);
      await saveRawVault({ salt: raw.salt, ...encrypted });
      return { success: true };
    }

    case 'CHANGE_MASTER_PASSWORD': {
      const key = await getSessionKey();
      if (!key) return { error: 'locked' };
      const raw = await loadRawVault();
      const vault = await decryptData(key, raw);
      const newSalt = crypto.getRandomValues(new Uint8Array(16));
      const newKey = await deriveKey(message.newPassword, newSalt);
      const encrypted = await encryptData(newKey, vault);
      await saveRawVault({ salt: bufToB64(newSalt), ...encrypted });
      await setSessionKey(newKey);
      return { success: true };
    }

    default:
      return { error: 'Unknown message type: ' + message.type };
  }
}
