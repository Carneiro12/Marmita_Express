import { CONFIG } from './config.js';

/**
 * Módulo de Preços - Cálculos Monetários 100% Determinísticos
 * Todas as operações financeiras são realizadas com inteiros (centavos) para evitar erros de ponto flutuante.
 */
export class Pricing {
  /**
   * Converte valor em Reais (float) para centavos inteiros
   * @param {number} valueInReais 
   * @returns {number} centavos
   */
  static toCents(valueInReais) {
    if (typeof valueInReais !== 'number' || isNaN(valueInReais)) return 0;
    return Math.round(valueInReais * 100);
  }

  /**
   * Converte centavos inteiros para float em Reais
   * @param {number} cents 
   * @returns {number} reais
   */
  static toReais(cents) {
    if (typeof cents !== 'number' || isNaN(cents)) return 0;
    return cents / 100;
  }

  /**
   * Formata centavos em string monetária BRL (R$ 00,00)
   * @param {number} cents 
   * @returns {string}
   */
  static formatCents(cents) {
    const reais = this.toReais(cents);
    return reais.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  }

  /**
   * Calcula o subtotal em centavos de uma lista de itens do carrinho
   * @param {Array<{ priceCents: number, quantity: number }>} items 
   * @returns {number} Subtotal em centavos
   */
  static calculateSubtotalCents(items) {
    if (!Array.isArray(items)) return 0;
    return items.reduce((acc, item) => {
      const price = Number.isInteger(item.priceCents) ? item.priceCents : Math.round((item.price || 0) * 100);
      const qty = Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : 0;
      return acc + (price * qty);
    }, 0);
  }

  /**
   * Retorna a taxa fixa de entrega em centavos
   * @param {number} subtotalCents 
   * @returns {number}
   */
  static getDeliveryFeeCents(subtotalCents = 0) {
    if (subtotalCents === 0) return 0;
    return CONFIG.DELIVERY_FEE_CENTS;
  }

  /**
   * Calcula o valor total incluindo taxa de entrega
   * Total = Subtotal + Taxa de Entrega
   * @param {Array} items 
   * @returns {{ subtotalCents: number, deliveryFeeCents: number, totalCents: number, subtotalFormatted: string, deliveryFeeFormatted: string, totalFormatted: string }}
   */
  static calculateOrderSummary(items) {
    const subtotalCents = this.calculateSubtotalCents(items);
    const deliveryFeeCents = this.getDeliveryFeeCents(subtotalCents);
    const totalCents = subtotalCents + deliveryFeeCents;

    return {
      subtotalCents,
      deliveryFeeCents,
      totalCents,
      subtotalFormatted: this.formatCents(subtotalCents),
      deliveryFeeFormatted: this.formatCents(deliveryFeeCents),
      totalFormatted: this.formatCents(totalCents)
    };
  }
}
