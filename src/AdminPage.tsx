import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Trash2 } from "lucide-react";
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
  if (error && typeof error === "object" && "message" in error) {
    const message = String(error.message);
    if (message) return message;
  }
  if (error instanceof Error) return error.message;
  return "Não foi possível carregar os agendamentos. Verifique a conexão e tente novamente.";
}

export default function AdminPage() {
  const location = useLocation();
  const isDemoRoute = location.pathname.replace(/\/+$/, "") === "/admin/demo";
  const [email, setEmail] = useState(isDemoRoute ? demoEmail : "");
  const [password, setPassword] = useState(isDemoRoute ? demoPassword : "");
  const [loading, setLoading] = useState(!isDemoRoute);
  const [authChecking, setAuthChecking] = useState(!isDemoRoute);
  const [adminAuthorized, setAdminAuthorized] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [demoActive, setDemoActive] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [dateFilter, setDateFilter] = useState("");
  const [timeFilter, setTimeFilter] = useState("");
  const [actionError, setActionError] = useState("");
  const [deletingId, setDeletingId] = useState("");

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
      setDemoActive(false);
      setAdminAuthorized(false);
      setError("");
      setLoading(false);
      setAuthChecking(false);
      return;
    }

    let active = true;
    async function restoreAdminSession() {
      try {
        const { data, error: sessionError } = await getSupabaseClient().auth.getSession();
        if (sessionError) throw sessionError;
        if (!data.session) {
          if (active) setLoading(false);
          return;
        }

        const { data: admin, error: adminError } = await getSupabaseClient()
          .from("admin_users")
          .select("user_id")
          .eq("user_id", data.session.user.id)
          .maybeSingle();
        if (adminError) throw adminError;
        if (!admin) {
          await getSupabaseClient().auth.signOut();
          if (active) {
            setError("Esta conta não está cadastrada como administradora. Peça ao responsável para adicioná-la em public.admin_users.");
            setLoading(false);
          }
          return;
        }

        if (active) {
          setAdminAuthorized(true);
          await loadBookings();
        }
      } catch (sessionError) {
        if (active) {
          setError(friendlyError(sessionError));
          setLoading(false);
        }
      } finally {
        if (active) setAuthChecking(false);
      }
    }

    void restoreAdminSession();
    return () => {
      active = false;
    };
  }, [isDemoRoute]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    if (isDemoRoute && email.trim() === demoEmail && password === demoPassword) {
      setDemoActive(true);
      setBookings(demoBookings);
      setPassword("");
      setSubmitting(false);
      return;
    }

    if (isDemoRoute) {
      setError("Use o e-mail e a senha fictícios indicados para acessar a demonstração.");
      setSubmitting(false);
      return;
    }

    try {
      const { data, error: signInError } = await getSupabaseClient().auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError || !data.user) {
        throw new Error("E-mail ou senha inválidos.");
      }

      const { data: admin, error: adminError } = await getSupabaseClient()
        .from("admin_users")
        .select("user_id")
        .eq("user_id", data.user.id)
        .maybeSingle();
      if (adminError) throw adminError;
      if (!admin) {
        await getSupabaseClient().auth.signOut();
        throw new Error("Esta conta não está cadastrada como administradora. Peça ao responsável para adicioná-la em public.admin_users.");
      }

      setAdminAuthorized(true);
      setPassword("");
      await loadBookings();
    } catch (loginError) {
      setError(friendlyError(loginError));
    }
    setSubmitting(false);
  }

  async function handleSignOut() {
    try {
      const { error: signOutError } = await getSupabaseClient().auth.signOut();
      if (signOutError) throw signOutError;
      setAdminAuthorized(false);
      setBookings([]);
      setPassword("");
      setError("");
    } catch (signOutError) {
      setError(friendlyError(signOutError));
    }
  }

  async function handleDeleteBooking(booking: Booking) {
    const formattedDate = format(parseISO(booking.data_agendamento), "dd/MM/yyyy", { locale: ptBR });
    if (!window.confirm(`Excluir o agendamento de ${booking.nome_cliente} em ${formattedDate} às ${booking.horario_agendamento.slice(0, 5)}? Esta ação não pode ser desfeita.`)) {
      return;
    }

    setActionError("");
    setDeletingId(booking.id);
    try {
      if (demoActive) {
        setBookings((current) => current.filter((item) => item.id !== booking.id));
        return;
      }

      const { data, error: deleteError } = await getSupabaseClient()
        .from("agendamentos")
        .delete()
        .eq("id", booking.id)
        .select("id");

      if (deleteError) throw deleteError;
      if (!data?.length) {
        throw new Error("O banco não excluiu o agendamento. Confirme que sua conta está autorizada como administradora.");
      }
      setBookings((current) => current.filter((item) => item.id !== booking.id));
    } catch (deleteError) {
      const message = deleteError && typeof deleteError === "object" && "message" in deleteError
        ? String(deleteError.message).toLowerCase()
        : "";
      setActionError(
        message.includes("permission") || message.includes("row-level security")
          ? "A exclusão foi bloqueada pelas permissões do banco. Cadastre sua conta em public.admin_users e execute o SQL atualizado em supabase/agendamentos.sql."
          : friendlyError(deleteError),
      );
    } finally {
      setDeletingId("");
    }
  }

  const visibleBookings = bookings.filter((booking) =>
    (statusFilter === "todos" || booking.status === statusFilter) &&
    (!dateFilter || booking.data_agendamento === dateFilter) &&
    (!timeFilter || booking.horario_agendamento.slice(0, 5) === timeFilter),
  );
  const hasActiveFilters = statusFilter !== "todos" || dateFilter !== "" || timeFilter !== "";

  return (
    <main className="admin-page">
      <header className="admin-header">
        <Link className="wordmark" to="/" aria-label="Brasa Barbearia — página inicial">
          <span className="wordmark__icon" aria-hidden="true">B.</span>
          <span className="wordmark__text">BRASA<span>BARBEARIA</span></span>
        </Link>
        {(demoActive || adminAuthorized) && (
          <button
            className="admin-logout"
            type="button"
            onClick={() => demoActive
              ? (setDemoActive(false), setPassword(demoPassword))
              : void handleSignOut()}
          >
            {demoActive ? "Sair da demonstração" : "Sair"}
          </button>
        )}
      </header>

      {loading || authChecking ? (
        <div className="admin-loading" role="status">
          <span className="booking-spinner" />
          {authChecking ? "Verificando acesso..." : "Carregando agendamentos..."}
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
      ) : !isDemoRoute && !adminAuthorized ? (
        <section className="admin-login">
          <p className="eyebrow"><span /> ACESSO ADMINISTRATIVO</p>
          <h1>Painel da barbearia</h1>
          <p>Entre com a conta de administrador cadastrada no Supabase para consultar e gerenciar os agendamentos.</p>
          <form onSubmit={(event) => void handleLogin(event)}>
            <label htmlFor="admin-email">E-mail</label>
            <input
              id="admin-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <label htmlFor="admin-password">Senha</label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            {error && <p className="admin-error" role="alert">{error}</p>}
            <button className="button admin-submit" type="submit" disabled={submitting}>
              {submitting ? "Verificando..." : "Entrar"}
            </button>
          </form>
          <Link className="admin-demo-link" to="/admin/demo">Ver demonstração com dados fictícios</Link>
        </section>
      ) : loadFailed ? (
        <section className="admin-login" aria-live="polite">
          <p className="eyebrow"><span /> ERRO AO CARREGAR</p>
          <h1>Painel real indisponível</h1>
          <p>
            Verifique a configuração e as permissões do banco para consultar os agendamentos.
          </p>
          {error && <p className="admin-error" role="alert">{error}</p>}
          <button className="button admin-submit" type="button" onClick={() => void loadBookings()}>
            Tentar novamente
          </button>
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

          <div className="admin-booking-filters" aria-label="Filtros de agendamentos">
            <label className="admin-filter">
              <span>Data</span>
              <input
                type="date"
                value={dateFilter}
                onChange={(event) => setDateFilter(event.target.value)}
              />
            </label>
            <label className="admin-filter">
              <span>Horário</span>
              <input
                type="time"
                value={timeFilter}
                onChange={(event) => setTimeFilter(event.target.value)}
              />
            </label>
            {hasActiveFilters && (
              <button
                className="admin-filter-clear"
                type="button"
                onClick={() => {
                  setStatusFilter("todos");
                  setDateFilter("");
                  setTimeFilter("");
                }}
              >
                Limpar filtros
              </button>
            )}
          </div>

          {actionError && <p className="admin-error" role="alert">{actionError}</p>}

          {visibleBookings.length === 0 ? (
            <div className="admin-empty">
              <span aria-hidden="true">◷</span>
              <h2>{hasActiveFilters ? "Nenhum resultado encontrado" : "Nenhum agendamento por aqui"}</h2>
              <p>
                {hasActiveFilters
                  ? "Não há agendamentos para os filtros selecionados. Tente outra data ou horário."
                  : "Quando um cliente confirmar um horário, ele aparecerá nesta lista."}
              </p>
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
                    <th>Ações</th>
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
                        <td>
                          <button
                            className="admin-delete"
                            type="button"
                            aria-label={`Excluir agendamento de ${booking.nome_cliente}`}
                            disabled={deletingId === booking.id}
                            onClick={() => void handleDeleteBooking(booking)}
                          >
                            <Trash2 aria-hidden="true" size={15} />
                            {deletingId === booking.id ? "Excluindo..." : "Excluir"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="admin-count">
            {visibleBookings.length} de {bookings.length} agendamento(s) exibido(s) · máximo de 300
          </p>
        </section>
      )}
    </main>
  );
}
