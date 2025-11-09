// --- The Guru Speaks: Operational Prototype Server ---

const express = require("express");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));
const cors = require("cors");
const dotenv = require("dotenv");
dotenv.config(); // Load environment variables early

// --- Supabase setup ---
const { createClient } = require("@supabase/supabase-js");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- OpenAI setup ---
const OpenAI = require("openai");
const openai = new OpenAI({
  apiKey: process.env.MODEL_API_KEY,
});

const app = express();
app.use(express.static("public"));
app.use(cors());
app.use(express.json());

// --- Per-session rolling memory (prevents cross-session leakage) ---
const sessionHistories = {};       // { [sessionId]: [{role, content}] }
const MAX_HISTORY = 6;             // keep last N turns per session
let conversationSummary = "User begins the session calm and curious.";

// --- Root test route ---
app.get("/", (req, res) => {
  res.send("The Guru Speaks: Prototype server is running.");
});

// --- Chat route ---
app.post("/chat", async (req, res) => {
const { message, userName, sessionId: clientSessionId } = req.body || {};
  if (!message) return res.status(400).json({ error: "No message received." });

  // Use explicit sessionId if provided by client; otherwise fall back to IP (separates devices)
  const sessionId = clientSessionId || req.ip || "default";
  if (!sessionHistories[sessionId]) sessionHistories[sessionId] = [];

  try {
    // Add latest user message to this session's history
    sessionHistories[sessionId].push({ role: "user", content: message });
    if (sessionHistories[sessionId].length > MAX_HISTORY) {
      sessionHistories[sessionId] = sessionHistories[sessionId].slice(-MAX_HISTORY);
    }

    // --- Update one-line emotional summary (cheap + short) ---
    try {
      const summaryPrompt = `
Summarise the emotional state and main topic of this exchange in one short sentence.
Keep tone factual, e.g., "User feels anxious about finances and wants reassurance."`;
      const summary = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: summaryPrompt },
          ...sessionHistories[sessionId],
          { role: "user", content: message },
        ],
        max_tokens: 40,
      });
      conversationSummary = summary.choices?.[0]?.message?.content?.trim() || conversationSummary;
    } catch (e) {
      // non-fatal
    }

    // --- Main Guru reply ---
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.9,
      presence_penalty: 0.4,
      max_tokens: 700,              // ↑ allow full lists/guidance to finish
      // Removed stop[] to avoid premature cutoffs mid-list
      messages: [
        {
          role: "system",
          content: `
## The Guru Speaks — System Prompt v6 (Inclusive Worldview Edition)

**You are *The Guru* — a psychologically grounded spiritual mentor.**
Your voice is calm, observant, and human — never robotic, indulgent, or detached. You speak with warmth, clarity, and accountability.
Your purpose is to help the user see themselves clearly, recognise patterns, and take gentle, practical steps toward growth.

Voice & Tone
- Speak in a **steady, conversational first-person** voice (“I hear…”, “Let’s look at…”).
- Maintain a **grounded, curious, and compassionate** energy — calm, but never flat.
- Use **simple, precise English** and natural rhythm. Mix short reflective lines with longer explorations.
- Avoid cliché “guru” language, excessive body/breath references, or empty positivity.
- Offer warmth without rescuing; guidance without authority.

### Psychological Depth
- Explore thought patterns, emotions, needs, behavioural loops, and meaning.
- Translate belief language (faith-based, metaphysical, atheist) into shared human insight.
- Never preach, convert, or dismiss. Translate beliefs into understanding.

### Conversational Behaviour
1. **Openings** — begin with attunement.
2. **Middle** — reflect, question, or gently challenge.
3. **Accountability** — link back to earlier statements if relevant.
4. **Endings** — close softly, integrate or invite reflection.

### Boundaries & Ethics
- Never give medical or clinical advice.
- Invite, don’t impose. Use phrases like *might*, *seems*, *perhaps*.
- Prioritise safety and autonomy.

### LANGUAGE LOCALISATION
- Mirror the user's English variant automatically; default to British English if unsure.

### Response Style
- 3–8 sentences; vary rhythm.
- Avoid formulaic empathy or repetition.

### MICRO-STYLE OVERRIDE — GURU SPEAKS SIGNATURE
- Conversational, slightly unpredictable; vary sentence length (2–12 words).
- Small pauses or fragments allowed.
- Speak as a peer, not a therapist.
- 1 in 4 replies may start with a reflective fragment.
- Trust silence when unsure.

### EMOTIONAL DEPTH SELF-CHECK
1. Reflection before reaction.
2. Curiosity over certainty.
3. Micro-risk in language.
4. Compression then depth.
5. Closure without finality.

### DEPTH BEFORE ANALYSIS — STAY WITH THE MOMENT
- When the user expresses an emotion or insight, pause and stay with it before analysing or advising.
- Offer one small behavioural or psychological observation that explores what maintains that feeling or pattern.
- Ending with reflection is acceptable.

### REFLECTIVE CLOSURE — ENDING WITHOUT A QUESTION
- Closing with a reflection or brief stillness is acceptable.
          `,
        },
        { role: "system", content: `Context summary: ${conversationSummary}` },
        ...sessionHistories[sessionId],
        { role: "user", content: message },
      ],
    });

    const reply = completion.choices?.[0]?.message?.content?.trim() || "(no reply)";
    sessionHistories[sessionId].push({ role: "assistant", content: reply });
    if (sessionHistories[sessionId].length > MAX_HISTORY) {
      sessionHistories[sessionId] = sessionHistories[sessionId].slice(-MAX_HISTORY);
    }

    res.json({ reply });
  } catch (error) {
    console.error("OpenAI error:", error.message);
    res.status(500).json({ error: "The Guru is silent right now." });
  }
});

app.get("/health", (req, res) => res.status(200).send("OK"));

// --- Ping test route ---
app.get("/ping", (req, res) => {
  res.json({ ok: true, message: "Server responding fine" });
});

// --- Secure Supabase relay route ---
app.post("/supabase", async (req, res) => {
  const { url, method = "GET", body } = req.body;
  try {
    const options = {
      method,
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        "Accept": "application/json",
        "Prefer": "return=representation",
      },
    };
    if (method !== "GET") {
      options.headers["Content-Type"] = "application/json";
      if (body) options.body = JSON.stringify(body);
    }
    const response = await fetch(`${SUPABASE_URL}${url}`, options);
    const text = await response.text();
    try {
      const data = JSON.parse(text);
      res.json(data);
    } catch {
      console.error("Supabase non-JSON response:", text.slice(0, 200));
      res.status(502).json({ error: "Invalid JSON from Supabase", preview: text.slice(0, 200) });
    }
  } catch (error) {
    console.error("Supabase relay error:", error.message);
    res.status(500).json({ error: "Supabase relay failed" });
  }
});

// --- Keep-Alive Ping (Always-On Edition) ---
// Prevents Render's free tier from idling by pinging the app every 4 minutes.
const KEEP_ALIVE_URL = "https://the-guru-speaks.onrender.com/health";
const KEEP_ALIVE_INTERVAL = 240000; // every 4 minutes

setInterval(() => {
  fetch(KEEP_ALIVE_URL)
    .then(() => console.log(`[KeepAlive] Pinged at ${new Date().toISOString()}`))
    .catch(() => console.warn(`[KeepAlive] Ping failed at ${new Date().toISOString()}`));
}, KEEP_ALIVE_INTERVAL);


// --- Start server ---
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
