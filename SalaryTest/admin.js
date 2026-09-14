if (typeof MEMBERS === "undefined") MEMBERS = [];
if (typeof TARGET_AMOUNT === "undefined") TARGET_AMOUNT = 0;

function getActiveMonthIndex() {
    const val = localStorage.getItem("fund-dashboard-active-month");
    return val !== null ? Number(val) : new Date().getMonth();
}

function getActiveWeekIndex() {
    const val = localStorage.getItem("fund-dashboard-active-week");
    return val !== null ? Number(val) : 0;
}

function safeSetText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function safeFmtMoney(val) {
    return typeof fmtMoney === "function" ? fmtMoney(val) : `฿${Number(val || 0).toLocaleString()}`;
}

function exportMembersToExcel() {
    if (typeof XLSX === "undefined") {
        alert("ไม่สามารถโหลดระบบส่งออก Excel ได้ กรุณาลองใหม่อีกครั้ง");
        return;
    }

    const rows = MEMBERS.map((member, index) => {
        let paidMonths = [];
        if (Array.isArray(member.paidMonths)) {
            paidMonths = member.paidMonths;
        } else if (typeof member.paidMonths === "string") {
            try { paidMonths = JSON.parse(member.paidMonths); } catch (e) { paidMonths = []; }
        }
        return {
            "ลำดับ": index + 1,
            "ชื่อสมาชิก": member.name || "",
            "อัตราต่อเดือน": Number(member.amount) || 0,
            "ชำระแล้ว (เดือน)": paidMonths.filter(Boolean).length,
            "สถานะเดือนปัจจุบัน": isMemberPaidCurrent(member) ? "จ่ายแล้ว" : "ค้างชำระ"
        };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet["!cols"] = [
        { wch: 8 },
        { wch: 30 },
        { wch: 16 },
        { wch: 18 },
        { wch: 24 }
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "สมาชิก");
    XLSX.writeFile(workbook, `รายชื่อสมาชิก-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

let state = { query: "", filter: "all", sort: "index", ratePreview: 100 };

function parseArrayField(field, defaultLen = 12) {
    if (Array.isArray(field)) return field;
    if (typeof field === "string") {
        try { return JSON.parse(field); } catch (e) { }
    }
    return Array(defaultLen).fill(false);
}

function isMemberPaidCurrent(m) {
    const mode = localStorage.getItem("fund-dashboard-mode") || "month";
    if (mode === "month") {
        const currentMonth = getActiveMonthIndex();
        const paidMonths = parseArrayField(m.paidMonths, 12);
        return Boolean(paidMonths[currentMonth]);
    } else {
        const activeWeek = Number(localStorage.getItem("fund-dashboard-active-week")) || 0;
        const totalWeeks = typeof WEEKS_LIST !== "undefined" ? WEEKS_LIST.length : 52;
        const paidWeeks = parseArrayField(m.paidWeeks, totalWeeks);
        return Boolean(paidWeeks[activeWeek]);
    }
}

function computeStats() {
    const mode = localStorage.getItem("fund-dashboard-mode") || "month";
    const paid = MEMBERS.filter(m => isMemberPaidCurrent(m)).length;
    const unpaid = MEMBERS.length - paid;
    const target = TARGET_AMOUNT;

    const collected = MEMBERS.reduce((sum, m) => {
        const rate = Number(m.amount) || 100;
        if (mode === "month") {
            const paidMonthsCount = parseArrayField(m.paidMonths, 12).filter(Boolean).length;
            return sum + (paidMonthsCount * rate); 
        } else {
            const totalWeeks = typeof WEEKS_LIST !== "undefined" ? WEEKS_LIST.length : 52;
            const paidWeeksCount = parseArrayField(m.paidWeeks, totalWeeks).filter(Boolean).length;
            return sum + (paidWeeksCount * rate);
        }
    }, 0);

    const pct = target > 0 ? Math.round((collected / target) * 100) : 0;
    return { paid, unpaid, collected, target, pct };
}

function sortedFilteredMembers() {
    let items = MEMBERS.filter(m => {
        const isPaid = isMemberPaidCurrent(m);
        const q = m.name ? m.name.includes(state.query.trim()) : false;
        const f = state.filter === "all" ? true : state.filter === "paid" ? isPaid : !isPaid;
        return q && f;
    });
    if (state.sort === "name") {
        items = items.slice().sort((a, b) => a.name.localeCompare(b.name, "th"));
    } else if (state.sort === "unpaid-first") {
        items = items.slice().sort((a, b) => Number(isMemberPaidCurrent(a)) - Number(isMemberPaidCurrent(b)));
    }
    return items;
}

async function togglePaid(id) {
    const mode = localStorage.getItem("fund-dashboard-mode") || "month";
    const currentMonth = getActiveMonthIndex();
    const activeWeek = Number(localStorage.getItem("fund-dashboard-active-week")) || 0;

    try {
        await fetch("/api/admin/toggle-paid", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ memberId: id, mode, monthIndex: currentMonth, weekIndex: activeWeek })
        });
        await loadFromStorage();
    } catch (err) {
        console.error("Error toggling paid state:", err);
    }
}

function openResetModal() {
    const modal = document.getElementById("reset-modal");
    if (modal) modal.style.display = "flex";
}

function closeResetModal() {
    const modal = document.getElementById("reset-modal");
    if (modal) modal.style.display = "none";
}

async function resetAllPayments() {
    try {
        await fetch("/api/admin/reset", { method: "POST" });
        await loadFromStorage();
    } catch (err) {
        console.error("Error resetting payments:", err);
    } finally {
        closeResetModal();
    }
}

function setFilter(f) { state.filter = f; render(); }
function setQuery(v) { state.query = v; render(); }
function setSort(s) { state.sort = s; render(); }
function setRatePreview(v) {
    const n = Number(v);
    state.ratePreview = isFinite(n) && n >= 0 ? n : state.ratePreview;
}

async function applyRateToAll() {
    try {
        await fetch('/api/admin/members/amount-all', {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ amount: state.ratePreview })
        });
        await loadFromStorage();
    } catch (error) {
        console.error("Error update all rates:", error);
    }
}

async function addMember(name) {
    const trimmed = name.trim();
    if (!trimmed) return;

    const branchSelect = document.getElementById("new-branch-select");
    const selectBranch = branchSelect ? branchSelect.value : "comsci41";

    try {
        await fetch("/api/admin/members", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                name: trimmed, 
                amount: state.ratePreview,
                branch: selectBranch
            })
        });
        await loadFromStorage();
    } catch (err) {
        console.error("Error adding member:", err);
    }
}

async function deleteMember(id) {
    if (confirm("ลบรายชื่อนี้?")) {
        try {
            await fetch(`/api/admin/members/${id}`, { method: "DELETE" });
            await loadFromStorage();
        } catch (err) {
            console.error("Error deleting member:", err);
        }
    }
}

function render() {
    loadBranchTitle();
    const s = computeStats();
    safeSetText("stat-collected", safeFmtMoney(s.collected));
    safeSetText("stat-target", safeFmtMoney(s.target));
    safeSetText("stat-paid", s.paid);
    safeSetText("stat-unpaid", s.unpaid);
    safeSetText("stat-total", MEMBERS.length);
    safeSetText("progress-pct", s.pct + "%");
    safeSetText("summary-line", `เก็บได้แล้ว ${safeFmtMoney(s.collected)} - จ่ายแล้ว ${s.paid} คน ยังไม่จ่าย ${s.unpaid} คน จากทั้งหมด ${MEMBERS.length} คน`);
    safeSetText("summary-projected", `ยอดเงินสะสมปัจจุบันคิดเป็น ${s.pct}% ของเป้าหมายทั้งหมด (${safeFmtMoney(s.target)})`);

    const ring = document.getElementById("progress-ring-fg");
    if (ring) {
        const circumference = 2 * Math.PI * 52;
        ring.style.strokeDasharray = circumference;
        ring.style.strokeDashoffset = circumference * (1 - Math.min(s.pct, 100) / 100);
    }

    const list = document.getElementById("member-list");
    if (list) {
        const items = sortedFilteredMembers();
        safeSetText("count-line", `แสดง ${items.length} จาก ${MEMBERS.length} คน`);

        if (items.length === 0) {
            list.innerHTML = '<div class="empty"><i class="ti ti-search-off"></i>ไม่พบสมาชิกที่ตรงกับคำค้นหา</div>';
            return;
        }
        list.innerHTML = items.map(renderRow).join("");
    }
}

function renderRow(m, index) {
    const displayNum = index + 1;
    const tint = typeof tintFor === "function" ? tintFor(m.id) : { bg: "#eef0fb", fg: "#4c5fd5" };
    const total = Number(m.amount) || 0;

    const statusInfo = getMemberStatus(m);
    const pill = `<span class="pill ${statusInfo.class}">${statusInfo.text}</span>`;
    const subText = statusInfo.subText;
    const historyCount = m.history ? m.history.length : 0;
    const branchBadge = `<span style="font-size:11px; background:#e0e7ff; color:#3730a3; padding:2px 6px; border-radius:4px; margin-left:6px;">${m.branch || 'comsci41'}</span>`;

    return `
    <div class="member-row" data-toggle-id="${m.id}">
        <div class="m-avatar" style="background:${tint.bg};color:${tint.fg}">${displayNum}</div>
        <div class="m-text">
            <div class="m-name">${m.name} ${branchBadge}</div>
            <div class="m-sub">${subText}</div>
        </div>
        <div class="m-right">
            <div class="m-amount" data-edit-amount="${m.id}" title="คลิกเพื่อแก้ยอดของคนนี้">${safeFmtMoney(total)}</div>
            ${pill}
            
            <button class="history-btn" data-history-id="${m.id}" title="ดูประวัติการจ่าย (${historyCount})" style="background:none; border:none; cursor:pointer; color:#777; padding:4px; margin-left:4px;">
                <i class="ti ti-history" style="font-size: 1.2rem;"></i>
            </button>
            
            <a href="detailmember.html?id=${m.id}" title="ดูรายละเอียด" onclick="event.stopPropagation();" style="display:flex; align-items:center; gap:4px; text-decoration: none; background:#EEF0FB; border:1px solid #C7CCEB; border-radius:6px; cursor:pointer; color:#4C5FD5; padding:4px 8px; font-size:12px; font-family:'Kanit'; white-space: nowrap;">
                <i class="ti ti-calendar-event" style="font-size: 1.1rem;"></i> รายละเอียด
            </a>

            <button class="delete-btn" data-delete-id="${m.id}" title="ลบสมาชิก" style="background:none; border:none; cursor:pointer; color:#ff5252; padding:4px;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"></path><path d="M10 11v6"></path><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12"></path><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1 v3"></path></svg> 
            </button>
        </div>
    </div>
    `;
}

function startEditAmount(el) {
    const id = Number(el.getAttribute("data-edit-amount"));
    const m = MEMBERS.find(x => x.id === id);
    if (!m) return;
    el.innerHTML = `<input type="number" class="amount-input" id="edit-amount-${id}" data-amount-id="${id}" value="${m.amount}">`;
    const input = el.querySelector("input");
    if (input) {
        input.focus();
        input.select();
    }
}

async function saveEditAmount(memberId) {
    const inputEl = document.getElementById(`edit-amount-${memberId}`);
    if (!inputEl) return;
    const newAmount = inputEl.value;

    try {
        const response = await fetch(`/api/admin/members/${memberId}/amount`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: Number(newAmount) })
        });

        if (response.ok) {
            await loadFromStorage();
        }
    } catch (error) {
        console.error('Error updating amount:', error);
    }
}

document.addEventListener("click", (e) => {
    const saveTargetBtn = e.target.closest("#btn-save-target");
    if (saveTargetBtn) {
        saveTargetAmount();
        return;
    }

    const resetBtn = e.target.closest("#reset-all-btn");
    if (resetBtn) {
        openResetModal();
        return;
    }

    const confirmResetBtn = e.target.closest("#btn-confirm-reset");
    if (confirmResetBtn) {
        resetAllPayments();
        return;
    }

    if (e.target.classList.contains("modal-overlay")) {
        closeResetModal();
        closeTargetModal();
    }

    const deleteBtn = e.target.closest("[data-delete-id]");
    if (deleteBtn) {
        e.stopPropagation();
        deleteMember(Number(deleteBtn.getAttribute("data-delete-id")));
        return;
    }

    const historyBtn = e.target.closest("[data-history-id]");
    if (historyBtn) {
        e.stopPropagation();
        viewHistory(Number(historyBtn.getAttribute("data-history-id")));
        return;
    }

    const amountEl = e.target.closest("[data-edit-amount]");
    if (amountEl && !e.target.closest(".amount-input")) {
        startEditAmount(amountEl);
        return;
    }

    const filterBtn = e.target.closest("[data-filter]");
    if (filterBtn) {
        document.querySelectorAll("[data-filter]").forEach(b => b.classList.remove("active"));
        filterBtn.classList.add("active");
        setFilter(filterBtn.getAttribute("data-filter"));
        return;
    }

    const sortBtn = e.target.closest("[data-sort]");
    if (sortBtn) {
        document.querySelectorAll("[data-sort]").forEach(b => b.classList.remove("active"));
        setSort(sortBtn.getAttribute("data-sort"));
        return;
    }

    const row = e.target.closest("[data-toggle-id]");
    if (row && !e.target.closest(".amount-input") && !e.target.closest("button") && !e.target.closest("a")) {
        togglePaid(Number(row.getAttribute("data-toggle-id")));
        return;
    }
});

document.addEventListener("focusout", (e) => {
    const input = e.target.closest(".amount-input");
    if (input) {
        const memberId = Number(input.getAttribute("data-amount-id"));
        saveEditAmount(memberId);
    }
});

document.addEventListener("keydown", (e) => {
    const targetModal = document.getElementById("target-modal");

    if (e.key === "Escape") {
        closeTargetModal();
        closeResetModal();
    }

    if (targetModal && targetModal.style.display === "flex") {
        if (e.key === "Enter") {
            e.preventDefault();
            saveTargetAmount();
        }
    }
});

document.addEventListener("DOMContentLoaded", () => {
    const searchInput = document.getElementById("search-input");
    const rateInput = document.getElementById("rate-input");
    const applyRateBtn = document.getElementById("apply-rate-btn");
    const addBtn = document.getElementById("add-member-btn");
    const nameInput = document.getElementById("new-name-input");
    const exportExcelBtn = document.getElementById("export-excel-btn");
    const statTargetBtn = document.getElementById("stat-target");

    if (searchInput) searchInput.addEventListener("input", (e) => setQuery(e.target.value));
    if (rateInput) rateInput.addEventListener("input", (e) => setRatePreview(e.target.value));
    if (applyRateBtn) applyRateBtn.addEventListener("click", applyRateToAll);

    if (addBtn && nameInput) {
        addBtn.addEventListener("click", () => {
            addMember(nameInput.value);
            nameInput.value = "";
            nameInput.focus();
        });
        nameInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                addBtn.click();
            }
        });
    }

    if (exportExcelBtn) exportExcelBtn.addEventListener("click", exportMembersToExcel);
    if (statTargetBtn) statTargetBtn.addEventListener("click", openTargetModal);
});

function viewHistory(memberId) {
   const member = MEMBERS.find(m => Number(m.id) === Number(memberId));
   if (!member) return;

   safeSetText("modal-member-name", `ประวัติชำระเงิน: ${member.name}`);

   const listEl = document.getElementById("modal-history-list");
   if (listEl) {
        listEl.innerHTML = "";
        let history = member.history;
        if (typeof history === "string") {
            try { history = JSON.parse(history); } catch(e) { history = []; }
        }

        if (Array.isArray(history) && history.length > 0) {
            history.forEach((h, index) => {
                const li = document.createElement("li");
                li.style.marginBottom = "8px";
                li.innerText = `ครั้งที่ ${index + 1}: วันที่ ${h.date || '-'} - ชำระ ${safeFmtMoney(h.amount)} (${h.method || 'โอนเงิน'})`;
                listEl.appendChild(li);
            });
        } else {
            listEl.innerHTML = "<li>ยังไม่มีประวัติการชำระเงิน</li>";
        }
   }

   const modal = document.getElementById("history-modal");
   if (modal) modal.style.display = "flex";
}

function closeHistoryModal() {
    const modal = document.getElementById("history-modal");
    if (modal) modal.style.display = "none";
}

async function loadFromStorage() {
    try {
        const targetRes = await fetch("/api/settings/target", { cache: "no-store" });
        if (targetRes.ok) {
            const targetData = await targetRes.json();
            TARGET_AMOUNT = Number(targetData.target) || 4000;
        }

        const branchFilter = document.getElementById("filter-branch-select")?.value;
        const url = branchFilter ? `/api/members?branch=${branchFilter}` : "/api/members";

        const response = await fetch(url, { cache: "no-store" });
        if (response.ok) {
            MEMBERS = await response.json();
        }
        render();
    } catch (e) {
        console.error("ดึงข้อมูลจาก Server/MySQL ล้มเหลว:", e);
    }
}

function openTargetModal() {
    const modal = document.getElementById("target-modal");
    const input = document.getElementById("target-modal-input");
    if (modal && input) {
        input.value = TARGET_AMOUNT;
        modal.style.display = "flex";
        setTimeout(() => {
            input.focus();
            input.select();
        }, 50);
    }
}

function closeTargetModal() {
    const modal = document.getElementById("target-modal");
    if (modal) modal.style.display = "none";
}

async function saveTargetAmount() {
    const inputEl = document.getElementById('target-modal-input');
    const targetValue = inputEl ? inputEl.value : null;

    if (!targetValue || isNaN(Number(targetValue))) {
        alert("กรุณากรอกจำนวนเงินเพื่อตั้งเป้าหมาย");
        return;
    } 

    closeTargetModal();
    showLoading("กำลังบันทึกเป้าหมาย...");
        
    try {
        const response = await fetch('/api/settings/target', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target: Number(targetValue) })
        });

        if (response.ok) {
            localStorage.setItem('fund-dashboard-target', targetValue);
            await loadFromStorage();
            showSuccess("บันทึกเป้าหมายสำเร็จ");
        } else {
            hideLoading();
            alert("บันทึกไม่สำเร็จ: เซิร์ฟเวอร์ตอบกลับผิดพลาด");
        }
    } catch (error) {
        console.error('Error saving target:', error);
        hideLoading();
        alert("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    }
}

function getCollectionMode() {
    return localStorage.getItem("fund-dashboard-mode") || "month";
}

function setCollectionMode(mode) {
    if (mode === "week") return;
    localStorage.setItem("fund-dashboard-mode", mode);
    updateModeUI(mode);
    render();
}

function updateModeUI(mode) {
    const monthBtn = document.getElementById("mode-month-btn");
    const weekBtn = document.getElementById("mode-week-btn");

    if (monthBtn && weekBtn) {
        monthBtn.classList.toggle("active", mode === "month");
        weekBtn.classList.toggle("active", mode === "week");
    }
}

function initAdminApp() {
    localStorage.setItem("fund-dashboard-mode", "month");
    updateModeUI(getCollectionMode());
    setupBranchTitle();
}

function getMemberStatus(m) {
    const mode = localStorage.getItem("fund-dashboard-mode") || "month";

    if (mode === "month") {
        const currentMonth = typeof getActiveMonthIndex === "function" ? getActiveMonthIndex() : new Date().getMonth();
        const paidMonths = parseArrayField(m.paidMonths, 12);

        if (paidMonths[currentMonth]) {
            return {
                status: "paid",
                text: "จ่ายแล้ว",
                class: "paid",
                subText: "ชำระเรียบร้อย"
            };
        }

        return {
            status: "unpaid",
            text: "ค้างชำระ",
            class: "unpaid",
            subText: `ยอดชำระประจำเดือน ${safeFmtMoney(m.amount)} บาท`
        };
    } else {
        const activeWeek = typeof getActiveWeekIndex === "function" ? getActiveWeekIndex() : Number(localStorage.getItem("fund-dashboard-active-week")) || 0;
        const totalWeeks = typeof WEEKS_LIST !== "undefined" ? WEEKS_LIST.length : 52;
        const paidWeeks = parseArrayField(m.paidWeeks, totalWeeks);

        if (paidWeeks[activeWeek]) {
            return {
                status: "paid",
                text: "จ่ายแล้ว",
                class: "paid",
                subText: "ชำระเรียบร้อย"
            };
        }

        return {
            status: "unpaid",
            text: "ค้างชำระ",
            class: "unpaid",
            subText: `ยอดชำระประจำสัปดาห์ ${safeFmtMoney(m.amount)} บาท`
        };
    }
}

function loadBranchTitle() {
    const titleEl = document.getElementById("branch-title");
    if (!titleEl) return;
    const savedTitle = localStorage.getItem("fund-dashboard-branch-title");
    if (savedTitle) {
        titleEl.textContent = savedTitle;
    }
}

function setupBranchTitle() {
    const titleEl = document.getElementById("branch-title");
    if (!titleEl) return;

    loadBranchTitle();

    titleEl.addEventListener("blur", () => {
        const newTitle = titleEl.textContent.trim() || "Comsci 41";
        titleEl.textContent = newTitle;
        localStorage.setItem("fund-dashboard-branch-title", newTitle);
    });

    titleEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            titleEl.blur();
        }
    });
}

// เข้าสู่ระบบแอดมินผ่าน MySQL
async function processAdminLogin() {
    const inputEl = document.getElementById("login-student-id");
    const studentId = inputEl ? inputEl.value.trim() : "";

    if (!studentId) {
        showLoginError("กรุณากรอกรหัสนักศึกษา");
        return;
    }

    try {
        const response = await fetch("/api/admin/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ studentId })
        });

        const data = await response.json();

        if (!data.success) {
            showLoginError(data.message || "ไม่พบรหัสนักศึกษา");
            return;
        }

        sessionStorage.setItem("admin_student_id", data.studentId);
        sessionStorage.setItem("admin_branch", data.branch);
        sessionStorage.setItem("admin_name", data.name || "");

        const loginModal = document.getElementById("login-modal");
        const mainDashboard = document.getElementById("main-dashboard");

        if (loginModal) loginModal.style.display = "none";
        if (mainDashboard) mainDashboard.style.display = "block";
        
        applyAdminBranch(data.branch);
    } catch (err) {
        showLoginError("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    }
}

// ลงทะเบียนแอดมินใหม่เข้า MySQL
async function processAdminRegister(e) {
    if (e) e.preventDefault();
    const studentId = document.getElementById("reg-student-id")?.value.trim();
    const name = document.getElementById("reg-name")?.value.trim();
    const branch = document.getElementById("reg-branch")?.value.trim();

    if (!studentId || !name || !branch) {
        alert("กรุณากรอกข้อมูลให้ครบถ้วน");
        return;
    }

    // 1. เรียกแสดงวงกลมหมุนรอโหลด
    showLoading("กำลังลงทะเบียน...");

    try {
        const response = await fetch("/api/admin/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ studentId, name, branch })
        });

        const data = await response.json();

        if (data.success) {
            sessionStorage.setItem("admin_student_id", studentId);
            sessionStorage.setItem("admin_branch", branch);

            // 2. แสดงติ๊กถูกสีเขียวสำเร็จ พร้อม Callback ปิด Modal หลังจบอนิเมชัน
            showSuccess("ลงทะเบียนสำเร็จ!", 1800, () => {
                const loginModal = document.getElementById("login-modal");
                const mainDashboard = document.getElementById("main-dashboard");
                if (loginModal) loginModal.style.display = "none";
                if (mainDashboard) mainDashboard.style.display = "block";

                applyAdminBranch(branch);

                if (document.getElementById("login-student-id")) {
                    document.getElementById("login-student-id").value = studentId;
                }
                toggleAuthView('login');
            });
        } else {
            hideLoading();
            alert("ลงทะเบียนไม่สำเร็จ: " + (data.message || "เกิดข้อผิดพลาด"));
        }
    } catch (err) {
        hideLoading();
        alert("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    }
}

function showLoginError(msg) {
    const errorEl = document.getElementById("login-error");
    const textEl = document.getElementById("login-error-text");
    if (textEl) textEl.textContent = msg;
    if (errorEl) errorEl.style.display = "flex";
}

function applyAdminBranch(branch) {
    const filterSelect = document.getElementById("filter-branch-select");
    if (filterSelect) {
        filterSelect.value = branch;
        filterSelect.disabled = true;
    }

    const newBranchSelect = document.getElementById("new-branch-select");
    if (newBranchSelect) {
        newBranchSelect.value = branch;
        newBranchSelect.disabled = true;
    }
    loadBranchAvatar(branch);
    loadFromStorage();
}

function initAdminAuth() {
    const savedBranch = sessionStorage.getItem("admin_branch");
    const loginModal = document.getElementById("login-modal");
    const mainDashboard = document.getElementById("main-dashboard");

    if (savedBranch) {
        if (loginModal) loginModal.style.display = "none";
        if (mainDashboard) mainDashboard.style.display = "block";
        applyAdminBranch(savedBranch);
    } else {
        if (loginModal) loginModal.style.display = "flex";
        if (mainDashboard) mainDashboard.style.display = "none";
    }

    const submitBtn = document.getElementById("btn-login-submit");
    const inputEl = document.getElementById("login-student-id");

    if (submitBtn) submitBtn.addEventListener("click", processAdminLogin);
    if (inputEl) {
        inputEl.addEventListener("keydown", (e) => {
            if (e.key === "Enter") processAdminLogin();
        });
    }
}

async function loadBranchAvatar(branch) {
    if (!branch) return;
    try {
        const response = await fetch(`/api/branch/profile?branch=${branch}`);
        if (response.ok) {
            const data = await response.json();
            if (data.avatarUrl) {
                const avatarImg = document.getElementById('branch-avatar-img');
                const settingImg = document.getElementById('settings-avatar-preview');
                const timestampedUrl = `${data.avatarUrl}?t=${Date.now()}`;
                if (avatarImg) avatarImg.src = timestampedUrl;
                if (settingImg) settingImg.src = timestampedUrl;
            }
        }
    } catch (err) {
        console.error("ไม่สามารถดึงรูปโปรไฟล์สาขาได้:", err);
    }
}

// Event Listeners สำหรับ UI Components
document.addEventListener('DOMContentLoaded', () => {
    initAdminApp();
    initAdminAuth();

    // Drawer Menu & Overlay
    const menuBtn = document.getElementById("menu-toggle-btn");
    const closeBtn = document.getElementById("close-drawer-btn");
    const drawer = document.getElementById("side-drawer");
    const overlay = document.getElementById("menu-overlay");

    function openDrawer() {
        drawer?.classList.add("open");
        overlay?.classList.add("active");
    }

    function closeDrawer() {
        drawer?.classList.remove("open");
        overlay?.classList.remove("active");
    }

    menuBtn?.addEventListener("click", openDrawer);
    closeBtn?.addEventListener("click", closeDrawer);
    overlay?.addEventListener("click", closeDrawer);

    // Logout Modal
    const logoutBtn = document.getElementById("logout-btn");
    const logoutModal = document.getElementById("logout-confirm-modal");
    const cancelLogoutBtn = document.getElementById("cancel-logout-btn");
    const confirmLogoutBtn = document.getElementById("confirm-logout-btn");

    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            if (logoutModal) logoutModal.classList.add("active");
        });
    }

    if (cancelLogoutBtn) {
        cancelLogoutBtn.addEventListener("click", () => {
            if (logoutModal) logoutModal.classList.remove("active");
        });
    }

    if (confirmLogoutBtn) {
        confirmLogoutBtn.addEventListener("click", () => {
            sessionStorage.removeItem("admin_student_id");
            sessionStorage.removeItem("admin_branch");
            sessionStorage.removeItem("admin_name");
            location.reload();
        });
    }

    // Settings Profile Image Upload Modal
    const openSettingBtn = document.getElementById('open-setting-btn');
    const closeSettingsBtn = document.getElementById('close-setting-btn');
    const settingsModal = document.getElementById('settings-modal');
    const avatarInput = document.getElementById('avatar-file-input');
    const settingPreview = document.getElementById('settings-avatar-preview');
    const mainAvatar = document.getElementById('branch-avatar-img');
    const saveAvatarBtn = document.getElementById('save-avatar-btn');

    let selectedFile = null;

    openSettingBtn?.addEventListener('click', () => {
        if (settingPreview && mainAvatar) {
            settingPreview.src = mainAvatar.src;
        }
        if (settingsModal) settingsModal.style.display = 'flex';
    });

    closeSettingsBtn?.addEventListener('click', () => {
        if (settingsModal) settingsModal.style.display = 'none';
        selectedFile = null;
    });

    avatarInput?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 2 * 1024 * 1024) {
                alert('ขนาดไฟล์ต้องไม่เกิน 2MB');
                avatarInput.value = '';
                return;
            }
            selectedFile = file;
            const reader = new FileReader();
            reader.onload = (evt) => {
                if (settingPreview) settingPreview.src = evt.target.result;
            };
            reader.readAsDataURL(file);
        }
    });

    saveAvatarBtn?.addEventListener('click', async () => {
        if (!selectedFile) {
            alert('กรุณาเลือกรูปภาพใหม่ก่อนบันทึก');
            return;
        }

        const currentBranch = sessionStorage.getItem("admin_branch") || "comsci41";
        const formData = new FormData();
        formData.append('branch', currentBranch);
        formData.append('avatar', selectedFile);

        if (settingsModal) settingsModal.style.display = 'none';
        showLoading("กำลังอัปโหลดรูปโปรไฟล์...");

        try {
            const response = await fetch('/api/admin/branch/upload-profile', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                const updatedUrl = `${result.avatarUrl}?t=${Date.now()}`;
                if (mainAvatar) mainAvatar.src = updatedUrl;
                selectedFile = null;
                showSuccess("เปลี่ยนรูปโปรไฟล์สำเร็จ!");
            } else {
                hideLoading();
                alert('เกิดข้อผิดพลาด: ' + (result.message || 'ไม่สามารถอัปโหลดได้'));
            }
        } catch (error) {
            console.error('Upload Error:', error);
            hideLoading();
            alert('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้');
        }
    });
});

// แสดงวงกลมหมุนรอโหลด
function showLoading(message = "กำลังโหลดข้อมูล...") {
    const modal = document.getElementById("loading-modal");
    const spinnerBox = document.getElementById("loading-spinner-box");
    const successBox = document.getElementById("loading-success-box");
    const loadingText = document.getElementById("loading-text");

    if (!modal) return;
    if (loadingText) loadingText.textContent = message;
    
    if (spinnerBox) spinnerBox.style.display = "block";
    if (successBox) successBox.style.display = "none";
    modal.style.display = "flex";
}

// เปลี่ยนเป็นเครื่องหมายติ๊กถูกสำเร็จ
function showSuccess(message = "สำเร็จ!", duration = 1400, callback = null) {
    const modal = document.getElementById("loading-modal");
    const spinnerBox = document.getElementById("loading-spinner-box");
    const successBox = document.getElementById("loading-success-box");
    const successText = document.getElementById("success-text");

    if (!modal) return;

    if (successText) successText.textContent = message;
    if (spinnerBox) spinnerBox.style.display = "none";
    
    if (successBox) {
        successBox.style.display = "block";
        const svg = successBox.querySelector('.checkmark-svg');
        if (svg) {
            const newSvg = svg.cloneNode(true);
            svg.parentNode.replaceChild(newSvg, svg);
        }
    }

    setTimeout(() => {
        modal.style.display = "none";
        if (typeof callback === "function") callback();
    }, duration);
}

// ปิด Modal โหลดกรณีเกิด Error
function hideLoading() {
    const modal = document.getElementById("loading-modal");
    if (modal) modal.style.display = "none";
}