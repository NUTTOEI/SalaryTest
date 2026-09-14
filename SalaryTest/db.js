// db.js — เชื่อมต่อ MySQL แบบ connection pool (ใช้ mysql2/promise)
// อ่านค่า config จาก environment variables (ตั้งค่าใน .env หรือใน Render > Environment)

require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'metro.proxy.rlwy.net',
    port: process.env.DB_PORT || 24417,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'KRHJNTMmlMjZhCwYQPfZQYtIjYPrlkAW',
    database: process.env.DB_NAME || 'railway',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    // ตัวเลือกนี้ทำให้ mysql2 คืนค่าคอลัมน์ชนิด JSON เป็น object/array ให้อัตโนมัติ
    // (ไม่ต้อง JSON.parse เองในโค้ดฝั่ง route)
});

// ping ตอนสตาร์ทเซิร์ฟเวอร์ เพื่อ fail-fast ถ้าต่อ MySQL ไม่ได้ (จะได้เห็น error ทันที ไม่ใช่หน้าว่างเงียบๆ)
async function testConnection() {
    const safeHost = process.env.DB_HOST || 'metro.proxy.rlwy.net';
    const safeUser = process.env.DB_USER || 'root';
    const safeDb = process.env.DB_NAME || 'railway';

    try {
        const conn = await pool.getConnection();
        await conn.ping();
        conn.release();
        console.log(`✅ เชื่อมต่อ MySQL สำเร็จ (host=${safeHost} db=${safeDb} user=${safeUser})`);
    } catch (err) {
        console.error(`❌ เชื่อมต่อ MySQL ไม่สำเร็จ (host=${safeHost} db=${safeDb} user=${safeUser})`);
        console.error('   code:', err.code || '(ไม่มี)');
        console.error('   errno:', err.errno || '(ไม่มี)');
        console.error('   message:', err.message || '(ว่างเปล่า — ดู code/errno ด้านบนแทน)');
        console.error('   ตรวจสอบ DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME ใน environment variables');
    }
}

module.exports = { pool, testConnection };