# DietTracker

App web per seguire la dieta del proprio nutrizionista: ogni utente si registra, carica la propria dieta (foto o PDF, letta da Claude) oppure la inserisce a mano, e ogni giorno segna pasti, variazioni, fuori dieta, peso, acqua, sport e bagno. Include report settimanali e mensili e la lista della spesa.

- **Sito**: GitHub Pages (file statici in questa repo)
- **Account e dati**: Supabase (login con email, un database privato per utente)
- **Lettura della dieta e valutazione degli sgarri**: Claude, chiamato da una funzione Supabase (la chiave API non è mai nel sito)

Si può provare senza account aprendo il sito con `?demo` alla fine dell'indirizzo: i dati restano solo nel browser.

## Configurazione (una volta sola)

### 1. Database
Supabase → **SQL Editor** → **New query** → incolla il contenuto di `supabase/schema.sql` → **Run**.

### 2. Login
Supabase → **Authentication** → **URL Configuration**:
- **Site URL**: `https://margheritag95.github.io/DietTracker/`
- **Redirect URLs**: aggiungi lo stesso indirizzo

### 3. Funzione Claude
1. Crea una chiave su [console.anthropic.com](https://console.anthropic.com) → **API Keys** (imposta anche un limite di spesa mensile in **Billing**).
2. Supabase → **Edge Functions** → **Secrets** → aggiungi `ANTHROPIC_API_KEY` con la chiave.
3. Supabase → **Edge Functions** → **Deploy a new function** → **Via Editor** → nome **`claude`** → incolla il contenuto di `supabase/functions/claude/index.ts` → **Deploy**. Lascia attivo "Verify JWT".

Facoltativi (Secrets): `PARSE_DAILY_LIMIT` (letture dieta al giorno per utente, default 10), `EVAL_DAILY_LIMIT` (valutazioni al giorno per utente, default 60), `PARSE_MODEL`, `EVAL_MODEL`.

### 4. Collegare il sito
In `config.js` inserisci **Project URL** e chiave **anon public** (Project Settings → API). Sono chiavi pubbliche: la sicurezza è garantita dalle regole del database (ogni utente vede solo i suoi dati).

### 5. Privacy
Completa i campi evidenziati in `privacy.html` (titolare, contatti, data) e falla verificare prima di aprire l'app al pubblico: l'app tratta dati sulla salute.

## File
| File | Cosa contiene |
|---|---|
| `index.html`, `style.css`, `app.js` | l'app |
| `config.js` | indirizzo e chiave pubblica di Supabase |
| `privacy.html` | informativa privacy (modello da completare) |
| `supabase/schema.sql` | tabelle e regole di sicurezza |
| `supabase/functions/claude/index.ts` | funzione server per Claude, limiti d'uso, eliminazione account |
