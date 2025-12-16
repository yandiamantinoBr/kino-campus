# KinoCampus - Projeto Melhorado

## 📋 Sobre o Projeto

KinoCampus é uma plataforma universitária para compartilhamento de informações e oportunidades entre alunos. O projeto foi melhorado com funcionalidades de filtros, busca, banco de dados e gerenciamento de publicações.

## ✨ Melhorias Implementadas

### 1. Preenchimento de Imagens com Emojis ✅

Todos os quadros de imagens foram preenchidos com emojis consistentes e relevantes:

- **Compra e Venda**: 💻 (Eletrônicos), 📚 (Livros), 🛋️ (Móveis), 👕 (Vestuário)
- **Achados/Perdidos**: 💳 (Carteira), 📱 (Celular), 🔑 (Chaves)
- **Caronas**: 🚗 (Carro)
- **Eventos**: 👋 (Workshop), 🎤 (Palestra), 🎉 (Festa)
- **Moradia**: 🏡 (República), 🛋️ (Quarto), 🏘️ (Apartamento)
- **Oportunidades**: 💻 (Desenvolvimento), 💼 (Emprego), 🌐 (Freelancer)

### 2. Filtros e Busca Funcionais ✅

**Filtros por Subcategoria:**
- Clique em qualquer subcategoria (Eletrônicos, Livros, Móveis, etc.) para filtrar publicações
- Os filtros funcionam em tempo real
- Indicador visual mostra qual filtro está ativo

**Busca em Tempo Real:**
- Digite na barra de busca para encontrar publicações
- A busca funciona por título e descrição
- Atualiza instantaneamente conforme você digita

**Arquivos com Filtros:**
- `compra-venda-feed.html` - Filtros por categoria de produtos
- `achados-perdidos.html` - Filtros por tipo (Perdido/Encontrado)
- `caronas-feed.html` - Filtros por tipo de carona
- `eventos.html` - Filtros por tipo de evento
- `moradia.html` - Filtros por tipo de moradia
- `oportunidades.html` - Filtros por tipo de oportunidade

### 3. Banco de Dados JSON ✅

**Arquivo**: `data/posts.json`

Contém dados estruturados para:
- Compra e Venda (6 publicações)
- Achados/Perdidos (3 publicações)
- Caronas (3 publicações)
- Eventos (3 publicações)
- Moradia (3 publicações)
- Oportunidades (3 publicações)

**Estrutura de Dados:**
```json
{
  "id": 1,
  "title": "Título do Produto",
  "category": "eletronicos",
  "price": "R$ 1.800,00",
  "condition": "Bom estado",
  "emoji": "💻",
  "description": "Descrição detalhada",
  "author": "Nome do Autor",
  "rating": 4.9,
  "verified": true,
  "timestamp": "2 horas",
  "likes": 156,
  "comments": 23
}
```

### 4. Funcionalidades CRUD ✅

**Criar (Create):**
- Página `create-post.html` para criar novas publicações
- Formulário com campos para título, categoria, preço, descrição, etc.
- Dados salvos em localStorage

**Editar (Update):**
- Botão "Editar" em cada publicação
- Modal para editar dados existentes
- Alterações salvas automaticamente

**Deletar (Delete):**
- Botão "Deletar" em cada publicação
- Confirmação antes de deletar
- Remoção instantânea

**Persistência:**
- Dados salvos em `localStorage`
- Persiste durante a sessão do navegador
- Dados iniciais carregados de `data/posts.json`

## 📁 Estrutura do Projeto

```
kinocampus-melhorado/
├── index.html                 # Página principal
├── compra-venda-feed.html     # Feed de Compra e Venda
├── compra-venda.html          # Detalhes do produto
├── achados-perdidos.html      # Achados e Perdidos
├── caronas-feed.html          # Feed de Caronas
├── caronas.html               # Detalhes da carona
├── eventos.html               # Eventos
├── moradia.html               # Moradia
├── oportunidades.html         # Oportunidades
├── product.html               # Página de produto genérica
├── create-post.html           # Criar publicação
├── styles.css                 # Estilos globais
├── script.js                  # JavaScript com CRUD e filtros
├── data/
│   └── posts.json            # Banco de dados JSON
└── README.md                  # Este arquivo
```

## 🚀 Como Usar

### Abrir o Projeto

1. Extraia o arquivo ZIP
2. Abra `index.html` em qualquer navegador moderno
3. Pronto! O projeto funciona 100% no navegador

### Navegar entre Seções

- Clique em "Compra e Venda", "Achados/Perdidos", "Caronas", etc. no header
- Use a navegação móvel na parte inferior em dispositivos pequenos
- Cada seção tem seus próprios filtros e busca

### Usar Filtros

1. **Por Subcategoria**: Clique em "Eletrônicos", "Livros", "Móveis", etc.
2. **Por Busca**: Digite na barra de busca do header
3. **Combinado**: Use filtro + busca para resultados mais específicos

### Criar Publicação

1. Clique em "+ Criar" ou no botão flutuante
2. Selecione a categoria
3. Preencha o formulário
4. Clique em "Publicar"
5. A publicação aparecerá no feed

### Editar Publicação

1. Clique em "Editar" na publicação desejada
2. Modifique os dados no modal
3. Clique em "Salvar"
4. Alterações são aplicadas imediatamente

### Deletar Publicação

1. Clique em "Deletar" na publicação
2. Confirme a exclusão
3. A publicação é removida do feed

## 🎨 Design e Responsividade

- **Desktop**: Layout completo com 3 colunas
- **Tablet**: Layout adaptado com 2 colunas
- **Mobile**: Layout em coluna única com navegação inferior
- **Tema Claro/Escuro**: Toggle no header

## 🔧 Tecnologias Utilizadas

- **HTML5**: Estrutura semântica
- **CSS3**: Layouts modernos (Grid, Flexbox)
- **JavaScript ES6+**: Lógica interativa
- **JSON**: Armazenamento de dados
- **Font Awesome**: Ícones
- **localStorage**: Persistência de dados

## 📊 Dados de Exemplo

### Compra e Venda (6 itens)
- Notebook Dell Inspiron 15 - R$ 1.800,00
- Kit Livros Cálculo - R$ 280,00
- Sofá 3 Lugares - R$ 450,00
- Jaqueta de Couro - R$ 120,00
- Fone Bluetooth Sony - R$ 350,00
- Livro O Poder do Hábito - R$ 45,00

### Achados/Perdidos (3 itens)
- Carteira Marrom Perdida
- Celular Samsung Encontrado
- Molho de Chaves Perdido

### Caronas (3 itens)
- Carona Campus → Setor Universitário
- Carona Diária Campus → Bairro X
- Procuro Carona para Casa

### Eventos (3 itens)
- Workshop: Práticas Sustentáveis
- Palestra: Empreendedorismo
- Campeonato de Futsal

### Moradia (3 itens)
- Vaga em República Feminina
- Procuro Colega para Dividir Apartamento
- Kitnet Mobiliada

### Oportunidades (3 itens)
- Estágio em Desenvolvimento Web
- Emprego em Marketing
- Voluntariado em Educação

## 💾 Persistência de Dados

Os dados são salvos em `localStorage` do navegador. Para resetar os dados:

1. Abra o console do navegador (F12)
2. Execute: `localStorage.removeItem('kinocampus_posts')`
3. Recarregue a página

## 🎯 Funcionalidades Principais

✅ Filtros por categoria funcionais  
✅ Busca em tempo real  
✅ Emojis consistentes em todas as publicações  
✅ Sistema CRUD completo  
✅ Banco de dados JSON  
✅ Persistência em localStorage  
✅ Design responsivo  
✅ Tema claro/escuro  
✅ Navegação intuitiva  
✅ Sem dependências externas (apenas Font Awesome)  

## 🔮 Próximas Melhorias Sugeridas

1. **Backend Real**: Node.js + Express + MongoDB
2. **Autenticação**: Login/Registro com JWT
3. **Upload de Imagens**: Suporte a múltiplas imagens
4. **Chat em Tempo Real**: WebSocket para mensagens
5. **Sistema de Pagamento**: Stripe/PayPal
6. **Avaliações**: Rating e comentários
7. **Notificações**: Push notifications
8. **API REST**: Para integração com apps mobile

## 📝 Notas Importantes

- O projeto funciona 100% no navegador, sem servidor necessário
- Dados são salvos localmente em localStorage
- Funciona offline após carregamento inicial
- Compatível com todos os navegadores modernos
- Performance otimizada para carregamento rápido

## 👨‍💻 Desenvolvido com ❤️

**KinoCampus - Plataforma Universitária**  
Versão: 2.0 (Melhorada)  
Data: Dezembro 2025

---

## 📞 Suporte

Para dúvidas ou sugestões sobre o projeto, entre em contato através da plataforma KinoCampus.

**Aproveite a plataforma! 🎉**
