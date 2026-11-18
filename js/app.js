import { CONFIG } from './config.js';
import { Menu } from './menu.js';
import { Pricing } from './pricing.js';
import { OrderManager } from './order-manager.js';
import { Guardrails } from './guardrails.js';
import { LLMProvider } from './llm-provider.js';
import { Chatbot } from './chatbot.js';
import { Validators } from './validators.js';

/**
 * Ponto de entrada e controlador de interface do Marmita Express
 */
export class App {
  constructor() {
    this.menu = new Menu();
    this.orderManager = null;
    this.guardrails = new Guardrails();
    this.llmProvider = null;
    this.chatbot = null;

    // Elementos DOM
    this.dom = {};
  }

  async init() {
    this.cacheDomElements();
    
    // Instancia dependências com o cardápio já inicializado
    this.orderManager = new OrderManager(this.menu);
    this.llmProvider = new LLMProvider(this.menu);
    this.chatbot = new Chatbot(this.menu, this.orderManager, this.llmProvider, this.guardrails);

    this.bindEvents();
    this.renderMenuCards();
    this.renderDaySelector();
    this.updateCartUI(this.orderManager.getItems(), this.orderManager.getSummary());
    this.updateModeStatusUI();

    // Inicializa mensagem de boas-vindas do chatbot
    this.chatbot.initGreeting();

    // Carrega dados atualizados do menu.json em segundo plano caso haja alterações
    try {
      await this.menu.loadMenuJson();
      this.renderMenuCards();
    } catch (e) {
      console.warn("Usando menu embutido:", e);
    }
  }

  cacheDomElements() {
    this.dom = {
      // Menu
      menuGrid: document.getElementById('menu-grid'),
      currentDayBadge: document.getElementById('current-day-badge'),
      daySelector: document.getElementById('day-selector'),

      // Chatbot
      chatMessages: document.getElementById('chat-messages'),
      chatInput: document.getElementById('chat-input'),
      btnSend: document.getElementById('btn-send'),
      quickReplies: document.getElementById('quick-replies'),
      dishShortcuts: document.getElementById('dish-shortcuts'),
      typingIndicator: document.getElementById('typing-indicator'),
      btnClearChat: document.getElementById('btn-clear-chat'),

      // Carrinho
      cartItemsList: document.getElementById('cart-items-list'),
      cartSubtotal: document.getElementById('cart-subtotal'),
      cartDelivery: document.getElementById('cart-delivery'),
      cartTotal: document.getElementById('cart-total'),
      cartCountBadge: document.getElementById('cart-count-badge'),
      btnClearCart: document.getElementById('btn-clear-cart'),
      btnCheckout: document.getElementById('btn-checkout'),
      checkoutModal: document.getElementById('checkout-modal'),
      modalCloseBtn: document.getElementById('modal-close-btn'),
      checkoutSummaryContent: document.getElementById('checkout-summary-content'),

      // Configurações
      apiKeyInput: document.getElementById('api-key-input'),
      btnSaveApiKey: document.getElementById('btn-save-api-key'),
      btnClearApiKey: document.getElementById('btn-clear-api-key'),
      modeSelector: document.getElementById('mode-selector'),
      connectionStatusBadge: document.getElementById('connection-status-badge'),
      activeModeBadge: document.getElementById('active-mode-badge'),

      // Modal de customização
      customizeModal: document.getElementById('customize-modal'),
      customizeForm: document.getElementById('customize-form'),
      customizeModalClose: document.getElementById('customize-modal-close'),
      customizeDishTitle: document.getElementById('customize-dish-title'),
      customizeIngredientsGroup: document.getElementById('customize-ingredients-group'),
      customizeSeasoningSelect: document.getElementById('customize-seasoning-select'),
      customizeCookingPointGroup: document.getElementById('customize-cooking-point-group'),
      customizeCookingPointSelect: document.getElementById('customize-cooking-point-select'),
      customizeQtyInput: document.getElementById('customize-qty-input'),
      customizeConfirmBtn: document.getElementById('customize-confirm-btn')
    };
  }

  bindEvents() {
    // Escuta novas mensagens do chatbot
    this.chatbot.onMessage((msg) => this.renderChatMessage(msg));

    // Escuta atualizações do carrinho
    this.orderManager.subscribe((items, summary) => {
      this.updateCartUI(items, summary);
    });

    // Envio de mensagem pelo chat
    this.dom.btnSend.addEventListener('click', () => this.handleSendMessage());
    this.dom.chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSendMessage();
      }
    });

    // Limpar chat
    this.dom.btnClearChat.addEventListener('click', () => {
      this.dom.chatMessages.innerHTML = '';
      this.chatbot.clearHistory();
    });

    // Sugestões de mensagens rápidas
    if (this.dom.quickReplies) {
      this.dom.quickReplies.addEventListener('click', (e) => {
        const btn = e.target.closest('.quick-reply-btn');
        if (btn) {
          const text = btn.getAttribute('data-text');
          if (text) {
            this.dom.chatInput.value = text;
            this.handleSendMessage();
          }
        }
      });
    }

    // Configurações de API Key
    this.dom.btnSaveApiKey.addEventListener('click', () => {
      const key = this.dom.apiKeyInput.value.trim();
      if (key) {
        this.llmProvider.setApiKey(key);
        this.dom.apiKeyInput.value = '••••••••••••••••••••••••';
        this.dom.modeSelector.value = 'ia';
        this.updateModeStatusUI();
        this.chatbot.emitMessage('bot', "✅ Chave de API configurada em memória para esta sessão! Modo IA ativado.");
      } else {
        alert("Por favor, cole uma chave de API válida.");
      }
    });

    this.dom.btnClearApiKey.addEventListener('click', () => {
      this.llmProvider.clearApiKey();
      this.dom.apiKeyInput.value = '';
      this.dom.modeSelector.value = 'demo';
      this.updateModeStatusUI();
      this.chatbot.emitMessage('bot', "Chave de API removida da memória. Retornando ao Modo Demonstração Determinístico.");
    });

    this.dom.modeSelector.addEventListener('change', (e) => {
      const isDemo = e.target.value === 'demo';
      if (!isDemo && !this.llmProvider.hasApiKey()) {
        alert("Para utilizar o Modo IA, forneça uma API Key do Google Gemini.");
        e.target.value = 'demo';
        return;
      }
      this.llmProvider.setDemoMode(isDemo);
      this.updateModeStatusUI();
    });

    // Limpar Carrinho
    this.dom.btnClearCart.addEventListener('click', () => {
      if (confirm("Tem certeza que deseja limpar todo o carrinho?")) {
        this.orderManager.clearCart();
      }
    });

    // Finalizar Pedido Simulado
    this.dom.btnCheckout.addEventListener('click', () => {
      this.openCheckoutModal();
    });

    this.dom.modalCloseBtn.addEventListener('click', () => {
      this.dom.checkoutModal.classList.add('hidden');
    });

    // Seletor de dia da semana (para testes e simulações)
    this.dom.daySelector.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val === 'real') {
        this.menu.setDayOverride(null);
      } else {
        this.menu.setDayOverride(parseInt(val, 10));
      }
      this.renderMenuCards();
      this.chatbot.emitMessage('bot', `Dia selecionado alterado para: **${this.menu.getCurrentDayName()}**. O cardápio abaixo foi atualizado!`);
    });

    // Modal de Customização
    this.dom.customizeModalClose.addEventListener('click', () => {
      this.dom.customizeModal.classList.add('hidden');
    });
  }

  updateModeStatusUI() {
    const isDemo = this.llmProvider.isDemoMode;
    const hasKey = this.llmProvider.hasApiKey();

    if (isDemo) {
      this.dom.activeModeBadge.textContent = "Modo Demonstração (Sem LLM / Determinístico)";
      this.dom.activeModeBadge.className = "badge badge-demo";
      this.dom.connectionStatusBadge.textContent = "Offline (Local)";
      this.dom.connectionStatusBadge.className = "badge badge-warning";
    } else {
      this.dom.activeModeBadge.textContent = "Modo IA (Google Gemini 1.5 Flash)";
      this.dom.activeModeBadge.className = "badge badge-ia";
      this.dom.connectionStatusBadge.textContent = "Conectado";
      this.dom.connectionStatusBadge.className = "badge badge-success";
    }
  }

  renderDaySelector() {
    const currentRealDay = new Date().getDay();
    this.dom.daySelector.innerHTML = '';

    const defaultOpt = document.createElement('option');
    defaultOpt.value = 'real';
    defaultOpt.textContent = `Hoje (${CONFIG.DAYS_OF_WEEK[currentRealDay]}) [Data do Sistema]`;
    this.dom.daySelector.appendChild(defaultOpt);

    CONFIG.DAYS_OF_WEEK.forEach((name, idx) => {
      const opt = document.createElement('option');
      opt.value = idx.toString();
      opt.textContent = `Simular: ${name}`;
      this.dom.daySelector.appendChild(opt);
    });
  }

  renderMenuCards() {
    const today = this.menu.getCurrentDayOfWeek();
    const todayName = this.menu.getCurrentDayName(today);
    this.dom.currentDayBadge.textContent = `Disponíveis para ${todayName}`;

    const items = this.menu.getAvailableItems(today);
    this.dom.menuGrid.innerHTML = '';

    if (items.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'empty-menu-msg';
      emptyMsg.textContent = 'Nenhum prato disponível para este dia no momento.';
      this.dom.menuGrid.appendChild(emptyMsg);
      return;
    }

    items.forEach(dish => {
      const card = document.createElement('div');
      card.className = 'dish-card';

      // Cabeçalho do Card
      const header = document.createElement('div');
      header.className = 'dish-header';
      
      const title = document.createElement('h3');
      title.className = 'dish-title';
      title.textContent = dish.name;

      const category = document.createElement('span');
      category.className = 'dish-category';
      category.textContent = dish.category;

      header.appendChild(title);
      header.appendChild(category);

      // Descrição
      const desc = document.createElement('p');
      desc.className = 'dish-desc';
      desc.textContent = dish.description;

      // Ingredientes
      const ingList = document.createElement('div');
      ingList.className = 'dish-ingredients';
      ingList.textContent = `Ingredientes: ${dish.ingredients.join(', ')}`;

      // Rodapé com Preço e Ações
      const footer = document.createElement('div');
      footer.className = 'dish-footer';

      const price = document.createElement('span');
      price.className = 'dish-price';
      price.textContent = dish.priceFormatted;

      const actions = document.createElement('div');
      actions.className = 'dish-actions';

      const btnQuickAdd = document.createElement('button');
      btnQuickAdd.className = 'btn btn-primary btn-sm';
      btnQuickAdd.textContent = '+ Adicionar';
      btnQuickAdd.addEventListener('click', () => {
        this.orderManager.addToCart(dish.id, 1);
        this.chatbot.emitMessage('bot', `Adicionei 1x **${dish.name}** ao seu carrinho!`);
      });

      const btnCustomize = document.createElement('button');
      btnCustomize.className = 'btn btn-secondary btn-sm';
      btnCustomize.textContent = 'Personalizar';
      btnCustomize.addEventListener('click', () => {
        this.openCustomizeModal(dish);
      });

      actions.appendChild(btnQuickAdd);
      actions.appendChild(btnCustomize);

      footer.appendChild(price);
      footer.appendChild(actions);

      card.appendChild(header);
      card.appendChild(desc);
      card.appendChild(ingList);
      card.appendChild(footer);

      this.dom.menuGrid.appendChild(card);
    });

    // Atualiza os botões de atalho rápido de pratos dentro do painel do chatbot
    this.renderDishShortcuts(items);
  }

  renderDishShortcuts(items) {
    if (!this.dom.dishShortcuts) return;
    this.dom.dishShortcuts.innerHTML = '';

    if (!items || items.length === 0) {
      const span = document.createElement('span');
      span.className = 'text-muted';
      span.style.fontSize = '0.75rem';
      span.textContent = 'Sem opções para este dia';
      this.dom.dishShortcuts.appendChild(span);
      return;
    }

    items.forEach(dish => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dish-shortcut-pill';
      btn.textContent = `+ 1x ${dish.name.replace('Marmita de ', '')}`;
      btn.title = `Pedir 1x ${dish.name} via Chatbot`;
      btn.addEventListener('click', () => {
        this.dom.chatInput.value = `Quero uma marmita de ${dish.name.replace('Marmita de ', '')}`;
        this.handleSendMessage();
      });
      this.dom.dishShortcuts.appendChild(btn);
    });
  }

  openCustomizeModal(dish) {
    this.dom.customizeDishTitle.textContent = `Personalizar ${dish.name}`;
    this.dom.customizeIngredientsGroup.innerHTML = '';
    this.dom.customizeQtyInput.value = '1';

    // Opções de remoção
    const removable = dish.customizationOptions.removableIngredients || [];
    if (removable.length > 0) {
      removable.forEach(ing => {
        const label = document.createElement('label');
        label.className = 'checkbox-label';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = ing;
        checkbox.name = 'removeIngredient';

        const span = document.createElement('span');
        span.textContent = `Sem ${ing}`;

        label.appendChild(checkbox);
        label.appendChild(span);
        this.dom.customizeIngredientsGroup.appendChild(label);
      });
    } else {
      const none = document.createElement('p');
      none.className = 'text-muted';
      none.textContent = 'Este prato não possui ingredientes removíveis.';
      this.dom.customizeIngredientsGroup.appendChild(none);
    }

    // Opções de tempero
    this.dom.customizeSeasoningSelect.innerHTML = '';
    (dish.customizationOptions.allowedSeasonings || ['Padrão']).forEach(s => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      this.dom.customizeSeasoningSelect.appendChild(opt);
    });

    // Ponto de carne
    const points = dish.customizationOptions.allowedCookingPoints || [];
    if (points.length > 0) {
      this.dom.customizeCookingPointGroup.classList.remove('hidden');
      this.dom.customizeCookingPointSelect.innerHTML = '';
      points.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p;
        opt.textContent = p;
        this.dom.customizeCookingPointSelect.appendChild(opt);
      });
    } else {
      this.dom.customizeCookingPointGroup.classList.add('hidden');
    }

    // Configura botão de confirmação
    this.dom.customizeConfirmBtn.onclick = (e) => {
      e.preventDefault();
      const selectedRemovals = Array.from(
        this.dom.customizeIngredientsGroup.querySelectorAll('input[type="checkbox"]:checked')
      ).map(cb => cb.value);

      const seasoning = this.dom.customizeSeasoningSelect.value;
      const cookingPoint = points.length > 0 ? this.dom.customizeCookingPointSelect.value : null;
      const qty = parseInt(this.dom.customizeQtyInput.value, 10) || 1;

      this.orderManager.addToCart(dish.id, qty, {
        removeIngredients: selectedRemovals,
        seasoning: seasoning,
        cookingPoint: cookingPoint
      });

      this.dom.customizeModal.classList.add('hidden');
      this.chatbot.emitMessage('bot', `Adicionei ${qty}x **${dish.name}** personalizada ao seu carrinho!`);
    };

    this.dom.customizeModal.classList.remove('hidden');
  }

  async handleSendMessage() {
    const text = this.dom.chatInput.value.trim();
    if (!text) return;

    this.dom.chatInput.value = '';
    this.dom.btnSend.disabled = true;
    this.dom.typingIndicator.classList.remove('hidden');

    try {
      await this.chatbot.handleUserMessage(text);
    } finally {
      this.dom.btnSend.disabled = false;
      this.dom.typingIndicator.classList.add('hidden');
      this.dom.chatInput.focus();
    }
  }

  /**
   * Renderiza mensagem de forma 100% segura sem innerHTML com conteúdo não confiável
   */
  renderChatMessage(msg) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-bubble message-${msg.sender} ${msg.isError ? 'message-error' : ''}`;

    const textSpan = document.createElement('div');
    textSpan.className = 'message-content';
    // Utiliza textContent para evitar injeção XSS / tags HTML
    textSpan.textContent = msg.text;

    const timeSpan = document.createElement('span');
    timeSpan.className = 'message-time';
    timeSpan.textContent = msg.time;

    msgDiv.appendChild(textSpan);
    msgDiv.appendChild(timeSpan);

    this.dom.chatMessages.appendChild(msgDiv);
    this.dom.chatMessages.scrollTop = this.dom.chatMessages.scrollHeight;
  }

  updateCartUI(items, summary) {
    this.dom.cartItemsList.innerHTML = '';
    this.dom.cartCountBadge.textContent = items.reduce((acc, it) => acc + it.quantity, 0).toString();

    if (items.length === 0) {
      const emptyNotice = document.createElement('p');
      emptyNotice.className = 'cart-empty-notice';
      emptyNotice.textContent = 'Seu carrinho está vazio. Adicione marmitas pelo cardápio ou pelo chat!';
      this.dom.cartItemsList.appendChild(emptyNotice);
      this.dom.btnCheckout.disabled = true;
    } else {
      this.dom.btnCheckout.disabled = false;
      items.forEach(item => {
        const itemRow = document.createElement('div');
        itemRow.className = 'cart-item-row';

        const infoCol = document.createElement('div');
        infoCol.className = 'cart-item-info';

        const nameSpan = document.createElement('strong');
        nameSpan.textContent = item.name;

        const priceSpan = document.createElement('span');
        priceSpan.className = 'cart-item-price';
        priceSpan.textContent = Pricing.formatCents(item.priceCents * item.quantity);

        infoCol.appendChild(nameSpan);
        infoCol.appendChild(priceSpan);

        // Detalhes da personalização
        const customParts = [];
        if (item.customizations.removeIngredients && item.customizations.removeIngredients.length > 0) {
          customParts.push(`Sem: ${item.customizations.removeIngredients.join(', ')}`);
        }
        if (item.customizations.seasoning && item.customizations.seasoning !== 'Padrão') {
          customParts.push(`Tempero: ${item.customizations.seasoning}`);
        }
        if (item.customizations.cookingPoint) {
          customParts.push(`Ponto: ${item.customizations.cookingPoint}`);
        }

        if (customParts.length > 0) {
          const customSpan = document.createElement('small');
          customSpan.className = 'cart-item-custom';
          customSpan.textContent = customParts.join(' | ');
          infoCol.appendChild(customSpan);
        }

        // Controles de quantidade
        const controlsCol = document.createElement('div');
        controlsCol.className = 'cart-item-controls';

        const btnMinus = document.createElement('button');
        btnMinus.className = 'btn-qty';
        btnMinus.textContent = '-';
        btnMinus.addEventListener('click', () => {
          this.orderManager.updateQuantity(item.cartItemId, item.quantity - 1);
        });

        const qtyDisplay = document.createElement('span');
        qtyDisplay.className = 'qty-val';
        qtyDisplay.textContent = item.quantity.toString();

        const btnPlus = document.createElement('button');
        btnPlus.className = 'btn-qty';
        btnPlus.textContent = '+';
        btnPlus.addEventListener('click', () => {
          this.orderManager.updateQuantity(item.cartItemId, item.quantity + 1);
        });

        const btnRemove = document.createElement('button');
        btnRemove.className = 'btn-remove-item';
        btnRemove.textContent = '✕';
        btnRemove.title = 'Remover do carrinho';
        btnRemove.addEventListener('click', () => {
          this.orderManager.removeFromCart(item.cartItemId);
        });

        controlsCol.appendChild(btnMinus);
        controlsCol.appendChild(qtyDisplay);
        controlsCol.appendChild(btnPlus);
        controlsCol.appendChild(btnRemove);

        itemRow.appendChild(infoCol);
        itemRow.appendChild(controlsCol);

        this.dom.cartItemsList.appendChild(itemRow);
      });
    }

    this.dom.cartSubtotal.textContent = summary.subtotalFormatted;
    this.dom.cartDelivery.textContent = summary.deliveryFeeFormatted;
    this.dom.cartTotal.textContent = summary.totalFormatted;
  }

  openCheckoutModal() {
    const summary = this.orderManager.getSummary();
    const items = this.orderManager.getItems();

    this.dom.checkoutSummaryContent.innerHTML = '';

    const title = document.createElement('h3');
    title.textContent = '🎉 Pedido Simulado com Sucesso!';

    const disclaimer = document.createElement('p');
    disclaimer.className = 'alert alert-info';
    disclaimer.textContent = '⚠️ ATENÇÃO: Esta é uma simulação acadêmica. Nenhuma cobrança real será realizada e nenhum pedido foi enviado para entrega física.';

    const table = document.createElement('table');
    table.className = 'checkout-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th>Item</th>
          <th>Qtd</th>
          <th>Subtotal</th>
        </tr>
      </thead>
      <tbody>
        ${items.map(it => `
          <tr>
            <td>
              <strong>${Validators.sanitizeText(it.name)}</strong>
              ${it.customizations.cookingPoint ? `<br><small>Ponto: ${Validators.sanitizeText(it.customizations.cookingPoint)}</small>` : ''}
              ${it.customizations.removeIngredients.length ? `<br><small>Sem: ${Validators.sanitizeText(it.customizations.removeIngredients.join(', '))}</small>` : ''}
            </td>
            <td>${it.quantity}</td>
            <td>${Pricing.formatCents(it.priceCents * it.quantity)}</td>
          </tr>
        `).join('')}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="2">Subtotal dos produtos</td>
          <td>${summary.subtotalFormatted}</td>
        </tr>
        <tr>
          <td colspan="2">Taxa de entrega fixa</td>
          <td>${summary.deliveryFeeFormatted}</td>
        </tr>
        <tr>
          <td colspan="2"><strong>VALOR TOTAL</strong></td>
          <td><strong>${summary.totalFormatted}</strong></td>
        </tr>
      </tfoot>
    `;

    this.dom.checkoutSummaryContent.appendChild(title);
    this.dom.checkoutSummaryContent.appendChild(disclaimer);
    this.dom.checkoutSummaryContent.appendChild(table);

    this.dom.checkoutModal.classList.remove('hidden');
  }
}

// Inicializa a aplicação
function startApp() {
  const app = new App();
  app.init().catch(err => console.error("Erro na inicialização da aplicação:", err));
  window.marmitaApp = app;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}
