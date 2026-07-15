const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const GEMINI_KEY = "GEMINI_KEY_PLACEHOLDER";
const ZYREOS_API = "https://zyreos-app-production.up.railway.app/api/alex/sync";
const ALEX_TOKEN = "zyreos_alex_secret_key_2026";
const botSentIds = new Set();
const pendingReceipts = {}; // Düşük güvenle okunan dekontlar: grup onayı bekler

const PROCESSED_DECONTS_FILE = path.join(__dirname, 'processed_deconts.json');
let processedDeconts = {};
if (fs.existsSync(PROCESSED_DECONTS_FILE)) {
    try { processedDeconts = JSON.parse(fs.readFileSync(PROCESSED_DECONTS_FILE, 'utf8')); } catch (e) { processedDeconts = {}; }
}

function saveProcessedDeconts() {
    try { fs.writeFileSync(PROCESSED_DECONTS_FILE, JSON.stringify(processedDeconts, null, 2), 'utf8'); } catch (e) { console.error("Hafıza dosyası yazılamadı:", e); }
}

async function sendMsg(sock, to, content, options = {}) {
    try {
        console.log(`[📤 MESAJ GÖNDERİLİYOR] Kime: ${to}`);
        const sent = await sock.sendMessage(to, content, options);
        if (sent && sent.key && sent.key.id) botSentIds.add(sent.key.id);
        console.log(`[✅ MESAJ GİTTİ]`);
        return sent;
    } catch (e) { console.error("❌ Mesaj gönderme hatası:", e); }
}

function formatTr(num) { return (num || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

async function callZyreos(action, groupId, payload) {
    try {
        console.log(`[🚀 ZYREOS'A İSTEK GİDİYOR] Aksiyon: ${action}`);
        const res = await axios.post(ZYREOS_API, { action, groupId, payload }, { headers: { 'x-alex-token': ALEX_TOKEN }, timeout: 10000 });
        console.log(`[✅ ZYREOS CEVABI]`, res.data);
        return res.data;
    } catch (e) {
        console.error("❌ Zyreos API Hatası:", e.response?.data || e.message);
        return { success: false, message: "Zyreos ana sunucusuna bağlanılamadı." }; 
    }
}

async function askGemini(prompt, sysInstr = null, base64Image = null) {
    console.log("   [🧠 Gemini API Çağrısı Yapılıyor...]");
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;
    const parts = [];
    if (base64Image) parts.push({ inline_data: { mime_type: "image/jpeg", data: base64Image } });
    parts.push({ text: prompt });
    const payload = { contents: [{ role: "user", parts }] };
    if (sysInstr) payload.system_instruction = { parts: [{ text: sysInstr }] };
    
    try {
        const res = await axios.post(url, payload, { timeout: 15000 });
        console.log("   [✅ Gemini Cevap Verdi]");
        return res.data.candidates[0].content.parts[0].text;
    } catch (e) {
        console.error("   ❌ Gemini API Hatası:", e.response?.data || e.message);
        return null;
    }
}

async function connectToWhatsApp () {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const sock = makeWASocket({ auth: state });
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) qrcode.generate(qr, { small: true });
        if(connection === 'close' && lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut) connectToWhatsApp();
        else if(connection === 'open') console.log('\n✅✅✅ ALEX CANLI PANEL ENTEGRE MODUYLA AKTİF! ✅✅✅\n');
    });

    sock.ev.on('messages.upsert', async m => {
        if (m.type !== 'notify') return; 

        const msg = m.messages[0];
        if(!msg.message || botSentIds.has(msg.key.id)) return;
        
        const from = msg.key.remoteJid;
        const gonderenKisi = msg.key.fromMe ? "Kadir Kaya" : (msg.pushName || "Müşteri");
        const txt = `${msg.message.conversation || ""} ${msg.message.extendedTextMessage?.text || ""} ${msg.message.imageMessage?.caption || ""} ${msg.message.documentMessage?.caption || ""}`.trim();
        const lTxt = txt.toLowerCase();
        
        if (txt) console.log(`\n[📥 YENİ MESAJ] Kimden: ${from} | İçerik: ${txt}`);

        const now = new Date();
        const todayStr = now.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' }).split('.').reverse().join('-');

        if (msg.message.imageMessage) {
            console.log("[📸 Görsel Algılandı, OCR Başlıyor...]");
            try {
                const buffer = await downloadMediaMessage(msg, 'buffer', {});
                const b64 = buffer.toString('base64');
                
                const imagePrompt = `Sen banka dekontu ve slip uzmanısın. Başarılı bir pos çekim tutarı içeriyorsa geçerli say.
GÖREVLER:
1. Dekont üzerindeki brüt tutarı, taksit sayısını bul.
2. BANKA TESPİT KURALI: Geçen kart markasını veya banka adını şuna çevir:
   - Axess, Akbank, Ak Bank -> Akbank
   - Bonus, Garanti, Garanti BBVA -> Garanti
   - Paraf, Halkbank, Halk Bank -> Halk
   - Ziraat, Ziraat Bankası, Bankkart -> Ziraat
   - CardFinans, Card Finans, QNB, QNB Finansbank, Finansbank, Enpara -> QNB
   - Kuveyt Türk, Kuveyt Turk, Sağlam Kart -> Kuveyt
   - World, WorldCard, World Card, Yapı Kredi, Yapi Kredi -> YKB
   - Maximum, Maxipuan, İş Bankası, İşbank, Isbank, Is Bankasi -> İş Bankası
   - Vakıfbank, Vakifbank, Vakıf, Vakif -> Vakıf
   Uymuyorsa veya bulunamadıysa kesinlikle "Diğer" döndür.
3. İŞLEM TARİHİ: Dekontun/slibin üzerindeki gerçek işlem tarihini GG.AA.YYYY formatında bul ve ayıkla. Bulamazsan boş bırak.
4. İŞLEM NUMARASI: Dekont üzerindeki işlem numarasını, referans numarasını (RRN), provizyon kodunu veya onay kodunu bul ve ayıkla. Bulamazsan boş bırak.

SADECE JSON DÖNDÜR. Markdown (\`\`\`json) kullanma.
Format: {"isReceipt": true/false, "grossAmount": 10000, "installments": 1, "banka": "İş Bankası", "receiptDate": "18.05.2026", "transactionId": "12345678"}`;
                
                const resText = await askGemini(imagePrompt, null, b64);
                if (!resText) return;
                
                let cleanJson = resText.trim().replace(/^```json/, '').replace(/```$/, '').trim();
                const resJson = JSON.parse(cleanJson);
                console.log("[🤖 OCR Sonucu]:", resJson);

                if (resJson.isReceipt) {
                    let finalDate = todayStr;
                    if (resJson.receiptDate && resJson.receiptDate.includes('.')) {
                        const parts = resJson.receiptDate.split('.');
                        if (parts.length === 3) finalDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
                    }

                    let isMukerrer = false;
                    const txId = resJson.transactionId ? resJson.transactionId.trim() : "YOK";
                    const uniqueKey = `${resJson.grossAmount}_${txId}`;

                    if (txId !== "YOK" && processedDeconts[uniqueKey]) {
                        isMukerrer = true;
                    }

                    const syncRes = await callZyreos('ADD_CARD', from, { 
                        grossAmount: resJson.grossAmount, 
                        installments: resJson.installments, 
                        bankaName: resJson.banka, 
                        gonderen: gonderenKisi, 
                        date: finalDate,
                        transactionId: txId
                    });

                    if (syncRes.success) {
                        if (txId !== "YOK") {
                            processedDeconts[uniqueKey] = { date: todayStr, amount: resJson.grossAmount };
                            saveProcessedDeconts();
                        }

                        let warningPrefix = "";
                        if (isMukerrer) {
                            warningPrefix = `⚠️ *MÜKERRER İŞLEM UYARISI!*\nBu işlem numarası (${txId}) daha önce kaydedilmişti! Kontrol edin, talimatınız gereği yine de işlendi.\n\n`;
                        }

                        const responseMsg = `${warningPrefix}🏢 *Cari Hesap:* ${syncRes.customerName || 'DİĞER'}\n` +
                                            `Alex Kart Çekimi Zyreos'a İşlendi!\n` +
                                            `Çekilen Tutar: ${formatTr(resJson.grossAmount)} TL\n` +
                                            `Taksit : ${resJson.installments}\n` +
                                            `Taksit Oranı : %${syncRes.customerRate || 0}\n` +
                                            `Net Kalan Tutar : ${formatTr(syncRes.netToCustomer)} TL\n\n` +
                                            `_İşlem Tarihi: ${resJson.receiptDate || finalDate}_\n` +
                                            `_İşlem No: ${txId}_ 🫡`;

                        await sendMsg(sock, from, { text: responseMsg }, { quoted: msg });
                    } else { 
                        await sendMsg(sock, from, { text: syncRes.message || "Kart kaydı işlenemedi abi." }, { quoted: msg }); 
                    }
                } else {
                    console.log(`[ℹ️ OCR Pas Geçildi] Gelen görsel dekont olarak doğrulanamadı.`);
                }
            } catch (err) { console.error("❌ OCR İşlem Hatası:", err); }
            return;
        }

        const isAlex = lTxt.includes('alex');
        const isPaymentTrigger = lTxt.includes('ödeme yapıldı') || lTxt.includes('bırakıldı') || lTxt.includes('geçildi');
        const isReportTrigger = lTxt.includes('rapor ver') || lTxt.includes('bakiye ne') || lTxt.includes('bakiye ver');
        const isLinkTrigger = lTxt.includes('grup') && (lTxt.includes('grubudur') || lTxt.includes('bağla') || lTxt.includes('carisidir') || lTxt.includes('adı'));
        
        const isCreateTrigger = lTxt.includes('carisini aç') || lTxt.includes('carisi oluştur') || lTxt.includes('müşterisi ekle');
        const isDeleteTrigger = lTxt.includes('carisini sil') || lTxt.includes('müşterisini sil');
        const isRateTrigger = lTxt.includes('taksit oranını') || (lTxt.includes('oranını') && lTxt.includes('yap'));
        const isCancelTrigger = lTxt.includes('son işlemi iptal') || lTxt.includes('son dekontu sil') || lTxt.includes('son işlemi sil');

        if (isAlex || isPaymentTrigger || isReportTrigger || isLinkTrigger || isCreateTrigger || isDeleteTrigger || isRateTrigger || isCancelTrigger) {
            console.log("[⚙️ Niyet Analizi Tetiklendi]");
            try {
                const niyetPrompt = `Aşağıdaki metni analiz et ve SADECE JSON formatında yanıt ver. Kod blokları veya fazladan işaretler kullanma.
Format KESİNLİKLE şu şekilde olmalıdır: {"intent": "SOHBET", "targetName": null, "amount": null, "installment": null, "rate": null}

Niyetler (intent):
- Kullanıcı grubu bir cariye bağlamak istiyorsa -> intent: "LINK_GROUP", targetName: "[Cari Adı]"
- Ödeme bildirimi varsa -> intent: "PAYMENT", amount: [tutar]
- Rapor/bakiye isteniyorsa -> intent: "REPORT"
- Yeni cari/müşteri açmak istiyorsa (Örn: "alex HAKAN carisini aç") -> intent: "CREATE_CUSTOMER", targetName: "[Müşteri Adı]"
- Cari silmek istiyorsa (Örn: "alex AHMET carisini sil") -> intent: "DELETE_CUSTOMER", targetName: "[Müşteri Adı]"
- Oran güncellemek istiyorsa (Örn: "alex DİĞER carisinin 3 taksit oranını 15 yap") -> intent: "UPDATE_RATE", targetName: "[Müşteri Adı]", installment: [taksit no], rate: [yeni oran]
- Son kart çekimini iptal etmek/silmek istiyorsa -> intent: "DELETE_LAST_CARD"
- Diğer konuşmalar -> intent: "SOHBET"

Metin: "${txt}"`;

                const resText = await askGemini(niyetPrompt);
                if (!resText) return;

                let cleanJson = resText.trim().replace(/^```json/, '').replace(/```$/, '').trim();
                let resJson = JSON.parse(cleanJson);
                
                let intent = resJson.intent || 'SOHBET';
                console.log(`[🤖 Niyet Analizi Sonucu]: ${intent} | Saf JSON:`, resJson);

                if (intent === 'LINK_GROUP' || isLinkTrigger) {
                    let targetName = resJson.targetName;
                    if (!targetName) {
                        const m = txt.match(/(?:bu grup|bu grubun adı|grubu) (.+?) (?:grubudur|carisidir|bağla)/i) || txt.match(/grup (.+?)$/i);
                        targetName = m ? m[1].trim() : null;
                    }
                    if (targetName) {
                        const linkRes = await callZyreos('LINK_GROUP', from, { targetName: targetName });
                        const replyMsg = linkRes.message ? linkRes.message : (linkRes.success ? `Mükemmel! Bu WhatsApp grubu artık Zyreos panelindeki *${linkRes.customerName || targetName}* carisine başarıyla bağlandı. 🫡` : "Cari bulunamadı veya bağlanamadı.");
                        await sendMsg(sock, from, { text: replyMsg }, { quoted: msg });
                    }
                    return;
                }

                if (intent === 'PAYMENT' && resJson.amount) {
                    const syncRes = await callZyreos('ADD_PAYMENT', from, { amount: resJson.amount, date: todayStr, gonderen: gonderenKisi });
                    
                    if (!syncRes.success) {
                        return await sendMsg(sock, from, { text: syncRes.message || "Ödeme işlenirken bir hata oluştu abi." }, { quoted: msg });
                    }
                    
                    const repRes = await callZyreos('REPORT', from, { date: todayStr });
                    await sendMsg(sock, from, { text: `🏢 *Cari Hesap:* ${syncRes.customerName || 'DİĞER'}\n💸 *Ödeme Zyreos'a İşlendi!*\n\n• Alacaktan Düşülen: -${formatTr(resJson.amount)} TL\n• Güncel Kalan Cari Bakiye: *${formatTr(repRes.totalBalance)} TL*` }, { quoted: msg });
                    return;
                }

                if (intent === 'REPORT' || isReportTrigger) {
                    const repRes = await callZyreos('REPORT', from, { date: todayStr });
                    
                    if (!repRes.success) {
                        return await sendMsg(sock, from, { text: repRes.message || "Rapor alınamadı abi." }, { quoted: msg });
                    }

                    const d = todayStr.split('-');
                    
                    let sonCekimMetni = "_Bugün henüz kart çekimi yapılmadı._";
                    if (repRes.latestCard) {
                        sonCekimMetni = `• Son Çekilen: ${formatTr(repRes.latestCard.grossAmount || repRes.latestCard.amount)} TL\n` +
                                        `• Son Taksit: ${repRes.latestCard.installment || 1}\n` +
                                        `• Son Taksit Oranı: %${repRes.latestCard.customerRate || 0}\n` +
                                        `• Son Net Kalan: ${formatTr(repRes.latestCard.netToCustomer || 0)} TL`;
                    }

                    const raporMetni = `🏢 *Cari Hesap:* ${repRes.customerName || 'DİĞER'}\n` +
                                       `📊 *${d[2]}.${d[1]}.${d[0]} Tarihi itibari ile ZYREOS Raporu;*\n\n` +
                                       `Önceki Bakiye : ${formatTr(repRes.previousBalance)}\n` +
                                       `Bugünkü Çekilen Kartlar (${repRes.todayCardsCount} Adet) : ${formatTr(repRes.todayCardsNet)}\n` +
                                       `Bugün Yapılan Ödeme : ${formatTr(repRes.todayPayments)}\n` +
                                       `-----------------------------------------\n` +
                                       `*⚠️ Son İşlem Detayı:*\n${sonCekimMetni}\n` +
                                       `-----------------------------------------\n` +
                                       `*Toplam Cari Bakiye : ${formatTr(repRes.totalBalance)} TL* 🫡`;

                    await sendMsg(sock, from, { text: raporMetni }, { quoted: msg });
                    return;
                }

                if (intent === 'CREATE_CUSTOMER') {
                    if (!resJson.targetName) return await sendMsg(sock, from, { text: "Abi oluşturulacak carinin ismini tam anlayamadım." }, { quoted: msg });
                    const createRes = await callZyreos('CREATE_CUSTOMER', from, { customerName: resJson.targetName.toUpperCase() });
                    if (createRes.success) {
                        await sendMsg(sock, from, { text: `✅ *Yeni Cari Hesap Açıldı!*\n\n*${resJson.targetName.toUpperCase()}* isimli müşteri Zyreos paneline sıfır bakiye ve varsayılan komisyon oranlarıyla başarıyla eklenmiştir abi. 🫡` }, { quoted: msg });
                    } else {
                        await sendMsg(sock, from, { text: `❌ *Hata:* ${createRes.message}` }, { quoted: msg });
                    }
                    return;
                }

                if (intent === 'DELETE_CUSTOMER') {
                    if (!resJson.targetName) return await sendMsg(sock, from, { text: "Abi silinecek carinin ismini tam anlayamadım." }, { quoted: msg });
                    const deleteRes = await callZyreos('DELETE_CUSTOMER', from, { customerName: resJson.targetName.toUpperCase() });
                    if (deleteRes.success) {
                        await sendMsg(sock, from, { text: `🗑️ *Cari Hesap Silindi!*\n\n*${resJson.targetName.toUpperCase()}* isimli müşteri ve bağlı tüm kayıtlar Zyreos panelinden tamamen temizlendi abi.` }, { quoted: msg });
                    } else {
                        await sendMsg(sock, from, { text: `❌ *Hata:* ${deleteRes.message}` }, { quoted: msg });
                    }
                    return;
                }

                if (intent === 'UPDATE_RATE') {
                    if (!resJson.targetName || !resJson.installment || resJson.rate === null) {
                        return await sendMsg(sock, from, { text: "Abi oran güncelleme emrini tam seçemedim. Örn: 'alex DİĞER carisinin 3 taksit oranını 15 yap' şeklinde vermelisin." }, { quoted: msg });
                    }
                    const rateRes = await callZyreos('UPDATE_RATE', from, { 
                        customerName: resJson.targetName.toUpperCase(), 
                        installment: parseInt(resJson.installment), 
                        newRate: parseFloat(resJson.rate) 
                    });
                    if (rateRes.success) {
                        await sendMsg(sock, from, { text: `⚙️ *Komisyon Oranı Güncellendi!*\n\n• Cari: *${resJson.targetName.toUpperCase()}*\n• Taksit: ${resJson.installment} Taksit\n• Yeni Oran: %${resJson.rate}\n\n_Bundan sonra atılacak dekontlarda bu yeni oran geçerli olacaktır abi._ 🫡` }, { quoted: msg });
                    } else {
                        await sendMsg(sock, from, { text: `❌ *Hata:* ${rateRes.message}` }, { quoted: msg });
                    }
                    return;
                }

                if (intent === 'DELETE_LAST_CARD' || isCancelTrigger) {
                    const cancelRes = await callZyreos('DELETE_LAST_CARD', from, {});
                    if (cancelRes.success) {
                        await sendMsg(sock, from, { text: `↩️ *Son İşlem İptal Edildi (Geri Alındı)!*\n\nBu gruba ait son eklenen *${formatTr(cancelRes.deletedAmount)} TL* tutarındaki kart çekimi veritabanından tamamen silindi ve kasa bakiyeleri eski haline döndürüldü abi. 🫡` }, { quoted: msg });
                    } else {
                        await sendMsg(sock, from, { text: `❌ *Hata:* ${cancelRes.message || "Bu gruba ait iptal edilecek bir çekim kaydı bulunamadı."}` }, { quoted: msg });
                    }
                    return;
                }

                if (intent === 'SOHBET') {
                    const chatRes = await askGemini(txt, "Sen Zyreos entegrasyonlu finans ortağı Alex'sin. Net, samimi, insan gibi ve kısa cevap ver.");
                    if (chatRes) await sendMsg(sock, from, { text: chatRes }, { quoted: msg });
                }
            } catch (e) { console.error("❌ İşlem Hatası:", e); }
        }
    });
}
connectToWhatsApp();