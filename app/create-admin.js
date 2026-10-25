const mysql = require('mysql2/promise');
const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectTimeout: 10000
  });

  try {
    const [existing] = await connection.execute(
      'SELECT id FROM users WHERE username = ?',
      ['admin']
    );

    if (existing.length > 0) {
      console.log('Tai khoan admin da ton tai. Khong thay doi mat khau.');
      return;
    }

    const password = crypto.randomBytes(15).toString('base64url');
    const salt = crypto.randomBytes(16).toString('hex');

    const hash = await scrypt(password, salt, 64, {
      N: 32768,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024
    });

    const storedHash = [
      'scrypt',
      '32768',
      '8',
      '1',
      salt,
      hash.toString('hex')
    ].join('$');

    await connection.execute(
      `INSERT INTO users (username, password_hash, role, is_active)
       VALUES (?, ?, ?, ?)`,
      ['admin', storedHash, 'admin', 1]
    );

    console.log('TAO TAI KHOAN THANH CONG');
    console.log('Ten dang nhap: admin');
    console.log('Mat khau: ' + password);
    console.log('Hay luu mat khau nay vao noi rieng truoc khi dong cua so.');
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error('Khong tao duoc tai khoan:', error.code || error.name);
  process.exitCode = 1;
});
