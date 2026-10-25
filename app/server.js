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
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} | CLB Esport</title>
  <style>
    body {
      margin: 0; padding: 40px 20px;
      font-family: Arial, sans-serif;
      background: #0f172a; color: #e2e8f0;
    }
    main { max-width: 1100px; margin: auto; }
    h1, a { color: #38bdf8; }
    nav { display: flex; gap: 24px; margin-bottom: 30px; }
    p { line-height: 1.6; }
    .panel {
      background: #1e293b;
      padding: 24px; border-radius: 12px;
      overflow-x: auto;
    }
    table { width: 100%; border-collapse: collapse; }
    th, td {
      padding: 14px; text-align: left;
      border-bottom: 1px solid #334155;
    }
    th { color: #38bdf8; white-space: nowrap; }
    .button {
      display: inline-block; padding: 12px 18px;
      background: #0284c7; color: white;
      border-radius: 8px; text-decoration: none;
    }
  </style>
</head>
<body>
  <main>
    <nav>
      <a href="/">Trang chủ</a>
      <a href="/members">Thành viên</a>
      <a href="/activities">Hoạt động</a>
      <a href="/contributions">Quỹ CLB</a>
      <a href="/meetings">Lịch họp</a>
      <a href="/login">Đăng nhập</a>
      <a href="/logout">Đăng xuất</a>
    </nav>
    <h1>${escapeHtml(title)}</h1>
    ${content}
  </main>
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
