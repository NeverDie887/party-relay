'use strict';
const http = require('http');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const MAX_PARTY = 8;
const ONLINE_MS = 10000;
const users = new Map();       // token -> user
const byName = new Map();      // lowercase username -> token
const parties = new Map();     // partyId -> party
const invites = new Map();     // inviteCode -> invite

function id(bytes=18) { return crypto.randomBytes(bytes).toString('base64url'); }
function json(res, code, obj) { const body=JSON.stringify(obj); res.writeHead(code, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'}); res.end(body); }
function bad(res,msg,code=400){json(res,code,{ok:false,error:msg});}
function read(req){ return new Promise((resolve,reject)=>{let b=''; req.on('data',c=>{b+=c; if(b.length>100000) req.destroy();}); req.on('end',()=>{try{resolve(b?JSON.parse(b):{});}catch(e){reject(e);}});}); }
function auth(token){ const u=users.get(token); if(!u) return null; u.last=Date.now(); return u; }
function partyOf(u){ return u.partyId ? parties.get(u.partyId) : null; }
function cleanup(){
  const now=Date.now();
  for (const [t,u] of users) if(now-u.last>30000){ if(byName.get(u.name.toLowerCase())===t) byName.delete(u.name.toLowerCase()); users.delete(t); }
  for (const [code,v] of invites) if(now-v.created>120000) invites.delete(code);
  for (const [pid,p] of parties) { p.members=[...p.members].filter(t=>users.has(t)); if(!p.members.length) parties.delete(pid); }
}
setInterval(cleanup,5000);
function state(u){
  const p=partyOf(u);
  const members=(p?p.members:[]).map(t=>users.get(t)).filter(Boolean).map(x=>({name:x.name,x:x.x,y:x.y,z:x.z,world:x.world,server:x.server,last:x.last}));
  const pending=[...invites.values()].filter(v=>v.to===u.name.toLowerCase()).map(v=>({code:v.code,from:v.from,partySize: (parties.get(v.partyId)?.members.length||0),created:v.created}));
  return {ok:true,party:p?{id:p.id,owner:users.get(p.owner)?.name||'',members}:null,invites:pending};
}
async function route(req,res){
  const rootUrl=new URL(req.url,`http://${req.headers.host||'localhost'}`);
  if(req.method==='GET' && rootUrl.pathname==='/'){
    res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});
    return res.end('Party Relay is running');
  }
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'});return res.end();}
  const uurl=new URL(req.url,`http://${req.headers.host||'localhost'}`); const path=uurl.pathname;
  try{
    if(req.method==='POST' && path==='/v1/session'){
      const b=await read(req), name=String(b.name||'').trim().slice(0,16), token=String(b.token||'');
      if(!/^[A-Za-z0-9_]{1,16}$/.test(name)||token.length<20) return bad(res,'invalid session');
      const old=byName.get(name.toLowerCase()); if(old&&old!==token) users.delete(old);
      const u=users.get(token)||{token}; Object.assign(u,{name,last:Date.now(),x:0,y:0,z:0,world:'',server:''}); users.set(token,u); byName.set(name.toLowerCase(),token); return json(res,200,state(u));
    }
    if(req.method==='GET' && path==='/v1/state'){ const u=auth(uurl.searchParams.get('token')); if(!u)return bad(res,'unauthorized',401); return json(res,200,state(u)); }
    if(req.method==='POST'){
      const b=await read(req), u=auth(String(b.token||'')); if(!u)return bad(res,'unauthorized',401);
      if(path==='/v1/create'){
        if(partyOf(u)) return json(res,200,state(u));
        const p={id:id(12),owner:u.token,members:[u.token]}; parties.set(p.id,p); u.partyId=p.id; return json(res,200,state(u));
      }
      if(path==='/v1/invite'){
        const p=partyOf(u); if(!p)return bad(res,'not in party'); const target=String(b.target||'').trim().slice(0,16).toLowerCase();
        if(!byName.has(target)) return bad(res,'player is not online in relay'); if(p.members.length>=MAX_PARTY)return bad(res,'party is full');
        const to=byName.get(target); if(p.members.includes(to))return bad(res,'already in party');
        const code=id(9); invites.set(code,{code,partyId:p.id,from:u.name,to:target,created:Date.now()}); return json(res,200,{ok:true,code});
      }
      if(path==='/v1/accept'){
        const code=String(b.code||''); const inv=invites.get(code); if(!inv)return bad(res,'invite expired or invalid'); if(inv.to!==u.name.toLowerCase())return bad(res,'not your invite');
        const p=parties.get(inv.partyId); if(!p)return bad(res,'party no longer exists'); if(p.members.length>=MAX_PARTY)return bad(res,'party is full');
        if(u.partyId&&parties.has(u.partyId)) parties.get(u.partyId).members=parties.get(u.partyId).members.filter(t=>t!==u.token);
        p.members.push(u.token); u.partyId=p.id; invites.delete(code); return json(res,200,state(u));
      }
      if(path==='/v1/leave'){
        const p=partyOf(u); if(p){p.members=p.members.filter(t=>t!==u.token); if(p.owner===u.token){p.owner=p.members[0]||null;} if(!p.members.length)parties.delete(p.id);} u.partyId=null; return json(res,200,state(u));
      }
      if(path==='/v1/update'){
        const nums=['x','y','z'].map(k=>Number(b[k])); if(nums.some(n=>!Number.isFinite(n)||Math.abs(n)>30000000))return bad(res,'bad coordinates');
        u.x=nums[0];u.y=nums[1];u.z=nums[2];u.world=String(b.world||'').slice(0,100);u.server=String(b.server||'').slice(0,200);return json(res,200,{ok:true});
      }
    }
    return bad(res,'not found',404);
  }catch(e){ console.error(e); bad(res,'server error',500); }
}
http.createServer(route).listen(PORT,HOST,()=>console.log(`Party Navigator relay listening on http://${HOST}:${PORT}`));
