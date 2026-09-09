const fs = require('fs');
const mysql = require('mysql2/promise');

async function importSQL() {
  const connection = await mysql.createConnection({
    host: 'sakura.proxy.rlwy.net',
    port: 14171,
    user: 'root',
    password: 'QxDdbvBOqDdCkFHdZnPdsEcTJaJlGfOM',
    database: 'railway',
    multipleStatements: true
  });

  // นำเข้าเฉพาะ 2 ไฟล์นี้พอครับ (ตัด fund_dashboard_members.sql ออก)
  const files = ['schemas.sql', 'fund_dashboard.sql'];

  for (const file of files) {
    if (fs.existsSync(file)) {
      console.log(`กำลังนำเข้า ${file}...`);
      const sql = fs.readFileSync(file, 'utf8');
      await connection.query(sql);
      console.log(`✅ ${file} สำเร็จ!`);
    } else {
      console.log(`⚠️ ไม่พบไฟล์ ${file}`);
    }
  }

  await connection.end();
  console.log('🎉 นำเข้าข้อมูลทั้งหมดเรียบร้อยแล้ว');
}

importSQL().catch(console.error);
