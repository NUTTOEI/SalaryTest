// document.addEventListener("DOMContentLoaded", () => {
//     if (document.getElementById('qr-name')) {
//         document.getElementById('qr-name').textContent = (typeof ROOM !== 'undefined' && ROOM.promptpayName)
//             ? ROOM.promptpayName
//             : "นายปุณณ์เมธ ม่วงวิเชียร";
//     }

//     const COLLECTION_MODE = localStorage.getItem("fund-dashboard-mode") || "month";

//     let selectedMonthIndex = new Date().getMonth();
//     let selectedMonths = [];
//     let selectedWeeks = [];

//     const params = new URLSearchParams(location.search);
//     const memberId = Number(params.get("id"));

//     let storedMembers = localStorage.getItem("fund-dashboard-members");
//     let MEMBERS = storedMembers ? JSON.parse(storedMembers) : (typeof getMembersData === 'function' ? getMembersData() : []);

//     const member = MEMBERS.find(m => m.id === memberId);

//     if (!member) {
//         alert("ไม่พบข้อมูลสมาชิก กรุณาเลือกใหม่อีกครั้ง");
//         location.href = "admin.html";
//         return;
//     }

//     const rate = Number(member.amount)
//         || (typeof ROOM !== 'undefined' && Number(ROOM.amount || ROOM.rate))
//         || Number(localStorage.getItem("fund-dashboard-rate"))
//         || 100;

//     function getCurrentWeekIndex() {
//         if (typeof WEEKS_LIST === 'undefined' || !Array.isArray(WEEKS_LIST)) return -1;
//         const now = new Date();
        
//         return WEEKS_LIST.findIndex(w => {
//             if (!w.startDate || !w.endDate) return false;
//             const start = new Date(w.startDate);
//             const end = new Date(w.endDate);
//             end.setHours(23, 59, 59, 999);
//             return now >= start && now <= end;
//         });
//     }

//     const now = new Date();
//     if (COLLECTION_MODE === "month") {
//         const currentMonthIdx = now.getMonth();
//         member.paid = Boolean(member.paidMonths && member.paidMonths[currentMonthIdx]);
//     } else {
//         const currentWeekIdx = getCurrentWeekIndex();
//         if (currentWeekIdx !== -1) {
//             member.paid = Boolean(member.paidWeeks && member.paidWeeks[currentWeekIdx]);
//         }
//     }

//     if (document.getElementById("rate-display")) document.getElementById("rate-display").textContent = rate;
//     if (document.getElementById("who-name")) document.getElementById("who-name").textContent = member.name;

//     const remainingAmount = member.paid ? 0 : rate;
//     if (document.getElementById("who-amount")) document.getElementById("who-amount").textContent = "฿" + remainingAmount.toLocaleString();

//     if (COLLECTION_MODE === "month") {
//         renderMonthModeUI();
//     } else {
//         renderWeekModeUI();
//     }
    
//     function renderMonthModeUI() {
//         const group = document.getElementById("month-selection-group");
//         if (!group) return;

//         group.innerHTML = `
//             <label><i class="ti ti-calendar"></i> เลือกเดือนที่ต้องการชำระ (เดือนละ ฿${rate})</label>
//             <div class="month-select-grid" id="month-grid"></div>
//         `;

//         const grid = document.getElementById("month-grid");
//         if (!grid) return;

//         const paidMonths = member.paidMonths || Array(12).fill(false);

//         grid.innerHTML = THAI_MONTHS.map((monthName, idx) => {
//             const isPaid = paidMonths[idx];
//             const isSelected = selectedMonths.includes(idx);

//             if (isPaid) {
//                 return `
//                 <div class="month-option-card paid-already">
//                     <div class="m-title">${monthName}</div>
//                     <div class="m-status"><i class="ti ti-check"></i> จ่ายแล้ว </div>
//                 </div>`;
//             }

//             return `
//             <div class="month-option-card ${isSelected ? 'selected' : ''}" onclick="toggleMonthSelection(${idx})">
//                 <div class="m-title">${monthName}</div>
//                 <div class="m-status">${isSelected ? 'เลือกแล้ว' : '฿' + rate}</div>
//             </div>`;
//         }).join("");
//     }

//     window.toggleMonthSelection = function(index) {
//         if (selectedMonths.includes(index)) {
//             selectedMonths = selectedMonths.filter(m => m !== index);
//         } else {
//             selectedMonths.push(index);
//         }

//         const totalAmount = selectedMonths.length * rate;
//         updatePayAmountUI(totalAmount, selectedMonths.length > 0);
//         renderMonthModeUI();
//     };

//     function renderWeekModeUI() {
//         injectMonthDropdown();
//         renderWeekGrid();
//     }

//     function injectMonthDropdown() {
//         const group = document.getElementById("month-selection-group");
//         if (!group || document.getElementById("pay-month-select")) return;
        
//         const optionsHTML = THAI_MONTHS.map((m, idx) =>
//             `<option value="${idx}" ${idx === selectedMonthIndex ? 'selected' : ''}>${m} (${CURRENT_YEAR})</option>`
//         ).join("");

//         group.innerHTML = `
//             <div class="month-select-wrapper">
//                 <label for="pay-month-select"><i class="ti ti-calendar"></i> เลือกประจำเดือนที่จะจ่ายสัปดาห์:</label>
//                 <select id="pay-month-select" class="month-dropdown">
//                     ${optionsHTML}
//                 </select>
//             </div>
//             <div class="week-select-grid" id="month-select-grid" style="margin-top: 12px;"></div>
//         `;

//         document.getElementById("pay-month-select")?.addEventListener("change", (e) => {
//             selectedMonthIndex = Number(e.target.value);
//             renderWeekGrid();
//         });
//     }

//     function renderWeekGrid() {
//         const grid = document.getElementById("month-select-grid");
//         if (!grid) return;

//         const weeksInMonth = WEEKS_LIST.filter(w => w.monthIndex === selectedMonthIndex);

//         grid.innerHTML = weeksInMonth.map((item, localIdx) => {
//             const isFullyPaid = Boolean(member.paidWeeks ? member.paidWeeks[item.index] : false);
//             const isSelected = selectedWeeks.includes(item.index);

//             if (isFullyPaid) {
//                 return `
//                 <div class="week-option paid-already">
//                     <i class="ti ti-circle-check-filled week-check-icon"></i>
//                     <div class="week-text">
//                         <span class="w-title">สัปดาห์ที่ ${localIdx + 1}</span>
//                         <span class="sub-date">จ่ายแล้ว</span>
//                     </div>
//                 </div>`;
//             }

//             return `
//             <div class="week-option ${isSelected ? 'selected' : ''}" onclick="toggleWeekSelection(${item.index})">
//                 <i class="ti ${isSelected ? 'ti-circle-check-filled' : 'ti-circle'} week-check-icon"></i>
//                 <div class="week-text">
//                     <span class="w-title">สัปดาห์ที่ ${localIdx + 1} (฿${rate})</span>
//                     <span class="sub-date">${item.dateRange}</span>
//                 </div>
//             </div>`;
//         }).join("");
//     }

//     window.toggleWeekSelection = function(index) {
//         if (selectedWeeks.includes(index)) {
//             selectedWeeks = selectedWeeks.filter(w => w !== index);
//         } else {
//             selectedWeeks.push(index);
//         }

//         const totalAmount = selectedWeeks.length * rate;
//         updatePayAmountUI(totalAmount, selectedWeeks.length > 0);
//         renderWeekGrid();
//     };

//     function updatePayAmountUI(totalAmount, hasSelection) {
//         const whoAmount = document.getElementById("who-amount");
//         if (whoAmount) whoAmount.textContent = "฿" + totalAmount.toLocaleString();

//         const labelEl = document.getElementById("payment-week-label");
//         if (labelEl) {
//             if (COLLECTION_MODE === "month") {
//                 labelEl.textContent = selectedMonths.length > 0 ? `เลือกชำระทั้งหมด ${selectedMonths.length} เดือน` : "กรุณาเลือกเดือนที่ต้องการชำระ";
//             } else {
//                 const weeksInMonth = WEEKS_LIST.filter(w => w.monthIndex === selectedMonthIndex);
//                 const weekNumbers = selectedWeeks
//                     .map(globalIdx => weeksInMonth.findIndex(w => w.index === globalIdx) + 1)
//                     .filter(num => num > 0)
//                     .sort((a, b) => a - b);

//                 if (weekNumbers.length === 0) {
//                     labelEl.textContent = "กรุณาเลือกสัปดาห์ที่ต้องการชำระ";
//                 } else {
//                     labelEl.textContent = `ยอดที่ต้องชำระประจำสัปดาห์ที่ ${weekNumbers.join(", ")}`;
//                 }
//             }
//         }

//         const methodWrap = document.getElementById("step-method-wrap");
//         if (hasSelection) {
//             methodWrap?.classList.remove("step-hidden");
//             methodWrap?.classList.add("step-visible");
            
//             // เปิดแถบแรกเป็น QR Code โดยอัตโนมัติหากยังไม่มีการเลือก Tab
//             if (!document.querySelector(".tab-btn.active")) {
//                 switchTab("qr");
//             } else {
//                 updateQRCode();
//             }
//         } else {
//             methodWrap?.classList.add("step-hidden");
//             methodWrap?.classList.remove("step-visible");
//             hideAllPanels();
//         }
//     }

//     function updateQRCode() {
//         const promptpayAccount = (typeof ROOM !== 'undefined' && ROOM.promptpayId)
//             ? ROOM.promptpayId
//             : (typeof window.targetAcc !== 'undefined' ? window.targetAcc : "0849731038");

//         const isMonthMode = COLLECTION_MODE === "month";
//         const selectedCount = isMonthMode ? selectedMonths.length : selectedWeeks.length;
//         const totalAmount = selectedCount * rate;

//         if (typeof buildPromptPayPayload === "function" && totalAmount > 0) {
//             const payload = buildPromptPayPayload(promptpayAccount, totalAmount);
//             const qrImg = document.getElementById('qr-img');
//             if (qrImg) {
//                 qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(payload)}`;
//             }
//         }
//     }

//     function switchTab(which) {
//         const tabQr = document.getElementById("tab-qr");
//         const tabCash = document.getElementById("tab-cash");
//         const panelQr = document.getElementById("panel-qr");
//         const panelCash = document.getElementById("panel-cash");

//         tabQr?.classList.toggle("active", which === "qr");
//         tabCash?.classList.toggle("active", which === "cash");

//         if (which === "qr") {
//             panelCash?.classList.add("step-hidden");
//             panelCash?.classList.remove("step-visible");
//             panelQr?.classList.remove("step-hidden");
//             panelQr?.classList.add("step-visible");
            
//             updateQRCode();
//         } else if (which === "cash") {
//             panelQr?.classList.add("step-hidden");
//             panelQr?.classList.remove("step-visible");
//             panelCash?.classList.remove("step-hidden");
//             panelCash?.classList.add("step-visible");
//         }
//     }

//     function hideAllPanels() {
//         document.getElementById("tab-qr")?.classList.remove("active");
//         document.getElementById("tab-cash")?.classList.remove("active");

//         const panelQr = document.getElementById("panel-qr");
//         const panelCash = document.getElementById("panel-cash");

//         panelQr?.classList.add("step-hidden");
//         panelQr?.classList.remove("step-visible");
//         panelCash?.classList.add("step-hidden");
//         panelCash?.classList.remove("step-visible");
//     }

//     async function markPending(method) {
//         const isMonthMode = COLLECTION_MODE === "month";
//         const hasSelection = isMonthMode ? selectedMonths.length > 0 : selectedWeeks.length > 0;

//         if (!hasSelection) {
//             alert(isMonthMode ? "กรุณาเลือกเดือนที่ต้องการชำระ" : "กรุณาเลือกสัปดาห์ที่ต้องการชำระ");
//             return;
//         }

//         const nowDate = new Date().toLocaleDateString("th-TH");
//         const payAmount = isMonthMode ? selectedMonths.length * rate : selectedWeeks.length * rate;

//         if (isMonthMode) {
//             if (!member.paidMonths) member.paidMonths = Array(12).fill(false);
//             selectedMonths.forEach(mIdx => member.paidMonths[mIdx] = true);
//         } else {
//             const weekCount = typeof WEEKS_LIST !== 'undefined' ? WEEKS_LIST.length : 52;
//             if (!member.paidWeeks) member.paidWeeks = Array(weekCount).fill(false);
//             selectedWeeks.forEach(wIdx => {
//                 member.paidWeeks[wIdx] = true;
//             });
//         }

//         if (isMonthMode) {
//             const currentMonth = new Date().getMonth();
//             member.paid = Boolean(member.paidMonths[currentMonth]);
//         } else {
//             const currentWeekIdx = getCurrentWeekIndex();
//             if (currentWeekIdx !== -1) {
//                 member.paid = Boolean(member.paidWeeks[currentWeekIdx]);
//             } else {
//                 member.paid = selectedWeeks.some(wIdx => member.paidWeeks[wIdx]);
//             }
//         }

//         if (!member.history) member.history = [];
//         member.history.push({
//             date: nowDate,
//             method: method,
//             amount: payAmount,
//             mode: COLLECTION_MODE,
//             items: isMonthMode ? [...selectedMonths] : [...selectedWeeks]
//         });

//         const idx = MEMBERS.findIndex(m => m.id === member.id);
//         if (idx !== -1) {
//             MEMBERS[idx] = member;
//         }

//         // 1. บันทึกลง LocalStorage ตามเดิม
//         window.MEMBERS = MEMBERS;
//         localStorage.setItem("fund-dashboard-members", JSON.stringify(MEMBERS));

//         // 🟢 2. เพิ่มส่วนนี้: ยิงข้อมูลไปบันทึกลง MySQL Database บน Railway
//         try {
//             await fetch(`/api/members/${member.id}`, {
//                 method: "PUT",
//                 headers: { "Content-Type": "application/json" },
//                 body: JSON.stringify({
//                     paidMonths: member.paidMonths,
//                     paidWeeks: member.paidWeeks,
//                     history: member.history
//                 })
//             });
//             console.log("✅ อัปเดตฐานข้อมูล MySQL สำเร็จ");
//         } catch (err) {
//             console.error("❌ ไม่สามารถอัปเดตลง MySQL ได้:", err);
//         }

//         alert("บันทึกการชำระเงินเรียบร้อยแล้ว!");

//         const formWrap = document.getElementById('pay-form-wrap');
//         const payDone = document.getElementById('pay-done');
//         const doneBackLink = document.getElementById('done-back-link');

//         if (doneBackLink) doneBackLink.href = `member.html?id=${member.id}`;
//         if (formWrap) formWrap.classList.add('hidden');
//         if (payDone) payDone.classList.remove('hidden');

//         setTimeout(() => {
//            window.location.href = `member.html?id=${member.id}`; 
//         }, 3000);
//     }

//     document.getElementById("back-btn")?.addEventListener("click", (e) => {
//         e.preventDefault();
//         location.href = `member.html?id=${member.id}`;
//     });
//     document.getElementById("tab-qr")?.addEventListener("click", () => switchTab("qr"));
//     document.getElementById("tab-cash")?.addEventListener("click", () => switchTab("cash"));
//     document.getElementById("confirm-qr")?.addEventListener("click", () => markPending("PromptPay"));
//     document.getElementById("confirm-cash")?.addEventListener("click", () => markPending("เงินสด"));
// });

function getBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

document.addEventListener("DOMContentLoaded", async () => {
    if (document.getElementById('qr-name')) {
        document.getElementById('qr-name').textContent = (typeof ROOM !== 'undefined' && ROOM.promptpayName)
            ? ROOM.promptpayName
            : "นายณัฐวัฒน์ สุดพูล";
    }

    const COLLECTION_MODE = localStorage.getItem("fund-dashboard-mode") || "month";

    let selectedMonthIndex = new Date().getMonth();
    let selectedMonths = [];
    let selectedWeeks = [];

    const params = new URLSearchParams(location.search);
    const memberId = Number(params.get("id"));

    // โหลดข้อมูลสมาชิกจาก MySQL API
    let MEMBERS = [];
    try {
        const response = await fetch("/api/members", { cache: "no-store" });
        if (response.ok) {
            MEMBERS = await response.json();
        }
    } catch (e) {
        console.error("❌ ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้:", e);
    }
    
    if (MEMBERS.length === 0) {
        const storedMembers = localStorage.getItem("fund-dashboard-members");
        MEMBERS = storedMembers ? JSON.parse(storedMembers) : (typeof getMembersData === 'function' ? getMembersData() : []);
    }

    const member = MEMBERS.find(m => m.id === memberId);

    if (!member) {
        alert("ไม่พบข้อมูลสมาชิก กรุณาเลือกใหม่อีกครั้ง");
        location.href = "admin.html";
        return;
    }

    const rate = Number(member.amount)
        || (typeof ROOM !== 'undefined' && Number(ROOM.amount || ROOM.rate))
        || Number(localStorage.getItem("fund-dashboard-rate"))
        || 100;

    if (document.getElementById("rate-display")) document.getElementById("rate-display").textContent = rate;
    if (document.getElementById("who-name")) document.getElementById("who-name").textContent = member.name;

    if (COLLECTION_MODE === "month") {
        renderMonthModeUI();
    } else {
        renderWeekModeUI();
    }
    
    function renderMonthModeUI() {
        const group = document.getElementById("month-selection-group");
        if (!group) return;

        group.innerHTML = `
            <label><i class="ti ti-calendar"></i> เลือกเดือนที่ต้องการชำระ (เดือนละ ฿${rate})</label>
            <div class="month-select-grid" id="month-grid"></div>
        `;

        const grid = document.getElementById("month-grid");
        if (!grid) return;

        const paidMonths = member.paidMonths || Array(12).fill(false);

        grid.innerHTML = THAI_MONTHS.map((monthName, idx) => {
            const isPaid = paidMonths[idx];
            const isSelected = selectedMonths.includes(idx);

            if (isPaid) {
                return `
                <div class="month-option-card paid-already">
                    <div class="m-title">${monthName}</div>
                    <div class="m-status"><i class="ti ti-check"></i> จ่ายแล้ว </div>
                </div>`;
            }

            return `
            <div class="month-option-card ${isSelected ? 'selected' : ''}" onclick="toggleMonthSelection(${idx})">
                <div class="m-title">${monthName}</div>
                <div class="m-status">${isSelected ? 'เลือกแล้ว' : '฿' + rate}</div>
            </div>`;
        }).join("");
    }

    // คลิกเลือกเดือน -> ไฮไลต์ปุ่ม + เปิดเมนูเลือกวิธีชำระเงิน (ยังไม่อัปเดต DB)
    window.toggleMonthSelection = function(index) {
        if (selectedMonths.includes(index)) {
            selectedMonths = selectedMonths.filter(m => m !== index);
        } else {
            selectedMonths.push(index);
        }

        const totalAmount = selectedMonths.length * rate;
        updatePayAmountUI(totalAmount, selectedMonths.length > 0);
        renderMonthModeUI();
    };

    function updatePayAmountUI(totalAmount, hasSelection) {
        const whoAmount = document.getElementById("who-amount");
        if (whoAmount) whoAmount.textContent = "฿" + totalAmount.toLocaleString();

        const labelEl = document.getElementById("payment-week-label");
        if (labelEl) {
            if (COLLECTION_MODE === "month") {
                labelEl.textContent = selectedMonths.length > 0 
                    ? `เลือกชำระทั้งหมด ${selectedMonths.length} เดือน` 
                    : "กรุณาเลือกเดือนที่ต้องการชำระ";
            }
        }

        const methodWrap = document.getElementById("step-method-wrap");
        if (hasSelection) {
            methodWrap?.classList.remove("step-hidden");
            methodWrap?.classList.add("step-visible");
            if (!document.querySelector(".tab-btn.active")) {
                switchTab("qr");
            } else {
                updateQRCode();
            }
        } else {
            methodWrap?.classList.add("step-hidden");
            methodWrap?.classList.remove("step-visible");
            hideAllPanels();
        }
    }

    function updateQRCode() {
        const promptpayAccount = (typeof ROOM !== 'undefined' && ROOM.promptpayId)
            ? ROOM.promptpayId
            : (typeof window.targetAcc !== 'undefined' ? window.targetAcc : "0863481103");

        const totalAmount = selectedMonths.length * rate;

        if (typeof buildPromptPayPayload === "function" && totalAmount > 0) {
            const payload = buildPromptPayPayload(promptpayAccount, totalAmount);
            const qrImg = document.getElementById('qr-img');
            if (qrImg) {
                qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(payload)}`;
            }
        }
    }

    function switchTab(which) {
        const tabQr = document.getElementById("tab-qr");
        const tabCash = document.getElementById("tab-cash");
        const panelQr = document.getElementById("panel-qr");
        const panelCash = document.getElementById("panel-cash");

        tabQr?.classList.toggle("active", which === "qr");
        tabCash?.classList.toggle("active", which === "cash");

        if (which === "qr") {
            panelCash?.classList.add("step-hidden");
            panelQr?.classList.remove("step-hidden");
            updateQRCode();
        } else {
            panelQr?.classList.add("step-hidden");
            panelCash?.classList.remove("step-hidden");
        }
    }

    function hideAllPanels() {
        document.getElementById("panel-qr")?.classList.add("step-hidden");
        document.getElementById("panel-cash")?.classList.add("step-hidden");
    }

    // ทำรายการชำระเงินพร้อมแนบรูปสลิป
    async function markPending(method) {
        const hasSelection = selectedMonths.length > 0;
        if (!hasSelection) {
            alert("กรุณาเลือกเดือนที่ต้องการชำระ");
            return;
        }

        const payAmount = selectedMonths.length * rate;
        let transferorName = null;

        // เช็กและอ่านไฟล์สลิป (ถ้าเลือกสแกนจ่าย)
        if (method === "PromptPay") {
            const slipInput = document.getElementById("slip-file");
            if (slipInput && slipInput.files.length === 0) {
                alert("กรุณาแนบไฟล์รูปภาพสลิปการโอนเงิน");
                return;
            }

            const formData = new FormData();
            formData.append("slip_image", slipInput.files[0]);
            formData.append("expected_amount", payAmount);

            try {
                const verifyRes = await fetch("/verify-slip", {
                    method: "POST",
                    body: formData
                });

                const verifyData = await verifyRes.json();

                if (!verifyRes.ok || verifyData.status !== "success") {
                    alert("❌ ตรวจสอบสลิปไม่ผ่าน: " + (verifyData.message || "สลิปไม่ถูกต้อง"));
                    return;
                }

                transferorName = verifyData.transferorName || null;
                console.log("✅ ตรวจสอบสลิปผ่านแล้ว:", verifyData.message);
            } catch (err) {
                console.error("❌ เกิดข้อผิดพลาดในการตรวจสลิป:", err);
                alert("ไม่สามารถเชื่อมต่อระบบตรวจสอบสลิปได้ กรุณาลองใหม่อีกครั้ง");
                return;
            }
        }

        let slipBase64 = null;
        if (method === "PromptPay") {
            const slipInput = document.getElementById("slip-file");
            if (slipInput && slipInput.files.length > 0) {
                try {
                    slipBase64 = await getBase64(slipInput.files[0]);
                } catch (e) {
                    console.error("❌ แปลงไฟล์สลิปไม่สำเร็จ:", e);
                }
            }
        }

        const nowDate = new Date().toLocaleDateString("th-TH");

        if (!member.paidMonths) member.paidMonths = Array(12).fill(false);
        selectedMonths.forEach(mIdx => member.paidMonths[mIdx] = true);

        if (!member.history) member.history = [];
        member.history.push({
            date: nowDate,
            method: method,
            amount: payAmount,
            mode: COLLECTION_MODE,
            items: [...selectedMonths],
            transferorName: transferorName,
            slipUrl: slipBase64
        });

        try {
            const res = await fetch(`/api/members/${member.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    paidMonths: member.paidMonths,
                    history: member.history
                })
            });

            if (res.ok) {
                alert("แจ้งชำระเงินสำเร็จ!");
                document.getElementById('pay-form-wrap')?.classList.add('hidden');
                document.getElementById('pay-done')?.classList.remove('hidden');
                setTimeout(() => {
                    window.location.href = `member.html?id=${member.id}`;
                }, 2000);
            } else {
                alert("ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง");
            }
        } catch (err) {
            console.error("❌ บันทึกไม่สำเร็จ:", err);
            alert("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
        }
    }

    document.getElementById("tab-qr")?.addEventListener("click", () => switchTab("qr"));
    document.getElementById("tab-cash")?.addEventListener("click", () => switchTab("cash"));
    document.getElementById("confirm-qr")?.addEventListener("click", () => markPending("PromptPay"));
    document.getElementById("confirm-cash")?.addEventListener("click", () => markPending("เงินสด"));
    document.getElementById("back-btn")?.addEventListener("click", () => history.back());
});