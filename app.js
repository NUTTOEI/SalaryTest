// app.js — เซิร์ฟเวอร์หลักตัวเดียว: serve หน้าเว็บ + API ที่ต่อ MySQL + ระบบตรวจสลิป
// รันด้วย: npm start (package.json ชี้ "start": "node app.js")

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const crypto = require('crypto');
const sharp = require('sharp');
const jsQR = require('jsqr');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const FormData = require('form-data');
const { pool, testConnection } = require('./db');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cors());
app.use(express.static(__dirname)); // serve admin.html, member.html, pay.html, css, รูป ฯลฯ

// ตรวจสอบและสร้างโฟลเดอร์ uploads อัตโนมัติหากยังไม่มี
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

const upload = multer({ storage: multer.memoryStorage() });
const processedSlips = new Set();

const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const LINE_TARGET_IDS = [
    process.env.LINE_TARGET_ID,
    'Ufac721db10fe012f12410f3cf59c3eb7', // นัท ณัฐวัฒน์
    'Ub0a8c9b3819bac10a968319bce489c2a'  // สุพรรณณิกา คงคาศรี
];
const EXPECTED_RECEIVER_NAME = "สุพรรณณิกา คงคาศรี";

const DEFAULT_MONTHS = () => Array(12).fill(false);
const DEFAULT_WEEKS = () => Array(52).fill(false);

/* ------------------------------------------------------------------ */
/* Helper: แปลงแถวจาก MySQL ให้ตรงกับ shape ที่ front-end (MEMBERS) ใช้  */
/* ------------------------------------------------------------------ */
function rowToMember(row) {
    const paidMonths = typeof row.paid_months === 'string' ? JSON.parse(row.paid_months) : (row.paid_months || DEFAULT_MONTHS());
    const paidWeeks = typeof row.paid_weeks === 'string' ? JSON.parse(row.paid_weeks) : (row.paid_weeks || DEFAULT_WEEKS());
    const history = typeof row.history === 'string' ? JSON.parse(row.history) : (row.history || []);

    return {
        id: row.id,
        branch: row.branch,
        name: row.name,
        amount: Number(row.amount),
        paidMonths,
        paidWeeks,
        history,
        paid: Array.isArray(paidMonths) && paidMonths.every(Boolean),
    };
}

/* ------------------------------------------------------------------ */
/* API: สมาชิก                                                        */
/* ------------------------------------------------------------------ */

app.get('/api/members', async (req, res) => {
    try {
        const { branch } = req.query;
        let sql = "SELECT * FROM members";
        let params = [];

        if (branch) {
            sql += " WHERE branch = ?";
            params.push(branch);
        }

        const [rows] = await pool.query(sql, params);
        const members = rows.map(rowToMember);
        res.json(members);
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.put('/api/members/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, branch, paidMonths, paidWeeks, history } = req.body;
        
        await pool.query(
            `UPDATE members
            SET name = COALESCE(?, name),
                branch = COALESCE(?, branch),
                paid_months = COALESCE(?, paid_months),
                paid_weeks = COALESCE(?, paid_weeks),
                history = COALESCE(?, history)
            WHERE id = ?`,
            [
                name || null,
                branch || null,
                paidMonths ? JSON.stringify(paidMonths) : null,
                paidWeeks ? JSON.stringify(paidWeeks) : null,
                history ? JSON.stringify(history) : null,
                id
            ]
        );

        res.json({ status: "success", message: "Update successfully" });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
});

app.post('/api/admin/members', async (req, res) => {
    try {
        const { name, amount, branch } = req.body;
        if (!name || !String(name).trim()) {
            return res.status(400).json({ status: 'error', message: 'กรุณาระบุชื่อ' });
        }
        const rate = Number(amount) || 100;
        const memberBranch = branch || 'comsci41';

        const [result] = await pool.query(
            `INSERT INTO members (branch, name, amount, paid_months, paid_weeks, history)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [memberBranch, String(name).trim(), rate, JSON.stringify(DEFAULT_MONTHS()), JSON.stringify(DEFAULT_WEEKS()), JSON.stringify([])]
        );
        const [rows] = await pool.query('SELECT * FROM members WHERE id = ?', [result.insertId]);
        res.json({ status: 'success', member: rowToMember(rows[0]) });
    } catch (err) {
        console.error('POST /api/admin/members error:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.delete('/api/admin/members/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM members WHERE id = ?', [req.params.id]);
        res.json({ status: 'success' });
    } catch (err) {
        console.error('DELETE /api/admin/members/:id error:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

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
        const history = Array.isArray(member.history) ? member.history : (typeof member.history === 'string' ? JSON.parse(member.history) : []);
        const nowDate = new Date().toLocaleDateString('th-TH');

        if (mode === 'week') {
            const rawWeeks = member.paid_weeks;
            const paidWeeks = Array.isArray(rawWeeks) ? rawWeeks.slice() : (typeof rawWeeks === 'string' ? JSON.parse(rawWeeks) : DEFAULT_WEEKS());
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
            const rawMonths = member.paid_months;
            const paidMonths = Array.isArray(rawMonths) ? rawMonths.slice() : (typeof rawMonths === 'string' ? JSON.parse(rawMonths) : DEFAULT_MONTHS());
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
/* API: เป้าหมายเก็บเงิน                                                */
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
            return res.status(400).json({ status: 'error', message: 'ยอดเงินไม่ถูกต้อง' });
        }
        await pool.query('UPDATE members SET amount = ?', [rate]);
        res.json({ status: 'success' });
    } catch (err) {
        console.error('PUT /api/admin/members/amount-all error:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

/* ------------------------------------------------------------------ */
/* ระบบตรวจสลิปโอนเงิน + แจ้งเตือน LINE                                */
/* ------------------------------------------------------------------ */
app.post('/verify-slip', upload.single('slip_image'), async (req, res) => {
    try {
        const expectedAmount = parseFloat(req.body.expected_amount);
        if (!req.file || isNaN(expectedAmount)) {
            return res.status(400).json({ status: 'fail', message: 'กรุณาแนบไฟล์สลิปและระบุยอดเงิน' });
        }

        const apiKey = (process.env.SLIPOK_API_KEY || 'SLIPOKT51XVYS').trim();
        const branchId = '73437';

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
        const transferorName = String(
            slipData.sender?.name ||
            slipData.sender?.displayName ||
            slipData.sender?.account?.name ||
            ''
        ).trim();

        if (parseFloat(slipData.amount) !== expectedAmount) {
            return res.status(400).json({
                status: 'fail',
                message: `ยอดเงินไม่ตรง! ยอดโอนจริงคือ ${slipData.amount} บาท แต่ยอดที่ต้องชำระคือ ${expectedAmount} บาท`
            });
        }

        const receiverName = slipData.receiver?.name || '';
        const receiverUpper = receiverName.toUpperCase();

        const ALLOWED_RECEIVERS = [
            "สุพรรณณิกา", "คงคาศรี", "SUPHANNIKA", "KHONGKASRI"
        ];

        const isReceiverValid = ALLOWED_RECEIVERS.some(keyword => 
            keyword.trim() !== '' && receiverUpper.includes(keyword.toUpperCase())
        );

        if (!isReceiverValid) {
            return res.status(400).json({
                status: 'fail',
                message: `บัญชีผู้รับไม่ถูกต้อง! สลิปนี้โอนไปยัง: ${receiverName}`
            });
        }

        const transRef = slipData.transRef;
        const [existing] = await pool.query('SELECT trans_ref FROM processed_slips WHERE trans_ref = ?', [transRef]);
        if (existing.length > 0) {
            return res.status(400).json({ status: 'fail', message: 'สลิปนี้เคยถูกนำมาใช้งานแล้ว' });
        }

        await pool.query('INSERT INTO processed_slips (trans_ref) VALUES (?)', [transRef]);

        const messageText =
            `👥 ชื่อผู้โอน: ${transferorName || 'ไม่ระบุ'}\n` +
            `🔔 แจ้งเตือนได้รับการชำระเงินสำเร็จ!\n` +
            `👤 ผู้รับ: ${slipData.receiver?.name || 'ไม่ระบุ'}\n` +
            `💰 ยอดเงิน: ${slipData.amount} บาท\n` +
            `📄 เลขที่รายการ: ${transRef}\n` +
            `⏰ เวลาโอน: ${slipData.transDate} ${slipData.transTime}`;

        if (LINE_ACCESS_TOKEN && LINE_TARGET_IDS.length > 0) {
            await axios.post(
                'https://api.line.me/v2/bot/message/multicast',
                { 
                    to: LINE_TARGET_IDS.filter(Boolean), 
                    messages: [{ type: 'text', text: messageText }] 
                },
                { 
                    headers: { 
                        'Content-Type': 'application/json', 
                        'Authorization': `Bearer ${LINE_ACCESS_TOKEN}` 
                    } 
                }
            );
        }

        return res.json({
            status: 'success',
            message: 'ตรวจสอบสลิปสำเร็จ',
            transferorName
        });

    } catch (err) {
        console.error('❌ /verify-slip Error:', err.response?.data || err.message);
        const errMsg = err.response?.data?.message || err.message || 'เกิดข้อผิดพลาดในการตรวจสอบสลิป';
        const statusCode = err.response?.status || 500;
        return res.status(statusCode).json({ status: 'fail', message: errMsg });
    }
});

/* ------------------------------------------------------------------ */
/* API: รูปโปรไฟล์สาขา                                                 */
/* ------------------------------------------------------------------ */
const branchStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `avatar-${uniqueSuffix}${ext}`);
    }
});


const uploadBranchAvatar = multer({
    storage: branchStorage,
    limits: { fileSize: 2 * 1024 * 1024 }, // ไม่เกิน 2MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('กรุณาอัปโหลดไฟล์รูปภาพเท่านั้น'));
        }
    }
});

app.get('/api/branch/profile', async (req, res) => {
    try {
        const { branch } = req.query;
        if (!branch) return res.status(400).json({ status: 'error', message: 'กรุณาระบุสาขา' });

        const [rows] = await pool.query(
            "SELECT `value` FROM settings WHERE `key` = ?", 
            [`avatar_branch_${branch}`]
        );
        
        const avatarUrl = rows.length > 0 ? rows[0].value : null;
        res.json({ success: true, avatarUrl });
    } catch (err) {
        console.error('GET /api/branch/profile error:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.post('/api/admin/branch/upload-profile', uploadBranchAvatar.single('avatar'), async (req, res) => {
    try {
        const branch = req.body.branch;

        if (!branch) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุสาขา' });
        }

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'กรุณาเลือกไฟล์รูปภาพ' });
        }

        const avatarUrl = `/uploads/${req.file.filename}`;

        await pool.query(
            "INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?",
            [`avatar_branch_${branch}`, avatarUrl, avatarUrl]
        );

        res.json({
            success: true,
            message: 'อัปเดตรูปโปรไฟล์สำเร็จ',
            avatarUrl: avatarUrl
        });
    } catch (error) {
        console.error('Upload Error:', error);
        res.status(500).json({ success: false, message: error.message || 'เกิดข้อผิดพลาดในการอัปโหลด' });
    }
});

/* ------------------------------------------------------------------ */
/* หน้าแรก + Webhook + start server                                    */
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
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`🚀 Server running on port ${PORT}`);
    await testConnection();
});


/* ------------------------------------------------------------------ */
/* API: สมัครสมาชิก และ เข้าสู่ระบบแอดมิน                                 */
/* ------------------------------------------------------------------ */

// 1. API ลงทะเบียนแอดมินใหม่ (เก็บเข้า MySQL)
app.post('/api/admin/register', async (req, res) => {
    try {
        const { studentId, name, branch } = req.body;
        if (!studentId || !name || !branch) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
        }

        await pool.query(
            "INSERT INTO admins (student_id, name, branch) VALUES (?, ?, ?)",
            [studentId.trim(), name.trim(), branch.trim()]
        );

        res.json({ success: true, message: 'ลงทะเบียนแอดมินสำเร็จ' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: 'รหัสนักศึกษานี้เคยลงทะเบียนไว้แล้ว' });
        }
        console.error('Register Admin Error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// 2. API ตรวจสอบรหัสนักศึกษาเพื่อเข้าสู่ระบบ
app.post('/api/admin/login', async (req, res) => {
    try {
        const { studentId } = req.body;
        if (!studentId) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกรหัสนักศึกษา' });
        }

        const [rows] = await pool.query("SELECT * FROM admins WHERE student_id = ?", [studentId.trim()]);
        
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'ไม่พบรหัสนักศึกษานี้ในระบบ กรุณาลงทะเบียนก่อน' });
        }

        const admin = rows[0];
        res.json({ 
            success: true, 
            studentId: admin.student_id, 
            name: admin.name, 
            branch: admin.branch 
        });
    } catch (err) {
        console.error('Login Admin Error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});