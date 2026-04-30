import { logger } from '../utils/logger.js';

// BUG8/BUG23: Endpoint para transcrição de áudio usando AssemblyAI (gratuito)
export async function transcribeAudio(req, res) {
  try {
    const { audioUrl } = req.body;

    if (!audioUrl) {
      return res.status(400).json({ error: 'audioUrl é obrigatório' });
    }

    // AssemblyAI API key (configurar no .env)
    const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;
    if (!ASSEMBLYAI_API_KEY) {
      logger.error('ASSEMBLYAI_API_KEY não configurada');
      return res.status(500).json({ error: 'Serviço de transcrição não configurado' });
    }

    // Enviar URL para AssemblyAI (mais eficiente que baixar)
    const uploadResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
      method: 'POST',
      headers: {
        'Authorization': ASSEMBLYAI_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        audio_url: audioUrl,
        language_code: 'pt' // Português
      })
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      logger.error('Erro na API AssemblyAI:', errorText);
      throw new Error('Erro na transcrição via AssemblyAI');
    }

    const uploadResult = await uploadResponse.json();
    const transcriptId = uploadResult.id;

    // Poll para verificar se a transcrição está pronta
    let transcript = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const statusResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
        headers: { 'Authorization': ASSEMBLYAI_API_KEY }
      });
      transcript = await statusResponse.json();
      if (transcript.status === 'completed' || transcript.status === 'error') {
        break;
      }
    }

    if (!transcript || transcript.status === 'error') {
      throw new Error('Transcrição falhou');
    }
    
    res.json({ transcription: transcript.text });
  } catch (error) {
    logger.error('Erro ao transcrever áudio:', error);
    res.status(500).json({ error: 'Erro ao transcrever áudio' });
  }
}
