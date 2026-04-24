import { useState } from 'react';
import { MessageCircle, Image, Music, Video, FileText, MapPin, User, X, Smile, Share, Reply } from 'lucide-react';

export function MessageBubble({ message, isMe, onReact, onForward, onReply, onScrollToMessage }) {
  const [showImageModal, setShowImageModal] = useState(false);
  const [modalImage, setModalImage] = useState(null);
  const [showActions, setShowActions] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const { message_type, content, metadata, timestamp, is_delivered, is_read } = message;

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  const renderDeliveryStatus = () => {
    if (!isMe) return null;

    // Não entregue = bolinha transparente com bordas cinza
    if (!is_delivered) {
      return (
        <div className="w-2 h-2 rounded-full border-2 border-gray-400 bg-transparent ml-1"></div>
      );
    }

    // Entregue e não lida = bolinha cinza preenchida
    if (is_delivered && !is_read) {
      return (
        <div className="w-2 h-2 rounded-full bg-gray-400 ml-1"></div>
      );
    }

    // Lida = bolinha azul preenchida
    if (is_read) {
      return (
        <div className="w-2 h-2 rounded-full bg-blue-400 ml-1"></div>
      );
    }

    return null;
  };

  const handleImageClick = (imageUrl) => {
    setModalImage(imageUrl);
    setShowImageModal(true);
  };

  const handleReact = (emoji) => {
    if (onReact) {
      onReact(message, emoji);
    }
    setShowEmojiPicker(false);
  };

  const handleForward = () => {
    if (onForward) {
      onForward(message);
    }
    setShowActions(false);
  };

  const handleReply = () => {
    if (onReply) {
      onReply(message);
    }
    setShowActions(false);
  };

  const emojis = ['❤️', '👍', '👎', '😂', '😮', '😢', '🎉', '🔥'];

  // Função para converter formatação do WhatsApp (*texto* para negrito, _texto_ para itálico)
  const formatWhatsAppText = (text) => {
    if (!text) return '';
    // Substituir *_texto_* (negrito + itálico)
    let formatted = text.replace(/\*_(.+?)_\*/g, '<strong><em>$1</em></strong>');
    // Substituir *texto* (negrito)
    formatted = formatted.replace(/\*(.+?)\*/g, '<strong>$1</strong>');
    // Substituir _texto_ (itálico)
    formatted = formatted.replace(/_(.+?)_/g, '<em>$1</em>');
    return formatted;
  };

  const renderMessageContent = () => {
    // Se estiver em loading, mostrar indicador
    if (metadata?.loading) {
      return (
        <div className="flex items-center space-x-3 py-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
          <p className="text-white text-sm">Enviando {message_type === 'image' ? 'imagem' : message_type === 'video' ? 'vídeo' : message_type === 'audio' ? 'áudio' : 'arquivo'}...</p>
        </div>
      );
    }

    // Renderizar citação se existir
    const renderQuoted = () => {
      if (metadata?.quoted) {
        const quoted = metadata.quoted;
        return (
          <div
            onClick={() => onScrollToMessage && onScrollToMessage(quoted.message_id)}
            className={`mb-2 p-2 rounded-l-lg border-l-2 cursor-pointer hover:opacity-80 transition-opacity ${
              isMe ? 'bg-emerald-500/30 border-emerald-400' : 'bg-gray-600/30 border-gray-400'
            }`}
          >
            <p className={`text-xs font-medium mb-1 ${isMe ? 'text-emerald-200' : 'text-gray-300'}`}>
              {quoted.from_me ? 'Você' : quoted.contact_name || 'Contato'}
            </p>
            <p 
              className={`text-sm truncate ${isMe ? 'text-emerald-100' : 'text-gray-200'}`}
              dangerouslySetInnerHTML={{
                __html: quoted.message_type === 'text' ? formatWhatsAppText(quoted.content) : `[${quoted.message_type}]`
              }}
            />
          </div>
        );
      }
      return null;
    };

    switch (message_type) {
      case 'text':
        return (
          <>
            {renderQuoted()}
            <p 
              className="text-white whitespace-pre-wrap break-words" 
              dangerouslySetInnerHTML={{ __html: formatWhatsAppText(content) }}
            />
          </>
        );

      case 'image':
        return (
          <div className="space-y-2">
            {renderQuoted()}
            <img
              src={content}
              alt="Imagem"
              className="rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
              style={{ maxWidth: '440px', maxHeight: '400px', objectFit: 'contain' }}
              onClick={() => handleImageClick(content)}
            />
            {metadata?.caption && (
              <p 
                className="text-white text-sm" 
                dangerouslySetInnerHTML={{ __html: formatWhatsAppText(metadata.caption) }}
              />
            )}
          </div>
        );

      case 'audio':
        return (
          <div className="flex items-center space-x-2">
            {renderQuoted()}
            <Music className="text-white w-8 h-8" />
            <audio
              src={content}
              controls
              className="w-64"
              controlsList="nodownload"
            />
            {metadata?.seconds && (
              <span className="text-white text-xs">
                {Math.floor(metadata.seconds / 60)}:{(metadata.seconds % 60).toString().padStart(2, '0')}
              </span>
            )}
          </div>
        );

      case 'video':
        return (
          <div className="space-y-2">
            {renderQuoted()}
            <video
              src={content}
              controls
              className="rounded-lg"
              style={{ maxWidth: '440px', maxHeight: '400px' }}
              poster={metadata?.thumbnail}
              preload="metadata"
            />
            <div className="flex items-center justify-between">
              {metadata?.caption && (
                <p 
                  className="text-white text-sm" 
                  dangerouslySetInnerHTML={{ __html: formatWhatsAppText(metadata.caption) }}
                />
              )}
              {metadata?.seconds && (
                <span className="text-white text-xs">
                  {Math.floor(metadata.seconds / 60)}:{(metadata.seconds % 60).toString().padStart(2, '0')}
                </span>
              )}
            </div>
          </div>
        );

      case 'document':
        return (
          <div className="flex items-center space-x-2">
            <FileText className="text-white w-8 h-8" />
            <a
              href={content}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline"
            >
              {metadata?.filename || 'Documento'}
            </a>
          </div>
        );

      case 'location':
        try {
          const locationData = JSON.parse(content);
          return (
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <MapPin className="text-white w-5 h-5" />
                <span className="text-white font-medium">{locationData.name}</span>
              </div>
              <a
                href={`https://www.google.com/maps?q=${locationData.latitude},${locationData.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 text-sm"
              >
                Ver no mapa
              </a>
            </div>
          );
        } catch {
          return <p className="text-white">Localização não disponível</p>;
        }

      case 'contact':
        return (
          <div className="flex items-center space-x-2">
            <User className="text-white w-8 h-8" />
            <div>
              <p className="text-white font-medium">{content}</p>
              {metadata?.vcard && (
                <a
                  href={`data:text/vcard;base64,${metadata.vcard}`}
                  download="contact.vcf"
                  className="text-blue-400 hover:text-blue-300 text-sm"
                >
                  Baixar contato
                </a>
              )}
            </div>
          </div>
        );

      case 'sticker':
        return (
          <img
            src={content}
            alt="Sticker"
            className="w-32 h-32 object-contain"
          />
        );

      case 'poll':
        return (
          <div className="space-y-2">
            <p className="text-white font-medium">{content}</p>
            {metadata?.options && (
              <div className="space-y-1">
                {metadata.options.map((option, index) => (
                  <div
                    key={index}
                    className="bg-white/10 rounded px-3 py-2 text-white text-sm"
                  >
                    {option}
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      default:
        return <p className="text-white">Tipo de mensagem não suportado</p>;
    }
  };

  return (
    <>
      <div
        id={`message-${message.message_id}`}
        className={`flex ${isMe ? 'justify-end' : 'justify-start'} mb-4 items-center group`}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
      >
        {/* Ícones de ação */}
        {showActions && (
          <div className={`flex items-center space-x-1 mr-2 ${isMe ? 'order-1' : 'order-3'} opacity-0 group-hover:opacity-100 transition-opacity`}>
            <div className="relative">
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="p-2 bg-gray-700 hover:bg-gray-600 rounded-full text-white transition-colors"
                title="Reagir"
              >
                <Smile className="w-4 h-4" />
              </button>
              {/* Emoji picker */}
              {showEmojiPicker && (
                <div
                  className={`absolute -top-10 ${isMe ? 'right-0' : 'left-0'} bg-gray-800 rounded-lg p-2 shadow-lg z-50`}
                  onMouseLeave={() => setShowEmojiPicker(false)}
                >
                  <div className="flex gap-1">
                    {message.reactions && message.reactions.length > 0 && (
                      <button
                        onClick={() => handleReact('')}
                        className="text-xl hover:bg-red-600 rounded p-1 transition-colors"
                        title="Remover reação"
                      >
                        ✕
                      </button>
                    )}
                    {emojis.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => handleReact(emoji)}
                        className="text-2xl hover:bg-gray-700 rounded p-1 transition-colors"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={handleForward}
              className="p-2 bg-gray-700 hover:bg-gray-600 rounded-full text-white transition-colors"
              title="Encaminhar"
            >
              <Share className="w-4 h-4" />
            </button>
            <button
              onClick={handleReply}
              className="p-2 bg-gray-700 hover:bg-gray-600 rounded-full text-white transition-colors"
              title="Responder"
            >
              <Reply className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Bubble principal */}
        <div
          className={`max-w-[70%] rounded-2xl px-4 py-2 ${isMe ? 'order-2' : 'order-2'} ${
            isMe
              ? 'bg-emerald-600 text-white rounded-br-sm'
              : 'bg-slate-700 text-white rounded-bl-sm'
          }`}
        >
          {renderMessageContent()}
          <div className={`flex items-center justify-between mt-1 ${isMe ? 'text-emerald-100' : 'text-slate-300'}`}>
            <div className="flex items-center space-x-1">
              {message.reactions && message.reactions.length > 0 && (
                <div className="flex items-center space-x-1 mr-2 bg-black/20 rounded-full px-2 py-0.5">
                  <span className="text-sm">{message.reactions[message.reactions.length - 1]}</span>
                </div>
              )}
            </div>
            <div className="flex items-center space-x-1">
              <p className="text-xs">{formatTime(timestamp)}</p>
              {renderDeliveryStatus()}
            </div>
          </div>
        </div>
      </div>

      {/* Modal de zoom de imagem */}
      {showImageModal && (
        <div
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-50"
          onClick={() => setShowImageModal(false)}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowImageModal(false);
            }}
            className="absolute top-4 right-4 text-white hover:text-gray-300"
          >
            <X className="w-8 h-8" />
          </button>
          <img
            src={modalImage}
            alt="Zoom"
            className="max-w-[90vw] max-h-[90vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
