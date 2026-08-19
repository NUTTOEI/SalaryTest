const fs = require('fs');
const mysql = require('mysql2/promise');

async function importSQL() {
  const connection = await mysql.createConnection({
    host: 'roundhouse.proxy.rlwy.net', // Public Host ใหม่จาก Railway
    port: 24417,                        // เลขพอร์ต 5 หลักใหม่จาก Railway
    user: 'root',
    password: 'Password123',            // Password ใหม่จาก Railway
    database: 'railway',
    multipleStatements: true            // อนุญาตให้รันหลายคำสั่งพร้อมกัน
  });

  const files = ['schemas.sql', 'fund_dashboard.sql', 'fund_dashboard_members.sql'];

  for (const file of files) {
    if (fs.existsSync(file)) {
      console.log(`กำลังนำเข้า ${file}...`);
      const sql = fs.readFileSync(file, 'utf8');
      await connection.query(sql);
      console.log(`✅ ${file} สำเร็จ!`);
    }
  }

  await connection.end();
  console.log('🎉 นำเข้าข้อมูลทั้งหมดเรียบร้อยแล้ว');
}

importSQL().catch(console.error);