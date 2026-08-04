/**
 * Autenticación de 3er tiempo.
 *
 * Cada jugador es un usuario con contraseña numérica de 6 dígitos.
 * En modo local las cuentas viven en este dispositivo (hash + salt).
 * En producción, provider="api" delega al backend real.
 */
const AuthService = (() => {
  const USERS_KEY = '3ertiempo_users_v1';
  const SESSION_KEY = '3ertiempo_session_v1';
  const PASSWORD_LENGTH = 6;

  function normalize(value) {
    return String(value || '').trim().toLocaleLowerCase('es');
  }

  function validatePassword(password) {
    const clean = String(password || '').trim();
    if (!/^\d{6}$/.test(clean)) {
      throw new Error(`La contraseña debe tener ${PASSWORD_LENGTH} números`);
    }
    return clean;
  }

  function isValidPasswordFormat(password) {
    return /^\d{6}$/.test(String(password || '').trim());
  }

  function readUsers() {
    try { return JSON.parse(localStorage.getItem(USERS_KEY) || '{}'); }
    catch { return {}; }
  }

  function writeUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  function bytesToHex(bytes) {
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function randomSalt() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return bytesToHex(bytes);
  }

  async function digest(password, salt) {
    const input = new TextEncoder().encode(`${salt}:${password}`);
    const hash = await crypto.subtle.digest('SHA-256', input);
    return bytesToHex(new Uint8Array(hash));
  }

  function isApi() {
    return APP_CONFIG.provider === 'api';
  }

  async function apiRequest(path, body) {
    const res = await fetch(`${APP_CONFIG.apiBaseUrl.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'No se pudo iniciar sesión');
    return data;
  }

  function isRegisteredSync(username) {
    if (!username) return false;
    return Boolean(readUsers()[normalize(username)]);
  }

  function listRegisteredUsernames() {
    return Object.values(readUsers()).map(account => account.username);
  }

  async function isRegistered(username) {
    if (isApi()) {
      const data = await apiRequest('/v1/auth/status', { username });
      return Boolean(data.registered);
    }
    return isRegisteredSync(username);
  }

  async function register(username, password) {
    const cleanName = String(username || '').trim();
    if (!cleanName) throw new Error('Elegí tu jugador');
    const cleanPassword = validatePassword(password);

    if (isApi()) {
      const data = await apiRequest('/v1/auth/register', {
        username: cleanName,
        password: cleanPassword
      });
      localStorage.setItem(SESSION_KEY, JSON.stringify(data.user));
      return data.user;
    }

    const users = readUsers();
    const key = normalize(cleanName);
    if (users[key]) throw new Error('Este jugador ya tiene contraseña. Usá Ingresar.');

    const salt = randomSalt();
    users[key] = {
      username: cleanName,
      salt,
      passwordHash: await digest(cleanPassword, salt),
      createdAt: new Date().toISOString()
    };
    writeUsers(users);

    const session = { username: cleanName, localPrototype: true };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  async function login(username, password) {
    const cleanName = String(username || '').trim();
    if (!cleanName) throw new Error('Elegí tu jugador');
    const cleanPassword = validatePassword(password);

    if (isApi()) {
      const data = await apiRequest('/v1/auth/login', {
        username: cleanName,
        password: cleanPassword
      });
      localStorage.setItem(SESSION_KEY, JSON.stringify(data.user));
      return data.user;
    }

    const account = readUsers()[normalize(cleanName)];
    if (!account) throw new Error('Primera vez: creá tu contraseña de 6 números');
    const candidate = await digest(cleanPassword, account.salt);
    if (candidate !== account.passwordHash) throw new Error('Contraseña incorrecta');

    const session = { username: account.username, localPrototype: true };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  function getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
    catch { return null; }
  }

  async function logout() {
    if (isApi()) {
      try { await apiRequest('/v1/auth/logout', {}); } catch { /* cierre local */ }
    }
    localStorage.removeItem(SESSION_KEY);
  }

  return {
    passwordLength: PASSWORD_LENGTH,
    validatePassword,
    isValidPasswordFormat,
    isRegistered,
    isRegisteredSync,
    listRegisteredUsernames,
    register,
    login,
    logout,
    getSession,
    normalize
  };
})();
