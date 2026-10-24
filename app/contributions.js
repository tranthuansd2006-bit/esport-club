module.exports = async function (
  req, res, path, pool, layout, sendHtml, escapeHtml
) {
  if (path !== '/contributions') return false;

  const e = escapeHtml;
  const reply = (code, title, body) => {
    sendHtml(res, code, layout(title, body));
    return true;
  };
  const error = (code, message) => reply(
    code, 'Chưa ghi nhận được đóng góp',
    `<p role="alert">${e(message)}</p>
     <a href="/contributions">Quay lại Quỹ CLB</a>`
  );

  if (!req.currentUser) {
    res.writeHead(303, { Location: '/login' });
    res.end();
    return true;
  }
  if (req.currentUser.role !== 'admin') {
    return error(403, 'Chức năng này dành cho quản trị viên.');
  }
  if (!['GET', 'POST'].includes(req.method)) {
    res.writeHead(405, { Allow: 'GET, POST' });
    res.end();
    return true;
  }

  if (req.method === 'POST') {
    if (!(req.headers['content-type'] || '')
        .startsWith('application/x-www-form-urlencoded')) {
      return error(415, 'Hãy gửi dữ liệu bằng biểu mẫu.');
    }

    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size <= 8192) chunks.push(chunk);
    }
    if (size > 8192) return error(413, 'Dữ liệu gửi lên quá dài.');

    const form = new URLSearchParams(
      Buffer.concat(chunks).toString('utf8')
    );

    if (!req.csrfToken || form.get('csrf') !== req.csrfToken) {
      return error(403, 'Biểu mẫu hết hiệu lực. Tải lại trang rồi thử lại.');
    }

    const memberId = (form.get('member_id') || '').trim();
    const amount = (form.get('amount') || '').trim();
    const date = (form.get('contribution_date') || '').trim();
    const description = (form.get('description') || '').trim();

    if (!/^[1-9][0-9]{0,9}$/.test(memberId)) {
      return error(400, 'Vui lòng chọn thành viên hợp lệ.');
    }
    if (!/^[1-9][0-9]{0,11}$/.test(amount)) {
      return error(400,
        'Số tiền phải là số nguyên từ 1 đến 999999999999 đồng, không có dấu chấm hoặc dấu phẩy.');
    }
    if (!description || description.length > 255) {
      return error(400, 'Nội dung đóng góp phải có từ 1 đến 255 ký tự.');
    }

    const parsed = new Date(date + 'T00:00:00Z');
    if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(parsed.getTime()) ||
        parsed.toISOString().slice(0, 10) !== date) {
      return error(400, 'Ngày đóng góp không hợp lệ.');
    }

    const [result] = await pool.execute(
      `INSERT INTO contributions
         (member_id, amount, contribution_date, description)
       SELECT id, ?, ?, ? FROM members
       WHERE id = ? AND status = 'active'`,
      [amount, date, description, memberId]
    );

    if (!result.affectedRows) {
      return error(400,
        'Thành viên không tồn tại hoặc đã ngừng hoạt động.');
    }

    console.log(
      'CONTRIBUTION_CREATED id=' + result.insertId +
      ' member_id=' + memberId +
      ' admin_id=' + req.currentUser.id
    );

    res.writeHead(303, { Location: '/contributions?saved=1' });
    res.end();
    return true;
  }

  const [members] = await pool.execute(
    `SELECT id, member_code, full_name FROM members
     WHERE status = 'active' ORDER BY member_code`
  );
  const [contributions] = await pool.execute(
    `SELECT c.id, c.amount, c.contribution_date, c.description,
            m.member_code, m.full_name
     FROM contributions c
     JOIN members m ON m.id = c.member_id
     ORDER BY c.contribution_date DESC, c.id DESC`
  );

  const money = value => BigInt(String(value)).toLocaleString('vi-VN') + ' đ';
  const total = contributions.reduce(
    (sum, item) => sum + BigInt(String(item.amount)), 0n
  );

  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const part = type => parts.find(item => item.type === type).value;
  const today = `${part('year')}-${part('month')}-${part('day')}`;

  const saved = new URL(req.url, 'http://localhost')
    .searchParams.get('saved') === '1';

  const rows = contributions.map(item => `<tr>
    <td>${e(item.id)}</td>
    <td>${e(item.member_code)}</td>
    <td>${e(item.full_name)}</td>
    <td style="white-space:nowrap">${e(money(item.amount))}</td>
    <td>${e(item.contribution_date)}</td>
    <td>${e(item.description)}</td>
  </tr>`).join('');

  return reply(200, 'Quỹ CLB — Đóng góp', `
    <style>
      .contribution-form {max-width:650px}
      .contribution-form input:not([type=hidden]),
      .contribution-form select {
        box-sizing:border-box;width:100%;padding:12px;margin-top:8px;
        background:#0f172a;color:#e2e8f0;
        border:1px solid #64748b;border-radius:6px;font:inherit
      }
      .contribution-form button {border:0;cursor:pointer}
    </style>

    ${saved ? '<p role="status" style="color:#86efac">Đã ghi nhận khoản đóng góp.</p>' : ''}

    <div class="panel">
      <h2>Tổng tiền đóng góp: ${e(money(total))}</h2>
      <p>Số khoản đã ghi nhận: ${contributions.length}</p>
      <p>Đây là tổng tiền thu từ đóng góp, chưa trừ các khoản chi.</p>
    </div>

    <h2>Ghi nhận đóng góp</h2>
    <div class="panel contribution-form">
      ${members.length ? `
        <form method="POST" action="/contributions">
          <input type="hidden" name="csrf" value="${e(req.csrfToken)}">
          <p><label>Thành viên
            <select name="member_id" required>
              <option value="">-- Chọn thành viên --</option>
              ${members.map(member =>
                `<option value="${e(member.id)}">${e(member.member_code)} — ${e(member.full_name)}</option>`
              ).join('')}
            </select>
          </label></p>

          <p><label>Số tiền (VNĐ)
            <input name="amount" type="number" required
              min="1" max="999999999999" step="1"
              placeholder="Ví dụ: 50000">
          </label></p>

          <p><label>Ngày đóng góp
            <input name="contribution_date" type="date" required
              min="1000-01-01" max="9999-12-31"
              value="${e(today)}">
          </label></p>

          <p><label>Nội dung đóng góp
            <input name="description" required maxlength="255"
              placeholder="Ví dụ: Đóng quỹ CLB tháng 10">
          </label></p>

          <button class="button">Lưu đóng góp</button>
        </form>
      ` : '<p>Chưa có thành viên đang hoạt động để ghi nhận đóng góp.</p>'}
    </div>

    <h2>Danh sách đóng góp</h2>
    <div class="panel"><table>
      <thead><tr>
        <th>Mã khoản</th><th>Mã thành viên</th><th>Họ tên</th>
        <th>Số tiền</th><th>Ngày đóng</th><th>Nội dung</th>
      </tr></thead>
      <tbody>
        ${rows || '<tr><td colspan="6">Chưa có khoản đóng góp.</td></tr>'}
      </tbody>
    </table></div>
  `);
};
