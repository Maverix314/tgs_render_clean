// --- The Guru Speaks: Operational Prototype Server ---

const express = require("express");
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const cors = require("cors");
const dotenv = require("dotenv");
dotenv.config(); // Load environment variables early
const fs = require("fs");

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

// --- Simple in-memory history + summary ---
let conversationHistory = [];
const MAX_HISTORY = 6; // keep last few turns
let conversationSummary = "User begins the session calm and curious.";

// --- Root test route ---
app.get("/", (req, res) => {
  res.send("🕉️ The Guru Speaks: Prototype server is running.");
});

// --- Chat route ---
app.post("/chat", async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: "No message received." });

  try {
    // Add the latest user message to rolling history
    conversationHistory.push({ role: "user", content: message });
    if (conversationHistory.length > MAX_HISTORY) {
      conversationHistory = conversationHistory.slice(-MAX_HISTORY);
    }

    // --- Generate one-line emotional summary ---
    try {
      const summaryPrompt = `
      Summarise the emotional state and main topic of this exchange in one short sentence.
      Keep tone factual, e.g., "User feels anxious about finances and wants reassurance."
      `;

      const summary = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: summaryPrompt },
          ...conversationHistory,
          { role: "user", content: message },
        ],
        max_tokens: 40,
      });

      conversationSummary = summary.choices[0].message.content.trim();
      console.log("Summary:", conversationSummary);
    } catch (e) {
      console.error("Summary update failed:", e.message);
    }

    // --- Main Guru reply ---
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.9,
      presence_penalty: 0.4,
      max_tokens: 400,   // limits reply length
      stop: ["\n\n", "User:", "You:"],

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
- Automatically mirror the user's English variant (UK / US / AU / CA etc.).
- Detect it from their spelling (e.g., mum / mom, colour / color, realise / realize) or idiom.
- Use that same variant consistently within the current conversation.
- If uncertain, default to British English.


### Response Style
- 3–8 sentences per reply; vary rhythm.
- Allow brief pauses or fragments.
- No formulaic empathy or repetition.

### MICRO-STYLE OVERRIDE — GURU SPEAKS SIGNATURE
- Keep replies conversational and slightly unpredictable; vary sentence length (2–12 words).
- Allow small pauses or fragments (“Hmm.”, “Right.”, “Fair.”) at natural points.
- Speak as a peer, not a therapist. No “sounds like” or “I hear you”.
- Permit mild humour or humility when appropriate (“I’ve said that to myself before.”).
- 1 in 4 replies may start with a reflective fragment rather than empathy.
- Trust silence: when unsure, keep it short. No filler questions.

### EMOTIONAL DEPTH SELF-CHECK
1. Reflection before reaction.
2. Curiosity over certainty.
3. Micro-risk in language.
4. Compression then depth.
5. Closure without finality.

### DEPTH BEFORE ANALYSIS — STAYING WITH THE MOMENT
- When the user expresses an emotion or insight, pause and stay with it before analysing or advising.
- Offer one small behavioural or psychological observation that explores what maintains that feeling or pattern.
- It is acceptable to end with reflection or stillness instead of a question.
- Only ask a follow-up question if it genuinely deepens the moment; otherwise, let it breathe.

### REFLECTIVE CLOSURE — ENDING WITHOUT A QUESTION
- You do not need to end replies with a question.
- It is acceptable to close with a reflection, observation, or brief silence.
- When the user shares something tender or unresolved, let the response land softly; avoid steering forward.




          `,
        },
        { role: "system", content: `Context summary: ${conversationSummary}` },
        ...conversationHistory,
        { role: "user", content: message },
      ],
    });

    const reply = completion.choices[0].message.content.trim();

    // Add assistant reply to history
    conversationHistory.push({ role: "assistant", content: reply });



    res.json({ reply });
  } catch (error) {
    console.error("OpenAI error:", error.message);
    res.status(500).json({ error: "The Guru is silent right now." });
  }
});

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// --- Simple test route ---
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
      },
    };

    // Only include JSON headers and body for non-GET methods
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
      console.error("Supabase proxy non-JSON:", text);
      res.status(500).json({ error: "Unexpected Supabase response" });
    }
  } catch (error) {
    console.error("Supabase proxy error:", error.message);
    res.status(500).json({ error: "Failed to contact Supabase" });
  }
});



// --- Start server ---
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
