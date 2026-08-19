// ===== member.js — หน้าค้นหา/โปรไฟล์ของสมาชิก =====

let selectedId = null;
let searchQuery = "";

if (typeof MEMBERS === "undefined") var MEMBERS = [];
if (typeof TARGET_AMOUNT === "undefined") var TARGET_AMOUNT = 0;

function getActiveMonthIndex() {
    return new Date().getMonth();
}

function getActiveWeekIndex() {
    const val = localStorage.getItem("fund-dashboard-active-week");
    return val !== null ? Number(val) : 0;
}

function safeFmtMoney(val) {
    return typeof fmtMoney === "function" ? fmtMoney(val) : `฿${Number(val || 0).toLocaleString()}`;
}

function statusLabel(m) {
    const statusInfo = getMemberStatus(m);
    return `<span class="u-tag ${statusInfo.class}">${statusInfo.text}</span>`;
}

// เพิ่มฟังก์ชันคำนวณยอดเงินสะสมจริงจากงวดที่ชำระ
function computeCollectedTotal(membersList) {
    const list = membersList || MEMBERS || [];
    const mode = localStorage.getItem("fund-dashboard-mode") || "month";
    
    return list.reduce((sum, m) => {
        const rate = Number(m.amount) || 100;
        if (mode === "month") {
            const paidCount = (m.paidMonths || []).filter(Boolean).length;
            return sum + (paidCount * rate);
        } else {
            const paidCount = (m.paidWeeks || []).filter(Boolean).length;
            return sum + (paidCount * rate);
        }
    }, 0);
}

function renderHomeSummary() {
    const roomEl = document.getElementById("room-title");
    if (roomEl && typeof ROOM !== "undefined") roomEl.textContent = ROOM.name;

    const totalMembers = MEMBERS.length;
    const collectionMode = localStorage.getItem("fund-dashboard-mode") || "month";
    const activeMonthIndex = getActiveMonthIndex();
    const activeWeekIndex = getActiveWeekIndex();

    const paidCount = MEMBERS.filter(m => {
        if (collectionMode === "month") {
            return m.paidMonths ? Boolean(m.paidMonths[activeMonthIndex]) : m.paid;
        } else {
            return m.paidWeeks ? Boolean(m.paidWeeks[activeWeekIndex]) : m.paid;
        }
    }).length;

    // คำนวณยอดเงินสะสมจริงตามงวดที่กดจ่าย
    const collected = computeCollectedTotal(MEMBERS);

    const targetAmt = TARGET_AMOUNT;
    const pct = targetAmt > 0 ? Math.round((collected / targetAmt) * 100) : 0;

    if (document.getElementById("jar-pct")) document.getElementById("jar-pct").textContent = pct + "%";
    if (document.getElementById("jar-collected")) document.getElementById("jar-collected").textContent = safeFmtMoney(collected);
    if (document.getElementById("jar-target")) document.getElementById("jar-target").textContent = safeFmtMoney(targetAmt);
    if (document.getElementById("jar-sub")) document.getElementById("jar-sub").textContent = `จ่ายแล้ว ${paidCount} จาก ${totalMembers} คน`;

    const circleCenterMoney = document.getElementById("circle-center-money");
    const circleSubText = document.getElementById("circle-sub-text");
    const circleProgress = document.getElementById("circle-progress");

    if (circleCenterMoney) circleCenterMoney.textContent = safeFmtMoney(collected);

    if (circleProgress) {
        const circumference = 326.72;
        const offset = circumference - (pct / 100) * circumference;
        circleProgress.style.strokeDashoffset = offset;
    }

}

function renderUserList() {
    const list = document.getElementById("user-list");
    if (!list) return;

    const q = searchQuery.trim().toLowerCase();
    const items = MEMBERS.filter(m => m.name && m.name.toLowerCase().includes(q));

    const listLabel = document.getElementById("list-label");
    if (listLabel) {
        listLabel.textContent = q ? `ผลการค้นหา "${searchQuery.trim()}"` : "รายชื่อสมาชิกทั้งหมด";
    }

    if (items.length === 0) {
        list.innerHTML = '<div class="empty">ไม่พบชื่อที่ค้นหา</div>';
        return;
    }

    list.innerHTML = items.map(m => {
        const tint = typeof tintFor === "function" ? tintFor(m.id) : { bg: "#eef0fb", fg: "#4c5fd5" };
        const initials = typeof initialsOf === "function" ? initialsOf(m.name) : m.name.substring(0, 2);
        return `<button class="user-item" data-select-id="${m.id}">
            <div class="avatar" style="background:${tint.bg};color:${tint.fg}">${initials}</div>
            <div class="u-name">${m.name}</div>
            ${statusLabel(m)}
        </button>`;
    }).join("");
}

function getNextUnpaidIndex(m, mode, activeMonth, activeWeek) {
    if (mode === "month") {
        const paidMonths = m.paidMonths || Array(12).fill(false);
        for (let i = activeMonth; i < 12; i++) {
            if (!paidMonths[i]) return i;
        }
        return paidMonths.findIndex(isPaid => !isPaid);
    } else {
        const totalWeeks = typeof WEEKS_LIST !== "undefined" ? WEEKS_LIST.length : 52;
        const paidWeeks = m.paidWeeks || Array(totalWeeks).fill(false);
        for (let i = activeWeek; i < totalWeeks; i++) {
            if (!paidWeeks[i]) return i;
        }
        return paidWeeks.findIndex(isPaid => !isPaid);
    }
}

function renderProfile() {
    const m = MEMBERS.find(x => x.id === selectedId);
    if (!m) return;

    const statusInfo = getMemberStatus(m);
    if (document.getElementById("profile-status")) {
        document.getElementById("profile-status").textContent = statusInfo.text;
    }

    const tint = typeof tintFor === "function" ? tintFor(m.id) : { bg: "#eef0fb", fg: "#4c5fd5" };
    const avatar = document.getElementById("profile-avatar");
    if (avatar) {
        avatar.textContent = typeof initialsOf === "function" ? initialsOf(m.name) : m.name.substring(0, 2);
        avatar.style.background = tint.bg;
        avatar.style.color = tint.fg;
    }

    if (document.getElementById("profile-name")) document.getElementById("profile-name").textContent = m.name;

    const label = document.getElementById("balance-label");
    const amountEl = document.getElementById("balance-amount");
    const payLink = document.getElementById("pay-link");
    const note = document.getElementById("status-note");
    const memberRate = Number(m.amount) || 100;

    const collectionMode = localStorage.getItem("fund-dashboard-mode") || "month";
    const activeMonthIndex = getActiveMonthIndex();
    const activeWeekIndex = getActiveWeekIndex();
    
    const targetIndex = getNextUnpaidIndex(m, collectionMode, activeMonthIndex, activeWeekIndex);
    const isAllPaid = targetIndex === -1;

    if (isAllPaid) {
        if (document.getElementById("profile-status")) document.getElementById("profile-status").textContent = "ชำระครบเรียบร้อยแล้ว";
        if (label) label.textContent = "คุณชำระเงินครบทุกงวดแล้ว";
        if (amountEl) {
            amountEl.textContent = safeFmtMoney(0);
            amountEl.className = "balance-amount clear";
        }
        if (payLink) payLink.classList.add("hidden");
        if (note) {
            note.className = "status-note paid";
            note.innerHTML = '<i class="ti ti-circle-check"></i> ชำระครบทุกงวดแล้ว';
        }
    } else {
        const periodText = collectionMode === "month" 
            ? `เดือน${typeof THAI_MONTHS !== "undefined" ? THAI_MONTHS[targetIndex] : targetIndex + 1}`
            : `สัปดาห์ที่ ${targetIndex + 1}`;

        if (document.getElementById("profile-status")) document.getElementById("profile-status").textContent = statusInfo.text;
        if (label) label.textContent = `ยอดที่ต้องชำระประจำ${periodText}`;
        if (amountEl) {
            amountEl.textContent = safeFmtMoney(memberRate);
            amountEl.className = statusInfo.status === "overdue" ? "balance-amount owe overdue" : "balance-amount owe";
        }
        if (payLink) {
            payLink.classList.remove("hidden");
            payLink.href = `pay.html?id=${m.id}&type=${collectionMode}&index=${targetIndex}`;
        }
        if (note) note.className = "status-note hidden";
    }

    let totalPaid = 0;
    if (collectionMode === "month") {
        const paidCount = (m.paidMonths || []).filter(Boolean).length;
        totalPaid = paidCount * memberRate;
    } else {
        const paidCount = (m.paidWeeks || []).filter(Boolean).length;
        totalPaid = paidCount * memberRate;
    }

    if (document.getElementById("history-total")) document.getElementById("history-total").textContent = safeFmtMoney(totalPaid) + " สะสม";

    const historyList = document.getElementById("history-list");
    if (historyList) {
        if (m.history && m.history.length > 0) {
            historyList.innerHTML = m.history.map(h => `
                <div class="history-row">
                    <div class="history-icon"><i class="ti ti-check"></i></div>
                    <div class="history-detail">
                        <div class="history-date">${h.date}</div>
                        <div class="history-method">${h.method || "ชำระเงิน"}</div>
                    </div>
                    <div class="history-amt">${safeFmtMoney(h.amount)}</div>
                </div>`).join("");
        } else if (totalPaid > 0) {
            historyList.innerHTML = `
            <div class="history-row">
                <div class="history-icon"><i class="ti ti-check"></i></div>
                <div class="history-detail">
                    <div class="history-date">${m.date || "ไม่ระบุวันที่"}</div>
                    <div class="history-method">ยอดชำระสะสม</div>
                </div>
                <div class="history-amt">${safeFmtMoney(totalPaid)}</div>
            </div>`;
        } else {
            historyList.innerHTML = '<div class="history-empty">ยังไม่มีประวัติการชำระเงิน</div>';
        }
    }

    renderMemberDashboard(m);
}

function renderMemberDashboard(member) {
    const gridContainer = document.getElementById("member-due-grid");
    if (!gridContainer || !member) return;

    const collectionMode = localStorage.getItem("fund-dashboard-mode") || "month";
    const activeMonthIndex = getActiveMonthIndex();
    const activeWeekIndex = getActiveWeekIndex();
    const rate = Number(localStorage.getItem("fund-dashboard-rate")) || member.amount || 100;

    let gridHTML = "";

    if (collectionMode === "month") {
        const paidMonths = member.paidMonths || Array(12).fill(false);
        
        gridHTML = Array.from({ length: 12 }, (_, i) => {
            const monthName = typeof THAI_MONTHS !== "undefined" ? THAI_MONTHS[i] : `งวดที่ ${i + 1}`;
            const isPaid = paidMonths[i];
            const isCurrent = (i === activeMonthIndex);
            const isOverdue = (i < activeMonthIndex && !isPaid);

            let cardClass = "due-card";
            let statusText = "";

            if (isPaid) {
                cardClass += " paid";
                statusText = "จ่ายแล้ว";
            } else if (isOverdue) {
                cardClass += " overdue";
                statusText = `ค้าง ฿${rate}`;
            } else if (isCurrent) {
                cardClass += " active unpaid";
                statusText = `ต้องชำระ ฿${rate}`;
            } else {
                cardClass += " pending";
                statusText = `฿${rate}`;
            }

            return `
                <div class="${cardClass}" onclick="goToPayPage(${member.id}, 'month', ${i})">
                    <div style="font-weight:600; font-size:13px;">เดือน${monthName}</div>
                    <div class="amount" style="margin-top:4px;">${statusText}</div>
                </div>
            `;
        }).join("");
    } else {
        const totalWeeks = typeof WEEKS_LIST !== "undefined" ? WEEKS_LIST.length : 52;
        const paidWeeks = member.paidWeeks || Array(totalWeeks).fill(false);

        gridHTML = Array.from({ length: totalWeeks }, (_, i) => {
            const isPaid = paidWeeks[i];
            const isCurrent = (i === activeWeekIndex);
            const isOverdue = (i < activeWeekIndex && !isPaid);

            let cardClass = "due-card";
            let statusText = "";

            if (isPaid) {
                cardClass += " paid";
                statusText = "จ่ายแล้ว";
            } else if (isOverdue) {
                cardClass += " overdue";
                statusText = `ค้าง ฿${rate}`;
            } else if (isCurrent) {
                cardClass += " active unpaid";
                statusText = `ต้องชำระ ฿${rate}`;
            } else {
                cardClass += " pending";
                statusText = `฿${rate}`;
            }

            return `
                <div class="${cardClass}" onclick="goToPayPage(${member.id}, 'week', ${i})">
                    <div style="font-weight:600; font-size:12px;">สัปดาห์ ${i + 1}</div>
                    <div class="amount" style="margin-top:2px;">${statusText}</div>
                </div>
            `;
        }).join("");
    }

    gridContainer.className = "payment-grid";
    gridContainer.innerHTML = gridHTML;
}

function goToPayPage(memberId, type, index) {
    window.location.href = `pay.html?id=${memberId}&type=${type}&index=${index}`;
}

function showHomeScreen() {
    selectedId = null;
    const home = document.getElementById("home-screen");
    const profile = document.getElementById("profile-screen");
    if (home) home.classList.remove("hidden");
    if (profile) profile.classList.add("hidden");
    renderHomeSummary();
    renderUserList();
}

function showProfileScreen(id) {
    selectedId = id;
    const home = document.getElementById("home-screen");
    const profile = document.getElementById("profile-screen");
    if (home) home.classList.add("hidden");
    if (profile) profile.classList.remove("hidden");
    renderProfile();
}

document.addEventListener("click", (e) => {
    const item = e.target.closest("[data-select-id]");
    if (item) {
        showProfileScreen(Number(item.getAttribute("data-select-id")));
        return;
    }
    if (e.target.closest("#back-btn")) {
        showHomeScreen();
        return;
    }
});

const searchInput = document.getElementById("user-search");
if (searchInput) {
    searchInput.addEventListener("input", (e) => {
        searchQuery = e.target.value;
        renderUserList();
    });
}

async function loadLatestMembers() {
    try {
        const response = await fetch("/api/members", { cache: "no-store" });
        if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data) && data.length > 0) return data;
        }
    } catch (e) {
        console.error("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ MySQL ได้", e);
    }
    return [];
}
async function loadTargetAmount() {
    try {
        const resTarget = await fetch("/api/settings/target", { cache: "no-store" });
        if (resTarget.ok) {
            const dataTarget = await resTarget.json();
            const val = Array.isArray(dataTarget) ? dataTarget[0]?.target : dataTarget.target;
            TARGET_AMOUNT = Number(val) || 4000;
        } else {
            TARGET_AMOUNT = 4000;
        }
    } catch (e) {
        TARGET_AMOUNT = 4000;
    }
}

async function initApp() {
    localStorage.setItem("fund-dashboard-mode", "month");
    await Promise.all([
        loadLatestMembers().then(m => { MEMBERS = m; }),
        loadTargetAmount()
    ]);

    const params = new URLSearchParams(location.search);
    const backTo = params.get("id");
    if (backTo && MEMBERS.some(m => m.id === Number(backTo))) {
        showProfileScreen(Number(backTo));
    } else {
        showHomeScreen();
    }
}


function getMemberStatus(m) {
    const mode = localStorage.getItem("fund-dashboard-mode") || "month";

    if (mode === "month") {
        const currentMonth = typeof getActiveMonthIndex === "function" ? getActiveMonthIndex() : new Date().getMonth();
        const paidMonths = m.paidMonths || Array(12).fill(false);

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
        const paidWeeks = m.paidWeeks || [];
        const paidCount = paidWeeks.filter(Boolean).length;
        const isCurrentPaid = Boolean(paidWeeks[activeWeek]);

        if (isCurrentPaid || paidCount > activeWeek) {
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

initApp();

window.addEventListener("storage", async (e) => {
   if (e.key === "fund-dashboard-member") {
        if (e.newValue) MEMBERS = JSON.parse(e.newValue);
   }
   if (e.key === "fund-dashboard-target") {
        const localVal = Number(e.newValue);
        if (!isNaN(localVal) && localVal > 0) {
            TARGET_AMOUNT = localVal;
        } else {
            await loadTargetAmount();
        }
   }

   if (selectedId !== null) {
        renderProfile();
   } else {
        renderHomeSummary();
        renderUserList();
   }
});

window.addEventListener("pageshow", async () => {
    await Promise.all([
        loadLatestMembers().then(m => { MEMBERS = m; }),
        loadTargetAmount()
    ]);

    if (selectedId !== null) {
        renderProfile();
    } else {
        renderHomeSummary();
        renderUserList();
    }
});