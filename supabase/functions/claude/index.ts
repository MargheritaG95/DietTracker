// DietTracker: funzione server che parla con Claude.
// - mode "parse": legge la foto/PDF di una dieta e la trasforma nel piano dell'app
// - mode "eval": valuta quanto una variazione è lontana dalla dieta
// - mode "delete_account": cancella l'account e tutti i dati dell'utente
// La chiave di Claude resta qui sul server (secret ANTHROPIC_API_KEY), mai nel sito.

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PARSE_MODEL = Deno.env.get("PARSE_MODEL") ?? "claude-sonnet-5";
const EVAL_MODEL = Deno.env.get("EVAL_MODEL") ?? "claude-haiku-4-5-20251001";
const PARSE_LIMIT = Number(Deno.env.get("PARSE_DAILY_LIMIT") ?? "10");
const EVAL_LIMIT = Number(Deno.env.get("EVAL_DAILY_LIMIT") ?? "60");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
const clip = (s: unknown, n: number) => String(s ?? "").slice(0, n);

async function askClaude(model: string, content: unknown[], maxTokens: number) {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("ANTHROPIC_API_KEY mancante");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: "user", content }] }),
  });
  if (!r.ok) throw new Error(`Claude ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const data = await r.json();
  const text = (data.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Risposta non in JSON");
  return JSON.parse(m[0]);
}

const PARSE_PROMPT = `Sei un assistente che trascrive piani alimentari prescritti da un nutrizionista.
Leggi il documento allegato (foto o PDF di una dieta) e trascrivilo FEDELMENTE, senza inventare nulla, in questo JSON:
{
  "meals": [ {"k": "col", "n": "Colazione", "h": "09:00", "note": ""} ],
  "week": {
    "1": { "meals": { "col": ["Latte di riso 200 g", "Caffè"] }, "sport": {"n": "Camminata", "min": 60} },
    "2": { ... }, "3": { ... }, "4": { ... }, "5": { ... }, "6": { ... }, "0": { ... }
  },
  "supplements": [ {"n": "Vitamina C", "dose": "1 compressa", "meal": "col"} ],
  "water_l": 2,
  "steps": 10000,
  "weigh_days": [3, 6],
  "target": {"min": 57, "max": 58},
  "exclusions": ["glutine"],
  "rules": [ {"t": "Fritti", "v": "Evitare", "no": true} ],
  "notes": ""
}
Regole:
- "week" usa i giorni come numeri: "1"=lunedì … "6"=sabato, "0"=domenica. Se la dieta è uguale tutti i giorni, ripeti lo stesso contenuto per tutti e 7.
- "meals" elenca i pasti in ordine di orario, con chiavi brevi e uniche (es. "col","spu1","pra","spu2","cen","dop"). "h" è l'orario HH:MM se indicato, altrimenti un orario tipico. Se gli integratori vanno presi "appena sveglio", crea un pasto {"k":"sveglia","n":"Appena sveglio"}.
- Ogni alimento è una voce separata con la sua quantità (es. "2 bicchieri d'acqua + caffè" diventa due voci). Mantieni le marche e le quantità come scritte.
- "sport" è null nei giorni senza attività prescritta. "min" in minuti.
- "supplements": integratori con dose e il pasto (chiave di "meals") in cui prenderli.
- "water_l", "steps", "weigh_days" (numeri dei giorni in cui pesarsi), "target" (peso obiettivo in kg): metti null se non indicati.
- "exclusions": intolleranze/sensibilità o alimenti esclusi indicati nel documento.
- "rules": indicazioni generali (dolci, alcolici, fritti, bibite...). "no": true se è da evitare.
- Non includere dati personali (nome, indirizzo, misure corporee) tranne il peso obiettivo.
Rispondi SOLO con il JSON.`;

function evalPrompt(b: Record<string, unknown>) {
  const ctx = (b.ctx ?? {}) as Record<string, unknown>;
  const excl = Array.isArray(ctx.exclusions) ? (ctx.exclusions as unknown[]).map((x) => clip(x, 60)).slice(0, 20).join(", ") : "";
  const rules = Array.isArray(ctx.rules) ? (ctx.rules as Record<string, unknown>[]).slice(0, 20).map((r) => `${clip(r.t, 40)}: ${clip(r.v, 60)}`).join("; ") : "";
  const target = clip(ctx.target, 40);
  const context = `Contesto della dieta:${target ? ` obiettivo di peso ${target}.` : ""}${excl ? ` Esclude: ${excl}.` : ""}${rules ? ` Regole: ${rules}.` : ""}`;
  const meal = clip(b.meal, 40), day = clip(b.day, 20);
  const prescribed = Array.isArray(b.prescribed) ? (b.prescribed as unknown[]).slice(0, 15).map((x) => clip(x, 80)).join("; ") : "";
  const eaten = clip(b.eaten, 200);
  const fmt = `Rispondi solo con JSON: {"vicinanza": numero intero, "nota": "frase in italiano di massimo 12 parole che spiega il perché"}`;
  if (b.kind === "extra") {
    return `Sei un nutrizionista. Valuta quanto un cibo mangiato in più, fuori dal piano, è compatibile con la dieta.\n${context}\nGiorno: ${day}. Ha mangiato in più: "${eaten}".\nDai un punteggio "vicinanza" da 0 a 100: 100 = innocuo (es. verdura, tè, acqua); 60–80 = poco impatto; 30–50 = impatto moderato; 0–20 = molto contrario alla dieta.\n${fmt}`;
  }
  if (b.kind === "meal") {
    return `Sei un nutrizionista. Valuta quanto un pasto mangiato è vicino al pasto prescritto dalla dieta.\n${context}\nPasto: ${meal} di ${day}. Il pasto prescritto è: ${prescribed}.\nAl suo posto ha mangiato: "${eaten}".\nDai un punteggio "vicinanza" da 0 a 100: 100 = pasto equivalente (stessi gruppi alimentari, porzioni e calorie simili, compatibile con le esclusioni); 70–90 = simile; 40–60 = diverso ma accettabile; 10–30 = lontano; 0 = del tutto contrario alla dieta. Se le porzioni non sono indicate, assumi porzioni normali.\n${fmt}`;
  }
  return `Sei un nutrizionista. Valuta quanto una sostituzione è vicina alla dieta prescritta.\n${context}\nPasto: ${meal} di ${day}. Il pasto prescritto è: ${prescribed}.\nAlimento prescritto: "${clip(b.item, 80)}". Al suo posto ha mangiato: "${eaten}".\nDai un punteggio "vicinanza" da 0 a 100: 100 = sostituto equivalente (stessa categoria, porzione e calorie simili, compatibile con le esclusioni); 70–90 = simile; 40–60 = diverso ma accettabile; 10–30 = lontano (molto più calorico, dolce, fritto o escluso dalla dieta); 0 = del tutto contrario alla dieta. Se la porzione non è indicata, assumi una porzione normale.\n${fmt}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    const asked = req.headers.get("Access-Control-Request-Headers");
    return new Response("ok", { headers: { ...CORS, ...(asked ? { "Access-Control-Allow-Headers": asked } : {}) } });
  }
  if (req.method !== "POST") return json({ error: "method" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const auth = req.headers.get("Authorization") ?? "";
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = auth.replace(/^Bearer\s+/i, "");
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return json({ error: "auth", message: "Sessione scaduta: esci e rientra nell'app." }, 401);
    const body = await req.json();

    if (body.mode === "delete_account") {
      const { error } = await admin.auth.admin.deleteUser(user.id); // le tabelle si cancellano a cascata
      if (error) throw error;
      return json({ ok: true });
    }

    // limite giornaliero per contenere i costi
    const today = new Date().toISOString().slice(0, 10);
    const { data: row } = await admin.from("ai_usage").select("*").eq("user_id", user.id).eq("day", today).maybeSingle();
    const usage = row ?? { user_id: user.id, day: today, parse_count: 0, eval_count: 0 };
    const field = body.mode === "parse" ? "parse_count" : "eval_count";
    const limit = body.mode === "parse" ? PARSE_LIMIT : EVAL_LIMIT;
    if (usage[field] >= limit) return json({ error: "limit", message: "Hai raggiunto il limite giornaliero di richieste. Riprova domani." }, 429);
    usage[field] += 1;
    await admin.from("ai_usage").upsert(usage);

    if (body.mode === "parse") {
      const files = Array.isArray(body.files) ? body.files.slice(0, 6) : [];
      if (!files.length) return json({ error: "Nessun file" }, 400);
      const content: unknown[] = files.map((f: { type: string; media_type: string; data: string }) =>
        f.type === "pdf"
          ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: f.data } }
          : { type: "image", source: { type: "base64", media_type: f.media_type, data: f.data } });
      content.push({ type: "text", text: PARSE_PROMPT });
      const plan = await askClaude(PARSE_MODEL, content, 8000);
      return json({ plan });
    }

    if (body.mode === "eval") {
      const r = await askClaude(EVAL_MODEL, [{ type: "text", text: evalPrompt(body) }], 200);
      const p = Math.max(0, Math.min(100, Math.round(Number(r.vicinanza))));
      if (Number.isNaN(p)) throw new Error("Valutazione non valida");
      return json({ p, nota: clip(r.nota, 140) });
    }

    return json({ error: "mode" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: "server", message: String((e as Error).message ?? e).slice(0, 300) }, 500);
  }
});
