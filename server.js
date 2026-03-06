const express=require('express');
const bcrypt=require('bcryptjs');
const jwt=require('jsonwebtoken');
const fs=require('fs');
const path=require('path');

const app=express();
app.use(express.json({limit:'10mb'}));

const DATA_DIR=process.env.DATA_DIR||(process.env.NODE_ENV==='production'?'/data':__dirname);
const USERS_FILE=path.join(DATA_DIR,'users.json');
const JWT_SECRET=process.env.JWT_SECRET||'zyreos_gizli_anahtar_degistir_2024';

if(!fs.existsSync(DATA_DIR))fs.mkdirSync(DATA_DIR,{recursive:true});
function getDataFile(username){return path.join(DATA_DIR,`data_${username}.json`);}
function readUsers(){try{return JSON.parse(fs.readFileSync(USERS_FILE,'utf8'));}catch{return[];}}
function writeUsers(u){fs.writeFileSync(USERS_FILE,JSON.stringify(u,null,2));}

if(!fs.existsSync(USERS_FILE)){
  const hash=bcrypt.hashSync('admin123',10);
  writeUsers([{username:'admin',password:hash,passwordPlain:'admin123',role:'admin',status:'approved',createdAt:new Date().toISOString()}]);
  console.log('Admin oluşturuldu. Varsayılan şifre: admin123');
}

function auth(req,res,next){
  const header=req.headers.authorization||'';
  const token=header.startsWith('Bearer ')?header.slice(7):null;
  if(!token)return res.status(401).json({error:'Yetkisiz erişim'});
  try{req.user=jwt.verify(token,JWT_SECRET);next();}
  catch{res.status(401).json({error:'Oturum süresi dolmuş, tekrar giriş yapın'});}
}

function adminOnly(req,res,next){
  if(req.user.role!=='admin')return res.status(403).json({error:'Admin yetkisi gerekli'});
  next();
}

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

app.get('/api/data',auth,(req,res)=>{
  const file=getDataFile(req.user.username);
  try{
    if(!fs.existsSync(file))return res.json({customers:[],banks:[]});
    res.json(JSON.parse(fs.readFileSync(file,'utf8')));
  }catch{res.status(500).json({error:'Veri okunamadı'});}
});

app.post('/api/data',auth,(req,res)=>{
  const file=getDataFile(req.user.username);
  try{
    fs.writeFileSync(file,JSON.stringify({...req.body,savedAt:new Date().toISOString()},null,2));
    res.json({ok:true});
  }catch{res.status(500).json({error:'Veri kaydedilemedi'});}
});

app.get('/api/admin/users',auth,adminOnly,(req,res)=>{
  const users=readUsers();
  res.json(users.map(u=>({username:u.username,passwordPlain:u.passwordPlain||'—',role:u.role,status:u.status,createdAt:u.createdAt})));
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

app.post('/api/change-password',auth,(req,res)=>{
  const{currentPassword,newPassword}=req.body||{};
  if(!currentPassword||!newPassword||newPassword.length<6)
    return res.status(400).json({error:'Geçersiz şifre bilgisi (min 6 karakter)'});
  const users=readUsers();
  const user=users.find(u=>u.username===req.user.username);
  if(!user||!bcrypt.compareSync(currentPassword,user.password))
    return res.status(401).json({error:'Mevcut şifre hatalı'});
  user.password=bcrypt.hashSync(newPassword,10);
  user.passwordPlain=newPassword;
  writeUsers(users);res.json({ok:true});
});

app.get('/',(req,res)=>res.sendFile(path.join(__dirname,'dashboard.html')));

const PORT=process.env.PORT||3000;
app.listen(PORT,()=>console.log(`ZYREOS http://localhost:${PORT} adresinde çalışıyor`));
