const express=require('express');
const bcrypt=require('bcryptjs');
const jwt=require('jsonwebtoken');
const fs=require('fs');
const path=require('path');
const axios=require('axios');
const{OpenAI}=require('openai');
const{randomUUID}=require('crypto');

const app=express();
app.use(express.json({limit:'10mb'}));

const DATA_DIR=process.env.DATA_DIR||(process.env.NODE_ENV==='production'?'/data':__dirname);
const USERS_FILE=path.join(DATA_DIR,'users.json');
const WA_QUEUE_FILE=path.join(DATA_DIR,'whatsapp_queue.json');
const JWT_SECRET=process.env.JWT_SECRET||'zyreos_gizli_anahtar_degistir_2024';
const WA_TOKEN=process.env.WHATSAPP_TOKEN||'';
const WA_PHONE_ID=process.env.WHATSAPP_PHONE_ID||'';
const WA_VERIFY_TOKEN=process.env.WHATSAPP_VERIFY_TOKEN||'zyreos2024';
const openai=process.env.OPENAI_API_KEY?new OpenAI({apiKey:process.env.OPENAI_API_KEY}):null;

if(!fs.existsSync(DATA_DIR))fs.mkdirSync(DATA_DIR,{recursive:true});

const BANK_ALIASES={
  'akbank':'Akbank','axess':'Akbank','ak bank':'Akbank',
  'garanti':'Garanti','bonus':'Garanti','garanti bbva':'Garanti',
  'diğer banka':'Diğer Banka','diger banka':'Diğer Banka','diğer':'Diğer Banka','diger':'Diğer Banka',
  'halk':'Halk','halkbank':'Halk','halk bank':'Halk','paraf':'Halk',
  'ziraat':'Ziraat','ziraat bankası':'Ziraat','ziraatbank':'Ziraat','bankkart':'Ziraat',
  'qnb':'QNB','finansbank':'QNB','qnb finansbank':'QNB','cardfinans':'QNB','card finans':'QNB','enpara':'QNB',
  'kuveyt':'Kuveyt','kuveyt türk':'Kuveyt','kuveytturk':'Kuveyt','kuveyt turk':'Kuveyt','ktbank':'Kuveyt',
  'ykb':'YKB','yapı kredi':'YKB','yapi kredi':'YKB','worldcard':'YKB','world card':'YKB',
  'iş bankası':'İş Bankası','isbank':'İş Bankası','işbank':'İş Bankası','maximum':'İş Bankası','is bankasi':'İş Bankası',
  'vakıf':'Vakıf','vakif':'Vakıf','vakıfbank':'Vakıf','vakifbank':'Vakıf'
};
const BANK_RATES_VERSION='iyzico-2026-05-05';
const DEFAULT_BANKS=[
  {id:1,name:'Akbank',fee:0,color:'#e30613',rates:[3.65,6.61,8.48,10.35,12.21,14.08,15.95,17.82,19.69,21.56,23.43,25.30]},
  {id:2,name:'QNB',fee:0,color:'#6d28d9',rates:[3.65,6.61,8.48,10.35,12.21,14.08,15.95,17.82,19.69,21.56,23.43,25.30]},
  {id:3,name:'Garanti',fee:0,color:'#00a651',rates:[3.65,6.54,8.40,10.27,12.01,13.56,15.54,17.41,19.21,21.03,22.90,24.77]},
  {id:'diger-banka',name:'Diğer Banka',fee:0,color:'#94a3b8',rates:[3.65,6.54,8.40,10.27,12.01,13.56,15.54,17.41,19.21,21.03,22.90,24.77]},
  {id:4,name:'Kuveyt',fee:0,color:'#0ea5e9',rates:[3.65,6.46,8.33,10.20,12.06,13.93,15.95,17.82,19.69,21.56,23.43,25.30]},
  {id:5,name:'Ziraat',fee:0,color:'#ef4444',rates:[3.65,5.79,7.48,9.38,10.76,12.78,14.64,16.45,18.07,19.90,21.64,23.10]},
  {id:6,name:'Halk',fee:0,color:'#0369a1',rates:[3.65,6.20,8.03,9.87,11.72,13.55,15.40,17.25,19.10,20.95,22.77,24.60]},
  {id:7,name:'İş Bankası',fee:0,color:'#1d4ed8',rates:[3.65,6.61,8.48,10.35,12.21,14.08,15.95,17.82,19.69,21.56,23.43,25.30]},
  {id:8,name:'Vakıf',fee:0,color:'#0f766e',rates:[3.65,6.32,8.09,9.86,11.63,13.40,15.18,16.95,18.72,20.49,22.26,24.03]},
  {id:9,name:'YKB',fee:0,color:'#0066cc',rates:[3.65,6.15,7.80,9.49,11.21,12.75,14.50,16.25,18.12,19.90,21.64,23.00]}
];
function rateNum(v){return +(String(v??0).replace(',','.'))||0;}
function normalizeBanksForData(banks,applyLatestRates){
  const src=Array.isArray(banks)?banks:[];
  const byName=new Map(src.map(b=>[String(b.name||'').toLowerCase(),b]));
  const normalized=DEFAULT_BANKS.map(def=>{
    const saved=byName.get(def.name.toLowerCase());
    if(!saved)return{...def,rates:[...def.rates]};
    const savedRates=Array.isArray(saved.rates)&&saved.rates.length===12?saved.rates.map(rateNum):def.rates;
    return{...def,...saved,fee:rateNum(saved.fee),rates:applyLatestRates?[...def.rates]:savedRates};
  });
  src.forEach(b=>{
    if(!DEFAULT_BANKS.some(def=>def.name.toLowerCase()===String(b.name||'').toLowerCase())){
      normalized.push({...b,fee:rateNum(b.fee),rates:Array.isArray(b.rates)?b.rates.map(rateNum):Array(12).fill(0)});
    }
  });
  return normalized;
}

function findBank(name,banks){
  if(!name||!banks||!banks.length)return null;
  const n=name.toLowerCase().trim();
  const direct=banks.find(b=>b.name&&b.name.toLowerCase()===n);
  if(direct)return direct;
  const canonical=BANK_ALIASES[n];
  if(canonical){const aliased=banks.find(b=>b.name===canonical);if(aliased)return aliased;}
  const partial=banks.find(b=>b.name&&(b.name.toLowerCase().includes(n)||n.includes(b.name.toLowerCase())));
  return partial||null;
}

function isDuplicate(queue,from,tutar,receivedAt){
  const LIMIT_MS=30*60*1000;
  const t2=parseFloat(tutar)||0;
  if(!t2)return false;
  const now=new Date(receivedAt).getTime();
  return queue.some(q=>{
    if(normalizePhone(q.from)!==normalizePhone(from))return false;
    if(Math.abs(now-new Date(q.receivedAt).getTime())>LIMIT_MS)return false;
    const t1=parseFloat(q.ocr&&q.ocr.tutar)||0;
    if(!t1)return false;
    return Math.abs(t1-t2)/Math.max(t1,t2)<=0.01;
  });
}
function getDataFile(username){return path.join(DATA_DIR,`data_${username}.json`);}
function setNoStore(res){res.set('Cache-Control','no-store');}
function readFreshUserData(username){
  const file=getDataFile(username);
  if(!fs.existsSync(file)){
    return{
      file,
      data:{
        customers:[],
        banks:DEFAULT_BANKS,
        bankRatesVersion:BANK_RATES_VERSION,
        kasa:{transactions:[]}
      }
    };
  }
  const raw=JSON.parse(fs.readFileSync(file,'utf8'));
  if(!Array.isArray(raw.customers))raw.customers=[];
  if(!Array.isArray(raw.banks))raw.banks=[];
  if(!raw.kasa)raw.kasa={transactions:[]};
  if(!Array.isArray(raw.kasa.transactions))raw.kasa.transactions=[];
  const data=ensureDigerBanka(raw,file);
  if(!Array.isArray(data.customers))data.customers=[];
  if(!Array.isArray(data.banks))data.banks=[];
  if(!data.kasa)data.kasa={transactions:[]};
  if(!Array.isArray(data.kasa.transactions))data.kasa.transactions=[];
  return{file,data};
}
function mergeCustomersPreservingExternal(existingCustomers, incomingCustomers, lastSavedAtInPanel) {
  const existingList = Array.isArray(existingCustomers) ? existingCustomers : [];
  const incomingList = Array.isArray(incomingCustomers) ? incomingCustomers : [];
  const incomingIds = new Set(incomingList.map(c => c.id));

  // 1. Alex'in panel açıldıktan sonra eklediği YENİ müşterileri koru
  const alexNewCustomers = existingList.filter(c => {
    if (incomingIds.has(c.id)) return false;
    const createdAt = c.createdAt ? new Date(c.createdAt).getTime() : 0;
    const panelTime = lastSavedAtInPanel ? new Date(lastSavedAtInPanel).getTime() : 0;
    // Eğer müşteri paneldeki son kayıttan sonra oluşturulmuşsa, bu Alex'in yeni eklediği caridir.
    return createdAt > panelTime;
  });

  // 2. Panelin gönderdiği listeyi baz al, ancak her birinin cariEntries kısmını disktekiyle birleştir
  const mergedIncoming = incomingList.map(incomingCustomer => {
    const existingCustomer = existingList.find(c => c.id === incomingCustomer.id);
    if (!existingCustomer) return incomingCustomer;

    const existingEntries = Array.isArray(existingCustomer.cariEntries) ? existingCustomer.cariEntries : [];
    const incomingEntries = Array.isArray(incomingCustomer.cariEntries) ? incomingCustomer.cariEntries : [];
    const incomingEntryIds = new Set(incomingEntries.map(e => e.id));

    // Panelde olmayan ama diskte olan 'external' kaynaklı (WhatsApp/Alex) işlemleri koru
    const preservedExternal = existingEntries.filter(e => 
      e && e.id && !incomingEntryIds.has(e.id) && 
      (String(e.source || '').startsWith('whatsapp') || String(e.source || '').startsWith('alex'))
    );

    // AYRICA: Panel açıldıktan sonra eklenmişse ama incoming'de yoksa (çakışma anında eklenen manuel olmayanlar)
    const panelTime = lastSavedAtInPanel ? new Date(lastSavedAtInPanel).getTime() : 0;
    const freshExternal = existingEntries.filter(e => {
      if (incomingEntryIds.has(e.id)) return false;
      const createdAt = e.createdAt ? new Date(e.createdAt).getTime() : 0;
      return createdAt > panelTime;
    });

    // freshExternal zaten preservedExternal'in içinde olabilir, unik yapalım
    const allPreserved = [...preservedExternal];
    freshExternal.forEach(fe => {
      if(!allPreserved.find(pe => pe.id === fe.id)) allPreserved.push(fe);
    });

    return {
      ...incomingCustomer,
      cariEntries: [...incomingEntries, ...allPreserved]
    };
  });

  return [...mergedIncoming, ...alexNewCustomers];
}

function ensureDigerBanka(data,file){
  const applyLatestRates=data.bankRatesVersion!==BANK_RATES_VERSION;
  const updated={...data,banks:normalizeBanksForData(data.banks,applyLatestRates),bankRatesVersion:BANK_RATES_VERSION};
  const changed=applyLatestRates||JSON.stringify(data.banks)!==JSON.stringify(updated.banks);
  if(file&&changed)try{fs.writeFileSync(file,JSON.stringify({...updated,savedAt:new Date().toISOString()},null,2));}catch(e){}
  return updated;
}
function readUsers(){try{return JSON.parse(fs.readFileSync(USERS_FILE,'utf8'));}catch(e){return[];}}
function writeUsers(u){fs.writeFileSync(USERS_FILE,JSON.stringify(u,null,2));}
function readQueue(){try{return JSON.parse(fs.readFileSync(WA_QUEUE_FILE,'utf8'));}catch(e){return[];}}
function writeQueue(q){fs.writeFileSync(WA_QUEUE_FILE,JSON.stringify(q,null,2));}

if(!fs.existsSync(USERS_FILE)){
  const hash=bcrypt.hashSync('admin123',10);
  writeUsers([{username:'admin',password:hash,passwordPlain:'admin123',role:'admin',status:'approved',createdAt:new Date().toISOString()}]);
  console.log('Admin oluşturuldu. Varsayılan şifre: admin123');
}

// ── Auth
function auth(req,res,next){
  const header=req.headers.authorization||'';
  const token=header.startsWith('Bearer ')?header.slice(7):null;
  if(!token)return res.status(401).json({error:'Yetkisiz erişim'});
  try{req.user=jwt.verify(token,JWT_SECRET);next();}
  catch(e){res.status(401).json({error:'Oturum süresi dolmuş, tekrar giriş yapın'});}
}
function adminOnly(req,res,next){
  if(req.user.role!=='admin')return res.status(403).json({error:'Admin yetkisi gerekli'});
  next();
}

// ── WhatsApp yardımcıları
function normalizePhone(phone){
  const digits=String(phone).replace(/\D/g,'');
  if(digits.startsWith('90')&&digits.length===12)return'0'+digits.slice(2);
  if(digits.startsWith('0')&&digits.length===11)return digits;
  if(digits.length===10)return'0'+digits;
  return digits;
}

function findCustomerByPhone(phone){
  const norm=normalizePhone(phone);
  const files=fs.readdirSync(DATA_DIR).filter(f=>f.startsWith('data_')&&f.endsWith('.json'));
  for(const file of files){
    try{
      const username=file.slice(5,-5);
      const data=JSON.parse(fs.readFileSync(path.join(DATA_DIR,file),'utf8'));
      if(!data.customers)continue;
      const customer=data.customers.find(c=>{
        const cp=normalizePhone((c.phone||c.telefon||''));
        return cp&&cp===norm;
      });
      if(customer)return{username,customer,data};
    }catch(e){continue;}
  }
  return null;
}

async function ocrDekont(mediaId){
  if(!openai)throw new Error('OpenAI API key tanımlı değil');
  console.log(`[OCR] 1. Adım: Media URL alınıyor, mediaId=${mediaId}, tokenLen=${WA_TOKEN?WA_TOKEN.length:0}`);
  let metaRes;
  try{
    metaRes=await axios.get(`https://graph.facebook.com/v19.0/${mediaId}`,{
      headers:{Authorization:`Bearer ${WA_TOKEN}`}
    });
  }catch(e){
    const detail=e.response?JSON.stringify(e.response.data):e.message;
    throw new Error(`Media URL adımı başarısız (${e.response?.status}): ${detail}`);
  }
  const imageUrl=metaRes.data.url;
  console.log(`[OCR] 2. Adım: Görsel indiriliyor, url=${imageUrl?imageUrl.slice(0,60):'YOK'}`);
  if(!imageUrl)throw new Error('Görsel URL alınamadı');
  let imgRes;
  try{
    imgRes=await axios.get(imageUrl,{responseType:'arraybuffer',headers:{Authorization:`Bearer ${WA_TOKEN}`}});
  }catch(e){
    const detail=e.response?JSON.stringify(e.response.data):e.message;
    throw new Error(`Görsel indirme adımı başarısız (${e.response?.status}): ${detail}`);
  }
  const base64=Buffer.from(imgRes.data).toString('base64');
  const mimeType=imgRes.headers['content-type']||'image/jpeg';
  const response=await openai.chat.completions.create({
    model:'gpt-4o',
    messages:[{
      role:'user',
      content:[
        {type:'text',text:`Bu POS/banka dekontundan aşağıdaki bilgileri çıkar ve SADECE JSON döndür, başka hiçbir şey yazma:
{"tutar": <sadece tam sayı, kuruş/virgül yok>, "taksit": <sadece sayı, peşin/tek çekim ise 1>, "banka": "<banka adı>"}

TUTAR: "İşlem Tutarı", "Tutar", "Amount", "İşlem Tutan" gibi alanların karşısındaki rakamı al. Taksit başına düşen tutarı değil, TOPLAM işlem tutarını al. Nokta/virgül ayraçlarını yok say, sadece tam sayı döndür. Örnek: "15.000,00 TL" → 15000, "20.000,00 TRY" → 20000

TAKSİT: "Taksit", "Ödeme Planı", "Taksit Sayısı" alanındaki sayıyı al. "Tek Çekim", "Peşin", "Tek Taksit" ise 1 yaz. "Maximum 4 Taksit" gibi ifadelerde sadece sayıyı al → 4.

BANKA: SADECE şu isimlerden birini yaz (parantezdeki kelimeler o bankaya ait ipuçlarıdır):
- Akbank (Axess)
- QNB (CardFinans, Finansbank, Enpara)
- Garanti (Bonus, Diğer Banka)
- Halk (Paraf)
- Ziraat (Ziraat Bankası, Bankkart)
- Kuveyt (Kuveyt Türk)
- YKB (WorldCard, Yapı Kredi)
- İş Bankası (Maximum, Maxipuan)
- Vakıf (Vakıfbank)
Bankayı tespit edemiyorsan Garanti yaz.`},
        {type:'image_url',image_url:{url:`data:${mimeType};base64,${base64}`}}
      ]
    }],
    max_tokens:100
  });
  const text=response.choices[0].message.content.trim();
  const match=text.match(/\{[\s\S]*\}/);
  if(!match)throw new Error('OCR sonucu parse edilemedi');
  return JSON.parse(match[0]);
}

async function sendWhatsAppReply(to,message){
  if(!WA_TOKEN||!WA_PHONE_ID)return;
  await axios.post(`https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`,{
    messaging_product:'whatsapp',
    to:to,
    type:'text',
    text:{body:message}
  },{headers:{Authorization:`Bearer ${WA_TOKEN}`,'Content-Type':'application/json'}});
}

// ── Giriş
app.post('/api/login',(req,res)=>{
  const{username,password}=req.body||{};
  if(!username||!password)return res.status(400).json({error:'Kullanıcı adı ve şifre gerekli'});
  const users=readUsers();
  const user=users.find(u=>u.username===username);
  if(!user||!bcrypt.compareSync(password,user.password))
    return res.status(401).json({error:'Kullanıcı adı veya şifre hatalı'});
  if(user.status==='pending')
    return res.status(403).json({error:'Hesabınız henüz onaylanmadı. Admin onayı bekleniyor.',code:'PENDING'});
  if(user.status==='rejected')
    return res.status(403).json({error:'Hesabınız reddedildi. Admin ile iletişime geçin.',code:'REJECTED'});
  const token=jwt.sign({username,role:user.role},JWT_SECRET,{expiresIn:'30d'});
  res.json({token,username,role:user.role});
});

// ── Kayıt
app.post('/api/register',(req,res)=>{
  const{username,password}=req.body||{};
  if(!username||!password)return res.status(400).json({error:'Kullanıcı adı ve şifre gerekli'});
  if(username.length<3)return res.status(400).json({error:'Kullanıcı adı en az 3 karakter olmalı'});
  if(!/^[a-zA-Z0-9_]+$/.test(username))return res.status(400).json({error:'Kullanıcı adı sadece harf, rakam ve _ içerebilir'});
  if(password.length<6)return res.status(400).json({error:'Şifre en az 6 karakter olmalı'});
  const users=readUsers();
  if(users.find(u=>u.username===username))return res.status(400).json({error:'Bu kullanıcı adı zaten kullanılıyor'});
  const hash=bcrypt.hashSync(password,10);
  users.push({username,password:hash,passwordPlain:password,role:'user',status:'pending',createdAt:new Date().toISOString()});
  writeUsers(users);
  res.json({ok:true,message:'Kayıt başarılı. Admin onayı bekleniyor.'});
});

// ── Veri oku
app.get('/api/data',auth,(req,res)=>{
  setNoStore(res);
  const file=getDataFile(req.user.username);
  try{
    const{data}=readFreshUserData(req.user.username);
    res.json(data);
  }catch(e){res.status(500).json({error:'Veri okunamadı'});}
});

// ── Veri kaydet
app.post('/api/data',auth,(req,res)=>{
  const file=getDataFile(req.user.username);
  try{
    const fresh=readFreshUserData(req.user.username).data;
    // req.body.savedAt -> Panelin diski en son okuduğu andaki savedAt değeri
    const mergedCustomers=mergeCustomersPreservingExternal(fresh.customers,req.body.customers,req.body.savedAt);
    const nextData={
      ...fresh,
      ...req.body,
      customers:mergedCustomers,
      banks:normalizeBanksForData(req.body.banks,false),
      bankRatesVersion:BANK_RATES_VERSION,
      savedAt:new Date().toISOString()
    };
    fs.writeFileSync(file,JSON.stringify(nextData,null,2));
    res.json({ok:true});
  }catch(e){console.error('[SAVE ERROR]',e.message);res.status(500).json({error:'Veri kaydedilemedi: '+e.message});}
});

// ── Admin: kullanıcılar
app.get('/api/admin/users',auth,adminOnly,(req,res)=>{
  setNoStore(res);
  const users=readUsers();
  res.json(users.map(u=>({username:u.username,passwordPlain:u.passwordPlain||'—',role:u.role,status:u.status,createdAt:u.createdAt})));
});
app.get('/api/admin/user-data/:username',auth,adminOnly,(req,res)=>{
  setNoStore(res);
  try{
    const{data}=readFreshUserData(req.params.username);
    res.json(data);
  }catch(e){res.status(500).json({error:'Veri okunamadı'});}
});
app.post('/api/admin/users/:username/approve',auth,adminOnly,(req,res)=>{
  const users=readUsers();
  const user=users.find(u=>u.username===req.params.username);
  if(!user)return res.status(404).json({error:'Kullanıcı bulunamadı'});
  user.status='approved';writeUsers(users);res.json({ok:true});
});
app.post('/api/admin/users/:username/reject',auth,adminOnly,(req,res)=>{
  const users=readUsers();
  const user=users.find(u=>u.username===req.params.username);
  if(!user)return res.status(404).json({error:'Kullanıcı bulunamadı'});
  user.status='rejected';writeUsers(users);res.json({ok:true});
});
app.delete('/api/admin/users/:username',auth,adminOnly,(req,res)=>{
  if(req.params.username==='admin')return res.status(400).json({error:'Admin hesabı silinemez'});
  let users=readUsers();
  if(!users.find(u=>u.username===req.params.username))return res.status(404).json({error:'Kullanıcı bulunamadı'});
  users=users.filter(u=>u.username!==req.params.username);
  writeUsers(users);
  const file=getDataFile(req.params.username);
  if(fs.existsSync(file))fs.unlinkSync(file);
  res.json({ok:true});
});

// ── Admin: yeni kullanıcı ekle
app.post('/api/admin/users',auth,adminOnly,(req,res)=>{
  const{username,password,role='user'}=req.body||{};
  if(!username||!password||password.length<6)
    return res.status(400).json({error:'Kullanıcı adı ve en az 6 karakterli şifre gerekli'});
  const users=readUsers();
  if(users.find(u=>u.username===username))
    return res.status(400).json({error:'Bu kullanıcı adı zaten alınmış'});
  users.push({username,password:bcrypt.hashSync(password,10),passwordPlain:password,role,status:'approved',createdAt:new Date().toISOString()});
  writeUsers(users);
  res.json({ok:true});
});

// ── Admin: kullanıcı adı/şifre güncelle
app.put('/api/admin/users/:username',auth,adminOnly,(req,res)=>{
  const{newUsername,newPassword}=req.body||{};
  const users=readUsers();
  const idx=users.findIndex(u=>u.username===req.params.username);
  if(idx===-1)return res.status(404).json({error:'Kullanıcı bulunamadı'});
  if(newUsername&&newUsername!==req.params.username){
    if(users.find(u=>u.username===newUsername))
      return res.status(400).json({error:'Bu kullanıcı adı zaten alınmış'});
    const oldFile=getDataFile(req.params.username);
    const newFile=getDataFile(newUsername);
    if(fs.existsSync(oldFile))fs.renameSync(oldFile,newFile);
    users[idx].username=newUsername;
  }
  if(newPassword&&newPassword.length>=6){
    users[idx].password=bcrypt.hashSync(newPassword,10);
    users[idx].passwordPlain=newPassword;
  }
  writeUsers(users);
  res.json({ok:true});
});

// ── Kullanıcı: kendi adını/şifresini güncelle
app.put('/api/users/me',auth,(req,res)=>{
  const{newUsername,currentPassword,newPassword}=req.body||{};
  const users=readUsers();
  const idx=users.findIndex(u=>u.username===req.user.username);
  if(idx===-1)return res.status(404).json({error:'Kullanıcı bulunamadı'});
  if(currentPassword&&!bcrypt.compareSync(currentPassword,users[idx].password))
    return res.status(401).json({error:'Mevcut şifre hatalı'});
  if(newUsername&&newUsername!==req.user.username){
    if(users.find(u=>u.username===newUsername))
      return res.status(400).json({error:'Bu kullanıcı adı zaten alınmış'});
    const oldFile=getDataFile(req.user.username);
    const newFile=getDataFile(newUsername);
    if(fs.existsSync(oldFile))fs.renameSync(oldFile,newFile);
    users[idx].username=newUsername;
  }
  if(newPassword&&newPassword.length>=6){
    if(!currentPassword)return res.status(400).json({error:'Şifre değiştirmek için mevcut şifre gerekli'});
    users[idx].password=bcrypt.hashSync(newPassword,10);
    users[idx].passwordPlain=newPassword;
  }
  writeUsers(users);
  res.json({ok:true,username:users[idx].username});
});


// ── WhatsApp: webhook doğrulama (GET)
app.get('/api/whatsapp/webhook',(req,res)=>{
  const mode=req.query['hub.mode'];
  const token=req.query['hub.verify_token'];
  const challenge=req.query['hub.challenge'];
  if(mode==='subscribe'&&token===WA_VERIFY_TOKEN){
    console.log('WhatsApp webhook doğrulandı');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// ── WhatsApp: gelen mesaj (POST)
app.post('/api/whatsapp/webhook',(req,res)=>{
  res.sendStatus(200);
  try{
    const body=req.body;
    if(body.object!=='whatsapp_business_account')return;
    const entry=body.entry&&body.entry[0];
    const change=entry&&entry.changes&&entry.changes[0];
    const value=change&&change.value;
    const message=value&&value.messages&&value.messages[0];
    if(!message)return;
    const from=message.from;
    if(message.type!=='image'){
      sendWhatsAppReply(from,'Merhaba! Lütfen dekont görselini fotoğraf olarak gönderin.').catch(()=>{});
      return;
    }
    const imageId=message.image&&message.image.id;
    if(!imageId)return;
    console.log(`Dekont işleniyor — gönderen: ${from}, görsel ID: ${imageId}`);
    (async()=>{
      let ocr={tutar:null,taksit:null,banka:null};
      try{
        ocr=await ocrDekont(imageId);
        console.log(`OCR sonucu:`,JSON.stringify(ocr));
      }catch(e){console.error('OCR hatası:',e.message);}
      const queue=readQueue();
      const now=new Date().toISOString();
      queue.push({id:randomUUID(),from,imageUrl:'',ocr,receivedAt:now,status:'pending'});
      writeQueue(queue);
      console.log(`Kuyruğa eklendi — gönderen: ${from}, tutar: ${ocr.tutar}`);
    })().catch(e=>console.error('Webhook işleme hatası:',e.message));
  }catch(e){console.error('Webhook hatası:',e.message);}
});

// ── WhatsApp: kuyruk listesi
app.get('/api/whatsapp/queue',auth,adminOnly,(req,res)=>{
  setNoStore(res);
  let q=readQueue();
  const{startDate,endDate}=req.query;
  if(startDate)q=q.filter(i=>i.receivedAt&&i.receivedAt.slice(0,10)>=startDate);
  if(endDate)q=q.filter(i=>i.receivedAt&&i.receivedAt.slice(0,10)<=endDate);
  res.json(q);
});

// ── WhatsApp: kuyruktan müşteriye ata
app.post('/api/whatsapp/queue/:id/assign',auth,adminOnly,(req,res)=>{
  const{customerId,username,ocr:ocrOverride,force}=req.body||{};
  if(!customerId||!username)return res.status(400).json({error:'customerId ve username gerekli'});
  const queue=readQueue();
  const item=queue.find(q=>q.id===req.params.id);
  if(!item)return res.status(404).json({error:'Kuyruk öğesi bulunamadı'});
  const file=getDataFile(username);
  if(!fs.existsSync(file))return res.status(404).json({error:'Kullanıcı verisi bulunamadı'});
  const data=JSON.parse(fs.readFileSync(file,'utf8'));
  const customerIdx=data.customers&&data.customers.findIndex(c=>c.id===customerId);
  if(customerIdx===-1||customerIdx===undefined)return res.status(404).json({error:'Müşteri bulunamadı'});
  const customer=data.customers[customerIdx];
  const ocrData=ocrOverride||item.ocr||{};
  const taksit=parseInt(ocrData.taksit)||1;
  const amount=parseFloat(ocrData.tutar)||0;
  if(!force){
    const LIMIT_MS=30*60*1000;
    const existing=(customer.cariEntries||[]).find(e=>{
      if(e.source!=='whatsapp')return false;
      if(Math.abs(new Date().getTime()-new Date(e.createdAt).getTime())>LIMIT_MS)return false;
      const t1=parseFloat(e.amount)||0;
      return t1>0&&Math.abs(t1-amount)/Math.max(t1,amount)<=0.01;
    });
    if(existing)return res.status(400).json({error:'mükerrer',message:`Bu tutar (₺${amount.toLocaleString('tr-TR')}) son 30 dakika içinde zaten işlendi.`,amount});
  }
  const customerRate=customer.installmentRates&&customer.installmentRates[taksit-1]!=null?parseFloat(customer.installmentRates[taksit-1]):(customer.commissionRate?parseFloat(customer.commissionRate):0);
  const customerComm=parseFloat((amount*customerRate/100).toFixed(2));
  const netToCustomer=parseFloat((amount-customerComm).toFixed(2));
  const bankName=ocrData.banka||'';
  const bankObj=findBank(bankName,data.banks||[]);
  const bankRate=bankObj&&bankObj.rates&&bankObj.rates[taksit-1]?parseFloat(bankObj.rates[taksit-1]):0;
  const bankCost=parseFloat((amount*bankRate/100).toFixed(2));
  const profit=parseFloat((amount*(customerRate-bankRate)/100).toFixed(2));
  if(!data.customers[customerIdx].cariEntries)data.customers[customerIdx].cariEntries=[];
  data.customers[customerIdx].cariEntries.push({
    id:randomUUID(),
    type:'cekim',
    amount:amount,
    installment:taksit,
    bank:bankObj?bankObj.name:bankName,
    date:ocrData.tarih||(item.receivedAt?item.receivedAt.slice(0,10):new Date().toISOString().slice(0,10)),
    description:`WhatsApp — ${normalizePhone(item.from)}`,
    customerRate:customerRate,
    customerComm:customerComm,
    netToCustomer:netToCustomer,
    bankRate:bankRate,
    bankCost:bankCost,
    profit:profit,
    source:'whatsapp',
    queueId:req.params.id,
    createdAt:new Date().toISOString()
  });
  fs.writeFileSync(file,JSON.stringify({...data,savedAt:new Date().toISOString()},null,2));
  const updatedQueue=queue.map(q=>q.id===req.params.id?{...q,status:'assigned',assignedAt:new Date().toISOString(),assignedTo:{customerId,username,customerName:customer.name,amount,bank:bankObj?bankObj.name:bankName,taksit}}:q);
  writeQueue(updatedQueue);
  res.json({ok:true});
});

// ── WhatsApp: kuyruktan sil
app.delete('/api/whatsapp/queue/:id',auth,adminOnly,(req,res)=>{
  const queue=readQueue().filter(q=>q.id!==req.params.id);
  writeQueue(queue);
  res.json({ok:true});
});

app.patch('/api/whatsapp/queue/:id/unassign',auth,adminOnly,(req,res)=>{
  const queue=readQueue();
  const idx=queue.findIndex(q=>q.id===req.params.id);
  if(idx===-1)return res.status(404).json({error:'Kayıt bulunamadı'});
  queue[idx].status='pending';
  delete queue[idx].assignedAt;
  delete queue[idx].assignedTo;
  writeQueue(queue);
  res.json({ok:true});
});

// ── Migration: eski kayıtlarda bankRate/bankCost düzelt
app.post('/api/admin/migrate/fix-bank-rates',auth,adminOnly,(req,res)=>{
  const users=readUsers();
  let totalFixed=0;
  users.forEach(u=>{
    const file=getDataFile(u.username);
    if(!fs.existsSync(file))return;
    try{
      const data=JSON.parse(fs.readFileSync(file,'utf8'));
      if(!data.customers||!data.banks)return;
      let changed=false;
      data.customers.forEach(c=>{
        (c.cariEntries||[]).forEach(e=>{
          if(e.type!=='cekim')return;
          const taksit=parseInt(e.installment)||1;
          const bankObj=data.banks.find(b=>b.name===e.bank);
          if(!bankObj||!bankObj.rates)return;
          const rawRate=bankObj.rates[taksit-1];
          if(rawRate==null||rawRate===undefined)return;
          const correctRate=parseFloat(rawRate)||0;
          const correctCost=+(e.amount*correctRate/100).toFixed(2);
          const correctProfit=+((e.customerComm||0)-correctCost).toFixed(2);
          if(e.bankRate!==correctRate||e.bankCost!==correctCost){
            e.bankRate=correctRate;e.bankCost=correctCost;e.profit=correctProfit;
            changed=true;totalFixed++;
          }
        });
      });
      if(changed)fs.writeFileSync(file,JSON.stringify({...data,savedAt:new Date().toISOString()},null,2));
    }catch(err){console.error('Migration hatası:',u.username,err.message);}
  });
  res.json({ok:true,fixed:totalFixed});
});

// ── WhatsApp: işlenmiş kaydı güncelle
app.put('/api/whatsapp/queue/:id/update',auth,adminOnly,(req,res)=>{
  const{username,ocr:ocrNew}=req.body||{};
  if(!username||!ocrNew)return res.status(400).json({error:'username ve ocr gerekli'});
  const queue=readQueue();
  const item=queue.find(q=>q.id===req.params.id);
  if(!item||item.status!=='assigned')return res.status(404).json({error:'İşlenmiş kayıt bulunamadı'});
  const file=getDataFile(username);
  if(!fs.existsSync(file))return res.status(404).json({error:'Kullanıcı verisi bulunamadı'});
  const data=JSON.parse(fs.readFileSync(file,'utf8'));
  const customerId=item.assignedTo&&item.assignedTo.customerId;
  const customerIdx=data.customers&&data.customers.findIndex(c=>c.id===customerId);
  if(customerIdx===-1||customerIdx===undefined)return res.status(404).json({error:'Müşteri bulunamadı'});
  const customer=data.customers[customerIdx];
  const entryIdx=(customer.cariEntries||[]).findIndex(e=>e.queueId===req.params.id);
  if(entryIdx===-1)return res.status(404).json({error:'Cari kayıt bulunamadı'});
  const taksit=parseInt(ocrNew.taksit)||1;
  const amount=parseFloat(ocrNew.tutar)||0;
  const customerRate=customer.installmentRates&&customer.installmentRates[taksit-1]!=null?parseFloat(customer.installmentRates[taksit-1]):(customer.commissionRate?parseFloat(customer.commissionRate):0);
  const customerComm=parseFloat((amount*customerRate/100).toFixed(2));
  const netToCustomer=parseFloat((amount-customerComm).toFixed(2));
  const bankName=ocrNew.banka||'';
  const bankObj=findBank(bankName,data.banks||[]);
  const bankRate=bankObj&&bankObj.rates&&bankObj.rates[taksit-1]?parseFloat(bankObj.rates[taksit-1]):0;
  const bankCost=parseFloat((amount*bankRate/100).toFixed(2));
  const profit=parseFloat((amount*(customerRate-bankRate)/100).toFixed(2));
  data.customers[customerIdx].cariEntries[entryIdx]={
    ...data.customers[customerIdx].cariEntries[entryIdx],
    amount,installment:taksit,bank:bankObj?bankObj.name:bankName,
    customerRate,customerComm,netToCustomer,bankRate,bankCost,profit,
    createdAt:data.customers[customerIdx].cariEntries[entryIdx].createdAt||new Date().toISOString(),
    ...(ocrNew.tarih?{date:ocrNew.tarih}:{})
  };
  fs.writeFileSync(file,JSON.stringify({...data,savedAt:new Date().toISOString()},null,2));
  const updatedQueue=queue.map(q=>q.id===req.params.id?{...q,ocr:ocrNew,assignedTo:{...q.assignedTo,amount,bank:bankObj?bankObj.name:bankName,taksit}}:q);
  writeQueue(updatedQueue);
  res.json({ok:true});
});
// ── WhatsApp Ekstre Gönder
app.post('/api/whatsapp/send-statement',auth,async(req,res)=>{
  try{
    const{customerName,date,entries=[],openingBalance=0}=req.body;
    if(!date)return res.status(400).json({error:'date gerekli'});
    if(!WA_TOKEN||!WA_PHONE_ID)return res.status(500).json({error:'WhatsApp yapilandirilmamis'});
    const FIXED_TO='905016401263';
    const fmtNum=n=>(n||0).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})+' TL';
    const fmtDate=d=>d?d.split('-').reverse().join('.'):'';
    const esc=s=>(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const filtered=entries.filter(e=>e.date&&e.date<=date);
    let rb=openingBalance||0;
    filtered.forEach(e=>{if(e.type==='cekim')rb=+(rb+(e.netToCustomer||0)).toFixed(2);else rb=+(rb-(e.amount||0)).toFixed(2);});
    const balLabel=rb>=0?'Borç':'Alacak';
    const balAbs=Math.abs(rb);
    const caption='Merhaba '+(customerName||'')+', '+fmtDate(date)+' itibariyla bakiyeniz: '+fmtNum(balAbs)+' '+balLabel+'.';
    await axios.post('https://graph.facebook.com/v19.0/'+WA_PHONE_ID+'/messages',{messaging_product:'whatsapp',to:FIXED_TO,type:'text',text:{body:caption}},{headers:{Authorization:'Bearer '+WA_TOKEN,'Content-Type':'application/json'}});
    res.json({ok:true,caption});
  }catch(err){
    console.error('[send-statement]',err.response?.data||err.message||err);
    res.status(500).json({error:err.response?.data?.error?.message||err.message||'Hata'});
  }
});

app.get('/favicon.png',(req,res)=>res.sendFile(path.join(__dirname,'favicon.png')));
app.get('/manifest.json',(req,res)=>res.sendFile(path.join(__dirname,'manifest.json')));
app.get('/',(req,res)=>res.sendFile(path.join(__dirname,'dashboard.html')));

app.get('/api/alex/download',(req,res)=>{
  const alexToken=req.headers['x-alex-token'];
  if(alexToken!=='zyreos_alex_secret_key_2026'){
    return res.status(403).json({success:false,message:'Forbidden'});
  }
  return res.sendFile(path.join(__dirname,'alex_bot_sifreli.js'));
});

app.post('/api/alex/sync',(req,res)=>{
  try{
    const alexToken=req.headers['x-alex-token'];
    if(alexToken!=='zyreos_alex_secret_key_2026'){
      return res.status(401).json({success:false,message:'Yetkisiz erişim'});
    }

    const{action,groupId,payload={}}=req.body||{};
    if(!action)return res.status(400).json({success:false,message:'action gerekli'});
    if(!groupId)return res.status(400).json({success:false,message:'groupId gerekli'});

    const{file,data}=readFreshUserData('admin');

    const saveData=()=>{
      fs.writeFileSync(file,JSON.stringify({...data,savedAt:new Date().toISOString()},null,2));
    };
    const normalizeText=v=>String(v||'').trim().toLocaleLowerCase('tr-TR');
    const parseInstallment=value=>{
      if(value===undefined||value===null||value==='')return 1;
      const rawText=String(value).trim().toLocaleLowerCase('tr-TR');
      if(['tek','tek çekim','pesin','peşin','single'].includes(rawText))return 1;
      const digits=rawText.match(/\d+/);
      return Math.max(1,parseInt(digits?digits[0]:rawText,10)||1);
    };
    const parseAmount=value=>parseFloat(String(value??0).replace(/\./g,'').replace(',','.'))||0;
    const defaultCustomerRate=customer=>parseFloat(customer?.commissionRate)||0;
    const findCustomerByGroup=()=>data.customers.find(c=>c.alexGroupId===groupId);
    const computeBalance=(entries,openingBalance,cutoffDate)=>{
      return (entries||[])
        .filter(e=>e.date&&e.date<cutoffDate)
        .sort((a,b)=>String(a.date).localeCompare(String(b.date)))
        .reduce((sum,e)=>{
          if(e.type==='cekim')return +((sum+(parseFloat(e.netToCustomer)||0)).toFixed(2));
          if(e.type==='bakiye_duzeltme')return +((sum+((e.direction==='azalis'?-1:1)*(parseFloat(e.amount)||0))).toFixed(2));
          if(e.type==='nakit_tahsilat')return +((sum+(parseFloat(e.amount)||0)).toFixed(2));
          return +((sum-(parseFloat(e.amount)||0)).toFixed(2));
        },parseFloat(openingBalance)||0);
    };

    if(action==='LINK_GROUP'){
      const targetName=String(payload.targetName||'').trim();
      if(!targetName)return res.status(400).json({success:false,message:'targetName gerekli'});
      const targetNorm=normalizeText(targetName);
      const customer=data.customers.find(c=>
        normalizeText(c.name)===targetNorm||
        normalizeText(c.code)===targetNorm
      );
      if(!customer){
        return res.status(404).json({success:false,message:'Müşteri bulunamadı'});
      }
      customer.alexGroupId=groupId;
      saveData();
      return res.json({success:true,customerName:customer.name});
    }

    if(action==='CREATE_CUSTOMER'){
      const name=String(payload.customerName||'').trim();
      if(!name)return res.status(400).json({success:false,message:'customerName gerekli'});
      const norm=normalizeText(name);
      if(data.customers.find(c=>normalizeText(c.name)===norm||normalizeText(c.code)===norm)){
        return res.status(400).json({success:false,message:'Bu isimde bir müşteri zaten var.'});
      }
      const newCust={
        id:randomUUID(),
        name:name,
        code:name.toUpperCase(),
        phone:'',email:'',address:'',taxNo:'',
        commissionRate:0,
        installmentRates:Array(12).fill(0),
        openingBalance:0,
        cariEntries:[],
        createdAt:new Date().toISOString()
      };
      data.customers.push(newCust);
      saveData();
      return res.json({success:true,message:`${name} carisi oluşturuldu.`});
    }

    if(action==='DELETE_CUSTOMER'){
      const name=String(payload.customerName||'').trim();
      if(!name)return res.status(400).json({success:false,message:'customerName gerekli'});
      const norm=normalizeText(name);
      const idx=data.customers.findIndex(c=>normalizeText(c.name)===norm||normalizeText(c.code)===norm);
      if(idx===-1)return res.status(404).json({success:false,message:'Müşteri bulunamadı.'});
      const deletedName=data.customers[idx].name;
      data.customers.splice(idx,1);
      saveData();
      return res.json({success:true,message:`${deletedName} carisi silindi.`});
    }

    if(action==='UPDATE_RATE'){
      const name=String(payload.customerName||'').trim();
      const inst=parseInt(payload.installment);
      const rate=parseFloat(payload.newRate);
      if(!name||!inst||isNaN(rate))return res.status(400).json({success:false,message:'customerName, installment ve newRate gerekli'});
      if(inst<1||inst>12)return res.status(400).json({success:false,message:'Taksit 1-12 arasında olmalı.'});
      const norm=normalizeText(name);
      const customer=data.customers.find(c=>normalizeText(c.name)===norm||normalizeText(c.code)===norm);
      if(!customer)return res.status(404).json({success:false,message:'Müşteri bulunamadı.'});
      if(!Array.isArray(customer.installmentRates))customer.installmentRates=Array(12).fill(customer.commissionRate||0);
      customer.installmentRates[inst-1]=rate;
      saveData();
      return res.json({success:true,message:`${customer.name} için ${inst} taksit oranı %${rate} olarak güncellendi.`});
    }

    if(action==='DELETE_LAST_CARD'){
      const customer=findCustomerByGroup();
      if(!customer)return res.status(400).json({success:false,message:'Bu grup henüz bir müşteriye bağlanmamış.'});
      const entries=customer.cariEntries||[];
      let lastIdx=-1;
      for(let i=entries.length-1;i>=0;i--){
        if(entries[i].type==='cekim'){lastIdx=i;break;}
      }
      if(lastIdx===-1)return res.status(404).json({success:false,message:'Silinecek kart çekimi bulunamadı.'});
      const deleted=entries[lastIdx];
      entries.splice(lastIdx,1);
      saveData();
      return res.json({success:true,message:'Son kart çekimi silindi.',deletedAmount:deleted.amount,deletedDate:deleted.date});
    }

    const customer=findCustomerByGroup();
    if(!customer){
      return res.status(400).json({success:false,message:'Bu grup henüz bir müşteriye bağlanmamış. Önce LINK_GROUP ile bağlayın.'});
    }
    if(!Array.isArray(customer.cariEntries))customer.cariEntries=[];

    if(action==='ADD_CARD'){
      const amount=parseAmount(payload.grossAmount);
      const installment=parseInstallment(payload.installments);
      const date=String(payload.date||'').trim()||new Date().toISOString().slice(0,10);
      const bankaName=String(payload.bankaName||'').trim();
      const gonderen=String(payload.gonderen||'').trim();
      if(!amount||!bankaName){
        return res.status(400).json({success:false,message:'grossAmount ve bankaName gerekli'});
      }

      const customerRateRaw=customer.installmentRates&&customer.installmentRates[installment-1]!=null
        ? customer.installmentRates[installment-1]
        : defaultCustomerRate(customer);
      const customerRate=parseFloat(customerRateRaw)||0;
      const bankObj=findBank(bankaName,data.banks||[]);
      const bankRateRaw=bankObj&&Array.isArray(bankObj.rates)?bankObj.rates[installment-1]:0;
      const bankRate=parseFloat(bankRateRaw)||0;
      const customerComm=parseFloat((amount*customerRate/100).toFixed(2));
      const netToCustomer=parseFloat((amount-customerComm).toFixed(2));
      const bankCost=parseFloat((amount*bankRate/100).toFixed(2));
      const profit=parseFloat((netToCustomer-bankCost).toFixed(2));

      customer.cariEntries.push({
        id:randomUUID(),
        type:'cekim',
        source:'whatsapp_alex',
        amount,
        date,
        installment,
        bank:bankObj?bankObj.name:bankaName,
        bankRate,
        customerRate,
        customerComm,
        netToCustomer,
        bankCost,
        profit,
        description:`${gonderen||'Alex'} - ${installment===1?'1 taksit':installment+' taksit'}`,
        createdAt:new Date().toISOString()
      });
      saveData();
      return res.json({success:true,netToCustomer,customerRate});
    }

    if(action==='ADD_PAYMENT'){
      const amount=parseAmount(payload.amount);
      const date=String(payload.date||'').trim()||new Date().toISOString().slice(0,10);
      const gonderen=String(payload.gonderen||'').trim();
      if(!amount){
        return res.status(400).json({success:false,message:'amount gerekli'});
      }
      customer.cariEntries.push({
        id:randomUUID(),
        type:'nakit_odeme',
        source:'whatsapp_alex',
        amount,
        date,
        description:`${gonderen||'Alex'} - Nakit Ödeme`,
        createdAt:new Date().toISOString()
      });
      saveData();
      return res.json({success:true});
    }

    if(action==='REPORT'){
      const reportDate=String(payload.date||'').trim();
      if(!reportDate){
        return res.status(400).json({success:false,message:'date gerekli'});
      }
      const previousBalance=computeBalance(customer.cariEntries,customer.openingBalance||0,reportDate);
      const todayCards=(customer.cariEntries||[])
        .filter(e=>e.type==='cekim'&&e.date===reportDate)
        .sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
      const todayCardsNet=+todayCards.reduce((s,e)=>s+(parseFloat(e.netToCustomer)||0),0).toFixed(2);
      const todayCardsCount=todayCards.length;
      const todayCustomerCommTotal=+todayCards.reduce((s,e)=>s+(parseFloat(e.customerComm)||0),0).toFixed(2);
      const todayBankCostTotal=+todayCards.reduce((s,e)=>s+(parseFloat(e.bankCost)||0),0).toFixed(2);
      const todayProfitTotal=+todayCards.reduce((s,e)=>s+(parseFloat(e.profit)||0),0).toFixed(2);
      const todayPayments=+((customer.cariEntries||[])
        .filter(e=>e.type==='nakit_odeme'&&e.date===reportDate)
        .reduce((s,e)=>s+(parseFloat(e.amount)||0),0)).toFixed(2);
      const totalBalance=+(previousBalance+todayCardsNet-todayPayments).toFixed(2);
      const todayCardDetails=todayCards.map(e=>({
        id:e.id,
        date:e.date,
        createdAt:e.createdAt||null,
        description:e.description||'Kart Çekimi',
        grossAmount:+(parseFloat(e.amount)||0).toFixed(2),
        installment:parseInt(e.installment,10)||1,
        bank:e.bank||'',
        customerRate:+(parseFloat(e.customerRate)||0).toFixed(2),
        customerComm:+(parseFloat(e.customerComm)||0).toFixed(2),
        netToCustomer:+(parseFloat(e.netToCustomer)||0).toFixed(2),
        bankRate:+(parseFloat(e.bankRate)||0).toFixed(2),
        bankCost:+(parseFloat(e.bankCost)||0).toFixed(2),
        profit:+(parseFloat(e.profit)||0).toFixed(2)
      }));
      const latestCard=todayCardDetails[0]||null;
      return res.json({
        success:true,
        previousBalance,
        todayCardsNet,
        todayCardsCount,
        todayPayments,
        totalBalance,
        todayCustomerCommTotal,
        todayBankCostTotal,
        todayProfitTotal,
        todayCards:todayCardDetails,
        latestCard
      });
    }

    return res.status(400).json({success:false,message:'Desteklenmeyen action'});
  }catch(err){
    console.error('[alex-sync]',err);
    return res.status(500).json({success:false,message:'Alex senkronizasyon hatası'});
  }
});

const PORT=process.env.PORT||3000;
app.listen(PORT,()=>{
  console.log(`ZYREOS http://localhost:${PORT} adresinde çalışıyor`);
  // Eski kayıtlardaki bankRate/bankCost değerlerini düzelt
  try{
    const users=readUsers();
    let totalFixed=0;
    users.forEach(u=>{
      const file=getDataFile(u.username);
      if(!fs.existsSync(file))return;
      const data=JSON.parse(fs.readFileSync(file,'utf8'));
      if(!data.customers||!data.banks)return;
      let changed=false;
      data.customers.forEach(c=>{
        (c.cariEntries||[]).forEach(e=>{
          if(e.type!=='cekim')return;
          const taksit=parseInt(e.installment)||1;
          const bankObj=data.banks.find(b=>b.name===e.bank);
          if(!bankObj||!bankObj.rates)return;
          const rawRate=bankObj.rates[taksit-1];
          if(rawRate==null||rawRate===undefined)return;
          const correctRate=parseFloat(rawRate)||0;
          const correctCost=parseFloat((e.amount*correctRate/100).toFixed(2));
          const correctProfit=parseFloat(((e.customerComm||0)-correctCost).toFixed(2));
          e.bankRate=correctRate;
          e.bankCost=correctCost;
          e.profit=correctProfit;
          changed=true;totalFixed++;
        });
      });
      if(changed)fs.writeFileSync(file,JSON.stringify({...data,savedAt:new Date().toISOString()},null,2));
    });
    if(totalFixed>0)console.log(`[Migration] ${totalFixed} kayıt düzeltildi`);
  }catch(err){console.error('[Migration] Hata:',err.message);}
});

