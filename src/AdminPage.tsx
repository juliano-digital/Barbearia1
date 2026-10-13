import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { format, isValid, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, Clock3, Phone, Scissors, Trash2, UserRound } from "lucide-react";
import ModalConfirmacao from "./components/ModalConfirmacao";
import { getSupabaseClient, isSupabaseConfigured } from "./lib/supabase";
import { formatBrazilianPhone } from "./lib/phone";

type Agendamento = {
  id: string;
  servico: string;
  nome_cliente: string;
  whatsapp: string;
  data_agendamento: string;
  horario_agendamento: string;
  status: string;
  created_at: string;
};

type PublicAgendamento = Pick<
  Agendamento,
  | "id"
  | "servico"
  | "nome_cliente"
  | "whatsapp"
  | "data_agendamento"
  | "horario_agendamento"
  | "status"
>;

function friendlyError(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = String(error.message);
    if (message) return message;
  }
  return "Não foi possível concluir a operação. Verifique a conexão e tente novamente.";
}

function formatBookingDate(value: string) {
  const date = parseISO(value);
  return isValid(date) ? format(date, "dd/MM/yyyy", { locale: ptBR }) : "Data inválida";
}

function PublicAgenda({
  onBack,
  onDeleteRequest,
  deletedBookingId,
  actionError,
}: {
  onBack: () => void;
  onDeleteRequest: (bookingId: string) => void;
  deletedBookingId: string;
  actionError: string;
}) {
  const [bookings, setBookings] = useState<PublicAgendamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [timeFilter, setTimeFilter] = useState("");

  useEffect(() => {
    let active = true;

    async function loadPublicBookings() {
      try {
        const { data, error: queryError } = await getSupabaseClient()
          .from("agendamentos")
          .select("id, servico, nome_cliente, whatsapp, data_agendamento, horario_agendamento, status")
          .order("data_agendamento", { ascending: true });

        if (queryError) throw queryError;
        if (active) setBookings(data);
      } catch (queryError) {
        if (active) setError(friendlyError(queryError));
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadPublicBookings();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (deletedBookingId) {
      setBookings((current) => current.filter((booking) => booking.id !== deletedBookingId));
    }
  }, [deletedBookingId]);

  const visibleBookings = bookings.filter((booking) =>
    (!dateFilter || booking.data_agendamento === dateFilter) &&
    (!timeFilter || booking.horario_agendamento.slice(0, 5) === timeFilter),
  );

  return (
    <section className="admin-dashboard">
      <div className="admin-dashboard__heading">
        <div>
          <p className="eyebrow"><span /> CONSULTA DA AGENDA</p>
          <h1>Agendamentos</h1>
        </div>
        <button className="admin-refresh" type="button" onClick={onBack}>Voltar</button>
      </div>
      {loading ? (
        <div className="admin-loading" role="status">
          <span className="booking-spinner" />Carregando agendamentos...
        </div>
      ) : error ? (
        <p className="admin-error" role="alert">{error}</p>
      ) : (
        <>
          <div className="admin-booking-filters" aria-label="Filtrar agendamentos">
            <label className="admin-filter">
              <span>Data</span>
              <input
                type="date"
                value={dateFilter}
                onChange={(event) => setDateFilter(event.target.value)}
                aria-label="Filtrar por data"
              />
            </label>
            <label className="admin-filter">
              <span>Horário</span>
              <input
                type="time"
                value={timeFilter}
                onChange={(event) => setTimeFilter(event.target.value)}
                aria-label="Filtrar por horário"
              />
            </label>
            {(dateFilter || timeFilter) && (
              <button
                className="admin-filter-clear"
                type="button"
                onClick={() => {
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
          <h2>{bookings.length === 0 ? "Sua agenda está livre" : "Nenhum horário encontrado"}</h2>
          <p>
            {bookings.length === 0
              ? "Os novos agendamentos aparecerão aqui."
              : "Não há agendamentos nessa data e horário. Ajuste os filtros e tente novamente."}
          </p>
        </div>
      ) : (
        <div className="admin-booking-list">
          {visibleBookings.map((booking) => (
            <article className="admin-booking-row admin-booking-row--public" key={booking.id}>
              <div className="admin-booking-row__service">
                <span className={`admin-status admin-status--${booking.status}`}>{booking.status}</span>
                <h2>{booking.servico}</h2>
              </div>
              <p className="admin-booking-row__detail">
                <UserRound aria-hidden="true" />
                <span><small>Cliente</small>{booking.nome_cliente}</span>
              </p>
              <a
                className="admin-booking-row__contact admin-booking-row__contact--public"
                href={`https://wa.me/${booking.whatsapp.replace(/\D/g, "")}`}
                target="_blank"
                rel="noreferrer"
                aria-label={`Abrir WhatsApp de ${booking.nome_cliente}`}
              >
                <Phone aria-hidden="true" />
                <span><small>Telefone</small>{formatBrazilianPhone(booking.whatsapp)}</span>
              </a>
              <p className="admin-booking-row__detail">
                <CalendarDays aria-hidden="true" />
                <span><small>Data</small>{formatBookingDate(booking.data_agendamento)}</span>
              </p>
              <p className="admin-booking-row__detail">
                <Clock3 aria-hidden="true" />
                <span><small>Horário</small>{booking.horario_agendamento.slice(0, 5)}</span>
              </p>
              <button
                className="admin-delete"
                type="button"
                aria-label={`Excluir agendamento de ${booking.servico} em ${formatBookingDate(booking.data_agendamento)}`}
                onClick={() => onDeleteRequest(booking.id)}
              >
                <Trash2 aria-hidden="true" size={16} />
                Excluir
              </button>
            </article>
          ))}
        </div>
      )}
      <p className="admin-count">{visibleBookings.length} de {bookings.length} agendamento(s)</p>
        </>
      )}
    </section>
  );
}

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [authChecking, setAuthChecking] = useState(true);
  const [adminAuthorized, setAdminAuthorized] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [bookings, setBookings] = useState<Agendamento[]>([]);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [dateFilter, setDateFilter] = useState("");
  const [timeFilter, setTimeFilter] = useState("");
  const [actionError, setActionError] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [bookingToDelete, setBookingToDelete] = useState<{ id: string } | null>(null);
  const [toast, setToast] = useState("");
  const [publicAgenda, setPublicAgenda] = useState(false);
  const [deletedBookingId, setDeletedBookingId] = useState("");
  const loadBookings = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setLoadFailed(true);
      setError("Configure as chaves do Supabase para carregar os agendamentos.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    setLoadFailed(false);
    try {
      const { data, error: queryError } = await getSupabaseClient()
        .from("agendamentos")
        .select("*")
        .order("data_agendamento", { ascending: true });

      if (queryError) throw queryError;
      setBookings(data);
    } catch (queryError) {
      setLoadFailed(true);
      setError(friendlyError(queryError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
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
  }, [loadBookings]);

  useEffect(() => {
    if (!adminAuthorized) return;

    const channel = getSupabaseClient()
      .channel("admin-agendamentos")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agendamentos" },
        () => void loadBookings(),
      )
      .subscribe();

    return () => {
      void getSupabaseClient().removeChannel(channel);
    };
  }, [adminAuthorized, loadBookings]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 4000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  function requestBookingDeletion(bookingId: string) {
    setActionError("");
    setBookingToDelete({ id: bookingId });
  }

  async function handleSignOut() {
    try {
      const { error: signOutError } = await getSupabaseClient().auth.signOut();
      if (signOutError) throw signOutError;
      setAdminAuthorized(false);
      setBookings([]);
      setError("");
    } catch (signOutError) {
      setError(friendlyError(signOutError));
    }
  }

  async function handleDeleteBooking() {
    if (!bookingToDelete) return;
    const selectedBooking = bookingToDelete;
    setActionError("");
    setDeletingId(selectedBooking.id);
    try {
      const { data, error: deleteError } = await getSupabaseClient()
        .from("agendamentos")
        .delete()
        .eq("id", selectedBooking.id)
        .select("id");

      if (deleteError) throw deleteError;
      if (!data?.length) {
        throw new Error("O agendamento não foi excluído. Atualize a agenda e tente novamente.");
      }

      setBookingToDelete(null);
      setBookings((current) => current.filter((booking) => booking.id !== selectedBooking.id));
      setDeletedBookingId(selectedBooking.id);
      setToast("Agendamento excluído com sucesso.");
    } catch (deleteError) {
      setActionError(friendlyError(deleteError));
      setBookingToDelete(null);
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
  const cancelDelete = useCallback(() => setBookingToDelete(null), []);

  return (
    <main className="admin-page">
      <header className="admin-header">
        <Link className="wordmark" to="/" aria-label="Brasa Barbearia — página inicial">
          <span className="wordmark__icon" aria-hidden="true">B.</span>
          <span className="wordmark__text">BRASA<span>BARBEARIA</span></span>
        </Link>
        {adminAuthorized && (
          <button className="admin-logout" type="button" onClick={() => void handleSignOut()}>
            Sair
          </button>
        )}
      </header>

      {loading || authChecking ? (
        <div className="admin-loading" role="status">
          <span className="booking-spinner" />
          {authChecking ? "Verificando acesso..." : "Carregando agendamentos..."}
        </div>
      ) : publicAgenda ? (
        <PublicAgenda
          onBack={() => setPublicAgenda(false)}
          onDeleteRequest={requestBookingDeletion}
          deletedBookingId={deletedBookingId}
          actionError={actionError}
        />
      ) : !adminAuthorized ? (
        <section className="admin-login">
          <p className="eyebrow"><span /> ACESSO ADMINISTRATIVO</p>
          <h1>Painel da barbearia</h1>
          <label htmlFor="example-admin-email">E-mail de exemplo</label>
          <input id="example-admin-email" type="email" value="admin@exemplo.com" readOnly />
          <label htmlFor="example-admin-password">Senha de exemplo</label>
          <input id="example-admin-password" type="password" value="senha123" readOnly />
          <button
            className="button admin-submit"
            type="button"
            onClick={() => setPublicAgenda(true)}
            disabled={!isSupabaseConfigured()}
          >
            Entrar
          </button>
          {!isSupabaseConfigured() && (
            <p className="admin-error" role="alert">Configure as chaves do Supabase para habilitar o acesso administrativo.</p>
          )}
        </section>
      ) : loadFailed ? (
        <section className="admin-login" aria-live="polite">
          <p className="eyebrow"><span /> ERRO AO CARREGAR</p>
          <h1>Painel indisponível</h1>
          <p>Verifique a configuração e as permissões do banco para consultar os agendamentos.</p>
          {error && <p className="admin-error" role="alert">{error}</p>}
          <button className="button admin-submit" type="button" onClick={() => void loadBookings()}>
            Tentar novamente
          </button>
        </section>
      ) : (
        <section className="admin-dashboard">
          <div className="admin-dashboard__heading">
            <div>
              <p className="eyebrow"><span /> PAINEL ADMINISTRATIVO</p>
              <h1>Agendamentos</h1>
              <p>Reservas reais recebidas pelo formulário do site.</p>
            </div>
            <button className="admin-refresh" type="button" disabled={loading} onClick={() => void loadBookings()}>
              {loading ? "Atualizando..." : "Atualizar agendamentos ↻"}
            </button>
          </div>

          <div className="admin-booking-filters" aria-label="Filtros de agendamentos">
            <label className="admin-filter">
              <span>Status</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="todos">Todos</option>
                <option value="pendente">Pendentes</option>
                <option value="confirmado">Confirmados</option>
                <option value="cancelado">Cancelados</option>
              </select>
            </label>
            <label className="admin-filter">
              <span>Data</span>
              <input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} />
            </label>
            <label className="admin-filter">
              <span>Horário</span>
              <input type="time" value={timeFilter} onChange={(event) => setTimeFilter(event.target.value)} />
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
              <h2>{hasActiveFilters ? "Nenhum resultado encontrado" : "Sua agenda está livre"}</h2>
              <p>
                {hasActiveFilters
                  ? "Não há agendamentos para os filtros selecionados. Tente ajustar a busca."
                  : "Quando um cliente solicitar um horário, os detalhes aparecerão aqui automaticamente."}
              </p>
            </div>
          ) : (
            <div className="admin-booking-list">
              {visibleBookings.map((booking) => {
                const phone = booking.whatsapp.replace(/\D/g, "");
                return (
                  <article className="admin-booking-row admin-booking-row--admin" key={booking.id}>
                    <div className="admin-booking-row__service">
                      <span className={`admin-status admin-status--${booking.status}`}>{booking.status}</span>
                      <h2>{booking.nome_cliente}</h2>
                    </div>
                    <p className="admin-booking-row__detail">
                      <CalendarDays aria-hidden="true" />
                      <span><small>Data</small>{formatBookingDate(booking.data_agendamento)}</span>
                    </p>
                    <p className="admin-booking-row__detail">
                      <Clock3 aria-hidden="true" />
                      <span><small>Horário</small>{booking.horario_agendamento.slice(0, 5)}</span>
                    </p>
                    <p className="admin-booking-row__detail admin-booking-row__service-name">
                      <Scissors aria-hidden="true" />
                      <span><small>Serviço</small>{booking.servico}</span>
                    </p>
                    <a className="admin-booking-row__contact" href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer">
                      <small>WhatsApp</small>
                      <span>{formatBrazilianPhone(booking.whatsapp)} ↗</span>
                    </a>
                    <button
                      className="admin-delete"
                      type="button"
                      aria-label={`Excluir agendamento de ${booking.nome_cliente}`}
                      disabled={deletingId === booking.id}
                      onClick={() => setBookingToDelete({ id: booking.id })}
                    >
                      <Trash2 aria-hidden="true" size={16} />
                      Excluir
                    </button>
                  </article>
                );
              })}
            </div>
          )}
          <p className="admin-count">{visibleBookings.length} de {bookings.length} agendamento(s) exibido(s)</p>
        </section>
      )}

      {toast && <div className="admin-toast" role="status">{toast}</div>}
      <ModalConfirmacao
        open={bookingToDelete !== null}
        busy={deletingId !== ""}
        onCancel={cancelDelete}
        onConfirm={() => void handleDeleteBooking()}
      />
    </main>
  );
}
