import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../dist/server/index.js';
import {normalizeItem,normalizeSnapshot,buildInboxQuery,summarizeMetrics} from '../src/community.js';

const origin='https://studio-linkedin.fixture.workers.dev',team='https://studio-fixture.cloudflareaccess.com',aud='fixture-audience-123456';
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const publicKey=await crypto.subtle.exportKey('jwk',pair.publicKey);Object.assign(publicKey,{kid:'fixture-key',alg:'RS256',use:'sig'});
const b64=b=>Buffer.from(b).toString('base64url');
async function jwt(){const now=Math.floor(Date.now()/1000),claims={iss:team,aud:[aud],sub:'fixture-user',email:'owner@example.test',iat:now-5,exp:now+3600},h=b64(JSON.stringify({alg:'RS256',kid:'fixture-key'})),p=b64(JSON.stringify(claims)),sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(h+'.'+p));return h+'.'+p+'.'+b64(sig)}
const token=await jwt();

// Database SQLite in memoria con entrambe le migrazioni, interfaccia compatibile con D1.
function db(){
 const d=new DatabaseSync(':memory:');
 d.exec(readFileSync('migrations/0001_linkedin_connection.sql','utf8'));
 d.exec(readFileSync('migrations/0002_metriche_community.sql','utf8').replace('--> statement-breakpoint',';'));
 return {
  raw:d,
  prepare(sql){let a=[];const s={bind(...v){a=v;return s},first(){return d.prepare(sql).get(...a)||null},all(){return {results:d.prepare(sql).all(...a)}},run(){return d.prepare(sql).run(...a)}};return s},
  batch:async a=>a.map(x=>x.run()),
 };
}
function env(database=db()){return {DB:database,CF_ACCESS_TEAM_DOMAIN:team,CF_ACCESS_AUD:aud,OWNER_EMAIL:'owner@example.test',STUDIO_ORIGIN:origin,LINKEDIN_CLIENT_ID:'fixture-client',LINKEDIN_CLIENT_SECRET:'fixture-secret',LINKEDIN_TOKEN_KEY:btoa('x'.repeat(32)),_jwks:true}}
const req=(path,options={})=>new Request(origin+path,{...options,headers:{'Cf-Access-Jwt-Assertion':token,...options.headers}});
// Access reale richiederebbe le chiavi pubbliche: qui le forniamo via fetch globale per la sola verifica JWT.
const realFetch=globalThis.fetch;
globalThis.fetch=async(url,...rest)=>String(url).endsWith('/cdn-cgi/access/certs')?new Response(JSON.stringify({keys:[publicKey]})):realFetch(url,...rest);

test('normalizeItem accetta un commento valido e normalizza il testo',()=>{
 const row=normalizeItem({source_id:'c1',kind:'comment',post_id:'p1',author:' Anna ',text:'  Bello  ',created_at:1000},5);
 assert.deepEqual(row,{source_id:'c1',kind:'comment',post_id:'p1',author:'Anna',text:'Bello',created_at:1000,fetched_at:5});
});
test('normalizeItem rifiuta tipo sconosciuto, testo vuoto, data mancante e id troppo lungo',()=>{
 for(const bad of [{kind:'tweet'},{text:'   '},{created_at:undefined},{source_id:'x'.repeat(201)}]){
  assert.throws(()=>normalizeItem({source_id:'c1',kind:'comment',text:'ok',created_at:1000,...bad}));
 }
});
test('normalizeItem usa Anonimo quando manca l autore',()=>{
 assert.equal(normalizeItem({source_id:'c1',kind:'message',text:'Ciao',created_at:1}).author,'Anonimo');
});
test('normalizeSnapshot rifiuta metriche negative o non intere',()=>{
 assert.throws(()=>normalizeSnapshot({post_id:'p1',impressions:-1}));
 assert.throws(()=>normalizeSnapshot({post_id:'p1',clicks:1.5}));
 assert.throws(()=>normalizeSnapshot({impressions:1}));
 assert.equal(normalizeSnapshot({post_id:'p1',impressions:10},7).captured_at,7);
});
test('buildInboxQuery usa solo filtri in whitelist e parametri legati',()=>{
 assert.throws(()=>buildInboxQuery({kind:'x; DROP TABLE community_items'}));
 assert.throws(()=>buildInboxQuery({status:'closed'}));
 const q=buildInboxQuery({kind:'comment',status:'open',post:'p1',limit:'9999'});
 assert.ok(!q.sql.includes('p1'));
 assert.deepEqual(q.args,['comment','open','p1',200]);
 assert.equal(buildInboxQuery({}).args[0],100);
});
test('summarizeMetrics prende lo snapshot più recente per post e calcola engagement',()=>{
 const s=summarizeMetrics([
  {post_id:'a',captured_at:1,impressions:100,reactions:1,comments:0,shares:0,clicks:0},
  {post_id:'a',captured_at:2,impressions:200,reactions:10,comments:5,shares:5,clicks:0},
  {post_id:'b',captured_at:3,impressions:0,reactions:0,comments:0,shares:0,clicks:0},
 ]);
 assert.equal(s.posts.length,2);
 assert.equal(s.posts.find(p=>p.post_id==='a').impressions,200);
 assert.equal(s.posts.find(p=>p.post_id==='a').engagement,10);
 assert.equal(s.posts.find(p=>p.post_id==='b').engagement,null);
 assert.equal(s.totals.impressions,200);
});
test('schema 0002 impone tipo e stato validi',()=>{
 const d=db().raw;
 assert.throws(()=>d.exec("INSERT INTO community_items VALUES ('x','tweet',NULL,'a','t',1,'open',1)"));
 assert.throws(()=>d.exec("INSERT INTO community_items VALUES ('x','comment',NULL,'a','t',1,'closed',1)"));
});
test('route community: senza accesso 401, con accesso filtra e aggiorna stato',async()=>{
 const e=env();
 e.DB.raw.exec("INSERT INTO community_items VALUES ('c1','comment','p1','Anna','Bello',2000,'open',1)");
 e.DB.raw.exec("INSERT INTO community_items VALUES ('m1','message',NULL,'Luca','Ciao',3000,'open',1)");
 assert.equal((await worker.fetch(new Request(origin+'/api/community'),e)).status,401);
 const list=await (await worker.fetch(req('/api/community?kind=message'),e)).json();
 assert.deepEqual(list.items.map(i=>i.source_id),['m1']);
 const bad=await worker.fetch(req('/api/community/status',{method:'POST',headers:{Origin:'https://other.invalid'},body:'{}'}),e);
 assert.equal(bad.status,403);
 const ok=await worker.fetch(req('/api/community/status',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({id:'c1',status:'replied'})}),e);
 assert.equal(ok.status,200);
 assert.equal(e.DB.raw.prepare("SELECT status FROM community_items WHERE source_id='c1'").get().status,'replied');
});
test('route metriche restituisce riepilogo; sync senza fonte risponde 503 senza inventare dati',async()=>{
 const e=env();
 e.DB.raw.exec("INSERT INTO metric_snapshots VALUES ('p1',1,100,5,2,1,3)");
 const m=await (await worker.fetch(req('/api/metrics'),e)).json();
 assert.equal(m.totals.impressions,100);
 assert.equal(m.posts[0].engagement,11);
 const sync=await worker.fetch(req('/api/community/sync',{method:'POST',headers:{Origin:origin}}),e);
 assert.equal(sync.status,503);
 assert.equal((await sync.json()).code,'no_source');
 assert.equal(e.DB.raw.prepare('SELECT COUNT(*) AS n FROM community_items').get().n,0);
});
test('metriche demo sono servite solo con source=demo e dichiarano di essere demo',async()=>{
 const e=env();
 const d=await (await worker.fetch(req('/api/metrics?source=demo'),e)).json();
 assert.equal(d.demo,true);
 assert.equal(d.totals.impressions,1200);
 assert.equal(d.followersTotal,300);
 assert.ok(d.topPosts.length>0);
 const live=await (await worker.fetch(req('/api/metrics'),e)).json();
 assert.equal(live.demo,undefined);
});
test.after(()=>{globalThis.fetch=realFetch});
