const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);

const sessions = new Map();
const attempts = new Map();
const cookieName = 'club_session';

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of sessions) {
    if (value.expires <= now) sessions.delete(key);
  }
  for (const [key, value] of attempts) {
    if (value.expires <= now) attempts.delete(key);
  }
}, 60000).unref();

function redirect(res, location) {
  res.writeHead(303, { Location: location });
  res.end();
}

function setCookie(res, id, seconds) {
  res.setHeader('Set-Cookie',
    `${cookieName}=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${seconds}`);
}

function createSession(res, user = null) {
  const id = crypto.randomBytes(32).toString('hex');
  const seconds = user ? 3600 : 600;
  const session = {
    user,
    csrf: crypto.randomBytes(32).toString('hex'),
    expires: Date.now() + seconds * 1000
  };
  sessions.set(id, session);
  setCookie(res, id, seconds);
  return session;
}

async function readForm(req) {
  if (!(req.headers['content-type'] || '')
      .startsWith('application/x-www-form-urlencoded')) return null;

  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size <= 8192) chunks.push(chunk);
  }

  if (size > 8192) return null;
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

async function passwordMatches(password, stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 6 ||
      parts.slice(0, 4).join('$') !== 'scrypt$32768$8$1' ||
      !/^[a-f0-9]{32}$/.test(parts[4]) ||
      !/^[a-f0-9]{128}$/.test(parts[5])) return false;

  const actual = await scrypt(password, parts[4], 64, {
    N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024
  });
  return crypto.timingSafeEqual(actual, Buffer.from(parts[5], 'hex'));
}

module.exports = async function handleAuth(
  req, res, path, pool, layout, sendHtml, escapeHtml
) {
  const protectedPath = path === '/meetings' || path.startsWith('/meetings/') || path === '/contributions' || path === '/members' || path.startsWith('/members/') ||
    path === '/activities' || path.startsWith('/activities/');
  if (!protectedPath && path !== '/login' && path !== '/logout') return false;

  const cookie = (req.headers.cookie || '').split(';')
    .map(value => value.trim())
    .find(value => value.startsWith(cookieName + '='));
  const sessionId = cookie ? cookie.slice(cookieName.length + 1) : '';
  let session = sessions.get(sessionId);

  if (session && session.expires <= Date.now()) {
    sessions.delete(sessionId);
    session = null;
  }

  function showLogin(status = 200, message = '') {
    if (!session) session = createSession(res);
    sendHtml(res, status, layout('Đăng nhập', `
      <div class="panel" style="max-width:440px">
        ${message ? `<p role="alert" style="color:#fda4af">${escapeHtml(message)}</p>` : ''}
        <form method="POST" action="/login">
          <input type="hidden" name="csrf" value="${session.csrf}">
          <p><label>Tên đăng nhập<br>
            <input name="username" required maxlength="50"
              autocomplete="username"
              style="box-sizing:border-box;width:100%;padding:12px;margin-top:8px">
          </label></p>
          <p><label>Mật khẩu<br>
            <input name="password" type="password" required maxlength="128"
              autocomplete="current-password"
              style="box-sizing:border-box;width:100%;padding:12px;margin-top:8px">
          </label></p>
          <button class="button" style="border:0;cursor:pointer">
            Đăng nhập
          </button>
        </form>
      </div>
    `));
  }

  if (path === '/login') {
    if (req.method === 'GET') {
      showLogin();
      return true;
    }

    if (req.method !== 'POST') {
      res.writeHead(405, { Allow: 'GET, POST' });
      res.end();
      return true;
    }

    const form = await readForm(req);
    if (!form || !session || form.get('csrf') !== session.csrf) {
      showLogin(403, 'Form đã hết hiệu lực. Vui lòng thử lại.');
      return true;
    }

    const ip = req.socket.remoteAddress;
    let attempt = attempts.get(ip);
    if (!attempt || attempt.expires <= Date.now()) {
      attempt = { count: 0, expires: Date.now() + 15 * 60 * 1000 };
      attempts.set(ip, attempt);
    }
    if (attempt.count >= 10) {
      showLogin(429, 'Bạn đã thử quá nhiều lần. Vui lòng thử lại sau 15 phút.');
      return true;
    }
    attempt.count++;

    const username = (form.get('username') || '').trim();
    const password = form.get('password') || '';

    if (!username || username.length > 50 ||
        !password || password.length > 128) {
      showLogin(400, 'Vui lòng kiểm tra tên đăng nhập và mật khẩu.');
      return true;
    }

    const [rows] = await pool.execute(
      'SELECT id, username, password_hash, role, is_active FROM users WHERE username = ?',
      [username]
    );
    const user = rows[0];

    if (!user || !user.is_active ||
        !(await passwordMatches(password, user.password_hash))) {
      console.log('LOGIN_FAILED');
      showLogin(401, 'Tên đăng nhập hoặc mật khẩu không đúng, hoặc tài khoản bị khóa.');
      return true;
    }

    sessions.delete(sessionId);
    createSession(res, {
      id: user.id,
      passwordHash: user.password_hash
    });
    attempts.delete(ip);
    console.log('LOGIN_SUCCESS user_id=' + user.id);
    redirect(res, '/members');
    return true;
  }

  if (path === '/logout') {
    if (req.method === 'GET') {
      if (!session) {
        redirect(res, '/login');
      } else {
        sendHtml(res, 200, layout('Đăng xuất', `
          <form method="POST" action="/logout">
            <input type="hidden" name="csrf" value="${session.csrf}">
            <button class="button" style="border:0;cursor:pointer">
              Xác nhận đăng xuất
            </button>
          </form>
        `));
      }
      return true;
    }

    if (req.method !== 'POST') {
      res.writeHead(405, { Allow: 'GET, POST' });
      res.end();
      return true;
    }

    const form = await readForm(req);
    if (!session || !form || form.get('csrf') !== session.csrf) {
      sendHtml(res, 403, layout('Không thể đăng xuất',
        '<p>Hãy tải lại trang rồi thử lại.</p>'));
      return true;
    }

    sessions.delete(sessionId);
    setCookie(res, '', 0);
    redirect(res, '/login');
    return true;
  }

  if (!session || !session.user) {
    redirect(res, '/login');
    return true;
  }

  const [rows] = await pool.execute(
    'SELECT id, role, is_active, password_hash FROM users WHERE id = ?',
    [session.user.id]
  );
  const user = rows[0];

  if (!user || !user.is_active ||
      user.password_hash !== session.user.passwordHash) {
    sessions.delete(sessionId);
    setCookie(res, '', 0);
    redirect(res, '/login');
    return true;
  }

  const needsAdmin = !['/members', '/activities', '/meetings'].includes(path) || req.method !== 'GET';

  if (needsAdmin && user.role !== 'admin') {
    sendHtml(res, 403, layout('Không có quyền truy cập',
      '<p>Chức năng này dành cho quản trị viên.</p>'));
    return true;
  }

  req.currentUser = user;
  req.csrfToken = session.csrf;
  return false;
};
