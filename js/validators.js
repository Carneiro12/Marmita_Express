import { CONFIG } from './config.js';

/**
 * Validador de dados, schemas e sanitização
 */
export class Validators {
  /**
   * Intenções permitidas conforme requisito 8.6
   */
  static ALLOWED_INTENTS = [
    'greeting',
    'show_menu',
    'ask_price',
    'ask_availability',
    'add_to_cart',
    'remove_from_cart',
    'update_quantity',
    'customize_product',
    'show_cart',
    'calculate_total',
    'checkout',
    'general_restaurant_question'
  ];

  /**
   * Valida se uma intenção retornada pelo LLM é permitida
   * @param {string} intent 
   */
  static isValidIntent(intent) {
    return typeof intent === 'string' && this.ALLOWED_INTENTS.includes(intent.trim());
  }

  /**
   * Valida a estrutura JSON do LLM (Schema Validation)
   * Formato esperado:
   * {
   *   "intent": string,
   *   "message": string,
   *   "items": [ { productId: string, quantity: number, customizations: object } ],
   *   "clarificationNeeded": boolean,
   *   "targetItemIndex": number | null
   * }
   */
  static validateLLMResponse(json) {
    if (!json || typeof json !== 'object' || Array.isArray(json)) {
      return { valid: false, error: 'Resposta não é um objeto JSON válido' };
    }

    if (!this.isValidIntent(json.intent)) {
      return { valid: false, error: `Intenção inválida ou não autorizada: ${json.intent}` };
    }

    if (typeof json.message !== 'string') {
      return { valid: false, error: 'Propriedade "message" deve ser uma string' };
    }

    if (json.items !== undefined && !Array.isArray(json.items)) {
      return { valid: false, error: 'Propriedade "items" deve ser um array se informada' };
    }

    // Se houver itens, validar cada um
    if (Array.isArray(json.items)) {
      for (let i = 0; i < json.items.length; i++) {
        const item = json.items[i];
        if (!item || typeof item !== 'object') {
          return { valid: false, error: `Item ${i} malformado` };
        }
        if (typeof item.productId !== 'string' || item.productId.trim() === '') {
          return { valid: false, error: `Item ${i} com productId inválido` };
        }
        if (item.quantity !== undefined) {
          if (!Number.isInteger(item.quantity) || item.quantity <= 0 || item.quantity > CONFIG.LIMITS.MAX_ITEM_QUANTITY) {
            return { valid: false, error: `Item ${i} com quantidade inválida (deve ser entre 1 e ${CONFIG.LIMITS.MAX_ITEM_QUANTITY})` };
          }
        }
      }
    }

    return { valid: true };
  }

  /**
   * Sanitiza strings para exibição segura no DOM (evita XSS)
   * @param {string} str 
   */
  static sanitizeText(str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Valida se a quantidade informada é um inteiro positivo válido
   * @param {number} qty 
   */
  static isValidQuantity(qty) {
    return Number.isInteger(qty) && qty > 0 && qty <= CONFIG.LIMITS.MAX_ITEM_QUANTITY;
  }
}
