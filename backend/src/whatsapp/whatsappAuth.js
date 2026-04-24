import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

/**
 * Implementação customizada de auth state para Baileys usando Supabase
 * Salva credenciais e chaves no banco de dados
 */
export class WhatsAppAuth {
  constructor(sessionId = 'default') {
    this.sessionId = sessionId;
  }

  /**
   * Salva as credenciais no banco de dados
   */
  async saveCreds(creds) {
    try {
      const { error } = await supabase
        .from('whatsapp_auth')
        .upsert({
          session_id: this.sessionId,
          creds: creds,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'session_id'
        });

      if (error) {
        console.error('Erro ao salvar credenciais:', error);
        throw error;
      }

      console.log('Credenciais salvas com sucesso');
    } catch (error) {
      console.error('Erro ao salvar credenciais:', error);
      throw error;
    }
  }

  /**
   * Carrega as credenciais do banco de dados
   */
  async loadCreds() {
    try {
      const { data, error } = await supabase
        .from('whatsapp_auth')
        .select('creds')
        .eq('session_id', this.sessionId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // Não encontrado, retorna null
          return null;
        }
        console.error('Erro ao carregar credenciais:', error);
        throw error;
      }

      return data?.creds || null;
    } catch (error) {
      console.error('Erro ao carregar credenciais:', error);
      throw error;
    }
  }

  /**
   * Salva uma chave de criptografia
   */
  async saveKey(type, id, value) {
    try {
      const { error } = await supabase
        .from('whatsapp_keys')
        .upsert({
          session_id: this.sessionId,
          type,
          id,
          value,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'session_id,type,id'
        });

      if (error) {
        console.error('Erro ao salvar chave:', error);
        throw error;
      }
    } catch (error) {
      console.error('Erro ao salvar chave:', error);
      throw error;
    }
  }

  /**
   * Carrega uma chave de criptografia
   */
  async loadKey(type, id) {
    try {
      const { data, error } = await supabase
        .from('whatsapp_keys')
        .select('value')
        .eq('session_id', this.sessionId)
        .eq('type', type)
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // Não encontrado, retorna null
          return null;
        }
        console.error('Erro ao carregar chave:', error);
        throw error;
      }

      return data?.value || null;
    } catch (error) {
      console.error('Erro ao carregar chave:', error);
      throw error;
    }
  }

  /**
   * Remove todas as chaves de um tipo específico
   */
  async removeKeys(type) {
    try {
      const { error } = await supabase
        .from('whatsapp_keys')
        .delete()
        .eq('session_id', this.sessionId)
        .eq('type', type);

      if (error) {
        console.error('Erro ao remover chaves:', error);
        throw error;
      }
    } catch (error) {
      console.error('Erro ao remover chaves:', error);
      throw error;
    }
  }

  /**
   * Remove todas as credenciais e chaves
   */
  async clear() {
    try {
      // Remove credenciais
      const { error: credsError } = await supabase
        .from('whatsapp_auth')
        .delete()
        .eq('session_id', this.sessionId);

      if (credsError) {
        console.error('Erro ao remover credenciais:', credsError);
        throw credsError;
      }

      // Remove todas as chaves
      const { error: keysError } = await supabase
        .from('whatsapp_keys')
        .delete()
        .eq('session_id', this.sessionId);

      if (keysError) {
        console.error('Erro ao remover chaves:', keysError);
        throw keysError;
      }

      console.log('Credenciais e chaves removidas com sucesso');
    } catch (error) {
      console.error('Erro ao limpar auth:', error);
      throw error;
    }
  }
}

/**
 * Cria um auth state compatível com Baileys
 */
export async function createAuthState(sessionId = 'default') {
  const auth = new WhatsAppAuth(sessionId);

  const state = {
    creds: await auth.loadCreds(),
    keys: {
      get: async (type, ids) => {
        const results = {};
        for (const id of ids) {
          const value = await auth.loadKey(type, id);
          if (value) {
            results[id] = value;
          }
        }
        return results;
      },
      set: async (data) => {
        for (const type in data) {
          for (const id in data[type]) {
            await auth.saveKey(type, id, data[type][id]);
          }
        }
      },
      remove: async (type, ids) => {
        if (ids) {
          for (const id of ids) {
            const { error } = await supabase
              .from('whatsapp_keys')
              .delete()
              .eq('session_id', sessionId)
              .eq('type', type)
              .eq('id', id);

            if (error) {
              console.error('Erro ao remover chave:', error);
            }
          }
        } else {
          await auth.removeKeys(type);
        }
      }
    },
    saveCreds: async () => {
      await auth.saveCreds(state.creds);
    }
  };

  return state;
}
