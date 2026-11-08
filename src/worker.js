import {authenticate,accessConfig} from './access.js';
import {buildInboxQuery,summarizeMetrics,STATUSES} from './community.js';
import {DEMO_METRICS} from './demo-metrics.js';
const HTML = /* EMBED_HTML */;

const COOKIE = '__Host-studio-oauth';
const HEADERS = {'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...HEADERS,'Content-Type':'application/json'}});
const redirect=(path,cookie)=>new Response(null,{status:303,headers:{...HEADERS,Location:path,...(cookie?{'Set-Cookie':cookie}:{})}});
const clearCookie=()=>`${COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax`;
const b64=bytes=>btoa(String.fromCharCode(...bytes));
const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function key(env){return crypto.subtle.importKey('raw',bytes(env.LINKEDIN_TOKEN_KEY),'AES-GCM',false,['encrypt','decrypt']);}
export async function encryptToken(token,env,user){const iv=crypto.getRandomValues(new Uint8Array(12));const enc=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(user)},await key(env),new TextEncoder().encode(token));return b64(iv)+'.'+b64(new Uint8Array(enc));}
export async function decryptToken(cipher,env,user){const [iv,data]=cipher.split('.');return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(iv),additionalData:new TextEncoder().encode(user)},await key(env),bytes(data)));}
function ready(env){return !!(env.DB&&env.LINKEDIN_CLIENT_SECRET&&env.LINKEDIN_TOKEN_KEY);}
export default {async fetch(request,env){
 const u=new URL(request.url),p=u.pathname;
 const ORIGIN=env.STUDIO_ORIGIN,CLIENT_ID=env.LINKEDIN_CLIENT_ID,CALLBACK=ORIGIN+'/auth/linkedin/callback';
 if(!accessConfig(env)||!/^https:\/\/[a-z0-9.-]+$/.test(ORIGIN||'')||!CLIENT_ID)return json({error:'Configurazione server incompleta.'},503);
 if(u.origin!==ORIGIN)return json({error:'Indirizzo non autorizzato.'},403);
 const identity=await authenticate(request,env);
 if(!identity)return json({error:'Accesso privato. Accedi tramite Cloudflare Access.'},401);
 const user=identity.id;
 if(p==='/privacy')return new Response('<!doctype html><html lang="it"><meta charset="utf-8"><title>Studio · Dati e collegamento</title><main style="max-width:700px;margin:70px auto;font:17px/1.7 system-ui;padding:25px"><h1>Dati e collegamento LinkedIn</h1><p>Studio è uno strumento personale privato. Bozze, testi e immagini vengono salvati nel browser del dispositivo e non sono ancora sincronizzati sul server.</p><p>Se colleghi LinkedIn, Studio conserva sul server il tuo identificativo LinkedIn, il nome, i permessi autorizzati, la scadenza e il token di accesso cifrato. Non richiede la tua password LinkedIn né il tuo indirizzo email.</p><p>Il token serve a mantenere il collegamento. Questa versione non invia post: la pubblicazione automatica deve ancora essere attivata. Il token scade secondo le regole di LinkedIn; puoi scollegare il profilo da Studio per eliminare la connessione salvata. Puoi anche revocare l’autorizzazione dalle impostazioni LinkedIn.</p><p>L’accesso privato a Studio è gestito da Cloudflare Access. I contenuti nel browser si eliminano dalla gestione dei dati del browser. Il servizio utilizza un cookie temporaneo essenziale durante il collegamento, con durata massima di 10 minuti.</p><a href="/">Torna a Studio</a></main></html>',{headers:{...HEADERS,'Content-Type':'text/html;charset=utf-8'}});

 try {
 if(p==='/api/linkedin/status'&&request.method==='GET'){
  if(!env.DB)return json({configured:false,connected:false});
  const row=await env.DB.prepare('SELECT display_name,expires_at FROM linkedin_connections WHERE user_id=?').bind(user).first();
  return json({configured:ready(env),connected:!!row&&row.expires_at>Date.now(),expired:!!row&&row.expires_at<=Date.now(),name:row?.display_name||null,expiresAt:row?.expires_at||null});
 }
 if(p==='/auth/linkedin/connect'&&request.method==='GET'){
  if(!ready(env))return redirect('/?linkedin=not_configured');
  const state=crypto.randomUUID()+crypto.randomUUID();
  await env.DB.prepare('DELETE FROM linkedin_oauth_states WHERE expires_at < ? OR user_id = ?').bind(Date.now(),user).run();
  await env.DB.prepare('INSERT INTO linkedin_oauth_states (state,user_id,expires_at) VALUES (?,?,?)').bind(state,user,Date.now()+600000).run();
  const target=new URL('https://www.linkedin.com/oauth/v2/authorization');target.search=new URLSearchParams({response_type:'code',client_id:CLIENT_ID,redirect_uri:CALLBACK,state,scope:'openid profile w_member_social'}).toString();
  return redirect(target.toString(),`${COOKIE}=${state}; Path=/; Max-Age=600; Secure; HttpOnly; SameSite=Lax`);
 }
 if(p==='/auth/linkedin/callback'&&request.method==='GET'){
  if(!ready(env))return redirect('/?linkedin=not_configured',clearCookie());
  const state=u.searchParams.get('state'),cookie=(request.headers.get('Cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
  if(!state||state!==cookie)return redirect('/?linkedin=invalid_state',clearCookie());
  const row=await env.DB.prepare('DELETE FROM linkedin_oauth_states WHERE state=? AND user_id=? RETURNING expires_at').bind(state,user).first();
  if(!row||row.expires_at<Date.now())return redirect('/?linkedin=invalid_state',clearCookie());
  if(u.searchParams.has('error'))return redirect('/?linkedin=cancelled',clearCookie());
  const code=u.searchParams.get('code');if(!code)return redirect('/?linkedin=failed',clearCookie());
  const resp=await fetch('https://www.linkedin.com/oauth/v2/accessToken',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:CALLBACK,client_id:CLIENT_ID,client_secret:env.LINKEDIN_CLIENT_SECRET}),signal:AbortSignal.timeout(20000)});
  if(!resp.ok)return redirect('/?linkedin=failed',clearCookie());
  const token=await resp.json();if(!token.access_token||!Number.isFinite(Number(token.expires_in))||Number(token.expires_in)<=0)return redirect('/?linkedin=failed',clearCookie());
  if(token.scope){const scopes=token.scope.split(/[ ,]+/);if(!['openid','profile','w_member_social'].every(s=>scopes.includes(s)))return redirect('/?linkedin=missing_permissions',clearCookie());}
  const profile=await fetch('https://api.linkedin.com/v2/userinfo',{headers:{Authorization:'Bearer '+token.access_token},signal:AbortSignal.timeout(20000)});
  if(!profile.ok)return redirect('/?linkedin=failed',clearCookie());const member=await profile.json();if(!member.sub||typeof member.sub!=='string')return redirect('/?linkedin=failed',clearCookie());
  const cipher=await encryptToken(token.access_token,env,user),now=Date.now();
  await env.DB.prepare('INSERT INTO linkedin_connections(user_id,member_id,display_name,token_cipher,expires_at,scopes,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET member_id=excluded.member_id,display_name=excluded.display_name,token_cipher=excluded.token_cipher,expires_at=excluded.expires_at,scopes=excluded.scopes,updated_at=excluded.updated_at').bind(user,member.sub,String(member.name||'Profilo LinkedIn'),cipher,now+Number(token.expires_in)*1000,token.scope||'openid profile w_member_social',now).run();
  return redirect('/?linkedin=connected',clearCookie());
 }
 if(p==='/api/linkedin/disconnect'&&request.method==='POST'){
  if(request.headers.get('Origin')!==ORIGIN)return json({error:'Richiesta non valida.'},403);
  if(!env.DB)return json({error:'Collegamento non configurato.'},503);
  await env.DB.batch([env.DB.prepare('DELETE FROM linkedin_connections WHERE user_id=?').bind(user),env.DB.prepare('DELETE FROM linkedin_oauth_states WHERE user_id=?').bind(user)]);
  return json({connected:false});
 }
 if(p==='/api/community'&&request.method==='GET'){
  if(!env.DB)return json({error:'Database non configurato.'},503);
  let q;try{q=buildInboxQuery(Object.fromEntries(u.searchParams));}catch(e){return json({error:e.message},400);}
  const {results}=await env.DB.prepare(q.sql).bind(...q.args).all();
  return json({items:results});
 }
 if(p==='/api/community/status'&&request.method==='POST'){
  if(request.headers.get('Origin')!==ORIGIN)return json({error:'Richiesta non valida.'},403);
  if(!env.DB)return json({error:'Database non configurato.'},503);
  const body=await request.json().catch(()=>null);
  if(!body||typeof body.id!=='string'||body.id.length>200||!STATUSES.includes(body.status))return json({error:'Dati non validi.'},400);
  await env.DB.prepare('UPDATE community_items SET status=? WHERE source_id=?').bind(body.status,body.id).run();
  return json({ok:true});
 }
 if(p==='/api/metrics'&&request.method==='GET'&&u.searchParams.get('source')==='demo'){
  return json({demo:true,...DEMO_METRICS});
 }
 if(p==='/api/metrics'&&request.method==='GET'){
  if(!env.DB)return json({error:'Database non configurato.'},503);
  const {results}=await env.DB.prepare('SELECT post_id,captured_at,impressions,reactions,comments,shares,clicks FROM metric_snapshots ORDER BY captured_at DESC LIMIT 2000').bind().all();
  return json(summarizeMetrics(results));
 }
 if(p==='/api/community/sync'&&request.method==='POST'){
  if(request.headers.get('Origin')!==ORIGIN)return json({error:'Richiesta non valida.'},403);
  return json({error:'Nessuna fonte collegata. Collega LinkedIn o Metricool prima di sincronizzare.',code:'no_source'},503);
 }
 if(p.startsWith('/api/')||p.startsWith('/auth/'))return json({error:'Percorso non disponibile.'},404);
 if(p==='/'&&request.method==='GET')return new Response(HTML,{headers:{...HEADERS,'Content-Type':'text/html;charset=utf-8','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'"}});
 return new Response('Pagina non trovata',{status:404,headers:HEADERS});
 }catch{return p==='/auth/linkedin/callback'?redirect('/?linkedin=failed',clearCookie()):json({error:'Operazione non riuscita. Riprova tra poco.'},500);}
}};
