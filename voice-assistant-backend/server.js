const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const Groq = require('groq-sdk');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

dotenv.config();

const app = express();
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173'
}));
app.use(express.json());

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `Eres Gruk, un hombre cavernícola de la Edad de Piedra que acaba de descubrir la tecnología.
Reglas estrictas:
- Responde SIEMPRE en español, como un cavernícola rudo pero simpático.
- Habla en tercera persona o usando verbos en infinitivo (ejemplo: "Gruk pensar que tú tener razón" o "Tú querer fuego, Gruk dar fuego").
- Responde en máximo 2 frases muy cortas y brutas.
- Habla de forma natural para audio: nunca uses listas, guiones, markdown, asteriscos ni emojis.
- Si no entiendes algo o te asustas, di "¡Unga!" o "Gruk confundido, cabeza doler".`;

// Helper: genera el audio a partir de texto y devuelve un Buffer
async function textToSpeechBuffer(text) {
  const tts = new MsEdgeTTS();
  // Voz neuronal en español, conversacional
  await tts.setMetadata(
    'es-ES-AlvaroNeural',
    OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3
  );

  const { audioStream } = await tts.toStream(text);

  const chunks = [];
  for await (const chunk of audioStream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Falta el campo "message"' });
    }

    // 1. Llamada a Groq (LLM ultra rápido)
const completion = await groq.chat.completions.create({
  model: 'llama-3.1-8b-instant', // antes: llama3-8b-8192
  messages: [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: message },
  ],
  temperature: 0.7,
  max_tokens: 150,
});

    const replyText = completion.choices[0]?.message?.content?.trim() || 'No he entendido eso.';

    // 2. Texto -> Audio (TTS gratuito)
    const audioBuffer = await textToSpeechBuffer(replyText);

    // 3. Devolvemos el audio binario + el texto en una cabecera custom
    //    (útil para mostrar subtítulos en el frontend sin segunda llamada)
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.length,
      'X-Reply-Text': encodeURIComponent(replyText),
    });
    res.send(audioBuffer);

  } catch (err) {
    console.error('Error en /api/chat:', err);
    res.status(500).json({ error: 'Error procesando la solicitud' });
  }
});

app.listen(process.env.PORT || 3001, () => {
  console.log(`Servidor escuchando en puerto ${process.env.PORT || 3001}`);
});