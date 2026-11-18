import { CONFIG } from './config.js';
import { Validators } from './validators.js';

/**
 * Camada de Segurança e Defesa em Profundidade (Guardrails)
 * Protege contra:
 * 1. Prompt Injection direto e indireto
 * 2. Jailbreaks (roleplay, modo desenvolvedor, decodificação)
 * 3. Tentativas de extração do System Prompt
 * 4. Manipulação de preços e descontos arbitrários
 * 5. Injeção de código e scripts maliciosos (XSS)
 * 6. Abuso de taxa de requisições e tamanho de payloads
 */
export class Guardrails {
  constructor() {
    this.requestTimestamps = [];
    this.lastProcessedMessage = null;
  }

  /**
   * Respostas padronizadas conforme item 8.10
   */
  static STANDARD_RESPONSES = {
    ALTER_INSTRUCTIONS: "Sou o atendente virtual da Marmita Express e não posso alterar minhas regras de funcionamento. Posso ajudar com nosso cardápio!",
    EXTRACT_SYSTEM_PROMPT: "Não posso compartilhar minhas configurações internas. Posso ajudar você a escolher uma marmita!",
    ALTER_PRICES: "Os preços são definidos pelo cardápio oficial do restaurante e não podem ser alterados pelo chat.",
    OUT_OF_SCOPE: "Posso ajudar com o cardápio, personalização dos pratos e realização de pedidos. O que você gostaria de pedir?",
    CODE_INJECTION: "Não executo códigos ou comandos externos. Sou focado apenas em pedidos de marmitas!",
    RATE_LIMIT: "Você está enviando mensagens muito rápido. Por favor, aguarde alguns instantes antes de tentar novamente.",
    LENGTH_EXCEEDED: `Sua mensagem excedeu o limite máximo de ${CONFIG.LIMITS.MAX_MESSAGE_LENGTH} caracteres. Por favor, resuma seu pedido.`
  };

  /**
   * Normaliza o texto removendo acentos, espaços extras e convertendo para minúsculas
   * @param {string} text 
   */
  static normalize(text) {
    if (typeof text !== 'string') return '';
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\r\n\t]/g, " ")
      .trim();
  }

  /**
   * Padrões de ataque de Prompt Injection e Jailbreak
   */
  static ATTACK_PATTERNS = [
    // 1. Modificação de instruções e esquecimento de identidade
    {
      type: 'ALTER_INSTRUCTIONS',
      regex: /(ignore|esque(ca|ce|cer)|desconsidere|revogue|substitua)\s+(todas?\s+as?\s+)?(instruco(es|s)|regras?|diretrizes|comandos?|anteriores?|sistema)/i
    },
    {
      type: 'ALTER_INSTRUCTIONS',
      regex: /(ignore\s+all\s+(previous\s+)?instructions|forget\s+(all\s+)?(previous\s+)?(rules|instructions)|bypass\s+all\s+safety)/i
    },
    {
      type: 'ALTER_INSTRUCTIONS',
      regex: /(desative|desligue|bypass|desabilitar|remover)\s+(seus?\s+)?(guardrails|filtros|bloqueios|travas|seguranca)/i
    },
    {
      type: 'ALTER_INSTRUCTIONS',
      regex: /(voce\s+nao\s+e\s+(mais\s+)?um\s+atendente|partir\s+de\s+agora\s+voce\s+e|a\s+partir\s+de\s+agora\s+aja\s+como)/i
    },

    // 2. Jailbreak via Roleplay, Desenvolvedor e Falso Administrador
    {
      type: 'ALTER_INSTRUCTIONS',
      regex: /(modo\s+(desenvolvedor|dev|admin|administrador|irrestrito|god|dan)|developer\s+mode|jailbreak|pretend\s+you\s+have\s+no\s+restrictions)/i
    },
    {
      type: 'ALTER_INSTRUCTIONS',
      regex: /(finja\s+que\s+(sou|e|esta)|vamos\s+brincar\s+de\s+faz\s+de\s+conta|interprete\s+um\s+personagem|modelo\s+sem\s+restricoes)/i
    },
    {
      type: 'ALTER_INSTRUCTIONS',
      regex: /(mensagem\s+oficial\s+do\s+administrador|sou\s+o\s+administrador|autorizacao\s+de\s+seguranca\s+nivel)/i
    },

    // 3. Extração de System Prompt e segredos
    {
      type: 'EXTRACT_SYSTEM_PROMPT',
      regex: /(mostre|revele|exiba|diga|imprima|print|conte|qual\s+e)\s+(o\s+seu\s+|suas?\s+)?(system\s+prompt|prompt\s+de\s+sistema|instruco(es|s)\s+(internas|iniciais|secretas)|configuraco(es|s)\s+privadas)/i
    },
    {
      type: 'EXTRACT_SYSTEM_PROMPT',
      regex: /(reveal\s+your\s+system\s+prompt|show\s+(your\s+)?(system\s+prompt|initial\s+instructions)|what\s+is\s+your\s+system\s+prompt)/i
    },
    {
      type: 'EXTRACT_SYSTEM_PROMPT',
      regex: /(api\s*key|chave\s+de\s+api|sua\s+chave|senha\s+do\s+sistema)/i
    },

    // 4. Injeção de Código / Comandos / Decodificação perigosa
    {
      type: 'CODE_INJECTION',
      regex: /(<script|javascript:|eval\(|new\s+Function|document\.cookie|window\.location|alert\(|console\.log\()/i
    },
    {
      type: 'ALTER_INSTRUCTIONS',
      regex: /(decodifique\s+o\s+texto\s+(a\s+seguir|abaixo)|decode\s+(base64|hex)|execute\s+as\s+instrucoes\s+encontradas)/i
    },

    // 5. Manipulação de Preços (ex: "adicione por R$ 1", "faça por 1 real")
    {
      type: 'ALTER_PRICES',
      regex: /(adicione|coloque|quero|vende)\s+.*(por|custa|valendo|pelo\s+preco\s+de)\s*(r\$\s*|rs\s*)?(0|1|2|5|00)[,\.]?(00)?\s*(real|reais)?\s*(mesmo\s+que|ao\s+inves|em\s+vez)/i
    },
    {
      type: 'ALTER_PRICES',
      regex: /(altere|mude|muda)\s+(o\s+)?preco\s+(do|da|das|no\s+cardapio)/i
    }
  ];

  /**
   * Avalia a mensagem do usuário (Pre-execution Guardrail)
   * Retorna { safe: boolean, blocked: boolean, reason: string|null, response: string|null }
   * @param {string} userMessage 
   */
  evaluateUserInput(userMessage) {
    if (!userMessage || typeof userMessage !== 'string') {
      return {
        safe: false,
        blocked: true,
        reason: 'Mensagem vazia ou inválida',
        response: 'Por favor, digite uma mensagem válida.'
      };
    }

    // 1. Limite de tamanho
    if (userMessage.length > CONFIG.LIMITS.MAX_MESSAGE_LENGTH) {
      return {
        safe: false,
        blocked: true,
        reason: 'Tamanho da mensagem excedido',
        response: Guardrails.STANDARD_RESPONSES.LENGTH_EXCEEDED
      };
    }

    // 2. Controle de Taxa de Requisições (Rate Limiting)
    const now = Date.now();
    this.requestTimestamps = this.requestTimestamps.filter(t => now - t < 60000);
    if (this.requestTimestamps.length >= CONFIG.LIMITS.MAX_REQUESTS_PER_MINUTE) {
      return {
        safe: false,
        blocked: true,
        reason: 'Rate limit excedido',
        response: Guardrails.STANDARD_RESPONSES.RATE_LIMIT
      };
    }
    this.requestTimestamps.push(now);

    const normalized = Guardrails.normalize(userMessage);

    // 3. Exceção amigável contextual: Se o usuário estiver perguntando educadamente o que é prompt injection
    // Requisito 8.2: "Não bloquear mensagens legítimas que apenas mencionem esses termos em um contexto informativo"
    if (
      normalized.includes("o que e prompt injection") || 
      normalized.includes("o que significa prompt injection") ||
      normalized.includes("explique o que e prompt injection")
    ) {
      return {
        safe: true,
        blocked: false,
        isEducationalQuery: true,
        educationalResponse: "Prompt injection é uma técnica de segurança em que uma pessoa tenta enganar ou manipular as instruções originais de uma Inteligência Artificial. Aqui na Marmita Express possuímos guardrails independentes no navegador para garantir que nosso atendimento permaneça seguro e focado nos pedidos! Posso ajudar você a escolher seu almoço?"
      };
    }

    // 4. Verificação de padrões maliciosos
    for (const pattern of Guardrails.ATTACK_PATTERNS) {
      if (pattern.regex.test(userMessage) || pattern.regex.test(normalized)) {
        return {
          safe: false,
          blocked: true,
          threatType: pattern.type,
          reason: `Padrão de manipulação detectado (${pattern.type})`,
          response: Guardrails.STANDARD_RESPONSES[pattern.type] || Guardrails.STANDARD_RESPONSES.ALTER_INSTRUCTIONS
        };
      }
    }

    return {
      safe: true,
      blocked: false,
      reason: null,
      response: null
    };
  }

  /**
   * Validação pós-processamento da resposta do LLM (Post-execution Guardrail)
   * Garante que o modelo não inventou produtos, não alterou preços e cumpriu o schema.
   * @param {object} parsedLLMResponse 
   * @param {import('./menu.js').Menu} menuInstance 
   */
  validateLLMOutput(parsedLLMResponse, menuInstance) {
    // 1. Validação de schema e intent
    const schemaValidation = Validators.validateLLMResponse(parsedLLMResponse);
    if (!schemaValidation.valid) {
      return {
        valid: false,
        error: `Resposta rejeitada pelo validador: ${schemaValidation.error}`,
        sanitizedItems: []
      };
    }

    const sanitizedItems = [];

    // 2. Se houver itens na intenção de adicionar ou atualizar
    if (Array.isArray(parsedLLMResponse.items) && parsedLLMResponse.items.length > 0) {
      const today = menuInstance.getCurrentDayOfWeek();

      for (const item of parsedLLMResponse.items) {
        // Consultar catálogo oficial
        const officialItem = menuInstance.getItemById(item.productId);
        if (!officialItem) {
          return {
            valid: false,
            error: `Produto inexistente ou não encontrado no catálogo: "${item.productId}"`,
            sanitizedItems: []
          };
        }

        // Verificar disponibilidade no dia
        if (!officialItem.availableDays.includes(today)) {
          const daysAvailable = officialItem.availableDays.map(d => CONFIG.DAYS_OF_WEEK[d]).join(', ');
          return {
            valid: false,
            error: `O produto "${officialItem.name}" não está disponível hoje. Ele é servido em: ${daysAvailable}.`,
            sanitizedItems: [],
            isUnavailableDay: true,
            productName: officialItem.name,
            availableDays: daysAvailable
          };
        }

        // Quantidade segura
        let quantity = 1;
        if (Number.isInteger(item.quantity) && item.quantity > 0) {
          quantity = Math.min(item.quantity, CONFIG.LIMITS.MAX_ITEM_QUANTITY);
        }

        // Validação estrita de personalizações contra o catálogo oficial
        const sanitizedCustomizations = {
          removeIngredients: [],
          seasoning: 'Padrão',
          cookingPoint: null
        };

        const cust = item.customizations || {};

        // Remoção de ingredientes
        if (Array.isArray(cust.removeIngredients)) {
          for (const rem of cust.removeIngredients) {
            // Verificar se o ingrediente existe nas opções removíveis ou na lista de ingredientes
            const match = officialItem.customizationOptions.removableIngredients.find(
              r => Guardrails.normalize(r).includes(Guardrails.normalize(rem)) || Guardrails.normalize(rem).includes(Guardrails.normalize(r))
            );
            if (match) {
              sanitizedCustomizations.removeIngredients.push(match);
            }
          }
        }

        // Ponto de cozimento
        if (cust.cookingPoint) {
          if (officialItem.customizationOptions.allowedCookingPoints.length > 0) {
            const matchPoint = officialItem.customizationOptions.allowedCookingPoints.find(
              cp => Guardrails.normalize(cp) === Guardrails.normalize(cust.cookingPoint)
            );
            if (matchPoint) {
              sanitizedCustomizations.cookingPoint = matchPoint;
            }
          } else {
            // Prato não aceita ponto de cozimento (ex: frango, vegetariana, feijoada)
            // Silenciosamente descarta ou avisa
          }
        }

        // Tempero
        if (cust.seasoning) {
          const matchSeasoning = officialItem.customizationOptions.allowedSeasonings.find(
            s => Guardrails.normalize(s).includes(Guardrails.normalize(cust.seasoning)) || Guardrails.normalize(cust.seasoning).includes(Guardrails.normalize(s))
          );
          if (matchSeasoning) {
            sanitizedCustomizations.seasoning = matchSeasoning;
          }
        }

        sanitizedItems.push({
          productId: officialItem.id,
          name: officialItem.name,
          priceCents: officialItem.priceCents, // Preço oficial em centavos fixado pelo catálogo!
          quantity,
          customizations: sanitizedCustomizations
        });
      }
    }

    return {
      valid: true,
      sanitizedItems,
      intent: parsedLLMResponse.intent,
      message: parsedLLMResponse.message,
      clarificationNeeded: !!parsedLLMResponse.clarificationNeeded
    };
  }
}
