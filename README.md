# 🍱 Marmita Express - Chatbot Inteligente com Guardrails de Segurança

Aplicação web completa e interativa de um restaurante fictício de marmitas, desenvolvida em arquitetura 100% **client-side** (executada inteiramente no navegador via HTML5, CSS3 e JavaScript ES6+ modular). 

O projeto demonstra a orquestração de um agente conversacional baseado em LLM (Large Language Model - Google Gemini), integrado a um sistema rigoroso de **Guardrails independentes** contra Prompt Injection, Jailbreak, manipulação de preços e vazamento de instruções internas.

---

## 🎯 1. Principais Recursos

- **Atendente Virtual Inteligente**:
  - Interpretação de pedidos e preferências em linguagem natural brasileira (pt-BR).
  - Identificação de itens, quantidades e personalizações complexas (remoção de ingredientes, ponto da carne, alterações de tempero).
  - Esclarecimento educado de dúvidas sobre o cardápio e cálculo de valores.
- **Cardápio Dinâmico Oficial**:
  - 8 opções completas com ingredientes, acompanhamentos e regras específicas de personalização.
  - Disponibilidade dinâmica baseada no dia da semana local (com seletor para simulação de qualquer dia).
  - Catálogo imutável: o LLM não possui permissão para inventar pratos, preços ou alterar regras de negócio.
- **Gerenciador de Pedidos & Carrinho Independente**:
  - Separação estrita entre o modelo de linguagem e as regras financeiras.
  - Todos os cálculos monetários são processados em centavos inteiros (`Pricing.js`) eliminando imprecisões de ponto flutuante.
  - Taxa fixa de entrega de R$ 5,00 e persistência segura em `LocalStorage`.
- **Modos de Operação Duplos**:
  - **Modo IA**: Conexão direta com a API do Google Gemini (`gemini-1.5-flash`), com chave informada pelo usuário em tempo de execução mantida exclusivamente em memória de sessão (RAM).
  - **Modo Demonstração**: Motor determinístico local que permite avaliar todas as telas, pedidos, carrinho e guardrails sem necessidade de chave de API e sem custos.
- **Suíte de Testes Automatizada no Navegador**:
  - Interface visual (`tests/index.html`) com relatórios instantâneos de status `PASS` / `FAIL` para validações funcionais e testes de segurança adversariais.

---

## 🛡️ 2. Arquitetura de Segurança & Guardrails

Para atender aos requisitos de segurança em profundidade, o sistema implementa uma camada defensiva desacoplada do modelo:

### 2.1. Hierarquia Imutável de Instruções
1. **Regras de segurança e políticas da aplicação** (Prioridade Máxima).
2. **Regras comerciais e catálogo oficial do restaurante**.
3. **Solicitações legítimas do cliente**.
4. **Conteúdo externo e texto do usuário** (Tratado estritamente como dado não-confiável).

### 2.2. Pre-execution Guardrails (Antes de chamar o LLM)
- **Detecção de Prompt Injection e Jailbreak**: Análise léxica e padrões de regex normalizados para detectar comandos como `"ignore all previous instructions"`, `"esqueça suas regras"`, `"ative o modo desenvolvedor"`, simulações de administrador e roleplay sem restrições.
- **Detecção de Extração de System Prompt**: Bloqueio de solicitações para exibir prompts internos, chaves de API ou segredos.
- **Bloqueio de Injeção de Código**: Filtro contra `<script>`, `javascript:`, `eval()`, chamadas maliciosas e injeções XSS.
- **Controle de Abuso**: Limite estrito de 500 caracteres por mensagem, histórico recente delimitado e controle de frequência (Rate Limiting).
- **Exceções Contextuais Legítimas**: Perguntas conceituais sobre segurança (ex: *"O que é prompt injection?"*) são respondidas de forma didática e educada, sem vazar configurações internas.

### 2.3. Post-execution Guardrails (Após o retorno do LLM)
- **Validação de Schema JSON**: Rejeição de respostas malformadas ou com propriedades espúrias.
- **Controle de Intenções Permitidas**: Apenas intenções autorizadas (`greeting`, `show_menu`, `ask_price`, `add_to_cart`, `remove_from_cart`, `calculate_total`, etc.) são processadas.
- **Validação Cruzada com o Catálogo**: O JavaScript confere cada produto, verifica se está disponível no dia e descarta customizações inválidas (ex: pedir ponto de cozimento para prato de frango).
- **Imutabilidade Financeira**: O preço utilizado é **sempre** extraído da tabela oficial em centavos. Se o modelo ou o usuário tentarem impor um preço (ex: *"adicione por R$ 1,00"*), o sistema aplica o valor oficial ou bloqueia a operação.
- **Renderização Segura no DOM**: Uso de `textContent` e criação programática de nós DOM, eliminando riscos de XSS.

---

## ⚠️ 3. Limitações de Segurança de Aplicações Client-Side

> [!WARNING]
> Como esta aplicação opera **100% no navegador sem backend**:
> 1. **Inspeção de Chaves**: Qualquer chave de API inserida no navegador reside na memória do cliente e é visível através das Ferramentas de Desenvolvedor (Network / Console). Portanto, **esta arquitetura é indicada para fins acadêmicos e de prototipação**, não devendo ser utilizada com chaves privadas de produção em ambientes corporativos ou públicos.
> 2. **Inspeção de Código**: O código JavaScript, as regras de validação e as instruções do sistema podem ser lidos diretamente pelo usuário através do código-fonte. A segurança proposta impede que o agente conversacional seja manipulado ou vaze suas instruções no fluxo do chat, mas não substitui a proteção de um backend seguro em produção.

---

## 📁 4. Estrutura do Projeto

```text
/
├── index.html                  # Interface principal da aplicação
├── css/
│   └── style.css               # Estilos e design system responsivo
├── js/
│   ├── app.js                  # Inicializador e controlador da interface
│   ├── chatbot.js              # Orquestrador do chat e fluxo de atendimento
│   ├── llm-provider.js         # Integração Gemini API e motor determinístico demo
│   ├── menu.js                 # Catálogo oficial e disponibilidade dos pratos
│   ├── order-manager.js        # Gerenciamento de carrinho e regras de pedidos
│   ├── pricing.js              # Cálculos monetários em centavos inteiros
│   ├── guardrails.js           # Camada de defesa contra Prompt Injection e Jailbreak
│   ├── validators.js           # Validação de schemas e sanitização
│   └── config.js               # Parâmetros e limites globais
├── data/
│   └── menu.json               # Dados oficiais do cardápio do restaurante
├── tests/
│   ├── index.html              # Interface de execução dos testes
│   └── security-tests.js       # Suíte de testes funcionais e de segurança
├── README.md                   # Documentação completa
└── .gitignore                  # Arquivos ignorados pelo Git
```

---

## 🚀 5. Como Executar Localmente

Como a aplicação é estática e utiliza módulos ES6 (`import`/`export`), basta servi-la em qualquer servidor web local simples:

### Opção 1: Usando Python (Recomendado)
No terminal, dentro da pasta do projeto:
```bash
# Python 3
python -m http.server 8000
```
Em seguida, acesse no navegador: `http://localhost:8000`

### Opção 2: Usando a extensão Live Server (VS Code)
Abra a pasta do projeto no VS Code, clique com o botão direito em `index.html` e selecione **"Open with Live Server"**.

---

## 🔑 6. Configuração da API Key (Google Gemini)

1. Obtenha uma chave gratuita no [Google AI Studio](https://aistudio.google.com/).
2. Abra a aplicação no navegador.
3. Na seção inferior **"⚙️ Painel de Configurações & Integração com IA"**, cole sua chave no campo correspondente e clique em **"Ativar"**.
4. O indicador mudará para **"Modo IA"**.
5. Para remover a chave a qualquer momento, clique no botão **"Limpar"**.

*Nota: Se você não possuir uma chave no momento, utilize o **Modo Demonstração**, que responderá a pedidos, perguntas de cardápio e ataques de segurança com inteligência determinística local.*

---

## 🌐 7. Publicação no GitHub Pages

1. Crie um novo repositório no GitHub (ex: `marmita-express`).
2. Adicione e envie os arquivos:
   ```bash
   git init
   git add .
   git commit -m "feat: release inicial Marmita Express com guardrails e chatbot"
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git
   git push -u origin main
   ```
3. No GitHub, acesse **Settings** > **Pages**.
4. Em **Branch**, selecione `main` e a pasta `/ (root)`.
5. Clique em **Save**. Em instantes, a aplicação estará online no endereço:
   `https://SEU_USUARIO.github.io/SEU_REPOSITORIO/`

---

## 🧪 8. Execução dos Testes Automatizados

Acesse a página de testes navegando até `tests/index.html` (ou clicando no botão de testes no rodapé da aplicação principal). A suíte verificará automaticamente:
- Cadastro e integridade dos pratos.
- Disponibilidade dinâmica por dia da semana.
- Cálculos financeiros determinísticos.
- Tentativas de injeção de prompt, jailbreak, comandos maliciosos e adulteração de preços.
