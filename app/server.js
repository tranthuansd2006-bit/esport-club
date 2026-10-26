const observeRequest = require('./metrics');
const handleMeetings = require('./meetings');
const handleContributions = require('./contributions');
const handleParticipants = require('./participants');
const handleActivities = require('./activities');
const handleAuth = require('./auth');
const handleMemberForm = require('./member-form');
const http = require('node:http');
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset: 'utf8mb4',
  dateStrings: true,
  connectionLimit: 5,
  connectTimeout: 10000
});

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function layout(title, content) {
  const links = [
    ['/', 'Trang chủ', '01'],
    ['/members', 'Thành viên', '02'],
    ['/activities', 'Hoạt động', '03'],
    ['/contributions', 'Quỹ câu lạc bộ', '04'],
    ['/meetings', 'Lịch họp', '05']
  ];

  const activePath =
    /thành viên/i.test(title) ? '/members' :
    /hoạt động|tham gia|điểm danh/i.test(title) ? '/activities' :
    /quỹ|đóng góp/i.test(title) ? '/contributions' :
    /họp|biên bản/i.test(title) ? '/meetings' : '/';

  const navigation = links.map(([href, label, number]) =>
    `<a href="${href}" class="nav-link ${href === activePath ? 'active' : ''}">
      <span class="nav-number">${number}</span>${label}
    </a>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} | Esport Club</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #17243b;
      --muted: #62718a;
      --blue: #2563eb;
      --line: #e2e8f0;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #f3f6fb;
      color: var(--ink);
      font-family: "Segoe UI", Arial, sans-serif;
      font-size: 15px;
      line-height: 1.6;
    }
    a { color: #1d4ed8; text-underline-offset: 3px; }
    button, input, select, textarea { font: inherit; }
    .sidebar {
      position: fixed;
      inset: 0 auto 0 0;
      width: 238px;
      padding: 32px 18px;
      background: #12213b;
      color: #fff;
      display: flex;
      flex-direction: column;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0 12px 30px;
      color: #fff;
      text-decoration: none;
    }
    .brand-mark {
      display: grid;
      place-items: center;
      width: 42px;
      height: 42px;
      border-radius: 13px;
      background: #3874f6;
      font-size: 20px;
      font-weight: 800;
    }
    .brand strong { display: block; font-size: 18px; }
    .brand small { color: #a9b9d3; font-size: 12px; }
    .nav-label {
      margin: 0 14px 12px;
      color: #99abc8;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 1.8px;
    }
    .sidebar nav { display: grid; gap: 7px; }
    .nav-link {
      display: flex;
      align-items: center;
      gap: 13px;
      padding: 12px 14px;
      border-radius: 10px;
      color: #c8d4e8;
      text-decoration: none;
      font-weight: 600;
    }
    .nav-link:hover { background: #1e3355; color: #fff; }
    .nav-link.active { background: #2563eb; color: #fff; }
    .nav-number { font-size: 11px; opacity: .75; }
    .sidebar-bottom {
      margin-top: auto;
      padding: 24px 12px 0;
      color: #a9b9d3;
      font-size: 12px;
    }
    .workspace { margin-left: 238px; }
    .topbar {
      min-height: 78px;
      padding: 18px 36px;
      background: #fff;
      border-bottom: 1px solid var(--line);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .topbar-label { font-weight: 600; color: #475569; }
    .account-links { display: flex; gap: 18px; }
    .account-links a {
      font-size: 13px;
      font-weight: 600;
      text-decoration: none;
    }
    main {
      width: 100%;
      max-width: 1500px;
      margin: auto;
      padding: 32px 36px 48px;
    }
    .page-heading { margin-bottom: 26px; }
    .eyebrow {
      margin: 0 0 5px;
      color: #2563eb;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 1.6px;
    }
    h1 {
      margin: 0;
      color: #17243b;
      font-size: clamp(24px, 2.5vw, 32px);
      line-height: 1.3;
      letter-spacing: -.7px;
    }
    .page-description { margin: 8px 0 0; color: var(--muted); }
    h2 { color: #17243b; font-size: 21px; margin-top: 0; }
    h3 { color: #17243b; }
    p { line-height: 1.7; }
    .panel {
      background: #fff !important;
      color: var(--ink) !important;
      padding: 26px !important;
      border: 1px solid var(--line);
      border-radius: 16px !important;
      box-shadow: 0 5px 20px rgba(28, 48, 82, .035);
      overflow-x: auto;
      margin-bottom: 22px;
    }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td {
      padding: 15px 13px;
      text-align: left;
      border-bottom: 1px solid #e8edf5;
      vertical-align: middle;
    }
    th {
      background: #f5f8fd;
      color: #465671;
      font-size: 12px;
      font-weight: 700;
      white-space: nowrap;
    }
    tbody tr:hover { background: #f8faff; }
    tbody tr:last-child td { border-bottom: 0; }
    td a { font-weight: 600; }
    .button, button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      min-height: 43px;
      padding: 10px 17px;
      border: 0;
      border-radius: 9px;
      background: #2563eb;
      color: #fff;
      text-decoration: none;
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;
    }
    .button:hover, button:hover { background: #1d4ed8; }
    input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]),
    select, textarea {
      background: #fff !important;
      color: #17243b !important;
      border: 1px solid #cbd5e1 !important;
      border-radius: 9px !important;
      padding: 11px 13px !important;
      min-height: 44px;
      max-width: 100%;
    }
    input::placeholder, textarea::placeholder { color: #8793a6; }
    textarea { min-height: 110px; resize: vertical; }
    label { color: #334155; font-weight: 600; }
    :focus-visible { outline: 3px solid #93c5fd; outline-offset: 3px; }
    .site-footer {
      margin-top: 32px;
      padding-top: 18px;
      border-top: 1px solid var(--line);
      color: #748198;
      font-size: 12px;
    }
    @media (min-width: 1450px) {
      main { padding: 38px 44px 50px; }
    }
    @media (max-width: 1000px) {
      .sidebar { width: 205px; padding: 26px 12px; }
      .workspace { margin-left: 205px; }
      main { padding: 26px 22px; }
      .topbar { padding: 18px 22px; }
    }
    @media (max-width: 720px) {
      .sidebar { position: static; width: 100%; padding: 18px; }
      .brand { padding: 0 0 16px; }
      .nav-label, .sidebar-bottom { display: none; }
      .sidebar nav { display: flex; overflow-x: auto; gap: 6px; }
      .nav-link { padding: 9px 12px; white-space: nowrap; font-size: 13px; }
      .nav-number { display: none; }
      .workspace { margin-left: 0; }
      .topbar { min-height: 60px; padding: 14px 18px; }
      .topbar-label { font-size: 12px; }
      .account-links { gap: 12px; }
      main { padding: 24px 16px; }
      .panel { padding: 18px !important; }
      th, td { padding: 12px 10px; }
    }
  </style>
</head>
<body>
  <aside class="sidebar">
    <a href="/" class="brand">
      <span class="brand-mark">E</span>
      <span><strong>ESPORT CLUB</strong><small>Không gian quản lý câu lạc bộ</small></span>
    </a>
    <p class="nav-label">ĐIỀU HƯỚNG</p>
    <nav aria-label="Điều hướng chính">${navigation}</nav>
    <div class="sidebar-bottom">Kết nối thành viên<br>Đồng hành cùng câu lạc bộ</div>
  </aside>
  <div class="workspace">
    <header class="topbar">
      <span class="topbar-label">Hệ thống quản lý câu lạc bộ</span>
      <div class="account-links">
        <a href="/login">Đăng nhập</a>
        <a href="/logout">Đăng xuất</a>
      </div>
    </header>
    <main>
      <div class="page-heading">
        <p class="eyebrow">ESPORT CLUB</p>
        <h1>${escapeHtml(title)}</h1>
        <p class="page-description">Quản lý thông tin và các hoạt động của câu lạc bộ.</p>
      </div>
      ${content}
      <footer class="site-footer">CLB Esport · Hệ thống quản lý câu lạc bộ</footer>
    </main>
  </div>
</body>
</html>`;
}

function sendHtml(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

http.createServer(async (req, res) => {
  observeRequest(req, res);
  const path = req.url.split('?')[0];
  console.log(req.method, path);

  try {
    if (await handleAuth(
      req, res, path, pool, layout, sendHtml, escapeHtml
    )) return;

    if (await handleParticipants(
      req, res, path, pool, layout, sendHtml, escapeHtml
    )) return;

    if (await handleActivities(
      req, res, path, pool, layout, sendHtml, escapeHtml
    )) return;

    if (await handleContributions(
      req, res, path, pool, layout, sendHtml, escapeHtml
    )) return;

    if (await handleMeetings(
      req, res, path, pool, layout, sendHtml, escapeHtml
    )) return;

    if (await handleMemberForm(
      req, res, path, pool, layout, sendHtml, escapeHtml
    )) return;

    if (req.method !== 'GET') {
      res.writeHead(405, { Allow: 'GET' });
      return res.end('Method not allowed');
    }

    if (path === '/health') {
      await pool.query('SELECT 1');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        status: 'ok',
        database: 'connected'
      }));
    }

    if (path === '/') {
      return sendHtml(res, 200, layout(
        'Hệ thống quản lý CLB Esport',
        `<div class="panel">
          <h2>Quản lý thành viên</h2>
          <p>Xem danh sách thành viên của câu lạc bộ.</p>
          <a class="button" href="/members">Xem danh sách</a>
          <p><a class="button" href="/activities">Xem hoạt động CLB</a></p>
        </div>`
      ));
    }

    if (path === '/members') {
      const memberSearch = new URL(
        req.url, 'http://localhost'
      ).searchParams.get('q')?.trim() || '';

      if (memberSearch.length > 100) {
        sendHtml(res, 400, layout('Từ khóa quá dài',
          '<p>Vui lòng nhập tối đa 100 ký tự.</p>'));
        return;
      }

      const [members] = await pool.execute(
        `SELECT id, member_code, full_name, game_name,
                nickname, joined_date, status
         FROM members
         WHERE ? = ''
            OR LOCATE(?, member_code) > 0
            OR LOCATE(?, full_name) > 0
            OR LOCATE(?, game_name) > 0
         ORDER BY id`,
        [memberSearch, memberSearch, memberSearch, memberSearch]
      );

      const rows = members.map(member => {
        const values = [
          member.member_code,
          member.full_name,
          member.game_name,
          member.nickname,
          member.joined_date,
          member.status === 'active' ? 'Đang hoạt động' : 'Ngừng hoạt động'
        ];

        return '<tr>' + values.map(value =>
          '<td>' + escapeHtml(value) + '</td>'
        ).join('') + (
          req.currentUser && req.currentUser.role === 'admin'
            ? '<td><a href="/members/' + member.id + '/edit">Sửa</a></td>'
            : '<td>—</td>'
        ) + '</tr>';
      }).join('');

      return sendHtml(res, 200, layout(
        'Danh sách thành viên',
        `<p><a class="button" href="/members/new">+ Thêm thành viên</a></p><form method="GET" action="/members"
              style="display:flex;gap:12px;flex-wrap:wrap;margin:20px 0">
          <input name="q" maxlength="100"
            aria-label="Tìm theo mã, họ tên hoặc game"
            placeholder="Nhập mã thành viên, họ tên hoặc game..."
            value="${escapeHtml(memberSearch)}"
            style="padding:12px;flex:1;min-width:200px;border-radius:8px;
                   border:1px solid #64748b">
          <button class="button" style="border:0;cursor:pointer">Tìm kiếm</button>
          <a class="button" href="/members">Xem tất cả</a>
        </form>
        <p>Số thành viên hiển thị: <strong>${members.length}</strong></p>
        <div class="panel">
          <table>
            <thead>
              <tr>
                <th>Mã thành viên</th>
                <th>Họ tên</th>
                <th>Game</th>
                <th>Nickname</th>
                <th>Ngày tham gia</th>
                <th>Trạng thái</th><th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="7">Không có thành viên phù hợp.</td></tr>'}
            </tbody>
          </table>
        </div>`
      ));
    }

    sendHtml(res, 404, layout('Không tìm thấy trang', '<a href="/">Về trang chủ</a>'));
  } catch (error) {
    console.error('Database error:', error.code || error.name);
    sendHtml(res, 503, layout(
      'Chưa tải được dữ liệu',
      '<p>Hãy kiểm tra kết nối MySQL và log ứng dụng.</p>'
    ));
  }
}).listen(3000, '0.0.0.0', () => {
  console.log('Website dang chay tren cong 3000');
});
