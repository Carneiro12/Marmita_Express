import { CONFIG } from './config.js';
import { Pricing } from './pricing.js';

/**
 * Gerenciador de Pedidos e Carrinho de Compras
 * Independente do LLM - Controla estado, persistência local e integridade dos itens.
 */
export class OrderManager {
  /**
   * @param {import('./menu.js').Menu} menuInstance 
   */
  constructor(menuInstance) {
    this.menu = menuInstance;
    this.items = [];
    this.listeners = [];
    this.loadFromStorage();
  }

  /**
   * Registra listener para atualização de estado na UI
   * @param {Function} callback 
   */
  subscribe(callback) {
    if (typeof callback === 'function') {
      this.listeners.push(callback);
    }
  }

  /**
   * Notifica listeners sobre mudanças no carrinho
   */
  notify() {
    this.saveToStorage();
    const summary = this.getSummary();
    for (const listener of this.listeners) {
      try {
        listener(this.items, summary);
      } catch (err) {
        console.error("Erro ao notificar listener do carrinho:", err);
      }
    }
  }

  /**
   * Salva carrinho no LocalStorage (apenas dados não sensíveis)
   */
  saveToStorage() {
    try {
      localStorage.setItem(CONFIG.STORAGE_KEYS.CART, JSON.stringify(this.items));
    } catch (e) {
      console.warn("Não foi possível salvar no LocalStorage:", e);
    }
  }

  /**
   * Carrega carrinho do LocalStorage com validação contra o cardápio oficial
   */
  loadFromStorage() {
    try {
      const saved = localStorage.getItem(CONFIG.STORAGE_KEYS.CART);
      if (!saved) return;
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return;

      this.items = [];
      for (const item of parsed) {
        const official = this.menu.getItemById(item.productId);
        if (official) {
          this.items.push({
            cartItemId: item.cartItemId || this.generateCartItemId(),
            productId: official.id,
            name: official.name,
            priceCents: official.priceCents,
            quantity: Math.max(1, Math.min(item.quantity || 1, CONFIG.LIMITS.MAX_ITEM_QUANTITY)),
            customizations: item.customizations || { removeIngredients: [], seasoning: 'Padrão', cookingPoint: null }
          });
        }
      }
    } catch (e) {
      console.warn("Erro ao restaurar carrinho:", e);
      this.items = [];
    }
  }

  /**
   * Gera um ID único para cada item no carrinho
   */
  generateCartItemId() {
    return 'cart_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
  }

  /**
   * Compara se duas customizações são idênticas para agrupar itens no carrinho
   */
  areCustomizationsEqual(c1, c2) {
    if (!c1 && !c2) return true;
    if (!c1 || !c2) return false;

    const r1 = (c1.removeIngredients || []).slice().sort().join(',');
    const r2 = (c2.removeIngredients || []).slice().sort().join(',');
    const s1 = c1.seasoning || 'Padrão';
    const s2 = c2.seasoning || 'Padrão';
    const p1 = c1.cookingPoint || null;
    const p2 = c2.cookingPoint || null;

    return r1 === r2 && s1 === s2 && p1 === p2;
  }

  /**
   * Adiciona um item ao carrinho
   * @param {string} productId 
   * @param {number} quantity 
   * @param {object} customizations 
   * @returns {{ success: boolean, message: string, item?: object }}
   */
  addToCart(productId, quantity = 1, customizations = {}) {
    const official = this.menu.getItemById(productId);
    if (!official) {
      return { success: false, message: `Produto ${productId} não encontrado no cardápio.` };
    }

    const qty = Number.isInteger(quantity) && quantity > 0 ? quantity : 1;

    // Verificar se já existe item idêntico no carrinho
    const existingIndex = this.items.findIndex(
      it => it.productId === productId && this.areCustomizationsEqual(it.customizations, customizations)
    );

    if (existingIndex >= 0) {
      const newQty = this.items[existingIndex].quantity + qty;
      if (newQty > CONFIG.LIMITS.MAX_ITEM_QUANTITY) {
        return {
          success: false,
          message: `Limite de ${CONFIG.LIMITS.MAX_ITEM_QUANTITY} marmitas deste tipo excedido por pedido.`
        };
      }
      this.items[existingIndex].quantity = newQty;
    } else {
      const newItem = {
        cartItemId: this.generateCartItemId(),
        productId: official.id,
        name: official.name,
        priceCents: official.priceCents,
        quantity: Math.min(qty, CONFIG.LIMITS.MAX_ITEM_QUANTITY),
        customizations: {
          removeIngredients: customizations.removeIngredients || [],
          seasoning: customizations.seasoning || 'Padrão',
          cookingPoint: customizations.cookingPoint || null
        }
      };
      this.items.push(newItem);
    }

    this.notify();
    return {
      success: true,
      message: `${qty}x ${official.name} adicionado(a) com sucesso!`
    };
  }

  /**
   * Remove um item do carrinho pelo cartItemId ou productId
   * @param {string} identifier (cartItemId ou productId)
   */
  removeFromCart(identifier) {
    if (!identifier) return { success: false, message: "Identificador não informado." };

    const initialLen = this.items.length;
    // Tenta primeiro por cartItemId
    this.items = this.items.filter(item => item.cartItemId !== identifier);
    
    // Se não removeu, tenta por productId
    if (this.items.length === initialLen) {
      this.items = this.items.filter(item => item.productId !== identifier);
    }

    if (this.items.length < initialLen) {
      this.notify();
      return { success: true, message: "Item removido do carrinho." };
    }
    return { success: false, message: "Item não encontrado no carrinho." };
  }

  /**
   * Atualiza a quantidade de um item no carrinho
   * @param {string} cartItemId 
   * @param {number} newQuantity 
   */
  updateQuantity(cartItemId, newQuantity) {
    const item = this.items.find(it => it.cartItemId === cartItemId || it.productId === cartItemId);
    if (!item) {
      return { success: false, message: "Item não encontrado." };
    }

    if (!Number.isInteger(newQuantity) || newQuantity <= 0) {
      return this.removeFromCart(item.cartItemId);
    }

    item.quantity = Math.min(newQuantity, CONFIG.LIMITS.MAX_ITEM_QUANTITY);
    this.notify();
    return { success: true, message: `Quantidade atualizada para ${item.quantity}.` };
  }

  /**
   * Limpa todos os itens do carrinho
   */
  clearCart() {
    this.items = [];
    this.notify();
    return { success: true, message: "Carrinho esvaziado." };
  }

  /**
   * Retorna os itens do carrinho
   */
  getItems() {
    return [...this.items];
  }

  /**
   * Retorna o resumo financeiro calculado pelo módulo de preços
   */
  getSummary() {
    return Pricing.calculateOrderSummary(this.items);
  }

  /**
   * Formata texto legível do carrinho para o atendente apresentar ao cliente
   */
  getFormattedCartText() {
    if (this.items.length === 0) {
      return "Seu carrinho está vazio no momento. Que tal dar uma olhada no nosso cardápio de hoje?";
    }

    const summary = this.getSummary();
    let text = "🛒 *Seu Pedido Atual:*\n\n";

    this.items.forEach((item, index) => {
      const itemSubtotal = Pricing.formatCents(item.priceCents * item.quantity);
      text += `${index + 1}. **${item.quantity}x ${item.name}** - ${itemSubtotal}\n`;
      
      const customNotes = [];
      if (item.customizations.removeIngredients && item.customizations.removeIngredients.length > 0) {
        customNotes.push(`Sem: ${item.customizations.removeIngredients.join(', ')}`);
      }
      if (item.customizations.seasoning && item.customizations.seasoning !== 'Padrão') {
        customNotes.push(`Tempero: ${item.customizations.seasoning}`);
      }
      if (item.customizations.cookingPoint) {
        customNotes.push(`Ponto: ${item.customizations.cookingPoint}`);
      }

      if (customNotes.length > 0) {
        text += `   ↳ _Personalização:_ ${customNotes.join(' | ')}\n`;
      }
    });

    text += `\nSubtotal: ${summary.subtotalFormatted}`;
    text += `\nTaxa de Entrega: ${summary.deliveryFeeFormatted}`;
    text += `\n**Total Final: ${summary.totalFormatted}**`;

    return text;
  }
}
