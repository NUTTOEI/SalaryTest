function crc16(payload) {
    let crc = 0xFFFF;
    for (let i = 0; i < payload.length; i++) {
        crc ^= payload.charCodeAt(i) << 8;
        for (let j = 0; j < 8; j++) {
            crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
            crc &= 0xFFFF;
        }
    }
    return crc.toString(16).toUpperCase().padStart(4, "0");
}

function buildPromptPayPayload(target, amount, name = "PROMPTPAY") {
    const safeName = (typeof name !== 'undefined' && name ? name : "PROMPTPAY");
    const merchantName = safeName.substring(0, 25);
    
    target = String(target).replace(/[^0-9]/g, '');
    let targetType = '01';
    let formattedTarget = target;

    if (target.length === 10 && target.startsWith('0')) {
        targetType = '01';
        formattedTarget = '0066' + target.substring(1);
    } else if (target.length === 13) {
        targetType = '02';
    }

    const tag29_target = `0016A000000677010111${targetType}${String(formattedTarget.length).padStart(2, '0')}${formattedTarget}`;
    
    let payload = '';
    payload += '000201'; 
    payload += (amount && amount > 0) ? '010212' : '010211';
    payload += `29${String(tag29_target.length).padStart(2, '0')}${tag29_target}`;
    payload += '5303764'; 

    if (amount && amount > 0) {
        const formattedAmount = Number(amount).toFixed(2);
        payload += `54${String(formattedAmount.length).padStart(2, '0')}${formattedAmount}`;
    }
    
    payload += '5802TH'; 
    payload += `59${String(merchantName.length).padStart(2, '0')}${merchantName}`;
    payload += '6007BANGKOK';
    payload += '6304';
    payload += crc16(payload);

    return payload;
}

function promptPayQrImageUrl(idRaw, amount, size) {
    const payload = buildPromptPayPayload(idRaw, amount);
    const s = size || 220;
    return "https://api.qrserver.com/v1/create-qr-code/?size=" + s + "x" + s +
        "&data=" + encodeURIComponent(payload);
}