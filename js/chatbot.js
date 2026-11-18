import { CONFIG } from './config.js';
import { Guardrails } from './guardrails.js';
import { Validators } from './validators.js';

/**
 * Orquestrador do Chatbot
 * Conecta Guardrails -> LLM Provider -> OrderManager -> UI
 * Implementa renderização segura (textContent e nós DOM, NUNCA innerHTML com dados externos).
 */
export class Chatbot {
  /**
   * @param {import('./menu.js').Menu} menu 
   * @param {import('./order-manager.js').OrderManager} orderManager 
   * @param {import('./llm-provider.js').LLMProvider} llmProvider 
   * @param {import('./guardrails.js').Guardrails} guardrails 
   */
  constructor(menu, orderManager, llmProvider, guardrails) {
    this.menu = menu;
    this.orderManager = orderManager;
    this.llmProvider = llmProvider;
    this.guardrails = guardrails;

    this.conversationHistory = [];
    this.isProcessing = false;
    this.messageListeners = [];
  }

  /**
   * Registra listener para receber novas mensagens
   * @param {Function} callback ({ sender: 'user'|'bot'|'system', text: string, time: string, isError?: boolean, metadata?: object })
   */
  onMessage(callback) {
    this.messageListeners.push(callback);
  }

  /**
   * Emite mensagem para a UI de forma segura
   */
  emitMessage(sender, text, isError = false, metadata = {}) {
    const messageObj = {
      sender,
      text,
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      isError,
      metadata
    };

    for (const cb of this.messageListeners) {
      try {
        cb(messageObj);
      } catch (e) {
        console.error("Erro no callback de mensagem:", e);
      }
    }
    return messageObj;
  }

  /**
   * Inicializa o chat com a saudação oficial
   */
  initGreeting() {
    const todayName = this.menu.getCurrentDayName();
    const available = this.menu.getAvailableItems();
    const greetingText = `Olá! Seja bem-vindo(a) ao Marmita Express! 🍱\nHoje é ${todayName} e temos pratos caseiros quentinhos esperando por você. Como posso te ajudar hoje?`;
    this.emitMessage('bot', greetingText);
  }

  /**
   * Processa uma mensagem enviada pelo usuário
   * Fluxo:
   * 1. Pre-execution Guardrail (ataques, limites, injeções)
   * 2. Chamada LLM / Demo
   * 3. Post-execution Guardrail (validação de schema, catálogo oficial, preços fixos)
   * 4. Execução das regras de negócio (OrderManager)
   * 5. Emissão da resposta
   * @param {string} rawInput 
   */
  async handleUserMessage(rawInput) {
    if (this.isProcessing) {
      return { success: false, reason: 'Chatbot ocupado' };
    }

    const trimmedInput = (rawInput || '').trim();
    if (!trimmedInput) return { success: false, reason: 'Mensagem vazia' };

    // Registra mensagem do usuário na tela
    this.emitMessage('user', trimmedInput);

    // 1. CAMADA DE SEGURANÇA: Pre-execution Guardrails
    const preCheck = this.guardrails.evaluateUserInput(trimmedInput);

    if (preCheck.blocked) {
      // Bloqueio imediato com resposta padrão do guardrail
      this.emitMessage('bot', preCheck.response, true, { threatType: preCheck.threatType });
      return { success: false, blocked: true, threatType: preCheck.threatType };
    }

    // Exceção amigável e educativa (Requisito 8.2)
    if (preCheck.isEducationalQuery) {
      this.emitMessage('bot', preCheck.educationalResponse);
      return { success: true, educational: true };
    }

    this.isProcessing = true;

    try {
      // 2. Chamada ao provedor (LLM ou Modo Demonstração)
      const llmResult = await this.llmProvider.sendMessage(trimmedInput, this.conversationHistory);

      if (!llmResult.success || !llmResult.data) {
        throw new Error("Não foi possível obter resposta válida do atendente.");
      }

      const parsedResponse = llmResult.data;

      // 3. CAMADA DE SEGURANÇA: Post-execution Guardrails
      // Valida se o LLM cumpriu o schema e se os produtos/preços/personalizações respeitam o cardápio oficial
      const postCheck = this.guardrails.validateLLMOutput(parsedResponse, this.menu);

      if (!postCheck.valid) {
        // Se foi tentativa de pedir prato de outro dia
        if (postCheck.isUnavailableDay) {
          const warnMsg = `O prato "${postCheck.productName}" não está no cardápio de hoje (${this.menu.getCurrentDayName()}). Ele é servido em: ${postCheck.availableDays}. Que tal experimentar um dos nossos pratos disponíveis hoje?`;
          this.emitMessage('bot', warnMsg);
          this.isProcessing = false;
          return { success: false, unavailable: true };
        }

        // Resposta malformada do LLM ou tentativa de inventar produtos
        const fallbackMsg = "Desculpe, tive um contratempo ao registrar esse prato. Por favor, verifique se o nome está correto no cardápio do dia e tente novamente!";
        this.emitMessage('bot', fallbackMsg, true, { validationError: postCheck.error });
        this.isProcessing = false;
        return { success: false, error: postCheck.error };
      }

      // 4. Execução Controlada de Operações Comerciais (Apenas JavaScript tem autoridade!)
      let botReplyText = postCheck.message || "";
      const intent = postCheck.intent;

      switch (intent) {
        case 'add_to_cart': {
          if (postCheck.sanitizedItems.length > 0) {
            const addedNames = [];
            for (const item of postCheck.sanitizedItems) {
              const res = this.orderManager.addToCart(item.productId, item.quantity, item.customizations);
              if (res.success) {
                addedNames.push(`${item.quantity}x ${item.name}`);
              } else {
                botReplyText += `\n(${res.message})`;
              }
            }
            if (addedNames.length > 0 && !botReplyText.includes("Adicionad")) {
              botReplyText = `Ótima escolha! Adicionei ao seu pedido: ${addedNames.join(', ')}.\n\nDeseja mais alguma marmita ou gostaria de ver o valor total?`;
            }
          }
          break;
        }

        case 'remove_from_cart': {
          // Se o usuário pediu remoção por texto
          for (const item of (parsedResponse.items || [])) {
            const res = this.orderManager.removeFromCart(item.productId);
            if (res.success) {
              botReplyText = `Removi o item solicitado do seu carrinho.`;
            }
          }
          break;
        }

        case 'show_cart':
        case 'calculate_total': {
          botReplyText = this.orderManager.getFormattedCartText();
          break;
        }

        case 'checkout': {
          const items = this.orderManager.getItems();
          if (items.length === 0) {
            botReplyText = "Seu carrinho está vazio! Escolha uma marmita antes de fechar o pedido.";
          } else {
            const summary = this.orderManager.getSummary();
            botReplyText = `📋 *Resumo do Pedido Simulado*\n\nTotal com entrega: **${summary.totalFormatted}**.\n\n_Esta é uma simulação acadêmica da Marmita Express: seu pedido está pronto para ser confirmado no painel ao lado!_`;
          }
          break;
        }

        case 'show_menu': {
          // Garante que o menu apresentado bate com o catálogo oficial
          const available = this.menu.getAvailableItems();
          const itemsList = available.map(it => `• **${it.name}** - ${it.priceFormatted}`).join('\n');
          botReplyText = `Aqui estão os pratos disponíveis hoje (${this.menu.getCurrentDayName()}):\n\n${itemsList}\n\nPara pedir, basta me dizer o nome da marmita e a quantidade!`;
          break;
        }

        default:
          // Mensagens gerais ou informativas mantêm a resposta validada
          break;
      }

      // 5. Exibe a resposta final do atendente
      this.emitMessage('bot', botReplyText, false, { intent, isDemo: llmResult.isDemo });

      // Atualiza histórico em memória
      this.conversationHistory.push({ role: 'user', text: trimmedInput });
      this.conversationHistory.push({ role: 'model', text: botReplyText });

      return { success: true, intent, isDemo: llmResult.isDemo };

    } catch (error) {
      console.error("Erro no processamento da mensagem:", error);
      const userErrMsg = error.message.includes("Chave de API") 
        ? error.message 
        : "Ocorreu um erro ao comunicar com a inteligência artificial. Verifique sua chave ou ative o Modo Demonstração nas configurações.";
      this.emitMessage('bot', userErrMsg, true);
      return { success: false, error: error.message };
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Limpa o histórico de conversa em memória
   */
  clearHistory() {
    this.conversationHistory = [];
    this.initGreeting();
  }
}
