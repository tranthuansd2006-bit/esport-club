module.exports = async function (
  req, res, path, pool, layout, sendHtml, escapeHtml
) {
  if (path !== '/meetings' && !path.startsWith('/meetings/')) return false;

  const e = escapeHtml;
  const reply = (code, title, body) => {
    sendHtml(res, code, layout(title, body));
    return true;
  };
  const labels = {
    planned: 'Sắp diễn ra',
    completed: 'Đã hoàn thành',
    cancelled: 'Đã hủy'
  };

  if (!req.currentUser) {
    res.writeHead(303, { Location: '/login' });
    res.end();
    return true;
  }
  const admin = req.currentUser.role === 'admin';

  if (path === '/meetings' && req.method === 'GET') {
    const [rows] = await pool.execute(
      'SELECT * FROM meetings ORDER BY start_time DESC, id DESC'
    );
    const body = rows.map(row => `
      <div class="panel" style="margin-bottom:20px">
        <h2>${e(row.title)}</h2>
        <p><strong>Địa điểm:</strong> ${e(row.location)}</p>
        <p><strong>Thời gian:</strong>
          ${e(String(row.start_time).slice(0, 16))}
          → ${e(String(row.end_time).slice(0, 16))}
          (giờ Việt Nam)
        </p>
        <p><strong>Trạng thái:</strong> ${e(labels[row.status])}</p>
        <h3>Nội dung dự kiến</h3>
        <p style="white-space:pre-wrap">${e(row.agenda || 'Chưa có nội dung.')}</p>
        <h3>Biên bản / Kết luận</h3>
        <p style="white-space:pre-wrap">${e(row.minutes || 'Chưa có kết luận.')}</p>
        ${admin ? `<a class="button" href="/meetings/${row.id}/edit">Sửa / Ghi kết luận</a>` : ''}
      </div>
    `).join('');

    return reply(200, 'Lịch họp CLB', `
      ${admin ? '<p><a class="button" href="/meetings/new">+ Tạo lịch họp</a></p>' : ''}
      <p>Tổng số: ${rows.length} cuộc họp</p>
      ${body || '<div class="panel">Chưa có lịch họp.</div>'}
    `);
  }

  const match = path.match(/^\/meetings\/([1-9][0-9]*)\/edit$/);
  const editing = Boolean(match);

  if (path !== '/meetings/new' && !editing) {
    return reply(404, 'Không tìm thấy trang',
      '<a href="/meetings">Về lịch họp</a>');
  }
  if (!admin) {
    return reply(403, 'Không có quyền',
      '<p>Chức năng này dành cho quản trị viên.</p>');
  }
  if (!['GET', 'POST'].includes(req.method)) {
    res.writeHead(405, { Allow: 'GET, POST' });
    res.end();
    return true;
  }

  let values = { status: 'planned' };
  if (editing) {
    const [rows] = await pool.execute(
      'SELECT * FROM meetings WHERE id = ?', [match[1]]
    );
    if (!rows.length) {
      return reply(404, 'Không tìm thấy cuộc họp',
        '<a href="/meetings">Về lịch họp</a>');
    }
    values = rows[0];
  }

  function showForm(code = 200, message = '') {
    const input = (name, label, type, max) => {
      let value = values[name] || '';
      if (type === 'datetime-local') {
        value = String(value).replace(' ', 'T').slice(0, 16);
      }
      return `<p><label>${e(label)}
        <input name="${name}" type="${type}" required
          ${max ? `maxlength="${max}"` : 'min="1000-01-01T00:00" max="9999-12-31T23:59"'}
          value="${e(value)}">
      </label></p>`;
    };

    return reply(code, editing ? 'Sửa lịch họp' : 'Tạo lịch họp', `
      <style>
        .meeting-form {max-width:700px}
        .meeting-form input:not([type=hidden]),
        .meeting-form textarea,.meeting-form select {
          box-sizing:border-box;width:100%;padding:12px;margin-top:8px;
          border:1px solid #64748b;border-radius:6px;
          background:#0f172a;color:#e2e8f0;font:inherit
        }
        .meeting-form button {border:0;cursor:pointer}
      </style>
      <div class="panel meeting-form">
        ${message ? `<p role="alert" style="color:#fda4af">${e(message)}</p>` : ''}
        <form method="POST" action="${e(path)}">
          <input type="hidden" name="csrf" value="${e(req.csrfToken)}">
          ${input('title', 'Chủ đề cuộc họp', 'text', 150)}
          ${input('location', 'Địa điểm hoặc phòng online', 'text', 200)}
          <p>Nhập thời gian theo giờ Việt Nam.</p>
          ${input('start_time', 'Thời gian bắt đầu', 'datetime-local')}
          ${input('end_time', 'Thời gian kết thúc', 'datetime-local')}
          <p><label>Nội dung dự kiến
            <textarea name="agenda" rows="4" maxlength="5000">${e(values.agenda)}</textarea>
          </label></p>
          <p><label>Biên bản / Kết luận sau cuộc họp
            <textarea name="minutes" rows="5" maxlength="5000">${e(values.minutes)}</textarea>
          </label></p>
          <p><label>Trạng thái
            <select name="status">
              ${Object.entries(labels).map(([key, label]) =>
                `<option value="${key}" ${values.status === key ? 'selected' : ''}>${label}</option>`
              ).join('')}
            </select>
          </label></p>
          <button class="button">Lưu lịch họp</button>
          <a href="/meetings">Quay lại</a>
        </form>
      </div>
    `);
  }

  if (req.method === 'GET') return showForm();

  if (!(req.headers['content-type'] || '')
      .startsWith('application/x-www-form-urlencoded')) {
    return reply(415, 'Dữ liệu không hợp lệ',
      '<p>Hãy gửi dữ liệu bằng biểu mẫu.</p>');
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= 131072) chunks.push(chunk);
  }
  if (size > 131072) {
    return reply(413, 'Dữ liệu quá dài', '<p>Hãy giảm nội dung nhập.</p>');
  }

  const form = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
  if (!req.csrfToken || form.get('csrf') !== req.csrfToken) {
    return reply(403, 'Biểu mẫu hết hiệu lực',
      '<p>Tải lại trang rồi thử lại.</p>');
  }

  values = {};
  for (const name of [
    'title', 'location', 'start_time', 'end_time',
    'agenda', 'minutes', 'status'
  ]) {
    values[name] = (form.get(name) || '').trim();
  }

  if (!values.title || values.title.length > 150 ||
      !values.location || values.location.length > 200 ||
      values.agenda.length > 5000 || values.minutes.length > 5000 ||
      !Object.hasOwn(labels, values.status)) {
    return showForm(400, 'Kiểm tra chủ đề, địa điểm, nội dung và trạng thái.');
  }

  function validDate(value) {
    if (!/^[1-9]\d{3}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return false;
    const date = new Date(value + ':00Z');
    return Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 16) === value;
  }
  if (!validDate(values.start_time) || !validDate(values.end_time) ||
      values.end_time <= values.start_time) {
    return showForm(400, 'Thời gian kết thúc phải sau bắt đầu và ngày giờ phải hợp lệ.');
  }

  const data = [
    values.title, values.location,
    values.start_time.replace('T', ' ') + ':00',
    values.end_time.replace('T', ' ') + ':00',
    values.agenda, values.minutes, values.status
  ];

  if (editing) {
    await pool.execute(
      `UPDATE meetings SET title=?, location=?, start_time=?,
       end_time=?, agenda=?, minutes=?, status=? WHERE id=?`,
      [...data, match[1]]
    );
    console.log('MEETING_UPDATED id=' + match[1] +
      ' admin_id=' + req.currentUser.id);
  } else {
    const [result] = await pool.execute(
      `INSERT INTO meetings
       (title, location, start_time, end_time, agenda, minutes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`, data
    );
    console.log('MEETING_CREATED id=' + result.insertId +
      ' admin_id=' + req.currentUser.id);
  }

  res.writeHead(303, { Location: '/meetings' });
  res.end();
  return true;
};
