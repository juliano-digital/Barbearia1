import { useEffect, useState, type FormEvent } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getSupabaseClient, isSupabaseConfigured } from "./lib/supabase";

type Booking = {
  id: string;
  servico: string;
  nome_cliente: string;
  whatsapp: string;
  data_agendamento: string;
  horario_agendamento: string;
  status: string;
  created_at: string;
};

const demoEmail = "demo@brasa.com";
const demoPassword = "brasa123";
const isDemoRoute = window.location.pathname.replace(/\/+$/, "") === "/admin/demo";

function dateOffsetIso(daysFromToday: number) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

const demoBookings: Booking[] = [
  {
    id: "demo-booking-1",
    servico: "Corte masculino",
    nome_cliente: "Cliente Exemplo 01",
    whatsapp: "(11) 99999-0001",
    data_agendamento: dateOffsetIso(1),
    horario_agendamento: "10:00:00",
    status: "confirmado",
    created_at: new Date().toISOString(),
  },
  {
    id: "demo-booking-2",
    servico: "Barba",
    nome_cliente: "Cliente Exemplo 02",
    whatsapp: "(11) 99999-0002",
    data_agendamento: dateOffsetIso(1),
    horario_agendamento: "14:00:00",
    status: "confirmado",
    created_at: new Date().toISOString(),
  },
  {
    id: "demo-booking-3",
    servico: "Corte + Barba",
    nome_cliente: "Cliente Exemplo 03",
    whatsapp: "(11) 99999-0003",
    data_agendamento: dateOffsetIso(2),
    horario_agendamento: "16:00:00",
    status: "confirmado",
    created_at: new Date().toISOString(),
  },
];

function friendlyError(error: unknown) {
  if (error instanceof Error && error.message.includes("ainda não está configurado")) {
    return error.message;
  }
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  return "Não foi possível carregar os agendamentos. Verifique a conexão e tente novamente.";
}

export default function AdminPage() {
  const [email] = useState(demoEmail);
  const [password, setPassword] = useState(demoPassword);
  const [loading, setLoading] = useState(!isDemoRoute);
  const [submitting, setSubmitting] = useState(false);
  const [demoActive, setDemoActive] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");

  async function loadBookings() {
    if (!isSupabaseConfigured()) {
      setLoadFailed(true);
      setError("Configure as chaves do Supabase para carregar os agendamentos reais.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    setLoadFailed(false);
    try {
      const { data, error: queryError } = await getSupabaseClient()
        .from("agendamentos")
        .select("id, servico, nome_cliente, whatsapp, data_agendamento, horario_agendamento, status, created_at")
        .order("data_agendamento", { ascending: true })
        .order("horario_agendamento", { ascending: true })
        .limit(300);

      if (queryError) throw queryError;
      setBookings(data);
    } catch (queryError) {
      setLoadFailed(true);
      setError(friendlyError(queryError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isDemoRoute) {
      setBookings(demoBookings);
      setLoading(false);
      return;
    }
    void loadBookings();
  }, []);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    if (email.trim() === demoEmail && password === demoPassword) {
      setDemoActive(true);
      setBookings(demoBookings);
      setPassword("");
    } else {
      setError("Use o e-mail e a senha fictícios indicados para acessar a demonstração.");
    }
    setSubmitting(false);
  }

  const visibleBookings = statusFilter === "todos"
    ? bookings
    : bookings.filter((booking) => booking.status === statusFilter);

  return (
    <main className="admin-page">
      <header className="admin-header">
        <a className="wordmark" href="/" aria-label="Brasa Barbearia — página inicial">
          <span className="wordmark__icon" aria-hidden="true">B.</span>
          <span className="wordmark__text">BRASA<span>BARBEARIA</span></span>
        </a>
        {demoActive && (
          <button
            className="admin-logout"
            type="button"
            onClick={() => {
              setDemoActive(false);
              setPassword(demoPassword);
            }}
          >
            Sair da demonstração
          </button>
        )}
      </header>

      {loading ? (
        <div className="admin-loading" role="status">
          <span className="booking-spinner" /> Carregando agendamentos...
        </div>
      ) : isDemoRoute && !demoActive ? (
        <section className="admin-login">
          <p className="eyebrow"><span /> DEMONSTRAÇÃO</p>
          <h1>Painel da barbearia</h1>
          <p>Protótipo de apresentação. Use as credenciais fictícias já preenchidas e clique em Entrar.</p>
          <form onSubmit={handleLogin}>
            <label htmlFor="admin-email">E-mail</label>
            <input id="admin-email" type="email" autoComplete="username" value={email} readOnly required />
            <label htmlFor="admin-password">Senha</label>
            <input id="admin-password" type="password" autoComplete="current-password" value={password} readOnly required />
            <p className="admin-demo-credentials">
              Acesso de demonstração: <strong>{demoEmail}</strong> · senha <strong>{demoPassword}</strong>
            </p>
            {error && <p className="admin-error" role="alert">{error}</p>}
            <button className="button admin-submit" type="submit" disabled={submitting}>
              {submitting ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </section>
      ) : loadFailed ? (
        <section className="admin-login" aria-live="polite">
          <p className="eyebrow"><span /> ERRO AO CARREGAR</p>
          <h1>Painel real indisponível</h1>
          <p>
            Configure as chaves do Supabase e habilite a leitura pública da tabela
            `agendamentos` pelo script SQL do projeto.
          </p>
          {error && <p className="admin-error" role="alert">{error}</p>}
          {!isSupabaseConfigured() ? (
            <a className="admin-demo-link" href="/admin/demo">Ver demonstração com dados fictícios</a>
          ) : (
            <button className="button admin-submit" type="button" onClick={() => void loadBookings()}>
              Tentar novamente
            </button>
          )}
        </section>
      ) : (
        <section className="admin-dashboard">
          {demoActive && (
            <div className="admin-demo-banner" role="status">
              MODO DEMONSTRAÇÃO — todos os clientes e agendamentos exibidos são fictícios.
            </div>
          )}
          <div className="admin-dashboard__heading">
            <div>
              <p className="eyebrow">
                <span /> {demoActive ? "VISUALIZAÇÃO DE EXEMPLO" : "PAINEL ADMINISTRATIVO"}
              </p>
              <h1>Agendamentos</h1>
              <p>
                {demoActive
                  ? "Exemplo de como as reservas aparecem para o dono da barbearia."
                  : "Agendamentos reais recebidos pelo formulário do site."}
              </p>
            </div>
            <label className="admin-filter">
              <span>Exibir</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="todos">Todos</option>
                <option value="confirmado">Confirmados</option>
                <option value="cancelado">Cancelados</option>
              </select>
            </label>
            {!demoActive && (
              <button className="admin-refresh" type="button" disabled={loading} onClick={() => void loadBookings()}>
                {loading ? "Atualizando..." : "Atualizar agendamentos ↻"}
              </button>
            )}
          </div>

          {visibleBookings.length === 0 ? (
            <div className="admin-empty">
              <span aria-hidden="true">◷</span>
              <h2>Nenhum agendamento por aqui</h2>
              <p>Quando um cliente confirmar um horário, ele aparecerá nesta lista.</p>
            </div>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Data e hora</th>
                    <th>Cliente</th>
                    <th>Serviço</th>
                    <th>WhatsApp</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleBookings.map((booking) => {
                    const phone = booking.whatsapp.replace(/\D/g, "");
                    return (
                      <tr key={booking.id}>
                        <td>
                          <strong>{format(parseISO(booking.data_agendamento), "dd/MM/yyyy", { locale: ptBR })}</strong>
                          <small>{booking.horario_agendamento.slice(0, 5)}</small>
                        </td>
                        <td>{booking.nome_cliente}</td>
                        <td>{booking.servico}</td>
                        <td>
                          {demoActive ? (
                            <span>{booking.whatsapp} (exemplo)</span>
                          ) : (
                            <a href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer">
                              {booking.whatsapp} ↗
                            </a>
                          )}
                        </td>
                        <td>
                          <span className={`admin-status admin-status--${booking.status}`}>
                            {booking.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="admin-count">
            {visibleBookings.length} agendamento(s) exibido(s) · máximo de 300
          </p>
        </section>
      )}
    </main>
  );
}
