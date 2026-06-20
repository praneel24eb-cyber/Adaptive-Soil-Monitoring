// ─── Groq AI Service ─────────────────────────────────────────────────────
// Handles Groq Chat Completions (llama-3.3-70b-versatile) and
// Groq Whisper transcription for voice input.
//
// Usage:
//   askGroq(question, latestReading, history, apiKey)  → string response
//   transcribeAudio(audioUri, apiKey)                  → string transcript

const GROQ_BASE    = 'https://api.groq.com/openai/v1';
const CHAT_MODEL   = 'llama-3.3-70b-versatile';
const WHISPER_MODEL = 'whisper-large-v3';

// ─── Chat Completions ─────────────────────────────────────────────────────

/**
 * Send a question to Groq Chat with full soil context as system prompt.
 * @param {string} question       - User's natural language question
 * @param {object|null} reading   - Latest MQTT sensor reading
 * @param {Array}  history        - Recent reading history array
 * @param {string} apiKey         - Groq API key
 * @returns {Promise<string>}     - AI response text
 */
export async function askGroq(question, reading, history, apiKey) {
  if (!apiKey) throw new Error('Groq API key is not set. Go to Settings to add it.');

  const systemPrompt = buildSystemPrompt(reading, history);

  const response = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: question },
      ],
      max_tokens: 800,
      temperature: 0.65,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  return (data.choices?.[0]?.message?.content ?? '').trim();
}

// ─── Whisper Transcription ────────────────────────────────────────────────

/**
 * Transcribe a locally recorded audio file via Groq Whisper.
 * @param {string} audioUri  - expo-av local file URI (e.g. file:///tmp/recording.m4a)
 * @param {string} apiKey    - Groq API key
 * @returns {Promise<string>} - Transcribed text
 */
export async function transcribeAudio(audioUri, apiKey) {
  if (!apiKey) throw new Error('Groq API key is not set. Go to Settings to add it.');

  const formData = new FormData();
  // React Native FormData accepts an object with uri/name/type for file fields
  formData.append('file', {
    uri:  audioUri,
    name: 'recording.m4a',
    type: 'audio/m4a',
  });
  formData.append('model',           WHISPER_MODEL);
  formData.append('response_format', 'json');
  formData.append('language',        'en');

  const response = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
    method: 'POST',
    headers: {
      // Do NOT set Content-Type — let fetch set multipart/form-data boundary automatically
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Whisper error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  return (data.text ?? '').trim();
}

// ─── System Prompt Builder ────────────────────────────────────────────────

function buildSystemPrompt(reading, history) {
  const BASE = `You are an expert agricultural AI assistant embedded in a real-time IoT soil monitoring system.
You help farmers understand soil fertility, make fertilization decisions, and recommend suitable crops.
Be concise (3–6 sentences or use bullet points). Use emojis sparingly for clarity.
Give specific, data-driven, actionable recommendations based on the actual sensor readings provided.`;

  if (!reading) {
    return `${BASE}

No live sensor data is available yet. The device may not be connected to the MQTT broker.
Politely note this when relevant and suggest connecting to the broker.`;
  }

  const stats = computeRecentStats(history);
  const trend = computeTrend(history);

  return `${BASE}

=== LIVE SOIL SENSOR DATA (most recent reading) ===
• Nitrogen (N):      ${reading.N  ?? 'N/A'} mg/kg
• Phosphorus (P):    ${reading.P  ?? 'N/A'} mg/kg
• Potassium (K):     ${reading.K  ?? 'N/A'} mg/kg
• Soil Moisture:     ${reading.moisture ?? 'N/A'}%
• Temperature:       ${reading.temp ?? 'N/A'}°C
• Fertility Class:   ${reading.class ?? 'Unknown'}
• CUSUM Drift Score: ${reading.cusum != null ? Number(reading.cusum).toFixed(2) : 'N/A'}
• Drift Alert:       ${reading.drift ? '⚠️ YES — depletion trend detected' : 'No active drift'}

=== HISTORICAL AVERAGES (last ${Math.min(history.length, 20)} readings) ===
${stats}
Trend: ${trend}

Reason directly from this sensor data. For crop recommendations, match NPK levels and moisture to crop requirements.`;
}

function computeRecentStats(history) {
  if (!history || history.length === 0) return 'No history available yet.';
  const last = history.slice(-20);
  const avg = key => {
    const vals = last.map(r => parseFloat(r[key])).filter(v => !isNaN(v));
    return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : 'N/A';
  };
  return `Avg N: ${avg('N')} mg/kg | Avg P: ${avg('P')} mg/kg | Avg K: ${avg('K')} mg/kg | Avg Moisture: ${avg('moisture')}% | Avg Temp: ${avg('temp')}°C`;
}

function computeTrend(history) {
  if (!history || history.length < 5) return 'Insufficient data for trend analysis.';
  const recent = history.slice(-5);
  const delta  = (key) => (parseFloat(recent[4][key]) || 0) - (parseFloat(recent[0][key]) || 0);
  const parts  = [];
  const nD = delta('N'), kD = delta('K'), mD = delta('moisture');
  if (Math.abs(nD) > 10) parts.push(`N ${nD > 0 ? '↑ rising' : '↓ falling'}`);
  if (Math.abs(kD) > 10) parts.push(`K ${kD > 0 ? '↑ rising' : '↓ falling'}`);
  if (Math.abs(mD) > 5)  parts.push(`Moisture ${mD > 0 ? '↑ rising' : '↓ falling'}`);
  return parts.length ? parts.join(', ') + '.' : 'All values stable.';
}
