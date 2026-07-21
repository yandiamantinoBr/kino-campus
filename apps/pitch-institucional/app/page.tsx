"use client";

/* Exact public SVG, live-site capture and generated QR data URLs are intentionally rendered without an image proxy. */
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import QRCode from "qrcode";
import {
  Accessibility,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bookmark,
  BookOpenCheck,
  Bot,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Car,
  ChartNoAxesCombined,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Code2,
  Compass,
  Copy,
  Database,
  Download,
  ExternalLink,
  Eye,
  FileCheck2,
  Fullscreen,
  Globe2,
  GraduationCap,
  House,
  Layers3,
  Lightbulb,
  Link2,
  LockKeyhole,
  Maximize2,
  Menu,
  MessageCircleQuestion,
  MessageSquareText,
  MonitorSmartphone,
  Network,
  Presentation,
  Printer,
  QrCode,
  Rocket,
  Search,
  Send,
  Share2,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Sparkles,
  TestTube2,
  Users,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  allSlides,
  buildDeck,
  type Duration,
  type PresentationMode,
  type PromptDefinition,
  type SlideDefinition,
} from "./decks";

type SessionSnapshot = {
  code: string;
  duration: number;
  mode: string;
  currentSlide: number;
  activePrompt: string | null;
  status: string;
  updatedAt?: string;
  responseCount: number;
  aggregates: Record<string, Record<string, number>>;
};

type SessionApiResponse = {
  error?: string;
  session?: SessionSnapshot;
  presenterToken?: string;
};

async function readJson(response: Response): Promise<SessionApiResponse> {
  const raw = await response.text();
  if (!raw) {
    throw new Error(`O serviço de interação respondeu sem conteúdo (${response.status}).`);
  }
  try {
    return JSON.parse(raw) as SessionApiResponse;
  } catch {
    throw new Error("O serviço de interação retornou uma resposta inválida.");
  }
}

function subscribeToLocation(callback: () => void) {
  window.addEventListener("popstate", callback);
  return () => window.removeEventListener("popstate", callback);
}

function getLocationSearch() {
  return window.location.search;
}

function getServerSearch() {
  return "";
}

function createParticipantId() {
  const values = new Uint8Array(16);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => value.toString(16).padStart(2, "0")).join("");
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const input = document.createElement("textarea");
    input.value = value;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  }
}

const durationLabels: Record<Duration, string> = {
  5: "5 min",
  15: "15 min",
  30: "30 min",
};

const durationDescriptions: Record<Duration, string> = {
  5: "Decisão rápida",
  15: "Reunião executiva",
  30: "Apresentação aprofundada",
};

const moduleItems = [
  { label: "Eventos", icon: CalendarDays, accent: "blue", href: "https://www.kinocampus.com.br/eventos.html" },
  { label: "Oportunidades", icon: BriefcaseBusiness, accent: "green", href: "https://www.kinocampus.com.br/oportunidades.html" },
  { label: "Moradia", icon: House, accent: "orange", href: "https://www.kinocampus.com.br/moradia.html" },
  { label: "Compra e Venda", icon: ShoppingBag, accent: "yellow", href: "https://www.kinocampus.com.br/compra-venda-feed.html" },
  { label: "Caronas", icon: Car, accent: "blue", href: "https://www.kinocampus.com.br/caronas-feed.html" },
  { label: "Achados/Perdidos", icon: CircleHelp, accent: "green", href: "https://www.kinocampus.com.br/achados-perdidos.html" },
];

const KINO_URLS = {
  home: "https://www.kinocampus.com.br/",
  event: "https://www.kinocampus.com.br/product.html?id=b72f0f4c-29cc-462a-84c9-8b25faf4e445",
  languageCenter: "https://www.kinocampus.com.br/product.html?id=0ac23479-325c-428f-80d7-28431217bbde",
  opportunity: "https://www.kinocampus.com.br/product.html?id=2c139f6c-8d05-43f6-b242-85980428e0d7",
  opportunities: "https://www.kinocampus.com.br/oportunidades.html",
  transparency: "https://www.kinocampus.com.br/transparencia.html",
};

function KinoMark({ className = "" }: { className?: string }) {
  return <img className={`kino-mark ${className}`} src="/kino-campus-logo.svg" alt="" aria-hidden="true" />;
}

function KinoLogo({ compact = false }: { compact?: boolean }) {
  return (
    <a
      className={`kino-logo ${compact ? "kino-logo--compact" : ""}`}
      href={KINO_URLS.home}
      target="_blank"
      rel="noreferrer"
      aria-label="Ir para a página inicial do KinoCampus"
      title="Ir para o KinoCampus"
    >
      <span className="kino-logo__mark" aria-hidden="true">
        <KinoMark />
      </span>
      <span className="kino-logo__text">
        <strong>
          Kino<span>Campus</span>
        </strong>
        {!compact && <small>Comunidade UFG</small>}
      </span>
    </a>
  );
}

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={value === option.value ? "is-active" : ""}
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ModulePreview() {
  return (
    <div className="launch-visual" aria-label="Prévia dos módulos Eventos, Oportunidades e Cadu Bot">
      <span className="shape shape--blue" />
      <span className="shape shape--green" />
      <span className="shape shape--cream" />
      <a className="preview-card preview-card--event" href={KINO_URLS.languageCenter} target="_blank" rel="noreferrer" aria-label="Abrir a publicação do Centro de Línguas no Kino Campus">
        <div className="preview-card__topline">
          <span className="icon-badge icon-badge--blue"><CalendarDays size={22} /></span>
          <span className="date-chip">27 JUL · 14:00</span>
          <CheckCircle2 size={18} className="verified" />
        </div>
        <h3>Centro de Línguas UFG</h3>
        <p><Building2 size={15} /> Campus Samambaia <span>·</span> Matrículas abertas</p>
        <div className="tag-row"><span>Cursos</span><span>Evento</span><span className="tag-verified">Fonte oficial</span></div>
      </a>
      <a className="preview-card preview-card--opportunity" href={KINO_URLS.opportunity} target="_blank" rel="noreferrer" aria-label="Abrir a oportunidade de bolsas AUIP no Kino Campus">
        <div className="preview-card__topline">
          <span className="icon-badge icon-badge--green"><BriefcaseBusiness size={22} /></span>
          <span className="date-chip date-chip--green">INSCRIÇÕES ABERTAS</span>
          <CheckCircle2 size={18} className="verified" />
        </div>
        <h3>Bolsas AUIP para Dupla Titulação</h3>
        <p><GraduationCap size={15} /> Pós-graduação <span>·</span> <Clock3 size={15} /> Convocatória 2027</p>
        <div className="tag-row"><span>Pesquisa</span><span>Até €5.000</span><span className="tag-verified">Verificável</span></div>
      </a>
      <a className="preview-card preview-card--bot" href={KINO_URLS.transparency} target="_blank" rel="noreferrer" aria-label="Conhecer a transparência e a curadoria do Cadu Bot">
        <span className="icon-badge icon-badge--orange"><Bot size={22} /></span>
        <div><strong>Cadu Bot</strong><small>Fontes públicas → conteúdo útil</small></div>
        <ArrowRight size={21} />
      </a>
      <a href="https://www.kinocampus.com.br/eventos.html" target="_blank" rel="noreferrer" className="module-orbit module-orbit--event"><CalendarDays size={20} /><span>Eventos</span></a>
      <a href={KINO_URLS.opportunities} target="_blank" rel="noreferrer" className="module-orbit module-orbit--opportunity"><BriefcaseBusiness size={20} /><span>Oportunidades</span></a>
      <a href={KINO_URLS.transparency} target="_blank" rel="noreferrer" className="module-orbit module-orbit--bot"><Bot size={20} /><span>Cadu Bot</span></a>
    </div>
  );
}

function LaunchScreen({
  duration,
  mode,
  onDuration,
  onMode,
  onStart,
}: {
  duration: Duration;
  mode: PresentationMode;
  onDuration: (duration: Duration) => void;
  onMode: (mode: PresentationMode) => void;
  onStart: () => void;
}) {
  const count = buildDeck(duration, mode).length;
  return (
    <main className="launch-shell">
      <header className="launch-header">
        <KinoLogo />
        <div className="launch-header__controls">
          <Segmented
            value={duration}
            options={([5, 15, 30] as Duration[]).map((item) => ({ value: item, label: `${item} min` }))}
            onChange={onDuration}
            label="Duração da apresentação"
          />
          <span className="header-divider" />
          <Segmented
            value={mode}
            options={[
              { value: "expositivo" as const, label: "Expositivo" },
              { value: "interativo" as const, label: "Interativo" },
            ]}
            onChange={onMode}
            label="Modalidade da apresentação"
          />
        </div>
      </header>

      <section className="launch-hero">
        <div className="launch-copy">
          <p className="eyebrow">PITCH INSTITUCIONAL · UFG</p>
          <h1>Toda a vida universitária, em um só lugar.</h1>
          <p className="launch-lead">
            Eventos e oportunidades que hoje se perdem entre sites, perfis e grupos —
            organizados, verificáveis e fáceis de encontrar.
          </p>
          <div className="launch-actions">
            <button className="primary-cta" type="button" onClick={onStart}>
              Iniciar apresentação <ArrowRight size={23} />
            </button>
            <a className="launch-read-link" href={`/?read=${duration}-${mode}`} target="_blank" rel="noreferrer"><Eye size={19} /> Versão para leitura</a>
            <span className="live-status"><i /> Piloto funcional em produção</span>
          </div>
          <div className="selection-summary">
            <strong>{durationDescriptions[duration]}</strong>
            <span>{count} telas · {mode === "interativo" ? "participação ao vivo" : "narrativa contínua"}</span>
          </div>
        </div>
        <ModulePreview />
      </section>

      <footer className="launch-footer">
        <span><Globe2 size={17} /> kinocampus.com.br</span>
        <span><Layers3 size={17} /> 6 módulos conectados</span>
        <span><ShieldCheck size={17} /> A fonte oficial prevalece</span>
        <span className="launch-footer__hint"><ArrowRight size={16} /> Use ← → ou o celular para avançar</span>
      </footer>
    </main>
  );
}

function InteractionResults({
  prompt,
  aggregates,
}: {
  prompt: PromptDefinition;
  aggregates: Record<string, number>;
}) {
  const entries = Object.entries(aggregates).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);

  if (prompt.type === "word") {
    const max = Math.max(1, ...entries.map(([, count]) => count));
    const palette = ["#071a3d", "#ff5a0a", "#168bab", "#208c52", "#876b58", "#5b4db8"];
    return (
      <div className="word-cloud" aria-label={`${total} respostas na nuvem de palavras`}>
        {entries.length === 0 ? (
          <div className="results-empty">
            <MessageSquareText size={34} />
            <span>A nuvem se forma com as palavras do público.</span>
            <small>Cada celular envia uma palavra — as mais repetidas ficam maiores.</small>
          </div>
        ) : (
          entries.slice(0, 36).map(([word, count], index) => {
            const weight = count / max;
            const rotate = ((index * 47) % 11) - 5;
            return (
              <span
                key={word}
                className="word-cloud__word"
                title={`${count} ${count === 1 ? "menção" : "menções"}`}
                style={{
                  fontSize: `${1.15 + weight * 2.85}rem`,
                  color: palette[index % palette.length],
                  opacity: 0.78 + weight * 0.22,
                  transform: `rotate(${rotate}deg)`,
                  animationDelay: `${Math.min(index, 18) * 28}ms`,
                  zIndex: Math.round(weight * 10),
                }}
              >
                {word}
              </span>
            );
          })
        )}
      </div>
    );
  }

  const options = prompt.options ?? [];
  const max = Math.max(1, ...options.map((option) => aggregates[option] ?? 0));
  return (
    <div className="poll-results">
      {options.map((option, index) => {
        const count = aggregates[option] ?? 0;
        const percentage = total ? Math.round((count / total) * 100) : 0;
        return (
          <div className="poll-row" key={option}>
            <div className="poll-row__label"><span>{option}</span><strong>{percentage}%</strong></div>
            <div className="poll-row__track"><i style={{ width: `${(count / max) * 100}%` }} data-color={index % 4} /></div>
            <small>{count} {count === 1 ? "resposta" : "respostas"}</small>
          </div>
        );
      })}
    </div>
  );
}

function CardMock({ type }: { type: "event" | "opportunity" }) {
  const event = type === "event";
  const [saved, setSaved] = useState(false);
  const href = event ? KINO_URLS.event : KINO_URLS.opportunity;
  return (
    <article className={`product-mock product-mock--${type}`}>
      <div className="product-mock__visual">
        {event ? <CalendarDays size={48} /> : <BriefcaseBusiness size={48} />}
        <span>{event ? "EVENTO" : "OPORTUNIDADE"}</span>
      </div>
      <div className="product-mock__content">
        <div className="tag-row">
          <span>{event ? "Cursos" : "Pesquisa"}</span>
          <span className="tag-verified"><CheckCircle2 size={13} /> Fonte verificável</span>
        </div>
        <h3>{event ? "Fastcamp de Dados Sintéticos para IA — EMC/UFG" : "Bolsas AUIP de até €5.000 para Dupla Titulação"}</h3>
        <p>{event ? "Workshop · Escola de Engenharia Elétrica, Mecânica e de Computação" : "Convocatória 2026–2027 · Pós-graduação"}</p>
        <div className="product-mock__action">
          <button type="button" onClick={() => setSaved((current) => !current)} aria-pressed={saved}>
            <Bookmark size={17} fill={saved ? "currentColor" : "none"} /> {saved ? "Salvo" : "Salvar"}
          </button>
          <span />
          <a href={href} target="_blank" rel="noreferrer">Abrir publicação <ExternalLink size={16} /></a>
        </div>
      </div>
    </article>
  );
}

function SlideVisual({
  slide,
  session,
}: {
  slide: SlideDefinition;
  session: SessionSnapshot | null;
}) {
  const promptAggregates = slide.prompt
    ? session?.aggregates?.[slide.prompt.id] ?? {}
    : {};

  switch (slide.variant) {
    case "vision":
      return <ModulePreview />;
    case "pain":
      return (
        <div className="pain-map">
          <div className="pain-map__channels">
            {["Portal UFG", "Pró-reitorias", "Unidades", "Instagram", "WhatsApp", "Projetos", "Editais", "Eventos"].map((item, index) => (
              <span key={item} style={{ "--i": index } as React.CSSProperties}>{item}</span>
            ))}
          </div>
          <div className="pain-map__person"><Search size={30} /><strong>Onde eu encontro?</strong><small>8 abas abertas · 1 prazo amanhã</small></div>
          <div className="deadline-alert"><Clock3 size={20} /><span>Prazo curto</span><strong>18h restantes</strong></div>
        </div>
      );
    case "map":
      return (
        <div className="source-map">
          <div className="source-map__center"><KinoMark className="kino-mark--diagram" /><strong>Kino Campus</strong><small>camada de descoberta</small></div>
          {["UFG", "PROGRAD", "PROEX", "PRPI", "PRAE", "Unidades", "Projetos", "Instagram"].map((item, index) => (
            <span className={`source-node source-node--${index + 1}`} key={item}>{item}</span>
          ))}
          <svg viewBox="0 0 600 520" aria-hidden="true"><circle cx="300" cy="260" r="178" /><circle cx="300" cy="260" r="118" /></svg>
        </div>
      );
    case "solution":
      return (
        <div className="solution-flow">
          {[
            [Network, "Descobrir", "Fontes e publicações dispersas"],
            [FileCheck2, "Organizar", "Prazo, contexto e categoria"],
            [Compass, "Decidir", "Vale para mim? Ainda está aberto?"],
            [ExternalLink, "Confirmar", "Fonte oficial e documentos"],
          ].map(([Icon, label, text], index) => {
            const FlowIcon = Icon as typeof Network;
            return (
              <div className="solution-step" key={label as string}>
                <span>{index + 1}</span><FlowIcon size={27} /><strong>{label as string}</strong><small>{text as string}</small>
              </div>
            );
          })}
        </div>
      );
    case "modules":
      return <div className="dual-cards"><CardMock type="event" /><CardMock type="opportunity" /></div>;
    case "event":
      return (
        <div className="focus-card focus-card--event">
          <div className="calendar-sheet"><span>JUL</span><strong>27</strong><small>SEG</small></div>
          <div><span className="focus-label">CURSOS · EVENTOS</span><h3>Centro de Línguas UFG</h3><p>Campus Samambaia · Matrículas 2026/2</p><div className="focus-meta"><span><Clock3 /> Prazo</span><span><Building2 /> Local</span><span><Link2 /> Inscrição</span></div><a className="focus-link" href={KINO_URLS.languageCenter} target="_blank" rel="noreferrer">Ver publicação <ExternalLink size={16} /></a></div>
        </div>
      );
    case "opportunity":
      return (
        <div className="focus-card focus-card--opportunity">
          <span className="opportunity-stamp"><BriefcaseBusiness size={32} /> INSCRIÇÕES ABERTAS</span>
          <h3>Bolsa de Pesquisa</h3><p>Público-alvo, requisitos, remuneração e cronograma antes do clique.</p>
          <div className="opportunity-list"><span><Check /> Prazo visível</span><span><Check /> Edital original</span><span><Check /> Área e modalidade</span></div>
          <a className="opportunity-link" href={KINO_URLS.opportunity} target="_blank" rel="noreferrer">Ver oportunidade real <ExternalLink size={17} /></a>
        </div>
      );
    case "journey":
      return (
        <div className="journey-grid">
          <div className="journey-side journey-side--before"><span>ANTES</span><strong>Procurar</strong>{["Abrir vários perfis", "Comparar datas", "Procurar o edital", "Perguntar no grupo"].map((x) => <small key={x}><X size={15} />{x}</small>)}</div>
          <ArrowRight className="journey-arrow" size={34} />
          <div className="journey-side journey-side--after"><span>COM KINO CAMPUS</span><strong>Decidir</strong>{["Filtrar", "Entender", "Salvar", "Confirmar na fonte"].map((x) => <small key={x}><Check size={15} />{x}</small>)}</div>
        </div>
      );
    case "product":
      return (
        <div className="browser-shot">
          <div className="browser-shot__bar"><i /><i /><i /><span>kinocampus.com.br</span><ExternalLink size={16} /></div>
          {/* The image is a live public-page capture made on 14 July 2026. */}
          <img src="/kino-home-live.jpg" alt="Captura real da página inicial do Kino Campus em produção" />
          <a href={KINO_URLS.home} target="_blank" rel="noreferrer">Abrir demonstração ao vivo <ExternalLink size={17} /></a>
        </div>
      );
    case "cadu":
      return (
        <div className="cadu-flow">
          {[Globe2, Search, Sparkles, ShieldCheck, Send].map((Icon, index) => (
            <div className="cadu-stage" key={index}><span><Icon size={26} /></span><strong>{["Fontes", "Coleta", "Organização", "Qualidade", "Publicação"][index]}</strong><small>{["Públicas", "Conteúdo acionável", "Contexto e campos", "Bloqueios e revisão", "Kino Campus"][index]}</small></div>
          ))}
          <div className="cadu-bot-mark"><Bot size={33} /><span>Cadu</span></div>
        </div>
      );
    case "six-modules":
      return <div className="modules-grid">{moduleItems.map(({ label, icon: Icon, accent, href }) => <a href={href} target="_blank" rel="noreferrer" key={label} className={`module-tile module-tile--${accent}`}><Icon size={27} /><strong>{label}</strong><small>{label === "Eventos" || label === "Oportunidades" ? "Núcleo institucional" : "Vida comunitária"}</small></a>)}</div>;
    case "governance":
      return (
        <div className="governance-stack">
          {["Fonte e contexto", "Critérios editoriais", "Revisão e denúncia", "Correção e transparência"].map((item, index) => <div key={item}><span>0{index + 1}</span><strong>{item}</strong><ShieldCheck size={22} /></div>)}
          <p><LockKeyhole size={20} /> A confiança é um processo, não um selo absoluto.</p>
        </div>
      );
    case "privacy":
      return (
        <div className="privacy-panel">
          <div><LockKeyhole size={35} /><strong>Privacidade por desenho</strong><small>Sem bases acadêmicas privadas no piloto</small><small>Consentimento e exclusão de conta</small><small>Áreas públicas e privadas separadas</small></div>
          <div><Accessibility size={35} /><strong>Acesso para mais pessoas</strong><small>Navegação por teclado</small><small>Layouts responsivos</small><small>Rótulos e textos alternativos</small></div>
        </div>
      );
    case "architecture":
      return (
        <div className="architecture-grid">
          {[[Code2, "Web", "HTML · CSS · JavaScript"], [Database, "Dados", "Supabase · PostgreSQL"], [ShieldCheck, "Acesso", "RLS · autenticação"], [TestTube2, "Qualidade", "Testes automatizados · E2E"], [Rocket, "Entrega", "Vercel · CI/CD"], [Globe2, "Transparência", "Repositório público"]].map(([Icon, title, text]) => { const I = Icon as typeof Code2; return <div key={title as string}><I size={25} /><strong>{title as string}</strong><small>{text as string}</small></div>; })}
        </div>
      );
    case "value":
      return (
        <div className="value-grid">
          {[[Eye, "Descoberta", "Mais iniciativas encontradas"], [Clock3, "Temporalidade", "Prazos mais visíveis"], [Share2, "Circulação", "Conteúdo pronto para compartilhar"], [BarChart3, "Aprendizado", "Sinais agregados de interesse"]].map(([Icon, title, text]) => { const I = Icon as typeof Eye; return <div key={title as string}><I size={29} /><strong>{title as string}</strong><small>{text as string}</small></div>; })}
        </div>
      );
    case "stakeholders":
      return (
        <div className="stakeholder-map">
          <div className="stakeholder-center"><KinoMark className="kino-mark--diagram" /><strong>Kino Campus</strong></div>
          {[[GraduationCap, "Estudantes", "encontram"], [BookOpenCheck, "Docentes", "divulgam"], [Building2, "Unidades", "ampliam alcance"], [ChartNoAxesCombined, "Gestão", "aprende"]].map(([Icon, title, action], index) => { const I = Icon as typeof GraduationCap; return <div className={`stakeholder-node stakeholder-node--${index + 1}`} key={title as string}><I size={25} /><strong>{title as string}</strong><small>{action as string}</small></div>; })}
        </div>
      );
    case "partnership":
      return (
        <div className="partnership-levels">
          <div><span>01</span><Lightbulb size={26} /><strong>Apoio</strong><p>Divulgação e indicação de fontes</p></div>
          <div className="is-featured"><span>02</span><Users size={26} /><strong>Piloto</strong><p>Unidades, pontos focais e revisão</p><small>PRÓXIMO PASSO</small></div>
          <div><span>03</span><Layers3 size={26} /><strong>Co-desenho</strong><p>Governança, indicadores e expansão</p></div>
        </div>
      );
    case "risk":
      return <div className="risk-list">{(slide.points ?? []).map((point, index) => <div key={point}><span>{index + 1}</span><ShieldCheck size={23} /><strong>{point}</strong></div>)}</div>;
    case "pilot":
      return (
        <div className="pilot-timeline">
          {[["01–15", "Mapear", "Unidades, fontes e critérios"], ["16–45", "Operar", "Curadoria e correções"], ["46–75", "Medir", "Uso, cobertura e qualidade"], ["76–90", "Decidir", "Relatório e próximos passos"]].map(([days, title, text], index) => <div key={days}><span className="pilot-dot">{index + 1}</span><small>DIAS {days}</small><strong>{title}</strong><p>{text}</p></div>)}
        </div>
      );
    case "metrics":
      return (
        <div className="metrics-board">
          <div className="metric-big"><span>Indicador principal</span><strong>Utilidade percebida</strong><small>Pesquisa antes e depois</small><ChartNoAxesCombined size={43} /></div>
          {["Cobertura de fontes", "Tempo de atualização", "Cliques para a fonte", "Correções e duplicidades"].map((item, index) => <div className="metric-small" key={item}><i style={{ width: `${[82, 64, 76, 38][index]}%` }} /><strong>{item}</strong><small>Linha de base → piloto</small></div>)}
        </div>
      );
    case "scale":
      return (
        <div className="scale-map">
          <div className="scale-core"><Building2 size={35} /><strong>UFG</strong><small>validar primeiro</small></div>
          <div className="scale-ring scale-ring--1"><Building2 size={22} /><span>IES pública</span></div>
          <div className="scale-ring scale-ring--2"><GraduationCap size={22} /><span>IES privada</span></div>
          <div className="scale-ring scale-ring--3"><Globe2 size={22} /><span>Ecossistemas locais</span></div>
          <svg viewBox="0 0 620 520" aria-hidden="true"><path d="M310 260 C180 150 120 140 62 110" /><path d="M310 260 C420 130 500 115 565 96" /><path d="M310 260 C390 370 470 410 560 435" /></svg>
        </div>
      );
    case "interaction":
      return (
        <div className="interaction-stage">
          <div className="interaction-stage__meta"><span><Smartphone size={20} /> Responda pelo celular</span><strong>{session ? `${session.responseCount} participações` : "Sessão interativa ainda não iniciada"}</strong></div>
          {slide.prompt && <InteractionResults prompt={slide.prompt} aggregates={promptAggregates} />}
        </div>
      );
    case "ask":
      return (
        <div className="ask-card">
          <span className="ask-icon"><Rocket size={35} /></span>
          <p>Precisamos de</p><strong>1 patrocinador institucional</strong><strong>3–5 unidades interessadas</strong><strong>1 reunião de desenho</strong>
          <a href="mailto:contato@kinocampus.com.br">contato@kinocampus.com.br <ArrowRight size={19} /></a>
        </div>
      );
    default:
      return null;
  }
}

function SlideCanvas({
  slide,
  index,
  total,
  session,
}: {
  slide: SlideDefinition;
  index: number;
  total: number;
  session: SessionSnapshot | null;
}) {
  return (
    <section className={`slide slide--${slide.variant}`} aria-label={`Slide ${index + 1} de ${total}: ${slide.title}`}>
      <div className="slide__copy">
        <p className="eyebrow">{slide.kicker}</p>
        <h1>{slide.title}</h1>
        <p className="slide__body">{slide.body}</p>
        {slide.points && !["risk"].includes(slide.variant) && (
          <div className="point-chips">{slide.points.map((point) => <span key={point}><Check size={15} />{point}</span>)}</div>
        )}
        {slide.prompt && session && (
          <div className="join-inline"><QrCode size={18} /><span>Acesse este endereço e use o código</span><strong>{session.code}</strong></div>
        )}
      </div>
      <div className="slide__visual"><SlideVisual slide={slide} session={session} /></div>
      <div className="slide__index" aria-hidden="true"><span>{String(index + 1).padStart(2, "0")}</span><i /><small>{slide.numberLabel}</small></div>
    </section>
  );
}

function SessionPanel({
  session,
  presenterToken,
  qrAudience,
  qrRemote,
  onClose,
}: {
  session: SessionSnapshot;
  presenterToken: string;
  qrAudience: string;
  qrRemote: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<"audience" | "remote" | "deck" | null>(null);
  const [remoteRevealed, setRemoteRevealed] = useState(false);
  const audienceUrl = typeof window === "undefined" ? "" : `${window.location.origin}/?join=${session.code}`;
  const remoteUrl = typeof window === "undefined" ? "" : `${window.location.origin}/?remote=${session.code}&token=${presenterToken}`;
  const deckUrl = typeof window === "undefined" ? "" : `${window.location.origin}/?read=${session.duration}-${session.mode}`;
  const copy = async (type: "audience" | "remote" | "deck") => {
    await copyText(type === "audience" ? audienceUrl : type === "remote" ? remoteUrl : deckUrl);
    setCopied(type);
    window.setTimeout(() => setCopied(null), 1600);
  };
  return (
    <aside className="session-panel" aria-label="Participação e controle pelo celular">
      <button className="icon-button session-panel__close" type="button" onClick={onClose} aria-label="Fechar"><X size={20} /></button>
      <p className="eyebrow">SESSÃO AO VIVO</p>
      <h2>Conecte os celulares</h2>
      <p>Projete somente o QR público. A participação é anônima e não exige cadastro.</p>
      <div className="session-panel__public">
        <span>PÚBLICO · SEM LOGIN</span>
        {qrAudience ? <img src={qrAudience} alt="QR code para participar da apresentação" /> : <div className="qr-placeholder" />}
        <strong>{session.code}</strong>
        <button type="button" onClick={() => copy("audience")}>{copied === "audience" ? <Check size={16} /> : <Copy size={16} />} Copiar link de participação</button>
      </div>
      <div className="session-panel__materials">
        <div><Presentation size={19} /><span><strong>Versão para leitura</strong><small>Sem notas e sem controle remoto</small></span></div>
        <button type="button" onClick={() => copy("deck")}>{copied === "deck" ? <Check size={16} /> : <Copy size={16} />} Copiar</button>
        <a href={deckUrl} target="_blank" rel="noreferrer">Abrir <ExternalLink size={15} /></a>
      </div>
      <div className={`remote-disclosure ${remoteRevealed ? "is-open" : ""}`}>
        <button type="button" className="remote-disclosure__toggle" aria-expanded={remoteRevealed} onClick={() => setRemoteRevealed((current) => !current)}>
          <LockKeyhole size={19} />
          <span><strong>{remoteRevealed ? "Ocultar controle privado" : "Mostrar controle privado"}</strong><small>Abra somente fora da visão do público</small></span>
          <ChevronRight size={18} />
        </button>
        {remoteRevealed && (
          <div className="remote-disclosure__content">
            <span>CONTROLE DO APRESENTADOR</span>
            {qrRemote ? <img src={qrRemote} alt="QR code privado para controlar os slides" /> : <div className="qr-placeholder" />}
            <strong><Smartphone size={17} /> Uso privado</strong>
            <button type="button" onClick={() => copy("remote")}>{copied === "remote" ? <Check size={16} /> : <Copy size={16} />} Copiar link privado</button>
            <a href={remoteUrl} target="_blank" rel="noreferrer">Abrir controle em nova guia <ExternalLink size={15} /></a>
          </div>
        )}
      </div>
      <small className="privacy-note"><ShieldCheck size={15} /> O público nunca recebe o token do apresentador.</small>
    </aside>
  );
}

function PresenterView({
  duration,
  mode,
  deck,
  current,
  onCurrent,
  onExit,
  session,
  presenterToken,
  onCreateSession,
  sessionError,
}: {
  duration: Duration;
  mode: PresentationMode;
  deck: SlideDefinition[];
  current: number;
  onCurrent: (index: number) => void;
  onExit: () => void;
  session: SessionSnapshot | null;
  presenterToken: string;
  onCreateSession: () => void;
  sessionError: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [projectionMode, setProjectionMode] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [qrAudience, setQrAudience] = useState("");
  const [qrRemote, setQrRemote] = useState("");
  const touchStart = useRef<number | null>(null);
  const touchIgnoreUntil = useRef(0);
  const slide = deck[current];

  const next = useCallback(() => onCurrent(Math.min(deck.length - 1, current + 1)), [current, deck.length, onCurrent]);
  const previous = useCallback(() => onCurrent(Math.max(0, current - 1)), [current, onCurrent]);

  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (["ArrowRight", "PageDown", " "].includes(event.key)) { event.preventDefault(); next(); }
      if (["ArrowLeft", "PageUp"].includes(event.key)) { event.preventDefault(); previous(); }
      if (event.key === "Home") { event.preventDefault(); onCurrent(0); }
      if (event.key === "End") { event.preventDefault(); onCurrent(deck.length - 1); }
      if (event.key === "Escape" && !document.fullscreenElement) onExit();
    };
    window.addEventListener("keydown", handler);
    const fs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", fs);
    return () => { window.removeEventListener("keydown", handler); document.removeEventListener("fullscreenchange", fs); };
  }, [deck.length, next, onCurrent, onExit, previous]);

  useEffect(() => {
    if (!session || !presenterToken) return;
    const audienceUrl = `${window.location.origin}/?join=${session.code}`;
    const remoteUrl = `${window.location.origin}/?remote=${session.code}&token=${presenterToken}`;
    Promise.all([QRCode.toDataURL(audienceUrl, { margin: 1, width: 240 }), QRCode.toDataURL(remoteUrl, { margin: 1, width: 240 })]).then(([audience, remote]) => { setQrAudience(audience); setQrRemote(remote); });
  }, [presenterToken, session]);

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  };
  const formattedTime = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  const markControlTouch = () => {
    // Prevent the same finger press from also being interpreted as a swipe.
    touchIgnoreUntil.current = Date.now() + 450;
    touchStart.current = null;
  };

  return (
    <main
      className={`presentation-shell ${projectionMode ? "is-projection" : ""}`}
      onTouchStart={(event) => {
        if (Date.now() < touchIgnoreUntil.current) return;
        const target = event.target as HTMLElement | null;
        if (target?.closest(".presentation-controls, .presentation-actions, .overview-drawer, .notes-drawer, .session-panel")) {
          touchStart.current = null;
          return;
        }
        touchStart.current = event.changedTouches[0].clientX;
      }}
      onTouchEnd={(event) => {
        if (touchStart.current === null || Date.now() < touchIgnoreUntil.current) {
          touchStart.current = null;
          return;
        }
        const distance = event.changedTouches[0].clientX - touchStart.current;
        if (distance < -60) next();
        if (distance > 60) previous();
        touchStart.current = null;
      }}
    >
      <header className="presentation-header">
        <div className="brand-button"><KinoLogo compact /></div>
        <div className="presentation-meta"><span>{durationLabels[duration]}</span><i /> <span>{mode === "interativo" ? "Interativo" : "Expositivo"}</span><i /> <strong>{slide.numberLabel}</strong></div>
        <div className="presentation-actions" onTouchStart={markControlTouch}>
          <span className="presentation-timer"><Clock3 size={16} /> {formattedTime}</span>
          <button
            type="button"
            data-kc-projection-toggle
            onClick={() => setProjectionMode((value) => !value)}
            className={projectionMode ? "is-active" : ""}
            aria-pressed={projectionMode}
            title={projectionMode ? "Restaurar tamanho do texto na projeção" : "Aumentar a legibilidade na projeção"}
            aria-label={projectionMode ? "Desativar modo de projeção e restaurar o tamanho do texto" : "Ativar modo de projeção para aumentar texto e contraste"}
          >
            {projectionMode ? <ZoomOut size={18} aria-hidden="true" /> : <ZoomIn size={18} aria-hidden="true" />}
            <span>Projeção</span>
          </button>
          <button type="button" onClick={() => { setNotesOpen((open) => !open); setMenuOpen(false); setSessionOpen(false); }} className={notesOpen ? "is-active" : ""}><BookOpenCheck size={18} /><span>Notas</span></button>
          <button type="button" onClick={() => { if (!session) onCreateSession(); setSessionOpen(true); setNotesOpen(false); setMenuOpen(false); }} className={session ? "is-live" : ""}><MonitorSmartphone size={18} /><span>{session ? session.code : "Celular"}</span></button>
          <button type="button" onClick={toggleFullscreen} aria-label={fullscreen ? "Sair da tela cheia" : "Tela cheia"}>{fullscreen ? <Maximize2 size={18} /> : <Fullscreen size={18} />}</button>
          <button type="button" onClick={() => { setMenuOpen((open) => !open); setNotesOpen(false); setSessionOpen(false); }} aria-label="Abrir visão geral"><Menu size={19} /></button>
        </div>
      </header>

      <SlideCanvas key={slide.id} slide={slide} index={current} total={deck.length} session={session} />

      <nav className="presentation-controls" aria-label="Controles da apresentação" onTouchStart={markControlTouch}>
        <button type="button" onClick={previous} disabled={current === 0} aria-label="Slide anterior"><ChevronLeft size={24} /></button>
        <div className="progress-track"><i style={{ width: `${((current + 1) / deck.length) * 100}%` }} /></div>
        <span>{String(current + 1).padStart(2, "0")} / {String(deck.length).padStart(2, "0")}</span>
        <button type="button" onClick={next} disabled={current === deck.length - 1} aria-label="Próximo slide"><ChevronRight size={24} /></button>
      </nav>

      {notesOpen && <aside className="notes-drawer"><span>NOTAS DO APRESENTADOR</span><p>{slide.speakerNote}</p><small>Tempo sugerido: {Math.max(20, Math.round((duration * 60) / deck.length))} segundos</small></aside>}
      {menuOpen && <aside className="overview-drawer"><div className="overview-drawer__header"><div><span>ROTEIRO</span><strong>{deck.length} telas</strong></div><button type="button" onClick={() => setMenuOpen(false)} aria-label="Fechar"><X size={20} /></button></div><div className="overview-list">{deck.map((item, index) => <button key={item.id} className={index === current ? "is-current" : ""} type="button" onClick={() => { onCurrent(index); setMenuOpen(false); }}><span>{String(index + 1).padStart(2, "0")}</span><div><small>{item.numberLabel}</small><strong>{item.title}</strong></div></button>)}</div></aside>}
      {sessionOpen && session && <SessionPanel session={session} presenterToken={presenterToken} qrAudience={qrAudience} qrRemote={qrRemote} onClose={() => setSessionOpen(false)} />}
      {sessionOpen && !session && <aside className="session-panel session-panel--loading"><button className="icon-button session-panel__close" type="button" onClick={() => setSessionOpen(false)} aria-label="Fechar"><X size={20} /></button><MonitorSmartphone size={42} /><h2>Preparando a sessão...</h2><p>{sessionError || "Em instantes, os QR codes aparecerão aqui."}</p>{sessionError && <button type="button" className="primary-cta primary-cta--small" onClick={onCreateSession}>Tentar novamente</button>}</aside>}
    </main>
  );
}

function AudienceView({ initialCode, onExit }: { initialCode: string; onExit: () => void }) {
  const [code, setCode] = useState(initialCode);
  const [session, setSession] = useState<SessionSnapshot | null>(null);
  const [error, setError] = useState("");
  const [value, setValue] = useState("");
  const [sentPrompt, setSentPrompt] = useState("");
  const [shareFeedback, setShareFeedback] = useState("");
  const participantId = useMemo(() => {
    const existing = localStorage.getItem("kino-pitch-participant");
    if (existing) return existing;
    const id = createParticipantId();
    localStorage.setItem("kino-pitch-participant", id);
    return id;
  }, []);

  const load = useCallback(async (targetCode = code) => {
    if (!targetCode.trim()) return;
    try {
      const response = await fetch(`/api/session?code=${encodeURIComponent(targetCode.trim())}`, { cache: "no-store" });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || "Sessão não encontrada.");
      if (!data.session) throw new Error("A sessão não trouxe dados válidos.");
      setSession(data.session); setError(""); setCode(data.session.code);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível entrar."); }
  }, [code]);

  useEffect(() => {
    if (!initialCode) return;
    const firstLoad = window.setTimeout(() => void load(initialCode), 0);
    return () => window.clearTimeout(firstLoad);
  }, [initialCode, load]);
  useEffect(() => {
    if (!session?.code) return;
    const sessionCode = session.code;
    const timer = window.setInterval(() => void load(sessionCode), 2200);
    return () => window.clearInterval(timer);
  }, [load, session?.code]);

  const promptSlide = session?.activePrompt ? allSlides.find((slide) => slide.prompt?.id === session.activePrompt) : null;
  const prompt = promptSlide?.prompt;
  const deck = useMemo(() => session ? buildDeck(session.duration as Duration, session.mode as PresentationMode) : [], [session]);
  const currentSlide = session ? deck[Math.min(session.currentSlide, Math.max(0, deck.length - 1))] : null;
  const presentationFinished = Boolean(session && deck.length && session.currentSlide >= deck.length - 1);
  const readUrl = session ? `/?read=${session.duration}-${session.mode}` : "/";

  const shareDeck = async () => {
    const url = new URL(readUrl, window.location.origin).toString();
    if (navigator.share) {
      await navigator.share({ title: "Kino Campus — Pitch Institucional", text: "Apresentação institucional do Kino Campus", url });
      setShareFeedback("Compartilhado");
    } else {
      await copyText(url);
      setShareFeedback("Link copiado");
    }
    window.setTimeout(() => setShareFeedback(""), 1800);
  };
  const sendResponse = async (selected?: string) => {
    if (!session || !prompt) return;
    const answer = (selected ?? value).trim();
    if (!answer) return;
    const response = await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "respond", code: session.code, participantId, promptId: prompt.id, value: answer }) });
    const data = await readJson(response);
    if (!response.ok) { setError(data.error || "Não foi possível enviar."); return; }
    if (!data.session) { setError("A resposta foi enviada, mas a sessão não pôde ser atualizada."); return; }
    setSession(data.session); setSentPrompt(prompt.id); setValue(""); setError("");
  };

  return (
    <main className="mobile-view audience-view">
      <header><KinoLogo compact /><button type="button" onClick={onExit}>Sair</button></header>
      {!session ? (
        <section className="join-card"><span className="mobile-icon"><Smartphone size={31} /></span><p className="eyebrow">PARTICIPAÇÃO AO VIVO</p><h1>Entre na apresentação</h1><p>Digite o código exibido na tela.</p><label>Código da sessão<input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} maxLength={6} placeholder="ABC123" /></label><button className="primary-cta" type="button" onClick={() => load()}>Participar <ArrowRight size={20} /></button>{error && <span className="form-error">{error}</span>}</section>
      ) : (
        <section className="audience-card">
          <div className="session-badge"><i /> AO VIVO · {session.code}</div>
          {currentSlide && (
            <div className="audience-progress">
              <div><span>{String(session.currentSlide + 1).padStart(2, "0")} / {String(deck.length).padStart(2, "0")}</span><strong>{currentSlide.numberLabel}</strong></div>
              <i><span style={{ width: `${((session.currentSlide + 1) / deck.length) * 100}%` }} /></i>
            </div>
          )}
          {presentationFinished ? (
            <div className="audience-finish">
              <span><CheckCircle2 size={31} /></span>
              <p className="eyebrow">MATERIAL DA APRESENTAÇÃO</p>
              <h1>Continue com o conteúdo.</h1>
              <p>Abra a versão completa, compartilhe o link ou salve como PDF — sem notas e sem acesso ao controle remoto.</p>
              <a className="primary-cta" href={readUrl}>Ver apresentação <ArrowRight size={20} /></a>
              <button type="button" className="secondary-action" onClick={shareDeck}><Share2 size={18} /> {shareFeedback || "Compartilhar link"}</button>
            </div>
          ) : prompt ? (
            <><p className="eyebrow">SUA VEZ</p><h1>{prompt.question}</h1><p>{prompt.helper}</p>{prompt.type === "choice" ? <div className="choice-list">{prompt.options?.map((option) => <button key={option} type="button" className={sentPrompt === prompt.id && session.aggregates[prompt.id]?.[option] ? "has-response" : ""} onClick={() => sendResponse(option)}>{option}<ArrowRight size={18} /></button>)}</div> : <div className="word-form"><input value={value} maxLength={42} onChange={(event) => setValue(event.target.value)} placeholder="Uma palavra ou expressão curta" onKeyDown={(event) => { if (event.key === "Enter") sendResponse(); }} /><button type="button" onClick={() => sendResponse()} aria-label="Enviar resposta"><Send size={20} /></button></div>}{sentPrompt === prompt.id && <div className="sent-confirm"><CheckCircle2 size={21} /> Resposta registrada. Você pode alterar.</div>}<a className="audience-read-link" href={readUrl}>Ver a apresentação completa <ExternalLink size={15} /></a></>
          ) : (
            <div className="audience-follow"><span><Sparkles size={29} /></span><p className="eyebrow">AGORA NA TELA</p><h1>{currentSlide?.title ?? "Acompanhe a apresentação"}</h1><p>{currentSlide?.body ?? "A próxima interação aparecerá aqui automaticamente."}</p>{currentSlide?.points && <div className="audience-points">{currentSlide.points.map((point) => <span key={point}><Check size={14} /> {point}</span>)}</div>}<a className="audience-read-link" href={readUrl}>Ver a apresentação completa <ExternalLink size={15} /></a><div className="waiting-pulse"><i /><i /><i /></div></div>
          )}
          {error && <span className="form-error">{error}</span>}
        </section>
      )}
      <footer>{session ? <a href={readUrl}>Apresentação para leitura e PDF</a> : "Sem cadastro · respostas vinculadas apenas a este dispositivo"}</footer>
    </main>
  );
}

function ReadOnlyDeck({
  duration,
  mode,
  onExit,
}: {
  duration: Duration;
  mode: PresentationMode;
  onExit: () => void;
}) {
  const deck = useMemo(() => buildDeck(duration, mode), [duration, mode]);
  const [shareFeedback, setShareFeedback] = useState("");
  const variants = ([5, 15, 30] as Duration[]).flatMap((itemDuration) =>
    (["expositivo", "interativo"] as PresentationMode[]).map((itemMode) => ({
      duration: itemDuration,
      mode: itemMode,
      href: `/?read=${itemDuration}-${itemMode}`,
    })),
  );

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title: "Kino Campus — Pitch Institucional", text: `${duration} minutos · ${mode}`, url });
      setShareFeedback("Compartilhado");
    } else {
      await copyText(url);
      setShareFeedback("Link copiado");
    }
    window.setTimeout(() => setShareFeedback(""), 1800);
  };

  return (
    <main className="read-view">
      <header className="read-header">
        <div className="brand-button"><KinoLogo /></div>
        <div className="read-header__meta"><span>VERSÃO PARA LEITURA</span><strong>{duration} minutos · {mode}</strong></div>
        <div className="read-header__actions">
          <button type="button" onClick={share}><Share2 size={18} /> {shareFeedback || "Compartilhar"}</button>
          <button type="button" onClick={() => window.print()}><Printer size={18} /> Salvar PDF</button>
          <button type="button" onClick={onExit}><X size={18} /> Fechar</button>
        </div>
      </header>

      <section className="read-intro">
        <p className="eyebrow">KINO CAMPUS · UFG</p>
        <h1>A apresentação, no seu ritmo.</h1>
        <p>Esta versão é pública, anônima e somente para leitura. Ela não contém notas do apresentador, token de controle ou ferramentas de comando.</p>
        <nav className="read-variants" aria-label="Escolher versão da apresentação">
          {variants.map((variant) => (
            <a key={`${variant.duration}-${variant.mode}`} href={variant.href} className={variant.duration === duration && variant.mode === mode ? "is-current" : ""}>
              <strong>{variant.duration} min</strong><span>{variant.mode}</span>
            </a>
          ))}
        </nav>
      </section>

      <section className="read-deck" aria-label={`Apresentação de ${duration} minutos no modo ${mode}`}>
        {deck.map((slide, index) => (
          <article className={`read-slide read-slide--${slide.variant}`} id={`read-${slide.id}`} key={slide.id}>
            <div className="read-slide__number"><span>{String(index + 1).padStart(2, "0")}</span><small>{slide.numberLabel}</small></div>
            <div className="read-slide__copy">
              <p className="eyebrow">{slide.kicker}</p>
              <h2>{slide.title}</h2>
              <p>{slide.body}</p>
              {slide.points && <div className="point-chips">{slide.points.map((point) => <span key={point}><Check size={15} />{point}</span>)}</div>}
              {slide.prompt && <div className="read-interaction-note"><MessageCircleQuestion size={18} /> Esta pergunta recebe respostas ao vivo durante a apresentação interativa.</div>}
            </div>
            <div className="read-slide__visual"><SlideVisual slide={slide} session={null} /></div>
          </article>
        ))}
      </section>

      <footer className="read-footer">
        <KinoLogo compact />
        <p>Eventos e oportunidades da comunidade UFG, organizados com contexto e acesso às fontes.</p>
        <div><button type="button" onClick={() => window.print()}><Download size={18} /> Salvar como PDF</button><a href={KINO_URLS.home} target="_blank" rel="noreferrer">Conhecer o Kino Campus <ExternalLink size={17} /></a></div>
      </footer>
    </main>
  );
}

function RemoteView({ code, token, onExit }: { code: string; token: string; onExit: () => void }) {
  const [session, setSession] = useState<SessionSnapshot | null>(null);
  const [error, setError] = useState("");
  const deck = useMemo(() => session ? buildDeck(session.duration as Duration, session.mode as PresentationMode) : [], [session]);
  const controlChainRef = useRef(Promise.resolve());
  const localAuthorityUntilRef = useRef(0);
  const desiredSlideRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/session?code=${encodeURIComponent(code)}`, { cache: "no-store" });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error);
      if (!data.session) throw new Error("Sessão sem dados válidos.");
      // Do not let a stale poll overwrite an in-flight local control.
      if (Date.now() < localAuthorityUntilRef.current && desiredSlideRef.current !== null) {
        if (data.session.currentSlide !== desiredSlideRef.current) {
          setSession({ ...data.session, currentSlide: desiredSlideRef.current });
          setError("");
          return;
        }
        localAuthorityUntilRef.current = 0;
        desiredSlideRef.current = null;
      }
      setSession(data.session);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Controle indisponível.");
    }
  }, [code]);
  useEffect(() => {
    const firstLoad = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 1800);
    return () => { window.clearTimeout(firstLoad); window.clearInterval(timer); };
  }, [load]);

  const control = (nextIndex: number) => {
    if (!session || !deck.length) return;
    const safe = Math.max(0, Math.min(deck.length - 1, nextIndex));
    const activePrompt = deck[safe]?.prompt?.id ?? null;
    desiredSlideRef.current = safe;
    localAuthorityUntilRef.current = Date.now() + 2400;
    setSession((previous) => previous ? { ...previous, currentSlide: safe, activePrompt } : previous);

    const run = async () => {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "control", code, token, currentSlide: safe, activePrompt }),
      });
      const data = await readJson(response);
      if (!response.ok) {
        setError(data.error || "Controle não autorizado.");
        return;
      }
      if (!data.session) {
        setError("O controle não recebeu o estado atualizado.");
        return;
      }
      if (desiredSlideRef.current === safe) {
        setSession(data.session);
        localAuthorityUntilRef.current = 0;
        desiredSlideRef.current = null;
      }
    };

    controlChainRef.current = controlChainRef.current.then(run, run).catch(() => undefined);
  };

  const currentSlide = session && deck[session.currentSlide];
  return (
    <main className="mobile-view remote-view">
      <header><KinoLogo compact /><button type="button" onClick={onExit}>Sair</button></header>
      <section className="remote-card">
        <div className="session-badge"><i /> CONTROLE · {code}</div>
        {session && currentSlide ? <><p className="eyebrow">{currentSlide.numberLabel}</p><h1>{currentSlide.title}</h1><div className="remote-progress"><i style={{ width: `${((session.currentSlide + 1) / deck.length) * 100}%` }} /></div><span className="remote-count">{session.currentSlide + 1} / {deck.length}</span><div className="remote-buttons"><button type="button" disabled={session.currentSlide === 0} onClick={() => control(session.currentSlide - 1)}><ArrowLeft size={28} /><span>Anterior</span></button><button type="button" disabled={session.currentSlide === deck.length - 1} onClick={() => control(session.currentSlide + 1)}><span>Próximo</span><ArrowRight size={28} /></button></div>{currentSlide.prompt && <div className="remote-live"><MessageCircleQuestion size={21} /><span>Interação ativa</span><strong>{session.responseCount} respostas</strong></div>}</> : <div className="waiting-state"><MonitorSmartphone size={40} /><h1>Conectando ao palco...</h1></div>}
        {error && <span className="form-error">{error}</span>}
      </section>
      <footer>Mantenha esta tela privada durante a apresentação.</footer>
    </main>
  );
}

export default function Home() {
  const [duration, setDuration] = useState<Duration>(15);
  const [mode, setMode] = useState<PresentationMode>("interativo");
  const locationSearch = useSyncExternalStore(subscribeToLocation, getLocationSearch, getServerSearch);
  const route = useMemo(() => {
    const params = new URLSearchParams(locationSearch);
    const join = params.get("join")?.toUpperCase();
    const remote = params.get("remote")?.toUpperCase();
    const read = params.get("read")?.toLowerCase();
    if (remote) return { view: "remote" as const, code: remote, token: params.get("token") ?? "" };
    if (join) return { view: "audience" as const, code: join, token: "" };
    if (read) {
      const [rawDuration, rawMode] = read.split("-");
      const readDuration = [5, 15, 30].includes(Number(rawDuration)) ? Number(rawDuration) as Duration : 15;
      const readMode: PresentationMode = rawMode === "interativo" ? "interativo" : "expositivo";
      return { view: "read" as const, code: "", token: "", duration: readDuration, mode: readMode };
    }
    return { view: "launch" as const, code: "", token: "" };
  }, [locationSearch]);
  const [viewOverride, setView] = useState<"launch" | "deck" | null>(null);
  const view = viewOverride ?? route.view;
  const [current, setCurrent] = useState(0);
  const [session, setSession] = useState<SessionSnapshot | null>(null);
  const [presenterToken, setPresenterToken] = useState("");
  const [sessionError, setSessionError] = useState("");
  const routeCode = route.code;
  const routeToken = route.token;
  const readDuration = route.view === "read" ? route.duration : 15;
  const readMode = route.view === "read" ? route.mode : "expositivo";
  const deck = useMemo(() => buildDeck(duration, mode), [duration, mode]);
  // Local navigation authority: a GET poll must not rewind a click that has
  // not yet been confirmed by the control POST (classic freeze/jump-back).
  const localAuthorityUntilRef = useRef(0);
  const desiredSlideRef = useRef(0);
  const controlChainRef = useRef(Promise.resolve());
  const pollGenerationRef = useRef(0);

  const createSession = useCallback(async () => {
    try {
      setSessionError("");
      const response = await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create", duration, mode }) });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || "Não foi possível criar a sessão.");
      if (!data.session || !data.presenterToken) throw new Error("A sessão foi criada sem dados de controle.");
      setSession(data.session); setPresenterToken(data.presenterToken);
      return data.session;
    } catch (caught) { setSessionError(caught instanceof Error ? caught.message : "A sessão ao vivo está indisponível."); return null; }
  }, [duration, mode]);

  const start = async () => {
    setCurrent(0);
    desiredSlideRef.current = 0;
    localAuthorityUntilRef.current = 0;
    setView("deck");
    if (mode === "interativo") await createSession();
  };

  const goToSlide = useCallback((index: number) => {
    const safe = Math.max(0, Math.min(deck.length - 1, index));
    if (desiredSlideRef.current === safe) {
      // Same target: still refresh authority so a late poll cannot rewind.
      localAuthorityUntilRef.current = Date.now() + 2800;
      return;
    }
    desiredSlideRef.current = safe;
    localAuthorityUntilRef.current = Date.now() + 2800;
    pollGenerationRef.current += 1;
    setCurrent(safe);
  }, [deck.length]);

  const sessionCode = session?.code;
  // Debounced control sync: rapid next/prev only posts the latest slide.
  useEffect(() => {
    if (view !== "deck" || !sessionCode || !presenterToken) return;
    const slideIndex = current;
    const slide = deck[slideIndex];
    const activePrompt = slide?.prompt?.id ?? null;

    const timer = window.setTimeout(() => {
      const run = async () => {
        // Skip stale chain items after burst navigation.
        if (desiredSlideRef.current !== slideIndex) return;
        try {
          const response = await fetch("/api/session", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              action: "control",
              code: sessionCode,
              token: presenterToken,
              currentSlide: slideIndex,
              activePrompt,
            }),
          });
          const data = await readJson(response);
          if (!data.session) return;
          if (desiredSlideRef.current !== slideIndex) return;
          setSession((previous) => {
            const next = data.session!;
            // Keep local slide authority; refresh aggregates/counts from server.
            if (Date.now() < localAuthorityUntilRef.current) {
              return {
                ...next,
                currentSlide: desiredSlideRef.current,
                activePrompt: deck[desiredSlideRef.current]?.prompt?.id ?? next.activePrompt,
              };
            }
            if (
              previous &&
              previous.currentSlide === next.currentSlide &&
              previous.responseCount === next.responseCount &&
              previous.updatedAt === next.updatedAt &&
              previous.activePrompt === next.activePrompt
            ) {
              return previous;
            }
            return next;
          });
          if (data.session.currentSlide === slideIndex) {
            localAuthorityUntilRef.current = 0;
          }
        } catch {
          /* keep presenting offline */
        }
      };
      controlChainRef.current = controlChainRef.current.then(run, run);
    }, 120);

    return () => window.clearTimeout(timer);
  }, [current, deck, presenterToken, sessionCode, view]);

  useEffect(() => {
    if (view !== "deck" || !sessionCode) return;
    // Interaction slides need fresher aggregates; otherwise poll lighter.
    const onInteraction = Boolean(deck[desiredSlideRef.current]?.prompt || deck[current]?.prompt);
    const intervalMs = onInteraction ? 1100 : 1600;
    const timer = window.setInterval(async () => {
      const generationAtStart = pollGenerationRef.current;
      try {
        const response = await fetch(`/api/session?code=${sessionCode}`, { cache: "no-store" });
        const data = await readJson(response);
        if (!data.session) return;
        // Drop polls started before a newer local navigation intent.
        if (generationAtStart !== pollGenerationRef.current) return;

        const safeCurrent = Math.max(0, Math.min(deck.length - 1, data.session.currentSlide));
        const localAuthorityActive = Date.now() < localAuthorityUntilRef.current;
        const desired = desiredSlideRef.current;

        if (localAuthorityActive && safeCurrent !== desired) {
          // Server is still catching up: keep aggregates/responses, hold slide.
          setSession((previous) => ({
            ...data.session!,
            currentSlide: previous?.currentSlide ?? desired,
            activePrompt: deck[desired]?.prompt?.id ?? data.session!.activePrompt,
          }));
          return;
        }

        if (localAuthorityActive && safeCurrent === desired) {
          localAuthorityUntilRef.current = 0;
        }

        setSession((previous) => {
          const next = data.session!;
          if (
            previous &&
            previous.currentSlide === next.currentSlide &&
            previous.responseCount === next.responseCount &&
            previous.updatedAt === next.updatedAt &&
            previous.activePrompt === next.activePrompt
          ) {
            return previous;
          }
          return next;
        });
        // Only follow server slide when remote/control advanced it (or after authority ends).
        if (!localAuthorityActive) {
          setCurrent((previous) => (previous === safeCurrent ? previous : safeCurrent));
          desiredSlideRef.current = safeCurrent;
        }
      } catch {
        /* keep the stage usable offline */
      }
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [current, deck, sessionCode, view]);

  const exit = () => {
    setView("launch");
    setCurrent(0);
    desiredSlideRef.current = 0;
    localAuthorityUntilRef.current = 0;
    window.history.replaceState({}, "", window.location.pathname);
  };
  if (view === "audience") return <AudienceView initialCode={routeCode} onExit={exit} />;
  if (view === "remote") return <RemoteView code={routeCode} token={routeToken} onExit={exit} />;
  if (view === "read") return <ReadOnlyDeck duration={readDuration} mode={readMode} onExit={exit} />;
  if (view === "deck") {
    return (
      <PresenterView
        duration={duration}
        mode={mode}
        deck={deck}
        current={current}
        onCurrent={goToSlide}
        onExit={exit}
        session={session}
        presenterToken={presenterToken}
        onCreateSession={createSession}
        sessionError={sessionError}
      />
    );
  }
  return (
    <LaunchScreen
      duration={duration}
      mode={mode}
      onDuration={(value) => { setDuration(value); setCurrent(0); desiredSlideRef.current = 0; }}
      onMode={(value) => { setMode(value); setCurrent(0); desiredSlideRef.current = 0; }}
      onStart={start}
    />
  );
}
