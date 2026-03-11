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

function ensureDigerBanka(data,file){
  if(!data.banks||!Array.isArray(data.banks))return data;
  if(data.banks.find(b=>b.name==='Diğer Banka'))return data;
  const garanti=data.banks.find(b=>b.name==='Garanti');
  const defaultRates=garanti?[...garanti.rates]:Array(12).fill(0);
  const defaultFee=garanti?garanti.fee:0;
  const newBank={id:'diger-banka',name:'Diğer Banka',color:'#94a3b8',rates:defaultRates,fee:defaultFee};
  const updated={...data,banks:[...data.banks,newBank]};
  if(file)try{fs.writeFileSync(file,JSON.stringify({...updated,savedAt:new Date().toISOString()},null,2));}catch(e){}
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
  res.set('Cache-Control','no-store');
  const file=getDataFile(req.user.username);
  try{
    if(!fs.existsSync(file))return res.json({customers:[],banks:[]});
    const data=ensureDigerBanka(JSON.parse(fs.readFileSync(file,'utf8')),file);
    res.json(data);
  }catch(e){res.status(500).json({error:'Veri okunamadı'});}
});

// ── Veri kaydet
app.post('/api/data',auth,(req,res)=>{
  const file=getDataFile(req.user.username);
  try{
    fs.writeFileSync(file,JSON.stringify({...req.body,savedAt:new Date().toISOString()},null,2));
    res.json({ok:true});
  }catch(e){res.status(500).json({error:'Veri kaydedilemedi'});}
});

// ── Admin: kullanıcılar
app.get('/api/admin/users',auth,adminOnly,(req,res)=>{
  const users=readUsers();
  res.json(users.map(u=>({username:u.username,passwordPlain:u.passwordPlain||'—',role:u.role,status:u.status,createdAt:u.createdAt})));
});
app.get('/api/admin/user-data/:username',auth,adminOnly,(req,res)=>{
  const file=getDataFile(req.params.username);
  try{
    if(!fs.existsSync(file))return res.json({customers:[],banks:[]});
    const data=ensureDigerBanka(JSON.parse(fs.readFileSync(file,'utf8')),file);
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
    // Tüm non-ASCII karakterleri temizle
    const asc=s=>(s||'').replace(/ş/g,'s').replace(/Ş/g,'S').replace(/ı/g,'i').replace(/İ/g,'I').replace(/ğ/g,'g').replace(/Ğ/g,'G').replace(/ü/g,'u').replace(/Ü/g,'U').replace(/ö/g,'o').replace(/Ö/g,'O').replace(/ç/g,'c').replace(/Ç/g,'C').replace(/[^\x00-\x7F]/g,'?');
    const fmtNum=n=>(n||0).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})+' TL';
    const fmtDate=d=>d?d.split('-').reverse().join('.'):'';
    const filtered=entries.filter(e=>e.date&&e.date<=date);
    let rb=openingBalance||0;
    filtered.forEach(e=>{if(e.type==='cekim')rb=+(rb+(e.netToCustomer||0)).toFixed(2);else rb=+(rb-(e.amount||0)).toFixed(2);});
    const balLabel=rb>=0?'Borc':'Alacak';
    const balAbs=Math.abs(rb);
    const cName=asc(customerName||'');
    const fmtDate2=d=>d?d.split('-').reverse().join('.'):'';
    // PDF stream'ini buf ile oluştur — tüm chars ASCII garantili
    const safePDF=s=>s.replace(/[()\\]/g,' ');
    const PW=842,PH=595; // A4 Landscape
    const pageStartY=560;
    const lineH=11;
    // multipage desteği için sayfa listesi
    const pages=[];
    let curLines=[];
    // Header satırları (her sayfada tekrar)
    const hdrLines=[
      {txt:'ZYREOS - Cari Ekstre',sz:13,bold:true},
      {txt:'Musteri: '+cName+'  |  Tarih: '+fmtDate2(date),sz:9},
      {txt:'',sz:9},
      {txt:'Tarih        Aciklama              Banka       Taks  Borc               Odeme              Bakiye',sz:7.5,mono:true},
      {txt:'-'.repeat(100),sz:7,mono:true},
    ];
    const flushPage=()=>{pages.push([...hdrLines,...curLines]);curLines=[];};
    let r2=openingBalance||0;
    filtered.forEach(e=>{
      const ic=e.type==='cekim';
      if(ic)r2=+(r2+(e.netToCustomer||0)).toFixed(2);else r2=+(r2-(e.amount||0)).toFixed(2);
      const desc=asc(e.description||'').slice(0,20).padEnd(20);
      const bnk=asc(ic?(e.bank||''):'').slice(0,11).padEnd(12);
      const taks=(ic?String(e.installment||1):'').padEnd(6);
      const borc=(ic?fmtNum(e.amount):'').padStart(18);
      const odeme=(!ic?fmtNum(e.amount):'').padStart(18);
      const bak=(fmtNum(Math.abs(r2))+(r2>=0?' B':' A')).padStart(17);
      const row=fmtDate(e.date).padEnd(13)+desc+bnk+taks+borc+odeme+bak;
      curLines.push({txt:row,sz:7,mono:true});
      if(curLines.length>=42)flushPage();
    });
    curLines.push({txt:'-'.repeat(100),sz:7});
    curLines.push({txt:'Bakiye: '+fmtNum(balAbs)+' '+balLabel,sz:10,bold:true});
    flushPage();
    // Her sayfa için PDF objesi oluştur — çok sayfalı PDF
    const kids=[];
    const allObjs={};
    let objId=1;
    const addO=(s)=>{const id=objId++;allObjs[id]=s;return id;};
    const catId=addO(''); // catalog placeholder
    const pagesId=addO(''); // pages placeholder
    const fontId=addO('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');
    const fontBId=addO('<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>');
    pages.forEach(lines=>{
      let y=pageStartY;
      let stream='';
      lines.forEach(l=>{
        const sz=l.sz||9;
        const font=l.bold?'F2':'F1';
        stream+='BT /'+font+' '+sz+' Tf 30 '+y+' Td ('+safePDF(l.txt)+') Tj ET\n';
        y-=(sz+3);
      });
      const contId=addO('<< /Length '+stream.length+' >>\nstream\n'+stream+'endstream');
      const pageId=addO('<< /Type /Page /Parent '+pagesId+' 0 R /MediaBox [0 0 '+PW+' '+PH+'] /Contents '+contId+' 0 R /Resources << /Font << /F1 '+fontId+' 0 R /F2 '+fontBId+' 0 R >> >> >>');
      kids.push(pageId);
    });
    allObjs[catId]='<< /Type /Catalog /Pages '+pagesId+' 0 R >>';
    allObjs[pagesId]='<< /Type /Pages /Kids ['+kids.map(k=>k+' 0 R').join(' ')+'] /Count '+kids.length+' >>';
    let pdf='%PDF-1.4\n';
    const offsets={};
    const maxId=objId-1;
    for(let i=1;i<=maxId;i++){offsets[i]=pdf.length;pdf+=i+' 0 obj\n'+allObjs[i]+'\nendobj\n';}
    const xrefOffset=pdf.length;
    pdf+='xref\n0 '+(maxId+1)+'\n0000000000 65535 f \n';
    for(let i=1;i<=maxId;i++)pdf+=(offsets[i].toString().padStart(10,'0'))+' 00000 n \n';
    pdf+='trailer\n<< /Size '+(maxId+1)+' /Root '+catId+' 0 R >>\nstartxref\n'+xrefOffset+'\n%%EOF';
    const pdfBuf=Buffer.from(pdf,'latin1');
    const fd=new global.FormData();
    fd.append('messaging_product','whatsapp');
    fd.append('type','application/pdf');
    fd.append('file',new Blob([pdfBuf],{type:'application/pdf'}),{filename:'ekstre_'+date+'.pdf'});
    const uploadRes=await fetch('https://graph.facebook.com/v19.0/'+WA_PHONE_ID+'/media',{method:'POST',headers:{Authorization:'Bearer '+WA_TOKEN},body:fd});
    if(!uploadRes.ok){const eu=await uploadRes.json();throw new Error(eu?.error?.message||'Media upload failed');}
    const mediaId=(await uploadRes.json()).id;
    const caption='Merhaba '+cName+', '+fmtDate(date)+' itibariyla bakiyeniz: '+fmtNum(balAbs)+' '+balLabel+'.';
    await axios.post('https://graph.facebook.com/v19.0/'+WA_PHONE_ID+'/messages',{messaging_product:'whatsapp',to:FIXED_TO,type:'document',document:{id:mediaId,filename:'ekstre_'+date+'.pdf',caption}},{headers:{Authorization:'Bearer '+WA_TOKEN,'Content-Type':'application/json'}});
    res.json({ok:true,caption});
  }catch(err){
    console.error('[send-statement]',err.response?.data||err.message||err);
    res.status(500).json({error:err.response?.data?.error?.message||err.message||'Hata'});
  }
});

app.get('/favicon.png',(req,res)=>res.sendFile(path.join(__dirname,'favicon.png')));
app.get('/manifest.json',(req,res)=>res.sendFile(path.join(__dirname,'manifest.json')));
app.get('/',(req,res)=>res.sendFile(path.join(__dirname,'dashboard.html')));

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

