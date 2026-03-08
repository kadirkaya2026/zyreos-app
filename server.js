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
    model:'gpt-4o-mini',
    messages:[{
      role:'user',
      content:[
        {type:'text',text:'Bu banka dekontundan şu bilgileri çıkar ve SADECE JSON döndür, başka hiçbir şey yazma: {"tutar": <sadece sayı, kuruş yok>, "taksit": <sadece sayı, peşin ise 1>, "banka": "<banka adı>"}. Banka adı SADECE şunlardan biri olmalı (parantezdeki kart/takma adlara dikkat et): Akbank (Axess), QNB (CardFinans, Finansbank, Enpara), Garanti (Bonus), Halk (Paraf), Ziraat (Ziraat Bankası, Bankkart), Kuveyt (Kuveyt Türk), YKB (WorldCard, Yapı Kredi), İş Bankası (Maximum, Maxipuan), Vakıf (Vakıfbank). Emin değilsen boş bırak.'},
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
    res.json(JSON.parse(fs.readFileSync(file,'utf8')));
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
    res.json(JSON.parse(fs.readFileSync(file,'utf8')));
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
    date:item.receivedAt?item.receivedAt.slice(0,10):new Date().toISOString().slice(0,10),
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

// ── Ana sayfa
app.get('/favicon.png',(req,res)=>res.sendFile(path.join(__dirname,'favicon.png')));
app.get('/manifest.json',(req,res)=>res.sendFile(path.join(__dirname,'manifest.json')));
app.get('/',(req,res)=>res.sendFile(path.join(__dirname,'dashboard.html')));

const PORT=process.env.PORT||3000;
app.listen(PORT,()=>console.log(`ZYREOS http://localhost:${PORT} adresinde çalışıyor`));

