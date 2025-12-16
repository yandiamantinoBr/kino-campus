# Análise de Problemas - Versão 5.1

## Problemas Identificados nas Imagens

### 1. Layout Mobile (S20 Ultra 412x915 e Responsive 268x635)

**Problemas no Header:**
- Header não ocupa 100% da largura da tela
- Há margens/padding excessivos nas laterais
- Logo e ícone de configurações não estão alinhados corretamente
- Barra de busca não ocupa a largura adequada

**Problemas na Navegação Inferior (kc-mobile-nav):**
- Navegação inferior não está visível nas screenshots
- Deve estar fixa na parte inferior da tela
- Precisa ocupar 100% da largura

**Problemas no Conteúdo:**
- Cards não estão ocupando a largura total disponível
- Banner/carousel cortado nas laterais
- Tabs de categorias cortadas

### 2. Módulo Compra e Venda - Sidebar Desformatada

**Problemas nos Filtros:**
- Checkboxes em linha horizontal (devem ser verticais)
- Falta estrutura visual clara
- Não há separação entre seções

**Problemas nas Categorias Populares:**
- Ícones e texto desalinhados
- Números de anúncios sem formatação adequada
- Falta layout em cards como no módulo de Oportunidades

**Problemas nas Dicas para Vendedores:**
- Lista com bullets genéricos
- Falta card container
- Falta estilização adequada

### 3. Filtros Não Funcionais

**Problemas identificados:**
- Filtro "Móveis" não mostra "Cama Box Solteiro"
- Tags dos anúncios podem estar incorretas
- Subítens horizontais não filtram corretamente

### 4. Busca Global

**Necessidades:**
- Banco de dados centralizado com todos os anúncios
- Busca por texto similar (fuzzy search)
- Busca em todos os módulos
- Resultados em tempo real

## Soluções Propostas

### 1. CSS Mobile Corrigido
- Remover max-width do container principal em mobile
- Header com width: 100% e padding adequado
- Navegação inferior fixa com width: 100%
- Cards com width: 100%

### 2. Sidebar Compra e Venda
- Copiar estrutura do módulo Oportunidades
- Filtros em lista vertical com checkboxes
- Categorias em cards com ícone, nome e contador
- Dicas em card separado com ícones de check

### 3. Sistema de Filtros
- Revisar data-category de cada anúncio
- Implementar filtro JavaScript funcional
- Vincular checkboxes aos filtros

### 4. Banco de Dados JSON
- Criar arquivo data/all-posts.json
- Estrutura com id, título, descrição, categoria, tags, módulo
- Implementar busca com includes() e toLowerCase()
