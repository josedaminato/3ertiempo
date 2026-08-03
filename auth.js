/**
 * Autenticación de 3er tiempo.
 *
 * En modo local las credenciales sirven para probar el producto en un único
 * dispositivo. La contraseña se guarda con salt + SHA-256, nunca en texto
 * plano. En producción, provider="api" delega todo al backend, que deberá
 * usar Argon2/bcrypt y una cookie de sesión HttpOnly.
 */
const AuthService = (() => {
  const USERS_KEY = '3ertiempo_users_v1';
  const SESSION_KEY = '3ertiempo_session_v1';

  function normalize(value) {
    return String(value || '').trim().toLocaleLowerCase('es');
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

  async function isRegistered(username) {
    if (isApi()) {
      const data = await apiRequest('/v1/auth/status', { username });
      return Boolean(data.registered);
    }
    return Boolean(readUsers()[normalize(username)]);
  }

  async function register(username, password) {
    const cleanName = String(username || '').trim();
    if (password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres');

    if (isApi()) {
      const data = await apiRequest('/v1/auth/register', {
        username: cleanName,
        password
      });
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(data.user));
      return data.user;
    }

    const users = readUsers();
    const key = normalize(cleanName);
    if (users[key]) throw new Error('Ese jugador ya creó su contraseña');

    const salt = randomSalt();
    users[key] = {
      username: cleanName,
      salt,
      passwordHash: await digest(password, salt),
      createdAt: new Date().toISOString()
    };
    writeUsers(users);

    const session = { username: cleanName, localPrototype: true };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  async function login(username, password) {
    const cleanName = String(username || '').trim();

    if (isApi()) {
      const data = await apiRequest('/v1/auth/login', {
        username: cleanName,
        password
      });
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(data.user));
      return data.user;
    }

    const account = readUsers()[normalize(cleanName)];
    if (!account) throw new Error('Primero tenés que crear tu contraseña');
    const candidate = await digest(password, account.salt);
    if (candidate !== account.passwordHash) throw new Error('Contraseña incorrecta');

    const session = { username: account.username, localPrototype: true };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  function getSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); }
    catch { return null; }
  }

  async function logout() {
    if (isApi()) {
      try { await apiRequest('/v1/auth/logout', {}); } catch { /* cierre local */ }
    }
    sessionStorage.removeItem(SESSION_KEY);
  }

  return { isRegistered, register, login, logout, getSession, normalize };
})();
