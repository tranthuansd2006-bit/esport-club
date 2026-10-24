const crypto = require('node:crypto');
const csrfToken = crypto.randomBytes(32).toString('hex');

module.exports = async function handleMemberForm(
  req, res, path, pool, layout, sendHtml, escapeHtml
) {
  const editMatch = path.match(/^\/members\/([1-9][0-9]*)\/edit$/);
  const isEdit = Boolean(editMatch);
  if (path !== '/members/new' && !isEdit) return false;

  if (!req.currentUser || req.currentUser.role !== 'admin') {
    sendHtml(res, 403, layout('Không có quyền truy cập',
      '<p>Chức năng này dành cho quản trị viên.</p>'));
    return true;
  }

  let existing = null;
  if (isEdit) {
    const [rows] = await pool.execute(
      'SELECT * FROM members WHERE id = ?',
      [editMatch[1]]
    );
    existing = rows[0];
    if (!existing) {
      sendHtml(res, 404, layout('Không tìm thấy thành viên',
        '<a href="/members">Về danh sách</a>'));
      return true;
    }
  }

  const fields = [
    ['member_code', 'Mã thành viên', 'text', 20, true],
    ['full_name', 'Họ tên', 'text', 100, true],
    ['email', 'Email', 'email', 150, true],
    ['phone', 'Số điện thoại', 'tel', 20, false],
    ['game_name', 'Tên game', 'text', 50, false],
    ['nickname', 'Tên trong game', 'text', 50, false],
    ['joined_date', 'Ngày tham gia', 'date', 10, true]
  ];

  function showForm(status, message = '', values = {}) {
    const inputs = fields.map(([name, label, type, max, required]) => `
      <label style="display:block;margin:16px 0">
        ${label}${required ? ' *' : ''}
        <input
          name="${name}"
          type="${type}"
          maxlength="${max}"
          value="${escapeHtml(values[name] || '')}"
          ${required ? 'required' : ''}
          style="display:block;box-sizing:border-box;width:100%;
                 padding:12px;margin-top:8px;border-radius:6px;
                 border:1px solid #64748b"
        >
      </label>
    `).join('');

    sendHtml(res, status, layout(isEdit ? 'Sửa thông tin thành viên' : 'Thêm thành viên', `
      <div class="panel" style="max-width:600px">
        ${message ? `<p role="alert" style="color:#fda4af">${escapeHtml(message)}</p>` : ''}
        <form method="POST" action="${escapeHtml(path)}">
          <input type="hidden" name="csrf" value="${csrfToken}">
          ${inputs}
          <label style="display:block;margin:16px 0">
            Trạng thái
            <select name="status"
              style="display:block;width:100%;padding:12px;margin-top:8px">
              <option value="active"
                ${values.status !== 'inactive' ? 'selected' : ''}>
                Đang hoạt động
              </option>
              <option value="inactive"
                ${values.status === 'inactive' ? 'selected' : ''}>
                Ngừng hoạt động
              </option>
            </select>
          </label>
          <button class="button" type="submit"
                  style="border:0;cursor:pointer;font-size:16px">
            ${isEdit ? 'Lưu thay đổi' : 'Lưu thành viên'}
          </button>
          <a href="/members" style="margin-left:16px">Hủy</a>
        </form>
      </div>
    `));
  }

  if (req.method === 'GET') {
    showForm(200, '', existing || {});
    return true;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { Allow: 'GET, POST' });
    res.end('Method not allowed');
    return true;
  }

  const contentType = (req.headers['content-type'] || '').split(';')[0];
  if (contentType !== 'application/x-www-form-urlencoded') {
    showForm(415, 'Định dạng gửi dữ liệu không hợp lệ.');
    return true;
  }

  let size = 0;
  const chunks = [];

  for await (const chunk of req) {
    size += chunk.length;
    if (size <= 16384) chunks.push(chunk);
  }

  if (size > 16384) {
    showForm(413, 'Dữ liệu gửi lên quá lớn.');
    return true;
  }

  const params = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));

  if (params.get('csrf') !== csrfToken) {
    showForm(403, 'Form đã hết hiệu lực. Vui lòng nhập lại.');
    return true;
  }

  const values = {};

  for (const [name, label, , max, required] of fields) {
    values[name] = (params.get(name) || '').trim();

    if ((required && !values[name]) || values[name].length > max) {
      showForm(400, `Vui lòng kiểm tra trường ${label}.`, values);
      return true;
    }
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
    showForm(400, 'Email không hợp lệ.', values);
    return true;
  }

  values.status = params.get('status');
  if (!['active', 'inactive'].includes(values.status)) {
    showForm(400, 'Trạng thái không hợp lệ.', values);
    return true;
  }

  const date = new Date(values.joined_date + 'T00:00:00Z');
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(values.joined_date) ||
    values.joined_date < '1000-01-01' ||
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== values.joined_date
  ) {
    showForm(400, 'Ngày tham gia không hợp lệ.', values);
    return true;
  }

  try {
    const data = [...fields.map(([name]) => values[name] || null), values.status];

    if (isEdit) {
      const [result] = await pool.execute(
        `UPDATE members
         SET member_code = ?, full_name = ?, email = ?, phone = ?,
             game_name = ?, nickname = ?, joined_date = ?, status = ?
         WHERE id = ?`,
        [...data, editMatch[1]]
      );

      if (result.affectedRows === 0) {
        const [remaining] = await pool.execute(
          'SELECT id FROM members WHERE id = ?', [editMatch[1]]
        );
        if (!remaining.length) {
          sendHtml(res, 404, layout('Không tìm thấy thành viên',
            '<p>Thành viên này không còn tồn tại.</p>'));
          return true;
        }
      }
      console.log('MEMBER_UPDATED id=' + editMatch[1]);
    } else {
      await pool.execute(
        `INSERT INTO members
         (member_code, full_name, email, phone, game_name, nickname, joined_date, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        data
      );
    }

    res.writeHead(303, { Location: '/members' });
    res.end();
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      showForm(409, 'Mã thành viên hoặc email đã tồn tại.', values);
    } else {
      console.error('Add member error:', error.code || error.name);
      showForm(500, 'Chưa lưu được thành viên. Vui lòng thử lại.', values);
    }
  }

  return true;
};
