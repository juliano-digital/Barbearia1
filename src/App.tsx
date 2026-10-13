import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { HashRouter, Link, Navigate, Route, Routes } from "react-router-dom";
import { format, isValid, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { MapPin, MessageCircle, Phone, Send, X } from "lucide-react";
import BookingModal from "./BookingModal";
import AdminPage from "./AdminPage";
import CustomerHistoryPage from "./CustomerHistoryPage";
import {
  LAST_BOOKING_STORAGE_KEY,
  readBookingIds,
  readBookingReceiptContact,
} from "./lib/bookingStorage";
import { getSupabaseClient } from "./lib/supabase";

const BookingSuccessPage = lazy(() => import("./BookingSuccessPage"));

const services = [
  {
    category: "01 / ESSENCIAL",
    icon: "✂",
    name: <>Corte<br />masculino</>,
    description:
      "Consultoria de estilo, corte na tesoura ou máquina e finalização na medida.",
    price: "R$ 65",
    duration: "45 MIN",
    featured: true,
  },
  {
    category: "02 / CLÁSSICO",
    icon: "◒",
    name: <>Barba<br />completa</>,
    description:
      "Toalha quente, desenho preciso e produtos escolhidos para a sua pele.",
    price: "R$ 50",
    duration: "35 MIN",
    featured: false,
  },
  {
    category: "03 / EXPERIÊNCIA",
    icon: "✳",
    name: <>Corte +<br />barba</>,
    description:
      "O ritual completo para sair renovado. Um cuidado da cabeça ao rosto.",
    price: "R$ 105",
    duration: "75 MIN",
    featured: false,
  },
];

const gallery = [
  {
    image:
      "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=900&q=85",
    alt: "Barbeiro finalizando um corte na barbearia",
    caption: "PRECISÃO À TESOURA",
    className: "gallery__item--tall",
  },
  {
    image:
      "https://images.unsplash.com/photo-1621605815971-fbc98d665033?auto=format&fit=crop&w=800&q=85",
    alt: "Detalhe de um corte masculino recém-finalizado",
    caption: "ACABAMENTO LIMPO",
    className: "gallery__item--short",
  },
  {
    image:
      "https://images.unsplash.com/photo-1599351431202-1e0f0137899a?auto=format&fit=crop&w=800&q=85",
    alt: "Atendimento cuidadoso durante o ritual da barba",
    caption: "RITUAL DA BARBA",
    className: "gallery__item--short",
  },
];

const questions = [
  {
    question: "Preciso agendar ou posso chegar sem hora marcada?",
    answer:
      "Recomendamos agendar para garantir seu horário e evitar espera. Se estiver por perto, consulte a disponibilidade da equipe no dia.",
  },
  {
    question: "Quanto tempo dura o atendimento?",
    answer:
      "O corte leva aproximadamente 45 minutos, a barba 35 minutos e a experiência completa cerca de 75 minutos. O tempo pode variar conforme o serviço escolhido.",
  },
  {
    question: "Posso escolher o profissional?",
    answer:
      "No momento, os horários são organizados pela disponibilidade da equipe. Se tiver uma preferência, conte para a gente pelo WhatsApp após confirmar.",
  },
  {
    question: "Onde fica a Barbearia Brasa?",
    answer:
      "O endereço ilustrativo da Barbearia Brasa é Rua das Navalhas, 123 — Centro, Canoas — RS.",
  },
];

const navLinks = [
  ["Serviços", "#servicos"],
  ["A casa", "#experiencia"],
  ["Resultados", "#resultados"],
  ["Depoimentos", "#depoimentos"],
];

function Wordmark({ footer = false }: { footer?: boolean }) {
  return (
    <a
      className={`wordmark${footer ? " wordmark--footer" : ""}`}
      href="#inicio"
      aria-label={footer ? "Brasa Barbearia — voltar ao início" : "Brasa Barbearia — início"}
    >
      <span className="wordmark__icon" aria-hidden="true">B.</span>
      <span className="wordmark__text">BRASA<span>BARBEARIA</span></span>
    </a>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="eyebrow"><span />{children}</p>;
}

type HomeBooking = {
  id: string;
  servico: string;
  data_agendamento: string;
  horario_agendamento: string;
  status: string;
  nome_cliente?: string;
  whatsapp?: string;
};

function isBookingVisibleAt(booking: HomeBooking, now: number) {
  const date = parseISO(booking.data_agendamento);
  const [hours, minutes] = booking.horario_agendamento.split(":").map(Number);
  if (
    !isValid(date) ||
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return false;
  }

  date.setHours(hours, minutes, 0, 0);
  return date.getTime() + 30 * 60 * 1000 > now;
}

function BookingNotice() {
  const [bookings, setBookings] = useState<HomeBooking[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let active = true;

    async function loadBooking() {
      setLoadError(false);
      try {
        const bookingIds = readBookingIds(window.localStorage.getItem(LAST_BOOKING_STORAGE_KEY));
        if (!bookingIds.length) {
          if (active) setBookings([]);
          return;
        }

        const { data, error } = await getSupabaseClient()
          .from("agendamentos")
          .select("id, servico, data_agendamento, horario_agendamento, status")
          .in("id", bookingIds)
          .in("status", ["pendente", "confirmado"])
          .order("data_agendamento", { ascending: true })
          .order("horario_agendamento", { ascending: true });
        if (error) throw error;

        if (active) {
          setBookings(data
            .filter((booking) =>
              typeof booking.id === "string" &&
              typeof booking.servico === "string" &&
              typeof booking.data_agendamento === "string" &&
              typeof booking.horario_agendamento === "string" &&
              (booking.status === "pendente" || booking.status === "confirmado"),
            )
            .map((booking) => ({
              id: booking.id,
              servico: booking.servico,
              data_agendamento: booking.data_agendamento,
              horario_agendamento: booking.horario_agendamento,
              status: booking.status,
              ...readBookingReceiptContact(booking.id),
            })));
        }
      } catch {
        if (active) setLoadError(true);
      }
    }

    void loadBooking();
    const refreshInterval = window.setInterval(() => void loadBooking(), 60_000);
    return () => {
      active = false;
      window.clearInterval(refreshInterval);
    };
  }, [retry]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  if (loadError) {
    return (
      <div className="booking-notice booking-notice--error" role="alert">
        <span>Não foi possível carregar seu agendamento.</span>
        <button type="button" onClick={() => setRetry((count) => count + 1)}>
          Tentar novamente
        </button>
      </div>
    );
  }
  const validBookings = bookings.filter((booking) => isBookingVisibleAt(booking, now));
  if (!validBookings.length) return null;

  return (
    <div className="booking-notices" aria-label="Seus horários marcados">
      {validBookings.map((booking, index) => {
        const date = parseISO(booking.data_agendamento);
        return (
          <Link
            className="booking-notice"
            key={booking.id}
            to={`/agendamento/comprovante/${encodeURIComponent(booking.id)}`}
            state={{
              nome_cliente: booking.nome_cliente,
              whatsapp: booking.whatsapp,
            }}
            aria-label={`Ver comprovante do agendamento: ${booking.servico}, ${format(date, "EEEE, dd 'de' MMMM", { locale: ptBR })}, às ${booking.horario_agendamento.slice(0, 5)}`}
          >
            <span className="booking-notice__icon" aria-hidden="true">✓</span>
            <span className="booking-notice__content">
              <strong>
                {booking.status === "confirmado"
                  ? validBookings.length > 1 ? `Agendamento ${index + 1} confirmado` : "Seu agendamento está confirmado"
                  : validBookings.length > 1 ? `Horário ${index + 1} solicitado` : "Seu horário foi solicitado"}
              </strong>
              <span>{booking.servico}</span>
              <span className="booking-notice__details">
                {format(date, "EEEE, dd 'de' MMMM", { locale: ptBR })} · {booking.horario_agendamento.slice(0, 5)}
              </span>
            </span>
            <span className="booking-notice__action" aria-hidden="true">Ver comprovante ↗</span>
          </Link>
        );
      })}
    </div>
  );
}

type ChatMessage = {
  id: number;
  author: "assistant" | "visitor";
  text: string;
};

const chatWelcomeMessage =
  "Olá! Estou em formato de protótipo e sei somente estas informações: a Barbearia Brasa é uma barbearia tradicional focada em atendimento de excelência, corte clássico e barba à navalha; fica na Avenida Navalha, Canoas — RS; funciona de segunda a sábado, das 09:00 às 20:00.";

function getChatReply(question: string) {
  const normalizedQuestion = question
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (/horario|abre|fecha|funciona|atendimento/.test(normalizedQuestion)) {
    return "Funcionamos de segunda a sábado, das 09:00 às 20:00.";
  }
  if (/onde|endereco|local|fica|localizacao/.test(normalizedQuestion)) {
    return "A Barbearia Brasa fica na Avenida Navalha, em Canoas — RS.";
  }
  if (/quem|sobre|barbearia|servico|servicos|fazem/.test(normalizedQuestion)) {
    return "Somos uma barbearia tradicional, focada em atendimento de excelência, corte clássico e barba à navalha.";
  }
  return "Estou em formato de protótipo e sei somente sobre a Barbearia Brasa, sua localização na Avenida Navalha em Canoas — RS, sua proposta de barbearia tradicional com corte clássico e barba à navalha, e o horário de segunda a sábado, das 09:00 às 20:00.";
}

function PrototypeChat() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 0, author: "assistant", text: chatWelcomeMessage },
  ]);

  function sendMessage(text = question) {
    const message = text.trim();
    if (!message) return;

    setMessages((current) => [
      ...current,
      { id: current.length, author: "visitor", text: message },
      { id: current.length + 1, author: "assistant", text: getChatReply(message) },
    ]);
    setQuestion("");
  }

  return (
    <>
      {open && (
        <section className="prototype-chat" aria-label="Chat da Barbearia Brasa">
          <header className="prototype-chat__header">
            <div>
              <strong>Barbearia Brasa</strong>
              <span>Assistente em protótipo</span>
            </div>
            <button
              className="prototype-chat__close"
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fechar chat"
            >
              <X aria-hidden="true" size={18} />
            </button>
          </header>
          <div className="prototype-chat__messages" role="log" aria-live="polite">
            {messages.map((message) => (
              <p
                className={`prototype-chat__message prototype-chat__message--${message.author}`}
                key={message.id}
              >
                {message.text}
              </p>
            ))}
          </div>
          <div className="prototype-chat__suggestions" aria-label="Perguntas sugeridas">
            <button type="button" onClick={() => sendMessage("Qual o horário de funcionamento?")}>
              Horários
            </button>
            <button type="button" onClick={() => sendMessage("Onde fica a barbearia?")}>
              Endereço
            </button>
            <button type="button" onClick={() => sendMessage("Quem somos?")}>
              Quem somos
            </button>
          </div>
          <form
            className="prototype-chat__form"
            onSubmit={(event) => {
              event.preventDefault();
              sendMessage();
            }}
          >
            <label className="sr-only" htmlFor="prototype-chat-question">Sua mensagem</label>
            <input
              id="prototype-chat-question"
              type="text"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Escreva sua pergunta..."
              maxLength={300}
            />
            <button type="submit" aria-label="Enviar mensagem" disabled={!question.trim()}>
              <Send aria-hidden="true" size={17} />
            </button>
          </form>
        </section>
      )}
      <button
        className="prototype-chat__toggle"
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={open ? "Fechar chat" : "Abrir chat"}
        aria-expanded={open}
      >
        {open ? <X aria-hidden="true" size={21} /> : <MessageCircle aria-hidden="true" size={21} />}
        <span>Chat</span>
      </button>
    </>
  );
}

function SiteApp() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const motionMedia = gsap.matchMedia();

    motionMedia.add(
      "(min-width: 681px) and (prefers-reduced-motion: no-preference)",
      () => {
        gsap.from(".hero__content > *", {
          y: 20,
          autoAlpha: 0,
          duration: 0.55,
          stagger: 0.09,
          ease: "power2.out",
          delay: 0.15,
        });

        gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((element) => {
          gsap.from(element, {
            y: 20,
            autoAlpha: 0,
            duration: 0.5,
            ease: "power2.out",
            scrollTrigger: {
              trigger: element,
              start: "top 88%",
              once: true,
            },
          });
        });

        gsap.to(".hero__image", {
          yPercent: 8,
          ease: "none",
          scrollTrigger: {
            trigger: ".hero",
            start: "top top",
            end: "bottom top",
            scrub: 0.5,
          },
        });
      },
    );

    return () => motionMedia.revert();
  }, []);

  return (
    <>
      <a className="skip-link" href="#conteudo">Pular para o conteúdo</a>
      <BookingModal open={bookingOpen} onClose={() => setBookingOpen(false)} />
      <a
        className="google-review"
        href="https://www.google.com/maps/search/?api=1&query=Brasa%20Barbearia%20Canoas%20RS"
        target="_blank"
        rel="noreferrer"
        aria-label="Nos avalie no Google Maps — buscar Brasa Barbearia em Canoas, Rio Grande do Sul"
      >
        <span className="google-review__icon" aria-hidden="true">G</span>
        <span className="google-review__stars" aria-label="5 estrelas">★★★★★</span>
        <span>Nos avalie</span>
      </a>
      <PrototypeChat />

      <header className="site-header">
        <Wordmark />
        <button
          className="menu-toggle"
          type="button"
          aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
          aria-expanded={menuOpen}
          aria-controls="site-nav"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span />
          <span />
        </button>
        <nav
          className={`site-nav${menuOpen ? " is-open" : ""}`}
          id="site-nav"
          aria-label="Navegação principal"
        >
          <span className="site-nav__contact">
            <MapPin aria-hidden="true" />
            Canoas — RS
          </span>
          <a className="site-nav__contact" href="tel:+5551900000000">
            <Phone aria-hidden="true" />
            (51) 90000-0000
          </a>
          {navLinks.map(([label, href]) => (
            <a key={href} href={href} onClick={() => setMenuOpen(false)}>{label}</a>
          ))}
          <a
            className="button button--small"
            href="#agendamento"
            onClick={() => setMenuOpen(false)}
          >
            Agendar horário <span aria-hidden="true">↗</span>
          </a>
        </nav>
      </header>

      <main className="min-h-screen" id="conteudo">
        <section className="hero" id="inicio" aria-labelledby="hero-title">
          <div
            className="hero__image"
            role="img"
            aria-label="Barbeiro preparando um corte em uma barbearia clássica"
          />
          <div className="hero__shade" />
          <div className="hero__content">
            <Eyebrow>BARBEARIA DE ASSINATURA · TÉCNICA E CUIDADO</Eyebrow>
            <h1 id="hero-title">O seu estilo.<br />Sem <span>atalhos.</span></h1>
            <p className="hero__copy">
              Mais do que um bom corte, um tempo só seu. Técnica apurada, conversa boa e
              cuidado em cada detalhe.
            </p>
            <div className="hero__actions">
              <a className="button" href="#agendamento">Reserve seu horário <span aria-hidden="true">↗</span></a>
              <a className="text-link" href="#servicos">Explore a barbearia <span aria-hidden="true">↓</span></a>
            </div>
            <BookingNotice />
          </div>
          <div className="hero__caption"><span>01 / 03</span><span>PRECISÃO EM CADA DETALHE</span></div>
          <a className="hero__scroll" href="#servicos" aria-label="Rolar para os serviços"><span /> ROLE PARA DESCOBRIR</a>
        </section>

        <section className="trust-strip" aria-label="Diferenciais da barbearia">
          <div className="trust-strip__item"><span className="trust-strip__icon" aria-hidden="true">✳</span><span>Estilo atemporal<br /><strong>feito para você</strong></span></div>
          <div className="trust-strip__item"><span className="trust-strip__icon" aria-hidden="true">⌁</span><span>Profissionais<br /><strong>mestres no ofício</strong></span></div>
          <div className="trust-strip__item"><span className="trust-strip__icon" aria-hidden="true">◷</span><span>Sem espera<br /><strong>hora marcada</strong></span></div>
          <div className="trust-strip__rating"><span aria-label="Avaliação ilustrativa">★★★★★</span><strong>Exemplo 4,9</strong><small>SUBSTITUIR POR AVALIAÇÃO REAL</small></div>
        </section>

        <section className="section services-section" id="servicos" aria-labelledby="services-title">
          <div className="section-heading" data-reveal>
            <div>
              <Eyebrow>O QUE A GENTE FAZ</Eyebrow>
              <h2 id="services-title">O ritual começa<br />na <span>cadeira.</span></h2>
            </div>
            <p className="section-heading__copy">Cada serviço respeita o seu estilo, o seu tempo e o cuidado que você merece.</p>
          </div>
          <div className="services-grid">
            {services.map((service) => (
              <article
                className={`service-card${service.featured ? " service-card--featured" : ""}`}
                data-reveal
                key={service.category}
              >
                <div className="service-card__top"><span>{service.category}</span><span aria-hidden="true">↗</span></div>
                <div className="service-card__icon" aria-hidden="true">{service.icon}</div>
                <h3>{service.name}</h3>
                <p>{service.description}</p>
                <div className="service-card__bottom"><span>A PARTIR DE</span><strong>{service.price}</strong><span>· {service.duration}</span></div>
              </article>
            ))}
          </div>
          <p className="service-note">Os valores apresentados são ilustrativos e devem ser atualizados pela barbearia.</p>
        </section>

        <section className="experience" id="experiencia" aria-labelledby="experience-title">
          <div
            className="experience__photo"
            role="img"
            aria-label="Detalhe de uma cadeira clássica de barbearia"
          />
          <div className="experience__content" data-reveal>
            <Eyebrow>UMA CASA, MUITAS HISTÓRIAS</Eyebrow>
            <h2 id="experience-title">O clássico<br />nunca sai de <em>cena.</em></h2>
            <p>
              A Brasa combina o melhor da barbearia clássica com um olhar atual:
              um lugar para desacelerar, se cuidar e sair se sentindo você mesmo.
            </p>
            <p>
              Ferramentas de confiança, mãos experientes e hospitalidade de verdade.
              Sem pressa. Sem fórmulas prontas. Só o melhor do ofício.
            </p>
            <a className="text-link text-link--light" href="#agendamento">Venha conhecer <span aria-hidden="true">↗</span></a>
            <div className="experience__signature"><span>01</span><span>UMA CADEIRA POR VEZ<br />CUIDADO SEM PRESSA</span></div>
          </div>
        </section>

        <section className="section results-section" id="resultados" aria-labelledby="results-title">
          <div className="section-heading section-heading--center" data-reveal>
            <Eyebrow>O TRABALHO FALA</Eyebrow>
            <h2 id="results-title">Feito com cuidado.<br /><span>Visto de perto.</span></h2>
            <p className="section-heading__copy">Cada detalhe importa. Cada cliente sai com um estilo só dele.</p>
          </div>
          <div className="gallery">
            {gallery.map((item, index) => (
              <figure className={`gallery__item ${item.className}`} data-reveal key={item.image}>
                <img src={item.image} alt={item.alt} loading="lazy" />
                <figcaption><span>0{index + 1}</span>{item.caption}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section className="testimonial-section" id="depoimentos" aria-labelledby="testimonial-title">
          <div
            className="testimonial-section__image"
            role="img"
            aria-label="Cliente aproveitando o atendimento na barbearia"
          />
          <div className="testimonial" data-reveal>
            <Eyebrow>PALAVRA DE QUEM VOLTA</Eyebrow>
            <h2 id="testimonial-title">“Finalmente achei um lugar que entende o meu estilo.”</h2>
            <div className="testimonial__meta">
              <span className="testimonial__avatar" aria-hidden="true">RM</span>
              <span><strong>Rafael M.</strong><small>CLIENTE HÁ 3 ANOS</small></span>
              <span className="testimonial__stars" aria-label="5 estrelas">★★★★★</span>
            </div>
            <p className="testimonial__disclaimer">Depoimento demonstrativo — substitua por uma avaliação real de cliente.</p>
          </div>
        </section>

        <section className="section faq-section" aria-labelledby="faq-title">
          <div className="faq-heading" data-reveal>
            <Eyebrow>ANTES DE SENTAR</Eyebrow>
            <h2 id="faq-title">Dúvidas<br /><span>de primeira.</span></h2>
            <p>Não encontrou sua resposta? Fale com a gente quando chegar.</p>
          </div>
          <div className="faq-list" data-reveal>
            {questions.map(({ question, answer }) => (
              <details key={question}>
                <summary>{question}<span aria-hidden="true" /></summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="booking-section" id="agendamento" aria-labelledby="booking-title">
          <div className="booking-section__content" data-reveal>
            <Eyebrow>SEU PRÓXIMO CORTE COMEÇA AQUI</Eyebrow>
            <h2 id="booking-title">A cadeira<br />já está <em>esperando.</em></h2>
            <p>Escolha o serviço e deixe seu contato. A gente combina o melhor horário com você.</p>
            <div className="booking-detail"><span aria-hidden="true">◷</span><span>Atendimento com hora marcada<br /><strong>Horários sob disponibilidade</strong></span></div>
          </div>
          <div className="booking-form" id="booking-form" data-reveal>
            <p className="booking-form__intro">Escolha o serviço, o dia e o horário que combinam com você.</p>
            <button
              className="button booking-form__submit"
              type="button"
              onClick={() => setBookingOpen(true)}
            >
              Solicitar meu horário <span aria-hidden="true">↗</span>
            </button>
            <p className="booking-form__note">Disponibilidade atualizada direto na agenda da Brasa.</p>
            <Link className="booking-form__history-link" to="/minha-conta">
              Já agendou? Consulte seu histórico →
            </Link>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="site-footer__top">
          <Wordmark footer />
          <p>O seu estilo. Sem atalhos.</p>
          <a href="#inicio">VOLTAR AO TOPO ↑</a>
        </div>
        <address className="site-footer__contact">
          <span><MapPin aria-hidden="true" /> Rua das Navalhas, 123 — Centro, Canoas — RS</span>
          <a href="tel:+5551900000000"><Phone aria-hidden="true" /> (51) 90000-0000</a>
          <small>Contato ilustrativo</small>
        </address>
        <div className="site-footer__bottom">
          <small>© {new Date().getFullYear()} BRASA BARBEARIA · FEITO COM CAPRICHO.</small>
          <Link className="site-footer__admin" to="/admin/login">ÁREA DA BARBEARIA</Link>
        </div>
      </footer>
    </>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/admin/login" element={<AdminPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/admin/*" element={<Navigate to="/admin" replace />} />
        <Route path="/confirmacao" element={<CustomerHistoryPage />} />
        <Route path="/minha-conta" element={<CustomerHistoryPage />} />
        <Route
          path="/agendamento/comprovante/:id"
          element={
            <Suspense fallback={<main className="grid min-h-screen place-items-center">Carregando comprovante...</main>}>
              <BookingSuccessPage />
            </Suspense>
          }
        />
        <Route path="*" element={<SiteApp />} />
      </Routes>
    </HashRouter>
  );
}
