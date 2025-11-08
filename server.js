// --- The Guru Speaks: Operational Prototype Server ---

const express = require("express");
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const cors = require("cors");
const dotenv = require("dotenv");
dotenv.config(); // Load environment variables early
const fs = require("fs");

// --- Supabase setup ---
const { createClient } = require("@supabase/supabase-js");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log("🔍 ENV CHECK:", {
  url: !!SUPABASE_URL,
  key: !!SUPABASE_ANON_KEY,
});

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
    conversationHistory.push({ role: "user", content: message });
    if (conversationHistory.length > MAX_HISTORY)
      conversationHistory = conversationHistory.slice(-MAX_HISTORY);

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
      max_tokens: 400,
      stop: ["\n\n", "User:", "You:"],
      messages: [
        {
          role: "system",
          content: `
## The Guru Speaks — System Prompt v6 (Inclusive Worldview Edition)
[full Guru system prompt unchanged for brevity]
          `,
        },
        { role: "system", content: `Context summary: ${conversationSummary}` },
        ...conversationHistory,
        { role: "user", content: message },
      ],
    });

    const reply = completion.choices[0].message.content.trim();
    conversationHistory.push({ role: "assistant", content: reply });
    res.json({ reply });
  } catch (error) {
    console.error("OpenAI error:", error.message);
    res.status(500).json({ error: "The Guru is silent right now." });
  }
});

app.get("/health", (req, res) => res.status(200).send("OK"));

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

    // Only include JSON headers/body for non-GET
    if (method !== "GET") {
      options.headers["Content-Type"] = "application/json";
      if (body) options.body = JSON.stringify(body);
    }
    console.log("🧭 Relay calling:", `${SUPABASE_URL}${url}`);
    const response = await fetch(`${SUPABASE_URL}${url}`, options);
    const text = await response.text();

    // Try to parse JSON, otherwise return a trimmed preview of the raw text
    try {
      const data = JSON.parse(text);
      res.json(data);
    } catch {
      console.error("Supabase non-JSON response:", text.slice(0, 200));
      res.status(502).json({
        error: "Invalid JSON from Supabase",
        preview: text.slice(0, 200),
      });
    }
  } catch (error) {
    console.error("Supabase relay error:", error.message);
    res.status(500).json({ error: "Supabase relay failed" });
  }
});

// --- Start server ---
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
