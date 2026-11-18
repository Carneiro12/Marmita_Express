import { CONFIG } from './config.js';
import { Pricing } from './pricing.js';

/**
 * Catálogo e Gestão de Cardápio Oficial
 * Esta é a ÚNICA fonte de verdade para pratos, preços, ingredientes e disponibilidade.
 */
export class Menu {
  constructor(initialData = null) {
    this.items = [];
    this.currentDayOverride = null;
    if (initialData) {
      this.loadFromData(initialData);
    } else {
      // Pré-carrega imediatamente com os dados de fallback para disponibilidade síncrona
      this.loadFromData(FALLBACK_MENU_DATA);
    }
  }

  loadFromData(data) {
    this.items = data.map(item => ({
      ...item,
      priceCents: Pricing.toCents(item.price),
      priceFormatted: Pricing.formatCents(Pricing.toCents(item.price))
    }));
  }

  async loadMenuJson(url = 'data/menu.json') {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Falha ao carregar cardápio: ${response.statusText}`);
      }
      const data = await response.json();
      this.loadFromData(data);
      return this.items;
    } catch (error) {
      console.error("Erro ao carregar menu.json, utilizando fallback:", error);
      this.loadFromData(FALLBACK_MENU_DATA);
      return this.items;
    }
  }

  getCurrentDayOfWeek() {
    if (this.currentDayOverride !== null && Number.isInteger(this.currentDayOverride)) {
      return this.currentDayOverride;
    }
    return new Date().getDay();
  }

  setDayOverride(dayIndex) {
    if (dayIndex === null || (dayIndex >= 0 && dayIndex <= 6)) {
      this.currentDayOverride = dayIndex;
      return true;
    }
    return false;
  }

  getCurrentDayName(dayIndex = null) {
    const day = dayIndex !== null ? dayIndex : this.getCurrentDayOfWeek();
    return CONFIG.DAYS_OF_WEEK[day] || "Desconhecido";
  }

  getAllItems() {
    return [...this.items];
  }

  getAvailableItems(dayOfWeek = null) {
    const targetDay = dayOfWeek !== null ? dayOfWeek : this.getCurrentDayOfWeek();
    return this.items.filter(item => item.availableDays.includes(targetDay));
  }

  getItemById(id) {
    if (!id || typeof id !== 'string') return null;
    return this.items.find(item => item.id.toLowerCase() === id.toLowerCase().trim()) || null;
  }

  /**
   * Busca inteligente e precisa de prato por linguagem natural
   * Considera sinônimos, termos de pratos específicos e palavras distintivas
   * @param {string} query 
   */
  findItemByName(query) {
    if (!query || typeof query !== 'string') return null;
    const cleanQuery = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

    // 1. Busca exata por ID ou nome completo
    for (const item of this.items) {
      const cleanName = item.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (cleanName === cleanQuery || item.id === cleanQuery) {
        return item;
      }
    }

    // 2. Mapeamento de termos distintivos fortes
    // "marmita" e "prato" são palavras genéricas e NÃO devem associar a nenhum prato específico
    const distinctRules = [
      { pattern: /\b(bife|alcatra|carne acebolada|bife acebolado)\b/, id: 'bife_acebolado' },
      { pattern: /\b(strogonoff|estrogonofe)\b/, id: 'strogonoff_frango' },
      { pattern: /\b(feijoada|feijuca)\b/, id: 'feijoada' },
      { pattern: /\b(linguica|toscana)\b/, id: 'linguica_acebolada' },
      { pattern: /\b(peixe|tilapia|pescado)\b/, id: 'peixe_grelhado' },
      { pattern: /\b(vegetariana|vegetariano|cogumelos?|veggie)\b/, id: 'vegetariana' },
      { pattern: /\b(carne moida|moida|patinho moido)\b/, id: 'carne_moida' },
      { pattern: /\b(frango|galinha|franguinho|file de frango)\b/, id: 'frango_grelhado' }
    ];

    for (const rule of distinctRules) {
      if (rule.pattern.test(cleanQuery)) {
        const found = this.getItemById(rule.id);
        if (found) return found;
      }
    }

    // 3. Busca por substring do nome de cada prato (excluindo a palavra 'marmita')
    for (const item of this.items) {
      const coreName = item.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/^marmita de\s+/i, "");
      if (cleanQuery.includes(coreName) || coreName.includes(cleanQuery)) {
        return item;
      }
    }

    return null;
  }

  isAvailableToday(id, day = null) {
    const item = this.getItemById(id);
    if (!item) return false;
    const targetDay = day !== null ? day : this.getCurrentDayOfWeek();
    return item.availableDays.includes(targetDay);
  }

  getAvailabilityDaysNames(id) {
    const item = this.getItemById(id);
    if (!item) return [];
    return item.availableDays.map(d => CONFIG.DAYS_OF_WEEK[d]);
  }

  getFormattedMenuForPrompt() {
    const today = this.getCurrentDayOfWeek();
    const todayName = this.getCurrentDayName(today);
    const available = this.getAvailableItems(today);

    let text = `CARDÁPIO OFICIAL PARA HOJE (${todayName}):\n`;
    for (const item of available) {
      text += `- ID: "${item.id}" | Nome: "${item.name}" | Preço: R$ ${(item.priceCents / 100).toFixed(2)}\n`;
      text += `  Ingredientes: ${item.ingredients.join(', ')}\n`;
      text += `  Removíveis: ${item.customizationOptions.removableIngredients.join(', ')}\n`;
      text += `  Temperos: ${item.customizationOptions.allowedSeasonings.join(', ')}\n`;
      if (item.customizationOptions.allowedCookingPoints.length > 0) {
        text += `  Pontos de carne permitidos: ${item.customizationOptions.allowedCookingPoints.join(', ')}\n`;
      } else {
        text += `  Ponto de carne: NÃO APLICÁVEL\n`;
      }
    }

    text += `\nOUTROS DIAS DA SEMANA:\n`;
    const others = this.items.filter(item => !item.availableDays.includes(today));
    for (const item of others) {
      const days = item.availableDays.map(d => CONFIG.DAYS_OF_WEEK[d]).join(', ');
      text += `- ID: "${item.id}" | "${item.name}" (Disponível em: ${days})\n`;
    }

    return text;
  }
}

export const FALLBACK_MENU_DATA = [
  {
    id: "frango_grelhado",
    name: "Marmita de Frango Grelhado",
    description: "Filé de frango suculento grelhado na chapa acompanhado de arroz soltinho, feijão caseiro e salada fresca.",
    price: 22.00,
    category: "Aves",
    ingredients: ["Filé de frango", "Arroz branco", "Feijão carioquinha", "Salada de alface e tomate", "Alho", "Cebola", "Azeite"],
    sideDishes: ["Arroz branco", "Feijão carioquinha", "Salada fresca"],
    availableDays: [0, 1, 2, 3, 4, 5, 6],
    customizationOptions: {
      removableIngredients: ["Alho", "Cebola", "Salada de alface e tomate", "Feijão carioquinha"],
      allowedSeasonings: ["Padrão", "Pouco sal", "Sem sal", "Mais alho", "Sem pimenta", "Tempero suave"],
      allowedCookingPoints: []
    }
  },
  {
    id: "bife_acebolado",
    name: "Marmita de Bife Acebolado",
    description: "Bife bovino macio acebolado, arroz branco, feijão carioquinha e farofa crocante.",
    price: 25.00,
    category: "Carnes",
    ingredients: ["Bife bovino (alcatra)", "Cebola fatiada", "Arroz branco", "Feijão carioquinha", "Farofa de milho", "Alho"],
    sideDishes: ["Arroz branco", "Feijão carioquinha", "Farofa crocante"],
    availableDays: [1, 2, 3, 4, 5],
    customizationOptions: {
      removableIngredients: ["Cebola fatiada", "Farofa de milho", "Feijão carioquinha", "Alho"],
      allowedSeasonings: ["Padrão", "Pouco sal", "Sem pimenta", "Mais alho", "Tempero suave"],
      allowedCookingPoints: ["Malpassado", "Ao ponto", "Bem passado"]
    }
  },
  {
    id: "carne_moida",
    name: "Marmita de Carne Moída com Batata",
    description: "Carne moída refogada com cubinhos de batata macia, arroz, feijão e couve refogada.",
    price: 23.00,
    category: "Carnes",
    ingredients: ["Carne moída (patinho)", "Batata inglesa", "Arroz branco", "Feijão carioquinha", "Couve refogada", "Alho", "Cebola"],
    sideDishes: ["Arroz branco", "Feijão carioquinha", "Couve refogada"],
    availableDays: [1, 3, 5],
    customizationOptions: {
      removableIngredients: ["Cebola", "Alho", "Couve refogada", "Batata inglesa"],
      allowedSeasonings: ["Padrão", "Pouco sal", "Sem pimenta", "Tempero suave"],
      allowedCookingPoints: []
    }
  },
  {
    id: "strogonoff_frango",
    name: "Marmita de Strogonoff de Frango",
    description: "Clássico strogonoff cremoso com champignon, arroz branco e batata palha super crocante.",
    price: 26.00,
    category: "Aves",
    ingredients: ["Iscas de frango", "Molho de strogonoff com creme de leite", "Champignon", "Arroz branco", "Batata palha", "Cebola"],
    sideDishes: ["Arroz branco", "Batata palha crocante"],
    availableDays: [2, 4, 6],
    customizationOptions: {
      removableIngredients: ["Champignon", "Batata palha", "Cebola"],
      allowedSeasonings: ["Padrão", "Pouco sal", "Sem pimenta"],
      allowedCookingPoints: []
    }
  },
  {
    id: "linguica_acebolada",
    name: "Marmita de Linguiça Acebolada",
    description: "Linguiça toscana grelhada com cebola dourada, arroz, feijão preto e vinagrete.",
    price: 22.00,
    category: "Carnes",
    ingredients: ["Linguiça toscana", "Cebola dourada", "Arroz branco", "Feijão preto", "Vinagrete de tomate e cebola"],
    sideDishes: ["Arroz branco", "Feijão preto", "Vinagrete"],
    availableDays: [1, 2, 4],
    customizationOptions: {
      removableIngredients: ["Cebola dourada", "Vinagrete de tomate e cebola", "Feijão preto"],
      allowedSeasonings: ["Padrão", "Pouco sal", "Sem pimenta"],
      allowedCookingPoints: []
    }
  },
  {
    id: "peixe_grelhado",
    name: "Marmita de Peixe Grelhado",
    description: "Filé de tilápia grelhado com azeite e ervas, acompanhado de purê de batata e legumes no vapor.",
    price: 27.00,
    category: "Peixes",
    ingredients: ["Filé de tilápia", "Azeite de oliva", "Ervas finas", "Purê de batatas", "Legumes no vapor (cenoura e brócolis)"],
    sideDishes: ["Purê de batatas", "Legumes no vapor"],
    availableDays: [3, 5, 6],
    customizationOptions: {
      removableIngredients: ["Ervas finas", "Legumes no vapor (cenoura e brócolis)", "Purê de batatas"],
      allowedSeasonings: ["Padrão", "Pouco sal", "Sem pimenta", "Mais limão", "Tempero suave"],
      allowedCookingPoints: []
    }
  },
  {
    id: "vegetariana",
    name: "Marmita Vegetariana Especial",
    description: "Mix de cogumelos salteados, arroz integral, feijão carioquinha, abóbora assada e brócolis ao alho.",
    price: 21.00,
    category: "Vegetariano",
    ingredients: ["Cogumelos salteados (shimeji e paris)", "Arroz integral", "Feijão carioquinha", "Abóbora cabotiá assada", "Brócolis", "Alho"],
    sideDishes: ["Arroz integral", "Feijão carioquinha", "Abóbora assada"],
    availableDays: [0, 1, 2, 3, 4, 5, 6],
    customizationOptions: {
      removableIngredients: ["Alho", "Abóbora cabotiá assada", "Brócolis", "Feijão carioquinha"],
      allowedSeasonings: ["Padrão", "Pouco sal", "Sem pimenta", "Mais alho", "Tempero suave"],
      allowedCookingPoints: []
    }
  },
  {
    id: "feijoada",
    name: "Marmita de Feijoada Completa",
    description: "Tradicional feijoada com carnes nobres, arroz branco, couve refogada, farofa e gomos de laranja.",
    price: 28.00,
    category: "Especiais",
    ingredients: ["Feijão preto com carnes nobres", "Arroz branco", "Couve refogada", "Farofa temperada", "Gomos de laranja fresca"],
    sideDishes: ["Arroz branco", "Couve refogada", "Farofa temperada", "Laranja"],
    availableDays: [3, 6],
    customizationOptions: {
      removableIngredients: ["Couve refogada", "Farofa temperada", "Gomos de laranja fresca"],
      allowedSeasonings: ["Padrão", "Pouco sal", "Sem pimenta"],
      allowedCookingPoints: []
    }
  }
];
