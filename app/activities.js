module.exports = async function (
  req, res, path, pool, layout, sendHtml, escapeHtml
) {
  if (path !== '/activities' && !path.startsWith('/activities/')) {
    return false;
  }

  const reply = (code, title, body) => {
    sendHtml(res, code, layout(title, body));
    return true;
  };
  const e = escapeHtml;
  const admin = req.currentUser?.role === 'admin';
  const labels = {
    planned: 'Sắp diễn ra',
    completed: 'Đã hoàn thành',
    cancelled: 'Đã hủy'
  };
  const dateText = value => String(value || '').replace('T', ' ').slice(0, 16);

  if (!req.currentUser) {
    res.writeHead(303, { Location: '/login' });
    res.end();
    return true;
  }

  if (path === '/activities' && req.method === 'GET') {
    const [rows] = await pool.execute(
      'SELECT * FROM activities ORDER BY start_time DESC, id DESC'
    );
    const body = rows.map(row => `<tr>
      <td>${e(row.title)}</td>
      <td>${e(row.location)}</td>
      <td>${e(dateText(row.start_time))}</td>
      <td>${e(dateText(row.end_time))}</td>
      <td>${e(labels[row.status])}</td>
      <td>${admin
        ? `<a href="/activities/${row.id}/edit">Sửa</a> | <a href="/activities/${row.id}/participants">Người tham gia</a>`
        : '—'}</td>
    </tr>`).join('');

    return reply(200, 'Hoạt động CLB', `
      ${admin ? '<p><a class="button" href="/activities/new">+ Thêm hoạt động</a></p>' : ''}
      <p>Tổng số: ${rows.length} hoạt động. Thời gian theo giờ Việt Nam.</p>
      <div class="panel"><table>
        <thead><tr>
          <th>Tên hoạt động</th><th>Địa điểm</th>
          <th>Bắt đầu</th><th>Kết thúc</th>
          <th>Trạng thái</th><th>Thao tác</th>
        </tr></thead>
        <tbody>${body || '<tr><td colspan="6">Chưa có hoạt động.</td></tr>'}</tbody>
      </table></div>
    `);
  }

  const match = path.match(/^\/activities\/([1-9][0-9]*)\/edit$/);
  const editing = Boolean(match);

  if (path !== '/activities/new' && !editing) {
    return reply(404, 'Không tìm thấy trang', '<a href="/activities">Quay lại</a>');
  }
  if (!admin) {
    return reply(403, 'Không có quyền', '<p>Chỉ admin được chỉnh sửa hoạt động.</p>');
  }
  if (!['GET', 'POST'].includes(req.method)) {
    res.writeHead(405, { Allow: 'GET, POST' });
    res.end();
    return true;
  }

  let values = { status: 'planned' };
  if (editing) {
    const [rows] = await pool.execute(
      'SELECT * FROM activities WHERE id = ?', [match[1]]
    );
    if (!rows.length) {
      return reply(404, 'Không tìm thấy hoạt động', '<a href="/activities">Quay lại</a>');
    }
    values = rows[0];
  }

  function showForm(code = 200, message = '') {
    const input = (name, label, type, max) => {
      let value = values[name] || '';
      if (type === 'datetime-local') {
        value = String(value).replace(' ', 'T').slice(0, 16);
      }
      return `<p><label>${e(label)}<br>
        <input name="${name}" type="${type}" required
          ${max ? `maxlength="${max}"` : 'min="1000-01-01T00:00" max="9999-12-31T23:59"'}
          value="${e(value)}">
      </label></p>`;
    };

    return reply(code, editing ? 'Sửa hoạt động' : 'Thêm hoạt động', `
      <style>
        .activity-form {max-width:650px}
        .activity-form input:not([type=hidden]),
        .activity-form textarea,.activity-form select {
          box-sizing:border-box;width:100%;padding:12px;margin-top:8px;
          border:1px solid #64748b;border-radius:6px;
          background:#0f172a;color:#e2e8f0;font:inherit
        }
      </style>
      <div class="panel activity-form">
        ${message ? `<p role="alert" style="color:#fda4af">${e(message)}</p>` : ''}
        <form method="POST" action="${e(path)}">
          <input type="hidden" name="csrf" value="${e(req.csrfToken)}">
          ${input('title', 'Tên hoạt động', 'text', 150)}
          ${input('location', 'Địa điểm hoặc phòng online', 'text', 200)}
          <p><label>Mô tả<br>
            <textarea name="description" maxlength="5000" rows="4">${e(values.description)}</textarea>
          </label></p>
          <p>Nhập thời gian theo giờ Việt Nam.</p>
          ${input('start_time', 'Thời gian bắt đầu', 'datetime-local')}
          ${input('end_time', 'Thời gian kết thúc', 'datetime-local')}
          <p><label>Trạng thái<br><select name="status">
            ${Object.entries(labels).map(([key, label]) =>
              `<option value="${key}" ${values.status === key ? 'selected' : ''}>${label}</option>`
            ).join('')}
          </select></label></p>
          <button class="button" style="border:0;cursor:pointer">Lưu hoạt động</button>
          <a href="/activities">Quay lại</a>
        </form>
      </div>
    `);
  }

  if (req.method === 'GET') return showForm();

  if (!(req.headers['content-type'] || '')
      .startsWith('application/x-www-form-urlencoded')) {
    return reply(415, 'Dữ liệu không hợp lệ', '<p>Hãy gửi bằng biểu mẫu.</p>');
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= 65536) chunks.push(chunk);
  }
  if (size > 65536) {
    return reply(413, 'Dữ liệu quá dài', '<p>Hãy giảm nội dung mô tả.</p>');
  }

  const form = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
  if (!req.csrfToken || form.get('csrf') !== req.csrfToken) {
    return reply(403, 'Biểu mẫu hết hiệu lực', '<p>Tải lại trang rồi thử lại.</p>');
  }

  values = {};
  for (const name of [
    'title', 'description', 'location', 'start_time', 'end_time', 'status'
  ]) {
    values[name] = (form.get(name) || '').trim();
  }

  if (!values.title || values.title.length > 150 ||
      !values.location || values.location.length > 200 ||
      values.description.length > 5000 ||
      !Object.hasOwn(labels, values.status)) {
    return showForm(400, 'Kiểm tra tên, địa điểm, mô tả và trạng thái.');
  }

  function validDate(value) {
    if (!/^[1-9]\d{3}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return false;
    const date = new Date(value + ':00Z');
    return Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 16) === value;
  }
  if (!validDate(values.start_time) || !validDate(values.end_time) ||
      values.end_time <= values.start_time) {
    return showForm(400, 'Thời gian phải hợp lệ; kết thúc phải sau bắt đầu.');
  }

  const data = [
    values.title, values.description, values.location,
    values.start_time.replace('T', ' ') + ':00',
    values.end_time.replace('T', ' ') + ':00',
    values.status
  ];

  if (editing) {
    await pool.execute(
      `UPDATE activities SET title=?, description=?, location=?,
       start_time=?, end_time=?, status=? WHERE id=?`,
      [...data, match[1]]
    );
    console.log('ACTIVITY_UPDATED id=' + match[1]);
  } else {
    const [result] = await pool.execute(
      `INSERT INTO activities
       (title, description, location, start_time, end_time, status)
       VALUES (?, ?, ?, ?, ?, ?)`, data
    );
    console.log('ACTIVITY_CREATED id=' + result.insertId);
  }

  res.writeHead(303, { Location: '/activities' });
  res.end();
  return true;
};
