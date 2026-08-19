// app.js — เซิร์ฟเวอร์หลักตัวเดียว: serve หน้าเว็บ + API ที่ต่อ MySQL + ระบบตรวจสลิป (เดิมอยู่ใน scanQR.js)
// รันด้วย: npm start  (package.json ต้องชี้ "start": "node app.js")

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const crypto = require('crypto');
const sharp = require('sharp');
const jsQR = require('jsqr');
const axios = require('axios');
const path = require('path');
const FormData = require('form-data');

const { pool, testConnection } = require('./db');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cors());
app.use(express.static(__dirname)); // serve admin.html, member.html, pay.html, css, รูป ฯลฯ

const upload = multer({ storage: multer.memoryStorage() });
const processedSlips = new Set();

const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const LINE_TARGET_IDS = [
    process.env.LINE_TARGET_ID,
    'Ufac721db10fe012f12410f3cf59c3eb7', // นัท ณัฐวัฒน์
    'Uf963df571b9d63db04690e4801fe1439' // ฟิล์ม ปุณณ์เมธ
   
]
const EXPECTED_RECEIVER_NAME = "ปุณณ์เมธ ม่วงวิเชียร";

const DEFAULT_MONTHS = () => Array(12).fill(false);
const DEFAULT_WEEKS = () => Array(52).fill(false);

/* ------------------------------------------------------------------ */
/*  Helper: แปลงแถวจาก MySQL ให้ตรงกับ shape ที่ front-end (MEMBERS) ใช้อยู่  */
/* ------------------------------------------------------------------ */
function rowToMember(row) {
    return {
        id: row.id,
        branch: row.branch,
        name: row.name,
        amount: Number(row.amount),
        paidMonths: row.paid_months,
        paidWeeks: row.paid_weeks,
        history: row.history,
        // ให้เข้ากันได้กับโค้ดเก่าบางจุดที่เช็ค m.paid ตรงๆ
        paid: Array.isArray(row.paid_months) && row.paid_months.every(Boolean),
    };
}

/* ------------------------------------------------------------------ */
/*  API: สมาชิก                                                        */
/* ------------------------------------------------------------------ */

app.get('/api/members', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM members');
        res.json(rows.map(rowToMember));
    } catch (err) {
        console.error('GET /api/members error:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// GET /api/members — ที่ admin.js / member.js / pay.js เรียกทุกครั้งตอนโหลดหน้า
app.put('/api/members/:id', async (req, res) => {
    const { id } = req.params;
    const { paidMonths, paidWeeks, history } = req.body;
    try {
        await pool.query(
            'UPDATE members SET paid_months = ?, paid_weeks = ?, history = ? WHERE id = ?',
            [
                JSON.stringify(paidMonths || DEFAULT_MONTHS()),
                JSON.stringify(paidWeeks || DEFAULT_WEEKS()),
                JSON.stringify(history || []),
                id
            ]
        );
        res.json({ success: true, message: 'อัปเดตข้อมูลสำเร็จ' });
    } catch (err) {
        console.error('PUT /api/members/:id error:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// POST /api/admin/members — เพิ่มสมาชิกใหม่ { name, amount }
app.post('/api/admin/members', async (req, res) => {
    try {
        const { name, amount } = req.body;
        if (!name || !String(name).trim()) {
            return res.status(400).json({ status: 'error', message: 'กรุณาระบุชื่อ' });
        }
        const rate = Number(amount) || 100;
        const [result] = await pool.query(
            `INSERT INTO members (branch, name, amount, paid_months, paid_weeks, history)
             VALUES (?, ?, ?, ?, ?, ?)`,
            ['comsci41', String(name).trim(), rate, JSON.stringify(DEFAULT_MONTHS()), JSON.stringify(DEFAULT_WEEKS()), JSON.stringify([])]
        );
        const [rows] = await pool.query('SELECT * FROM members WHERE id = ?', [result.insertId]);
        res.json({ status: 'success', member: rowToMember(rows[0]) });
    } catch (err) {
        console.error('POST /api/admin/members error:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// DELETE /api/admin/members/:id
app.delete('/api/admin/members/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM members WHERE id = ?', [req.params.id]);
        res.json({ status: 'success' });
    } catch (err) {
        console.error('DELETE /api/admin/members/:id error:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// PUT /api/admin/members/:id/amount — { amount }
app.put('/api/admin/members/:id/amount', async (req, res) => {
    try {
        const rate = Number(req.body.amount);
        if (!isFinite(rate) || rate < 0) {
            return res.status(400).json({ status: 'error', message: 'ยอดเงินไม่ถูกต้อง' });
        }
        await pool.query('UPDATE members SET amount = ? WHERE id = ?', [rate, req.params.id]);
        res.json({ status: 'success' });
    } catch (err) {
        console.error('PUT /api/admin/members/:id/amount error:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// POST /api/admin/toggle-paid — { memberId, mode, monthIndex, weekIndex }
app.post('/api/admin/toggle-paid', async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const { memberId, mode, monthIndex, weekIndex } = req.body;
        const [rows] = await conn.query('SELECT * FROM members WHERE id = ? FOR UPDATE', [memberId]);
        if (rows.length === 0) {
            conn.release();
            return res.status(404).json({ status: 'error', message: 'ไม่พบสมาชิก' });
        }
        const member = rows[0];
        const rate = Number(member.amount) || 100;
        const history = Array.isArray(member.history) ? member.history : [];
        const nowDate = new Date().toLocaleDateString('th-TH');

        if (mode === 'week') {
            const paidWeeks = Array.isArray(member.paid_weeks) ? member.paid_weeks.slice() : DEFAULT_WEEKS();
            const newStatus = !Boolean(paidWeeks[weekIndex]);
            paidWeeks[weekIndex] = newStatus;
            history.push({
                date: nowDate,
                method: newStatus ? 'Admin บันทึกชำระเงิน' : 'Admin ยกเลิกการชำระ',
                amount: newStatus ? rate : -rate,
                weeks: [weekIndex],
            });
            await conn.query(
                'UPDATE members SET paid_weeks = ?, history = ? WHERE id = ?',
                [JSON.stringify(paidWeeks), JSON.stringify(history), memberId]
            );
        } else {
            const paidMonths = Array.isArray(member.paid_months) ? member.paid_months.slice() : DEFAULT_MONTHS();
            const newStatus = !Boolean(paidMonths[monthIndex]);
            paidMonths[monthIndex] = newStatus;
            history.push({
                date: nowDate,
                method: newStatus ? 'Admin บันทึกชำระเงิน' : 'Admin ยกเลิกการชำระ',
                amount: newStatus ? rate : -rate,
                months: [monthIndex],
            });
            await conn.query(
                'UPDATE members SET paid_months = ?, history = ? WHERE id = ?',
                [JSON.stringify(paidMonths), JSON.stringify(history), memberId]
            );
        }

        conn.release();
        res.json({ status: 'success' });
    } catch (err) {
        conn.release();
        console.error('POST /api/admin/toggle-paid error:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// POST /api/admin/reset — ล้างสถานะจ่ายเงินของทุกคนกลับเป็นค่าเริ่มต้น
app.post('/api/admin/reset', async (req, res) => {
    try {
        await pool.query(
            'UPDATE members SET paid_months = ?, paid_weeks = ?, history = ?',
            [JSON.stringify(DEFAULT_MONTHS()), JSON.stringify(DEFAULT_WEEKS()), JSON.stringify([])]
        );
        res.json({ status: 'success' });
    } catch (err) {
        console.error('POST /api/admin/reset error:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

/* ------------------------------------------------------------------ */
/*  API: เป้าหมายเก็บเงิน (ทางเลือก — แทนที่ localStorage เดิมถ้าต้องการ sync ข้ามเครื่อง)  */
/* ------------------------------------------------------------------ */
app.get('/api/settings/target', async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT `value` FROM settings WHERE `key` = 'target_amount'");
        const targetVal = rows.length ? Number(rows[0].value) : 4000;
        res.json({ target: isNaN(targetVal) ? 4000 : targetVal });
    } catch (err) {
        console.error('GET /api/settings/target error:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.put('/api/settings/target', async (req, res) => {
    try {
        const target = Number(req.body.target);
        if (!isFinite(target) || target <= 0) {
            return res.status(400).json({ status: 'error', message: 'เป้าหมายไม่ถูกต้อง' });
        }
        await pool.query(
            "INSERT INTO settings (`key`, `value`) VALUES ('target_amount', ?) ON DUPLICATE KEY UPDATE `value` = ?",
            [String(target), String(target)]
        );
        res.json({ status: 'success', target });
    } catch (err) {
        console.error('PUT /api/settings/target error:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.put('/api/admin/members/amount-all', async (req, res) => {
    try {
        const rate = Number(req.body.amount);
        if (!isFinite(rate) || rate < 0) {
            return res.status(400).json({ status: 'error', message: 'ยอดเงินไม่ถูกต้องๅ' });
        }
        await pool.query('UPDATE members SET amount = ?', [rate]);
        res.json({ status: 'success' });
    } catch (err) {
        console.error('PUT /api/admin/members/amount-all error:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

/* ------------------------------------------------------------------ */
/*  ระบบตรวจสลิปโอนเงิน + แจ้งเตือน LINE (ย้ายมาจาก scanQR.js เดิม)      */
/* ------------------------------------------------------------------ */
// เพิ่ม Environment Variable บน Render: SLIPOK_API_KEY
const SLIPOK_API_KEY = process.env.SLIPOK_API_KEY; 

app.post('/verify-slip', upload.single('slip_image'), async (req, res) => {
    try {
        const expectedAmount = parseFloat(req.body.expected_amount);
        if (!req.file || isNaN(expectedAmount)) {
            return res.status(400).json({ status: 'fail', message: 'กรุณาแนบไฟล์สลิปและระบุยอดเงิน' });
        }

        const apiKey = (process.env.SLIPOK_API_KEY || 'SLIPOKT51XVYS').trim();
        const branchId = '73437';

        // สร้าง FormData เพื่อส่งไฟล์รูปภาพสลิปตรงไปยัง SlipOK
        const formData = new FormData();
        formData.append('files', req.file.buffer, {
            filename: req.file.originalname || 'slip.jpg',
            contentType: req.file.mimetype
        });
        formData.append('log', 'true');

        const slipokResponse = await axios.post(
            `https://api.slipok.com/api/line/apikey/${branchId}`,
            formData,
            { 
                headers: { 
                    ...formData.getHeaders(),
                    'x-authorization' : apiKey
                } 
            }
        );

        const result = slipokResponse.data;
        if (!result.success) {
            return res.status(400).json({ 
                status: 'fail', 
                message: result.message || 'สลิปไม่ถูกต้อง ไม่พบข้อมูลการโอนเงินจากธนาคาร' 
            });
        }

        const slipData = result.data;

        // 3. ตรวจสอบยอดเงินโอนจริงจากธนาคาร
        if (parseFloat(slipData.amount) !== expectedAmount) {
            return res.status(400).json({
                status: 'fail',
                message: `ยอดเงินไม่ตรง! ยอดโอนจริงคือ ${slipData.amount} บาท แต่ยอดที่ต้องชำระคือ ${expectedAmount} บาท`
            });
        }

        // 4. ตรวจสอบชื่อผู้รับโอน
        const receiverName = slipData.receiver?.name || '';
        const receiverUpper = receiverName.toUpperCase();

        const ALLOWED_RECEIVERS = [
            // "ณัฐวัฒน์", "สุดพูล", "NATTHAWAT", "NATTAWAT", "SUDPOOL", "SUTPOOL",

            "ปุณณ์เมธ", "ม่วงวิเชียร", "PUNMETH", "PUNNAMET", "MUANGWICHIAN",
        ];

        const isReceiverValid = ALLOWED_RECEIVERS.some(keyword => keyword.trim() !== '' && receiverUpper.includes(keyword.toUpperCase())
    );

        if (!isReceiverValid) {
            return res.status(400).json({
                status: 'fail',
                message: `บัญชีผู้รับไม่ถูกต้อง! สลิปนี้โอนไปยัง: ${receiverName}`
            });
        }

        // 5. เช็คเลขที่รายการ (transRef) ใน MySQL กันส่งสลิปซ้ำ
        const transRef = slipData.transRef;
        const [existing] = await pool.query('SELECT trans_ref FROM processed_slips WHERE trans_ref = ?', [transRef]);
        if (existing.length > 0) {
            return res.status(400).json({ status: 'fail', message: 'สลิปนี้เคยถูกนำมาใช้งานแล้ว' });
        }

        // บันทึก transRef ลงฐานข้อมูล
        await pool.query('INSERT INTO processed_slips (trans_ref) VALUES (?)', [transRef]);

        // 6. ส่งแจ้งเตือน LINE Notify / LINE Messaging API
        const messageText =
            `🔔 แจ้งเตือนได้รับการชำระเงินสำเร็จ!\n` +
            `👤 ผู้รับ: ${slipData.receiver.name}\n` +
            `💰 ยอดเงิน: ${slipData.amount} บาท\n` +
            `📄 เลขที่รายการ: ${transRef}\n` +
            `⏰ เวลาโอน: ${slipData.transDate} ${slipData.transTime}`;

        if (LINE_ACCESS_TOKEN && LINE_TARGET_IDS.length > 0) {
            await axios.post(
                'https://api.line.me/v2/bot/message/multicast',
                { 
                    to: LINE_TARGET_IDS, 
                    messages: [{ type: 'text', text: messageText }] 
                },
                { headers: { 
                    'Content-Type': 'application/json', 
                    'Authorization': `Bearer ${LINE_ACCESS_TOKEN}` 
                } 
            }
        );
    }

        return res.json({ status: 'success', message: 'ตรวจสอบสลิปสำเร็จ' });

    } catch (err) {
        console.error('❌ /verify-slip Error:', err.response?.data || err.message);
        const errMsg = err.response?.data?.message || err.message || 'เกิดข้อผิดพลาดในการตรวจสอบสลิป';
        const statusCode = err.response?.status || 500;
        return res.status(statusCode).json({ status: 'fail', message: errMsg });
    }
});

/* ------------------------------------------------------------------ */
/*  หน้าแรก + start server                                             */
/* ------------------------------------------------------------------ */
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'member.html'));
});

app.post('/webhook', (req, res) => {
    const events = req.body.events || [];
    events.forEach(event => {
        if (event.source && event.source.userId) {
            console.log('====================================');
            console.log('User ID ของคนที่ทักมา:', event.source.userId);
            console.log('====================================');
        }
    });
    res.sendStatus(200);
})

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`🚀 Server running on port ${PORT}`);
    await testConnection();
});
