const cache=new Map();
const unbase64=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const decode=s=>JSON.parse(new TextDecoder().decode(unbase64(s)));
export function accessConfig(env){
 const issuer=env.CF_ACCESS_TEAM_DOMAIN||'';
 return /^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer)&&typeof env.CF_ACCESS_AUD==='string'&&env.CF_ACCESS_AUD.length>10&&typeof env.OWNER_EMAIL==='string'&&/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(env.OWNER_EMAIL);
}
export async function verifyAccessJwt(token,env,fetchKeys=fetch){
 if(!accessConfig(env)||typeof token!=='string'||token.length>20000)return null;
 try{
 const parts=token.split('.');if(parts.length!==3)return null;
 const header=decode(parts[0]),claims=decode(parts[1]),now=Math.floor(Date.now()/1000);
 if(header.alg!=='RS256'||typeof header.kid!=='string'||header.kid.length>256||header.crit)return null;
 if(claims.iss!==env.CF_ACCESS_TEAM_DOMAIN||!Array.isArray(claims.aud)||!claims.aud.includes(env.CF_ACCESS_AUD))return null;
 if(!Number.isFinite(claims.exp)||claims.exp<=now||!Number.isFinite(claims.iat)||claims.iat>now+60||claims.exp<=claims.iat)return null;
 if(claims.nbf!==undefined&&(!Number.isFinite(claims.nbf)||claims.nbf>now))return null;
 if(typeof claims.sub!=='string'||!claims.sub||typeof claims.email!=='string'||claims.email.toLowerCase()!==env.OWNER_EMAIL.toLowerCase())return null;
 let entry=cache.get(env.CF_ACCESS_TEAM_DOMAIN);
 if(!entry||entry.until<Date.now()){
  const r=await fetchKeys(env.CF_ACCESS_TEAM_DOMAIN+'/cdn-cgi/access/certs',{signal:AbortSignal.timeout(10000)});if(!r.ok)return null;
  const body=await r.json();if(!Array.isArray(body.keys))return null;
  entry={keys:body.keys,until:Date.now()+300000};cache.set(env.CF_ACCESS_TEAM_DOMAIN,entry);
 }
 const jwk=entry.keys.find(k=>k.kid===header.kid&&k.kty==='RSA'&&k.alg==='RS256'&&(!k.use||k.use==='sig'));
 if(!jwk){cache.delete(env.CF_ACCESS_TEAM_DOMAIN);return null}
 const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 const valid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,unbase64(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]));
 return valid?{id:'studio-owner',email:claims.email}:null;
 }catch{return null}
}
export async function authenticate(request,env){return verifyAccessJwt(request.headers.get('Cf-Access-Jwt-Assertion'),env)}
