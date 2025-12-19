(function () {
  const heroSlides = [
    {
      id: "sustentabilidade",
      pill: "Destaque",
      title: "Semana de Sustentabilidade UFG",
      description: "Troque materiais, ganhe cashback em dobro e suba no ranking de impacto!",
      cta: "Ver Programação",
      href: "eventos.html?filter=sustentabilidade",
      icon: "fa-calendar-alt",
      iconKey: "calendar",
    },
    {
      id: "troca",
      pill: "Destaque",
      title: "Feira de Troca de Materiais",
      description: "Traga seus materiais acadêmicos usados e troque por outros que você precisa.",
      cta: "Participar",
      href: "eventos.html",
      icon: "fa-exchange-alt",
      iconKey: "exchange",
    },
    {
      id: "lancamento",
      pill: "Novidade",
      title: "Lançamento do KinoCampus na UFG",
      description: "A plataforma colaborativa e sustentável desenvolvida para a comunidade UFG.",
      cta: "Saiba Mais",
      href: "product.html?id=1",
      icon: "fa-campground",
      iconKey: "launch",
    },
  ];

  const rankingUsers = [
    { id: 1, name: "Ana Silva", avatar: "https://i.pravatar.cc/150?img=1", position: 1 },
    { id: 2, name: "Pedro Sá", avatar: "https://i.pravatar.cc/150?img=2", position: 2 },
    { id: 3, name: "Carla Dias", avatar: "https://i.pravatar.cc/150?img=3", position: 3 },
    { id: 4, name: "Lucas M.", avatar: "https://i.pravatar.cc/150?img=4", position: 4 },
    { id: 5, name: "Júlia R.", avatar: "https://i.pravatar.cc/150?img=5", position: 5 },
  ];

  const feedTabs = [
    { id: "destaque", label: "Destaque", icon: "fa-fire", href: "#", active: true },
    { id: "compra-venda", label: "Compra e Venda", icon: "fa-shopping-bag", href: "compra-venda-feed.html" },
    { id: "caronas", label: "Caronas", icon: "fa-car", href: "caronas-feed.html" },
    { id: "livros", label: "Livros", icon: "fa-book", href: "compra-venda-feed.html?filter=livros" },
    { id: "eletronicos", label: "Eletrônicos", icon: "fa-laptop", href: "compra-venda-feed.html?filter=eletronicos" },
    { id: "vestuario", label: "Roupas", icon: "fa-tshirt", href: "compra-venda-feed.html?filter=vestuario" },
    { id: "moradia", label: "Moradia", icon: "fa-home", href: "moradia.html" },
    { id: "eventos", label: "Eventos", icon: "fa-calendar", href: "eventos.html" },
    { id: "sustentabilidade", label: "Sustentabilidade", icon: "fa-leaf", href: "eventos.html?filter=sustentabilidade" },
  ];

  const feedCards = [
    {
      id: 43,
      category: "livros",
      image: "https://images.unsplash.com/photo-1507842217343-583f20270319?w=500&h=500&fit=crop",
      imageAlt: "Livro Cálculo Vol.1",
      categorySource: {
        text: "Livros • Exatas",
        tag: { href: "#", label: "@verificado", icon: "fa-check-circle" },
      },
      timestamp: "Há 2 horas",
      title: "Livro Cálculo Vol.1 - James Stewart (8ª Edição) - Excelente estado",
      href: "product.html?id=43",
      price: "R$ 120,00",
      priceMeta: "ou R$ 110/PIX",
      badge: { text: "-40%", className: "kc-card__discount" },
      author: {
        avatar: "https://i.pravatar.cc/150?img=16",
        name: "Maria Souza",
        prefix: "Anunciado por",
        rating: "4.7",
      },
      votes: 42,
      comments: "8 comentários",
      actionLabel: "Ver Detalhes",
    },
    {
      id: 44,
      category: "eletronicos",
      image: "https://images.unsplash.com/photo-1588872657840-790ff3bde4c5?w=500&h=500&fit=crop",
      imageAlt: "Notebook Dell",
      categorySource: {
        text: "Compra/Venda • Informática",
        tag: { href: "#", label: "@verificado", icon: "fa-check-circle" },
      },
      timestamp: "Há 1 hora",
      title: "Notebook Dell Inspiron i5 - 8ª geração, 8GB RAM, SSD 256GB",
      href: "product.html?id=44",
      price: "R$ 2.500,00",
      priceMeta: "ou R$ 2.350/PIX",
      badge: { text: "Negociável", className: "kc-card__highlight" },
      description: "Vendo notebook Dell Inspiron 15 3000 em excelente estado, comprado há 1 ano e pouco usado. Ideal para estudos...",
      author: {
        avatar: "https://i.pravatar.cc/150?img=12",
        name: "Rafael Almeida",
        prefix: "Anunciado por",
        rating: "4.7",
      },
      votes: 28,
      comments: "7 comentários",
      actionLabel: "Ver Detalhes",
      cashback: "22kg CO₂ evitado",
    },
    {
      id: 19,
      category: "caronas",
      icon: "fa-car",
      categorySource: {
        text: "Caronas • Setor Universitário",
      },
      timestamp: "Há 1 hora",
      title: "Carona Campus Samambaia → Setor Universitário (Segunda a Sexta)",
      href: "product.html?id=19",
      price: "R$ 5,00",
      priceMeta: "por trecho",
      description: "Saída às 18h30 do campus/retorno às 7h. Carro com ar. Aceito PIX ou dinheiro...",
      author: {
        avatar: "https://i.pravatar.cc/150?img=13",
        name: "Carlos Henrique",
        prefix: "Oferecido por",
        rating: "4.8",
      },
      votes: 36,
      comments: "12 comentários",
      actionLabel: "Reservar Vaga",
    },
    {
      id: 29,
      category: "eventos",
      image: "https://images.unsplash.com/photo-1552664730-d307ca884978?w=500&h=500&fit=crop",
      imageAlt: "Workshop Sustentabilidade",
      categorySource: {
        text: "Eventos • Sustentabilidade",
        tag: { href: "#", label: "@oficial", icon: "fa-check-circle" },
      },
      timestamp: "Há 2 dias",
      title: "Workshop: Práticas Sustentáveis no Campus Universitário",
      href: "product.html?id=29",
      price: "Gratuito",
      priceMeta: "com inscrição prévia",
      priceTone: "success",
      description: "Workshop prático sobre implementação de práticas sustentáveis no dia a dia universitário...",
      author: {
        avatar: "https://i.pravatar.cc/150?img=14",
        name: "CA Ciências Ambientais",
        prefix: "Organizado por",
        rating: "4.9",
      },
      votes: 56,
      comments: "7 comentários",
      actionLabel: "Inscrever-se",
    },
  ];

  function htmlEscape(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;");
  }

  function renderHeroFallback(slides) {
    const banners = slides
      .map((slide, index) => {
        return `
          <div class="kc-hero-banner ${index === 0 ? "active" : ""}" data-hero-icon="${slide.iconKey}">
            <div class="kc-hero-inner">
              <div class="kc-hero-content">
                <span class="kc-hero-pill">${htmlEscape(slide.pill)}</span>
                <h1>${htmlEscape(slide.title)}</h1>
                <p>${htmlEscape(slide.description)}</p>
                <a class="kc-btn-primary" href="${slide.href}">${htmlEscape(slide.cta)}</a>
              </div>
              <div aria-hidden="true" class="kc-hero-illustration">
                <i class="fas ${slide.icon}"></i>
              </div>
            </div>
          </div>
        `;
      })
      .join("");

    const dots = slides
      .map((_, index) => {
        return `<span class="kc-dot ${index === 0 ? "active" : ""}" onclick="goToSlide(${index})"></span>`;
      })
      .join("");

    return `
      <div class="kc-hero-carousel">
        <div class="kc-hero-slides">${banners}</div>
        <button class="kc-carousel-btn kc-carousel-prev" onclick="changeSlide(-1)">
          <i class="fas fa-chevron-left"></i>
        </button>
        <button class="kc-carousel-btn kc-carousel-next" onclick="changeSlide(1)">
          <i class="fas fa-chevron-right"></i>
        </button>
        <div class="kc-carousel-dots">${dots}</div>
      </div>
    `;
  }

  function renderRankingFallback(users) {
    const items = users
      .map((user) => {
        return `
          <div class="kc-ranking-user">
            <div class="kc-ranking-user-avatar">
              <img alt="${htmlEscape(user.name)}" src="${user.avatar}" />
              <span class="kc-ranking-user-position">${user.position}</span>
            </div>
            <span class="kc-ranking-user-name">${htmlEscape(user.name)}</span>
          </div>
        `;
      })
      .join("");

    return `
      <div class="kc-ranking-banner">
        <div class="kc-ranking-title">
          <i class="fas fa-trophy"></i>
          <span>Top Contribuidores da UFG</span>
        </div>
        <div class="kc-ranking-users">${items}</div>
      </div>
    `;
  }

  function renderTabsFallback(tabs) {
    const items = tabs
      .map((tab) => {
        return `
          <a class="${tab.active ? "active" : ""}" href="${tab.href}">
            <i class="fas ${tab.icon}"></i>
            <span>${htmlEscape(tab.label)}</span>
          </a>
        `;
      })
      .join("");

    return `<div class="kc-feed-tabs">${items}</div>`;
  }

  function renderCardsFallback(cards) {
    return cards
      .map((card) => {
        const badge = card.badge ? `<span class="${card.badge.className}">${htmlEscape(card.badge.text)}</span>` : "";
        const description = card.description ? `<div class="kc-card__description-preview">${htmlEscape(card.description)}</div>` : "";
        const cashback = card.cashback
          ? `<span class="kc-cashback-badge"><i class="fas fa-coins"></i> ${htmlEscape(card.cashback)}</span>`
          : "";
        const tag = card.categorySource.tag
          ? ` • <a href="${card.categorySource.tag.href}">${htmlEscape(card.categorySource.tag.label)}</a> <i class="fas ${card.categorySource.tag.icon}"></i>`
          : "";
        const priceTone = card.priceTone === "success" ? "kc-card__price kc-card__price--success" : "kc-card__price";
        const priceIcon = card.priceTone === "success" ? "fa-gift" : "fa-money-bill-wave";
        const imageBlock = card.image
          ? `<img alt="${htmlEscape(card.imageAlt)}" src="${card.image}" />`
          : `<i class="fas ${card.icon} kc-card__image-icon" aria-hidden="true"></i>`;

        return `
          <article class="kc-card" data-category="${card.category}" data-post-id="${card.id}">
            ${cashback}
            <div class="kc-card__main">
              <div class="kc-card__image-wrapper">${imageBlock}</div>
              <div class="kc-card__content">
                <div class="kc-card__header">
                  <div class="kc-card__category-source">${htmlEscape(card.categorySource.text)}${tag}</div>
                  <div class="kc-card__timestamp">${htmlEscape(card.timestamp)}</div>
                </div>
                <a class="kc-card__title" href="${card.href}">${htmlEscape(card.title)}</a>
                <div class="${priceTone}">
                  <i class="fas ${priceIcon}"></i>
                  ${htmlEscape(card.price)}
                  ${card.priceMeta ? `<small>${htmlEscape(card.priceMeta)}</small>` : ""}
                  ${badge}
                </div>
                ${description}
                <div class="kc-card__author">
                  <img alt="${htmlEscape(card.author.name)}" src="${card.author.avatar}" />
                  <span>${htmlEscape(card.author.prefix)} <strong>${htmlEscape(card.author.name)}</strong></span>
                  <i class="fas fa-star"></i> ${htmlEscape(card.author.rating)}
                </div>
              </div>
            </div>
            <div class="kc-card__footer">
              <div class="kc-card__interactions">
                <div class="kc-vote-box">
                  <button class="hot" onclick="vote(this, 'hot')" type="button">
                    <i class="fas fa-fire"></i>
                  </button>
                  <span>${card.votes}</span>
                  <button class="cold" onclick="vote(this, 'cold')" type="button">
                    <i class="fas fa-snowflake"></i>
                  </button>
                </div>
                <a class="kc-comment-link" href="${card.href}#comments">
                  <i class="fas fa-comment"></i>
                  <span>${htmlEscape(card.comments)}</span>
                </a>
              </div>
              <a class="kc-action-button kc-get-coupon-button" href="${card.href}">${htmlEscape(card.actionLabel)}</a>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function renderFallback(root) {
    root.innerHTML = `
      ${renderHeroFallback(heroSlides)}
      ${renderRankingFallback(rankingUsers)}
      ${renderTabsFallback(feedTabs)}
      <div class="kc-feed-list">${renderCardsFallback(feedCards)}</div>
    `;
  }

  const root = document.getElementById("kc-home-feed-root");
  if (!root) return;

  if (!window.React || !window.ReactDOM) {
    document.body.removeAttribute("data-kc-react-hero");
    renderFallback(root);
    return;
  }

  const { useEffect, useState } = React;

  function HeroCarousel(props) {
    const slides = props.slides;
    const [current, setCurrent] = useState(0);

    useEffect(() => {
      if (slides.length <= 1) return undefined;
      const intervalId = setInterval(() => {
        setCurrent((prev) => (prev + 1) % slides.length);
      }, 5000);
      return () => clearInterval(intervalId);
    }, [slides.length, current]);

    const handleChange = (direction) => {
      setCurrent((prev) => (prev + direction + slides.length) % slides.length);
    };

    return React.createElement(
      "div",
      { className: "kc-hero-carousel", "data-kc-react-hero": "true" },
      React.createElement(
        "div",
        { className: "kc-hero-slides" },
        slides.map((slide, index) =>
          React.createElement(
            "div",
            {
              className: `kc-hero-banner ${index === current ? "active" : ""}`,
              "data-hero-icon": slide.iconKey,
              key: slide.id,
            },
            React.createElement(
              "div",
              { className: "kc-hero-inner" },
              React.createElement(
                "div",
                { className: "kc-hero-content" },
                React.createElement("span", { className: "kc-hero-pill" }, slide.pill),
                React.createElement("h1", null, slide.title),
                React.createElement("p", null, slide.description),
                React.createElement("a", { className: "kc-btn-primary", href: slide.href }, slide.cta)
              ),
              React.createElement(
                "div",
                { className: "kc-hero-illustration", "aria-hidden": "true" },
                React.createElement("i", { className: `fas ${slide.icon}` })
              )
            )
          )
        )
      ),
      React.createElement(
        "button",
        {
          className: "kc-carousel-btn kc-carousel-prev",
          onClick: () => handleChange(-1),
          type: "button",
          "aria-label": "Slide anterior",
        },
        React.createElement("i", { className: "fas fa-chevron-left" })
      ),
      React.createElement(
        "button",
        {
          className: "kc-carousel-btn kc-carousel-next",
          onClick: () => handleChange(1),
          type: "button",
          "aria-label": "Próximo slide",
        },
        React.createElement("i", { className: "fas fa-chevron-right" })
      ),
      React.createElement(
        "div",
        { className: "kc-carousel-dots" },
        slides.map((slide, index) =>
          React.createElement("button", {
            className: `kc-dot ${index === current ? "active" : ""}`,
            key: slide.id,
            onClick: () => setCurrent(index),
            type: "button",
            "aria-label": `Ir para o destaque ${index + 1}`,
          })
        )
      )
    );
  }

  function RankingBanner(props) {
    return React.createElement(
      "div",
      { className: "kc-ranking-banner" },
      React.createElement(
        "div",
        { className: "kc-ranking-title" },
        React.createElement("i", { className: "fas fa-trophy" }),
        React.createElement("span", null, "Top Contribuidores da UFG")
      ),
      React.createElement(
        "div",
        { className: "kc-ranking-users" },
        props.users.map((user) =>
          React.createElement(
            "div",
            { className: "kc-ranking-user", key: user.id },
            React.createElement(
              "div",
              { className: "kc-ranking-user-avatar" },
              React.createElement("img", { alt: user.name, src: user.avatar }),
              React.createElement("span", { className: "kc-ranking-user-position" }, user.position)
            ),
            React.createElement("span", { className: "kc-ranking-user-name" }, user.name)
          )
        )
      )
    );
  }

  function FeedTabs(props) {
    const tabs = props.tabs;
    const defaultTab = tabs.find((tab) => tab.active) || tabs[0];
    const [activeTab, setActiveTab] = useState(defaultTab ? defaultTab.id : undefined);

    const handleTabClick = (event, tab) => {
      if (tab.href === "#") {
        event.preventDefault();
        setActiveTab(tab.id);
      }
    };

    return React.createElement(
      "div",
      { className: "kc-feed-tabs" },
      tabs.map((tab) =>
        React.createElement(
          "a",
          {
            className: tab.id === activeTab ? "active" : "",
            href: tab.href,
            key: tab.id,
            onClick: (event) => handleTabClick(event, tab),
          },
          React.createElement("i", { className: `fas ${tab.icon}` }),
          React.createElement("span", null, tab.label)
        )
      )
    );
  }

  function FeedCard(props) {
    const card = props.card;
    const handleVote = (event, type) => {
      if (typeof window.vote === "function") {
        window.vote(event.currentTarget, type);
      }
    };

    const priceClassName = card.priceTone === "success" ? "kc-card__price kc-card__price--success" : "kc-card__price";

    return React.createElement(
      "article",
      { className: "kc-card", "data-category": card.category, "data-post-id": card.id },
      card.cashback
        ? React.createElement(
            "span",
            { className: "kc-cashback-badge" },
            React.createElement("i", { className: "fas fa-coins" }),
            " ",
            card.cashback
          )
        : null,
      React.createElement(
        "div",
        { className: "kc-card__main" },
        React.createElement(
          "div",
          { className: "kc-card__image-wrapper" },
          card.image
            ? React.createElement("img", { alt: card.imageAlt, src: card.image })
            : React.createElement("i", { className: `fas ${card.icon} kc-card__image-icon`, "aria-hidden": "true" })
        ),
        React.createElement(
          "div",
          { className: "kc-card__content" },
          React.createElement(
            "div",
            { className: "kc-card__header" },
            React.createElement(
              "div",
              { className: "kc-card__category-source" },
              card.categorySource.text,
              card.categorySource.tag
                ? React.createElement(
                    React.Fragment,
                    null,
                    " ",
                    "• ",
                    React.createElement("a", { href: card.categorySource.tag.href }, card.categorySource.tag.label),
                    " ",
                    React.createElement("i", { className: `fas ${card.categorySource.tag.icon}` })
                  )
                : null
            ),
            React.createElement("div", { className: "kc-card__timestamp" }, card.timestamp)
          ),
          React.createElement("a", { className: "kc-card__title", href: card.href }, card.title),
          React.createElement(
            "div",
            { className: priceClassName },
            React.createElement("i", {
              className: `fas ${card.priceTone === "success" ? "fa-gift" : "fa-money-bill-wave"}`,
            }),
            card.price,
            card.priceMeta ? React.createElement("small", null, card.priceMeta) : null,
            card.badge ? React.createElement("span", { className: card.badge.className }, card.badge.text) : null
          ),
          card.description ? React.createElement("div", { className: "kc-card__description-preview" }, card.description) : null,
          React.createElement(
            "div",
            { className: "kc-card__author" },
            React.createElement("img", { alt: card.author.name, src: card.author.avatar }),
            React.createElement(
              "span",
              null,
              `${card.author.prefix} `,
              React.createElement("strong", null, card.author.name)
            ),
            React.createElement("i", { className: "fas fa-star" }),
            " ",
            card.author.rating
          )
        )
      ),
      React.createElement(
        "div",
        { className: "kc-card__footer" },
        React.createElement(
          "div",
          { className: "kc-card__interactions" },
          React.createElement(
            "div",
            { className: "kc-vote-box" },
            React.createElement(
              "button",
              { className: "hot", onClick: (event) => handleVote(event, "hot"), type: "button" },
              React.createElement("i", { className: "fas fa-fire" })
            ),
            React.createElement("span", null, card.votes),
            React.createElement(
              "button",
              { className: "cold", onClick: (event) => handleVote(event, "cold"), type: "button" },
              React.createElement("i", { className: "fas fa-snowflake" })
            )
          ),
          React.createElement(
            "a",
            { className: "kc-comment-link", href: `${card.href}#comments` },
            React.createElement("i", { className: "fas fa-comment" }),
            React.createElement("span", null, card.comments)
          )
        ),
        React.createElement("a", { className: "kc-action-button kc-get-coupon-button", href: card.href }, card.actionLabel)
      )
    );
  }

  function FeedList(props) {
    return React.createElement(
      "div",
      { className: "kc-feed-list" },
      props.cards.map((card) => React.createElement(FeedCard, { card, key: card.id }))
    );
  }

  function HomeFeed() {
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(HeroCarousel, { slides: heroSlides }),
      React.createElement(RankingBanner, { users: rankingUsers }),
      React.createElement(FeedTabs, { tabs: feedTabs }),
      React.createElement(FeedList, { cards: feedCards })
    );
  }

  ReactDOM.createRoot(root).render(React.createElement(HomeFeed));
})();
