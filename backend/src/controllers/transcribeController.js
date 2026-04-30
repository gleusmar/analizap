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

    const baseUrl = "https://api.assemblyai.com";
    const headers = {
      authorization: ASSEMBLYAI_API_KEY,
    };

    // BUG23: Usar código fornecido pelo AssemblyAI
    const data = {
      audio_url: audioUrl,
      language_detection: true,
      speech_models: ["universal-3-pro", "universal-2"]
    };

    const url = `${baseUrl}/v2/transcript`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Erro na API AssemblyAI (upload):', errorText);
      throw new Error('Erro na transcrição via AssemblyAI');
    }

    const result = await response.json();
    const transcriptId = result.id;
    const pollingEndpoint = `${baseUrl}/v2/transcript/${transcriptId}`;

    // Poll para verificar se a transcrição está pronta
    let transcriptionResult = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      const pollingResponse = await fetch(pollingEndpoint, {
        headers: headers,
      });
      transcriptionResult = await pollingResponse.json();

      if (transcriptionResult.status === 'completed') {
        break;
      } else if (transcriptionResult.status === 'error') {
        throw new Error(`Transcrição falhou: ${transcriptionResult.error}`);
      }
    }

    if (!transcriptionResult || transcriptionResult.status !== 'completed') {
      throw new Error('Transcrição falhou - timeout');
    }
    
    res.json({ transcription: transcriptionResult.text });
  } catch (error) {
    logger.error('Erro ao transcrever áudio:', error);
    res.status(500).json({ error: 'Erro ao transcrever áudio' });
  }
}
