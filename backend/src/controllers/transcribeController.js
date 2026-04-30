import { logger } from '../utils/logger.js';

// BUG8: Endpoint para transcrição de áudio usando Groq API (gratuita)
export async function transcribeAudio(req, res) {
  try {
    const { audioUrl } = req.body;

    if (!audioUrl) {
      return res.status(400).json({ error: 'audioUrl é obrigatório' });
    }

    // Groq API key (configurar no .env)
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) {
      logger.error('GROQ_API_KEY não configurada');
      return res.status(500).json({ error: 'Serviço de transcrição não configurado' });
    }

    // Baixar áudio da URL
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new Error('Falha ao baixar áudio');
    }
    const audioBuffer = await audioResponse.arrayBuffer();
    const audioBlob = new Blob([audioBuffer], { type: 'audio/webm' });

    // Enviar para Groq Whisper API
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', 'whisper-large-v3');
    formData.append('response_format', 'json');

    const groqResponse = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: formData
    });

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      logger.error('Erro na API Groq:', errorText);
      throw new Error('Erro na transcrição via Groq');
    }

    const result = await groqResponse.json();
    
    res.json({ transcription: result.text });
  } catch (error) {
    logger.error('Erro ao transcrever áudio:', error);
    res.status(500).json({ error: 'Erro ao transcrever áudio' });
  }
}
