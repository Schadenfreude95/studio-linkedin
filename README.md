# Studio — pubblicazione LinkedIn su Cloudflare Workers

> **Work in progress.** Il progetto è in sviluppo e non è pronto per l'uso in produzione. La pubblicazione automatica dei post non è ancora implementata, le metriche e la inbox community dipendono da una fonte dati non ancora collegata, e l'interfaccia può cambiare. Usalo come base di studio o per sperimentare, non come strumento definitivo.

Strumento personale per preparare e programmare post LinkedIn, con una vista metriche e una inbox per commenti e messaggi. Gira su Cloudflare Workers con database D1 e accesso privato tramite Cloudflare Access.

## Stato
- Interfaccia: home, calendario mese/settimana, editor con immagini, bozze, coda, metriche, community, connessione LinkedIn.
- Pubblicazione automatica dei post: **non ancora implementata**. Il pulsante Pianifica salva solo un record locale.
- Metriche e commenti: la vista esiste, ma serve una fonte dati da collegare (LinkedIn o un servizio terzo). Senza fonte mostra stati vuoti.
- Dati demo: `src/demo-metrics.js` contiene dati fittizi. Per vederli, attiva "Mostra dati demo" nella vista Metriche.

## Requisiti
- Node.js 22 o superiore.
- Un account Cloudflare con Workers, D1 e Zero Trust (Access).
- Un'app LinkedIn Developer con il prodotto "Sign In with LinkedIn using OpenID Connect" e "Share on LinkedIn".

## Configurazione
1. Copia `wrangler.jsonc` e sostituisci tutti i valori `REPLACE_*` con i tuoi: account, nome e sottodominio workers.dev, ID del client LinkedIn, dominio del team Access, AUD dell'applicazione Access, email del proprietario, ID del database D1.
2. Crea il database: `npx wrangler d1 create studio-linkedin` e inserisci l'ID in `wrangler.jsonc`.
3. Applica le migrazioni: `npx wrangler d1 migrations apply DB --remote`.
4. Imposta i segreti nel provider (mai nei file):
   ```
   npx wrangler secret put LINKEDIN_CLIENT_SECRET
   openssl rand -base64 32 | npx wrangler secret put LINKEDIN_TOKEN_KEY
   ```
   `LINKEDIN_TOKEN_KEY` non va cambiata dopo il primo collegamento: i token salvati diventerebbero illeggibili.
5. Abilita Cloudflare Access sull'indirizzo workers.dev, consentendo solo la tua email.
6. Registra nell'app LinkedIn il redirect `https://TUO-INDIRIZZO/auth/linkedin/callback`.

## Comandi
```
npm ci
npm test          # test locali, senza accessi live
npm run build     # genera dist/
npm run deploy    # controllo configurazione, build, test e deploy
```

## Sicurezza
- Il Worker verifica il token Access (firma RS256, audience, proprietario) anche quando viene raggiunto direttamente.
- Il token LinkedIn è cifrato con AES-GCM, legato all'identità del proprietario.
- Le bozze restano nel browser; esiste un backup JSON esportabile.
- Nessun segreto nel repository. `.env.example` contiene solo i nomi.
