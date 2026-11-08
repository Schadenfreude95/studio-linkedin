scripts/check-config.mjsimport {readFileSync} from 'node:fs';
const c=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
const v=c.vars||{};
if(JSON.stringify(c).includes('REPLACE')||c.d1_databases?.some(d=>d.database_id==='00000000-0000-0000-0000-000000000000'))throw Error('Completa origine, database e Cloudflare Access prima del deploy.');
if(!/^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/.test(v.STUDIO_ORIGIN))throw Error('Usa l’origine workers.dev definitiva, senza percorso o slash finale.');
if(!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(v.CF_ACCESS_TEAM_DOMAIN))throw Error('Dominio Access non valido.');
if(!v.CF_ACCESS_AUD||!v.OWNER_EMAIL?.includes('@'))throw Error('Configura Access e proprietario.');
if(v.LINKEDIN_CLIENT_SECRET||v.LINKEDIN_TOKEN_KEY)throw Error('I segreti vanno nel runtime Cloudflare, non nelle vars.');
console.log('Configurazione completa. Nessun segreto in vars.');
