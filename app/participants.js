module.exports = async function (
  req, res, path, pool, layout, sendHtml, escapeHtml
) {
  const match = path.match(/^\/activities\/([1-9][0-9]*)\/participants$/);
  if (!match) return false;

  const activityId = match[1];
  const e = escapeHtml;
  const reply = (code, title, body) => {
    sendHtml(res, code, layout(title, body));
    return true;
  };
  const error = (code, message) => reply(
    code, 'Chưa thực hiện được',
    `<p role="alert">${e(message)}</p><a href="${e(path)}">Quay lại</a>`
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

  const [activities] = await pool.execute(
    'SELECT id, title, status FROM activities WHERE id = ?',
    [activityId]
  );
  const activity = activities[0];
  if (!activity) {
    return reply(404, 'Không tìm thấy hoạt động',
      '<a href="/activities">Về danh sách hoạt động</a>');
  }

  const labels = {
    registered: 'Đã đăng ký',
    present: 'Có mặt',
    absent: 'Vắng mặt',
    cancelled: 'Đã hủy'
  };

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
    if (size > 8192) {
      return error(413, 'Dữ liệu gửi lên quá dài.');
    }

    const form = new URLSearchParams(
      Buffer.concat(chunks).toString('utf8')
    );
    if (!req.csrfToken || form.get('csrf') !== req.csrfToken) {
      return error(403, 'Biểu mẫu hết hiệu lực. Tải lại trang rồi thử lại.');
    }

    const memberId = form.get('member_id') || '';
    if (!/^[1-9][0-9]{0,9}$/.test(memberId)) {
      return error(400, 'Vui lòng chọn thành viên hợp lệ.');
    }

    const action = form.get('action');

    if (action === 'register') {
      if (activity.status !== 'planned') {
        return error(400,
          'Chỉ thêm người tham gia khi hoạt động ở trạng thái Sắp diễn ra.');
      }

      try {
        const [result] = await pool.execute(
          `INSERT INTO activity_participants (activity_id, member_id)
           SELECT ?, id FROM members
           WHERE id = ? AND status = 'active'`,
          [activityId, memberId]
        );
        if (!result.affectedRows) {
          return error(400,
            'Thành viên không tồn tại hoặc đã ngừng hoạt động.');
        }
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          return error(409,
            'Thành viên đã có trong danh sách. Nếu đã hủy, hãy đổi lại trạng thái.');
        }
        throw err;
      }

      console.log(
        'PARTICIPANT_REGISTERED activity_id=' + activityId +
        ' member_id=' + memberId +
        ' admin_id=' + req.currentUser.id
      );
    } else if (action === 'attendance') {
      const attendance = form.get('attendance') || '';
      if (!Object.hasOwn(labels, attendance)) {
        return error(400, 'Trạng thái điểm danh không hợp lệ.');
      }

      const [existing] = await pool.execute(
        `SELECT id FROM activity_participants
         WHERE activity_id = ? AND member_id = ?`,
        [activityId, memberId]
      );
      if (!existing.length) {
        return error(404, 'Thành viên chưa đăng ký hoạt động này.');
      }

      await pool.execute(
        `UPDATE activity_participants SET attendance = ?
         WHERE activity_id = ? AND member_id = ?`,
        [attendance, activityId, memberId]
      );

      console.log(
        'ATTENDANCE_UPDATED activity_id=' + activityId +
        ' member_id=' + memberId +
        ' status=' + attendance +
        ' admin_id=' + req.currentUser.id
      );
    } else {
      return error(400, 'Thao tác không hợp lệ.');
    }

    res.writeHead(303, { Location: path });
    res.end();
    return true;
  }

  const [participants] = await pool.execute(
    `SELECT p.member_id, p.attendance,
            m.member_code, m.full_name, m.game_name
     FROM activity_participants p
     JOIN members m ON m.id = p.member_id
     WHERE p.activity_id = ?
     ORDER BY m.member_code`,
    [activityId]
  );

  const [available] = await pool.execute(
    `SELECT m.id, m.member_code, m.full_name
     FROM members m
     WHERE m.status = 'active'
       AND NOT EXISTS (
         SELECT 1 FROM activity_participants p
         WHERE p.activity_id = ? AND p.member_id = m.id
       )
     ORDER BY m.member_code`,
    [activityId]
  );

  const csrf = `<input type="hidden" name="csrf" value="${e(req.csrfToken)}">`;
  const counts = { registered: 0, present: 0, absent: 0, cancelled: 0 };
  for (const participant of participants) {
    counts[participant.attendance]++;
  }

  const rows = participants.map(person => `<tr>
    <td>${e(person.member_code)}</td>
    <td>${e(person.full_name)}</td>
    <td>${e(person.game_name)}</td>
    <td>${e(labels[person.attendance])}</td>
    <td>
      <form method="POST" action="${e(path)}" class="attendance-form">
        ${csrf}
        <input type="hidden" name="action" value="attendance">
        <input type="hidden" name="member_id" value="${e(person.member_id)}">
        <select name="attendance"
          aria-label="Trạng thái của ${e(person.full_name)}">
          ${Object.entries(labels).map(([value, label]) =>
            `<option value="${value}" ${person.attendance === value ? 'selected' : ''}>${label}</option>`
          ).join('')}
        </select>
        <button class="button">Lưu</button>
      </form>
    </td>
  </tr>`).join('');

  let registerForm = '';
  if (activity.status !== 'planned') {
    registerForm = '<p>Hoạt động đã hoàn thành hoặc đã hủy: không nhận đăng ký mới.</p>';
  } else if (!available.length) {
    registerForm = '<p>Không còn thành viên đang hoạt động chưa được thêm vào danh sách.</p>';
  } else {
    registerForm = `
      <form method="POST" action="${e(path)}" class="attendance-form">
        ${csrf}
        <input type="hidden" name="action" value="register">
        <label>Chọn thành viên
          <select name="member_id" required>
            <option value="">-- Chọn thành viên --</option>
            ${available.map(member =>
              `<option value="${e(member.id)}">${e(member.member_code)} — ${e(member.full_name)}</option>`
            ).join('')}
          </select>
        </label>
        <button class="button">+ Thêm người tham gia</button>
      </form>`;
  }

  return reply(200, 'Người tham gia: ' + activity.title, `
    <style>
      .attendance-form {
        display:flex;gap:10px;align-items:center;flex-wrap:wrap
      }
      .attendance-form select {
        padding:10px;border-radius:6px;
        background:#0f172a;color:#e2e8f0;border:1px solid #64748b
      }
      .attendance-form button {border:0;cursor:pointer}
    </style>
    <p><a href="/activities">← Danh sách hoạt động</a></p>
    <div class="panel">
      <h2>Đăng ký tham gia</h2>
      ${registerForm}
    </div>
    <p>
      Đã đăng ký: <strong>${counts.registered}</strong> |
      Có mặt: <strong>${counts.present}</strong> |
      Vắng mặt: <strong>${counts.absent}</strong> |
      Đã hủy: <strong>${counts.cancelled}</strong>
    </p>
    <div class="panel"><table>
      <thead><tr>
        <th>Mã thành viên</th><th>Họ tên</th><th>Game</th>
        <th>Trạng thái</th><th>Điểm danh</th>
      </tr></thead>
      <tbody>
        ${rows || '<tr><td colspan="5">Chưa có người tham gia.</td></tr>'}
      </tbody>
    </table></div>
  `);
};
