/**
 * Configuração Global da Aplicação Marmita Express
 */
export const CONFIG = {
  RESTAURANT_NAME: "Marmita Express",
  TAGLINE: "Comida caseira de verdade, quentinha na sua porta!",
  CURRENCY_SYMBOL: "R$",
  DELIVERY_FEE_CENTS: 500, // R$ 5,00 em centavos
  DEFAULT_MODEL: "gemini-1.5-flash",
  GEMINI_API_ENDPOINT: "https://generativelanguage.googleapis.com/v1beta/models",
  
  // Limites e Segurança
  LIMITS: {
    MAX_MESSAGE_LENGTH: 500,
    MAX_HISTORY_MESSAGES: 12,
    MAX_REQUESTS_PER_MINUTE: 20,
    MAX_ITEM_QUANTITY: 20,
    API_TIMEOUT_MS: 15000,
    COOLDOWN_MS: 1000
  },

  DAYS_OF_WEEK: [
    "Domingo",
    "Segunda-feira",
    "Terça-feira",
    "Quarta-feira",
    "Quinta-feira",
    "Sexta-feira",
    "Sábado"
  ],

  STORAGE_KEYS: {
    CART: "marmita_express_cart",
    ACTIVE_DAY_OVERRIDE: "marmita_express_day_override"
  }
};
