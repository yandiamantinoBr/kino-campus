const { useEffect, useState } = React;

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

function HeroCarousel({ slides }) {
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

  return (
    <div className="kc-hero-carousel" data-kc-react-hero="true">
      <div className="kc-hero-slides">
        {slides.map((slide, index) => (
          <div
            className={`kc-hero-banner ${index === current ? "active" : ""}`}
            data-hero-icon={slide.iconKey}
            key={slide.id}
          >
            <div className="kc-hero-inner">
              <div className="kc-hero-content">
                <span className="kc-hero-pill">{slide.pill}</span>
                <h1>{slide.title}</h1>
                <p>{slide.description}</p>
                <a className="kc-btn-primary" href={slide.href}>
                  {slide.cta}
                </a>
              </div>
              <div aria-hidden="true" className="kc-hero-illustration">
                <i className={`fas ${slide.icon}`}></i>
              </div>
            </div>
          </div>
        ))}
      </div>
      <button
        className="kc-carousel-btn kc-carousel-prev"
        onClick={() => handleChange(-1)}
        type="button"
        aria-label="Slide anterior"
      >
        <i className="fas fa-chevron-left"></i>
      </button>
      <button
        className="kc-carousel-btn kc-carousel-next"
        onClick={() => handleChange(1)}
        type="button"
        aria-label="Próximo slide"
      >
        <i className="fas fa-chevron-right"></i>
      </button>
      <div className="kc-carousel-dots">
        {slides.map((slide, index) => (
          <button
            className={`kc-dot ${index === current ? "active" : ""}`}
            key={slide.id}
            onClick={() => setCurrent(index)}
            type="button"
            aria-label={`Ir para o destaque ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

function RankingBanner({ users }) {
  return (
    <div className="kc-ranking-banner">
      <div className="kc-ranking-title">
        <i className="fas fa-trophy"></i>
        <span>Top Contribuidores da UFG</span>
      </div>
      <div className="kc-ranking-users">
        {users.map((user) => (
          <div className="kc-ranking-user" key={user.id}>
            <div className="kc-ranking-user-avatar">
              <img alt={user.name} src={user.avatar} />
              <span className="kc-ranking-user-position">{user.position}</span>
            </div>
            <span className="kc-ranking-user-name">{user.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FeedTabs({ tabs }) {
  const defaultTab = tabs.find((tab) => tab.active) ?? tabs[0];
  const [activeTab, setActiveTab] = useState(defaultTab?.id);

  const handleTabClick = (event, tab) => {
    if (tab.href === "#") {
      event.preventDefault();
      setActiveTab(tab.id);
    }
  };

  return (
    <div className="kc-feed-tabs">
      {tabs.map((tab) => (
        <a
          className={tab.id === activeTab ? "active" : ""}
          href={tab.href}
          key={tab.id}
          onClick={(event) => handleTabClick(event, tab)}
        >
          <i className={`fas ${tab.icon}`}></i>
          <span>{tab.label}</span>
        </a>
      ))}
    </div>
  );
}

function FeedCard({ card }) {
  const handleVote = (event, type) => {
    if (typeof window.vote === "function") {
      window.vote(event.currentTarget, type);
    }
  };

  const priceClassName = card.priceTone === "success" ? "kc-card__price kc-card__price--success" : "kc-card__price";

  return (
    <article className="kc-card" data-category={card.category} data-post-id={card.id}>
      {card.cashback && (
        <span className="kc-cashback-badge">
          <i className="fas fa-coins"></i> {card.cashback}
        </span>
      )}
      <div className="kc-card__main">
        <div className="kc-card__image-wrapper">
          {card.image && <img alt={card.imageAlt} src={card.image} />}
          {!card.image && card.icon && <i className={`fas ${card.icon} kc-card__image-icon`} aria-hidden="true"></i>}
        </div>
        <div className="kc-card__content">
          <div className="kc-card__header">
            <div className="kc-card__category-source">
              {card.categorySource.text}
              {card.categorySource.tag && (
                <>
                  {" "}
                  •{" "}
                  <a href={card.categorySource.tag.href}>{card.categorySource.tag.label}</a>{" "}
                  <i className={`fas ${card.categorySource.tag.icon}`}></i>
                </>
              )}
            </div>
            <div className="kc-card__timestamp">{card.timestamp}</div>
          </div>
          <a className="kc-card__title" href={card.href}>
            {card.title}
          </a>
          <div className={priceClassName}>
            <i className={`fas ${card.priceTone === "success" ? "fa-gift" : "fa-money-bill-wave"}`}></i>
            {card.price}
            {card.priceMeta && <small>{card.priceMeta}</small>}
            {card.badge && <span className={card.badge.className}>{card.badge.text}</span>}
          </div>
          {card.description && <div className="kc-card__description-preview">{card.description}</div>}
          <div className="kc-card__author">
            <img alt={card.author.name} src={card.author.avatar} />
            <span>
              {card.author.prefix} <strong>{card.author.name}</strong>
            </span>
            <i className="fas fa-star"></i> {card.author.rating}
          </div>
        </div>
      </div>
      <div className="kc-card__footer">
        <div className="kc-card__interactions">
          <div className="kc-vote-box">
            <button className="hot" onClick={(event) => handleVote(event, "hot")} type="button">
              <i className="fas fa-fire"></i>
            </button>
            <span>{card.votes}</span>
            <button className="cold" onClick={(event) => handleVote(event, "cold")} type="button">
              <i className="fas fa-snowflake"></i>
            </button>
          </div>
          <a className="kc-comment-link" href={`${card.href}#comments`}>
            <i className="fas fa-comment"></i>
            <span>{card.comments}</span>
          </a>
        </div>
        <a className="kc-action-button kc-get-coupon-button" href={card.href}>
          {card.actionLabel}
        </a>
      </div>
    </article>
  );
}

function FeedList({ cards }) {
  return (
    <div className="kc-feed-list">
      {cards.map((card) => (
        <FeedCard card={card} key={card.id} />
      ))}
    </div>
  );
}

function HomeFeed() {
  return (
    <>
      <HeroCarousel slides={heroSlides} />
      <RankingBanner users={rankingUsers} />
      <FeedTabs tabs={feedTabs} />
      <FeedList cards={feedCards} />
    </>
  );
}

const homeFeedRoot = document.getElementById("kc-home-feed-root");
if (homeFeedRoot) {
  ReactDOM.createRoot(homeFeedRoot).render(<HomeFeed />);
}
