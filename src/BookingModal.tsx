import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO, startOfToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { getSupabaseClient } from "./lib/supabase";
import { bookingServices } from "./lib/bookingServices";
import { formatBrazilianPhone } from "./lib/phone";
import { LAST_BOOKING_STORAGE_KEY, readBookingIds, saveBookingIds } from "./lib/bookingStorage";

const allTimes = ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00", "17:00", "18:00"];
const stepTitles = ["Serviço", "Data e horário", "Seus dados"];
const priceFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

type AppointmentDraft = {
  id: string;
  service: string;
  date: string;
  time: string;
};

type AvailabilityStatus = {
  loading: boolean;
  error: boolean;
};

type AppointmentStage = "service" | "schedule";

type BookingModalProps = {
  open: boolean;
  onClose: () => void;
};

type AppointmentFieldsProps = {
  appointment: AppointmentDraft;
  appointments: AppointmentDraft[];
  index: number;
  stage: AppointmentStage;
  open: boolean;
  submitting: boolean;
  retry: number;
  error: string;
  onChange: (id: string, changes: Partial<Omit<AppointmentDraft, "id">>) => void;
  onRemove: (id: string) => void;
  onRetry: () => void;
  onAvailabilityChange: (id: string, status: AvailabilityStatus) => void;
};

function getFriendlyError(error: unknown) {
  if (error instanceof Error && error.message.includes("ainda não está configurado")) {
    return error.message;
  }
  return "Não foi possível concluir agora. Confira sua conexão e tente novamente.";
}

function isTimeInPast(date: Date, time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const timeSlot = new Date(date);
  timeSlot.setHours(hours, minutes, 0, 0);
  return timeSlot.getTime() <= Date.now();
}

function AppointmentFields({
  appointment,
  appointments,
  index,
  stage,
  open,
  submitting,
  retry,
  error,
  onChange,
  onRemove,
  onRetry,
  onAvailabilityChange,
}: AppointmentFieldsProps) {
  const [occupiedTimes, setOccupiedTimes] = useState<string[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState(false);

  useEffect(() => {
    let active = true;

    if (!open || !appointment.date) {
      setOccupiedTimes([]);
      setAvailabilityLoading(false);
      setAvailabilityError(false);
      onAvailabilityChange(appointment.id, { loading: false, error: false });
      return () => {
        active = false;
      };
    }

    setAvailabilityLoading(true);
    setAvailabilityError(false);
    onAvailabilityChange(appointment.id, { loading: true, error: false });

    async function fetchOccupiedTimes() {
      let requestFailed = false;
      try {
        setOccupiedTimes([]);
        const { data, error: queryError } = await getSupabaseClient()
          .from("agendamentos")
          .select("horario_agendamento")
          .eq("data_agendamento", appointment.date)
          .eq("status", "confirmado");

        if (queryError) throw queryError;
        if (active) {
          setOccupiedTimes(data.map((booking) => booking.horario_agendamento.slice(0, 5)));
        }
      } catch {
        requestFailed = true;
        if (active) {
          setAvailabilityError(true);
        }
      } finally {
        if (active) {
          setAvailabilityLoading(false);
          onAvailabilityChange(appointment.id, {
            loading: false,
            error: requestFailed,
          });
        }
      }
    }

    void fetchOccupiedTimes();
    return () => {
      active = false;
    };
  }, [appointment.date, appointment.id, onAvailabilityChange, open, retry]);

  const date = appointment.date ? parseISO(appointment.date) : undefined;
  const duplicateTime = appointments.some((other) =>
    other.id !== appointment.id &&
    other.date === appointment.date &&
    other.time === appointment.time &&
    Boolean(appointment.date && appointment.time),
  );
  const blockedTimes = allTimes.filter((time) =>
    occupiedTimes.includes(time) ||
    Boolean(date && isTimeInPast(date, time)) ||
    appointments.some((other) =>
      other.id !== appointment.id && other.date === appointment.date && other.time === time,
    ),
  );

  return (
    <section className="booking-appointment" aria-labelledby={`booking-appointment-title-${appointment.id}`}>
      <header className="booking-appointment__header">
        <h3 id={`booking-appointment-title-${appointment.id}`}>
          {appointments.length > 1 ? `Horário ${index + 1}` : "Seu horário"}
        </h3>
        {stage === "service" && index > 0 && (
          <button
            className="booking-modal__text-button booking-appointment__remove"
            type="button"
            onClick={() => onRemove(appointment.id)}
            aria-label={`Remover horário ${index + 1}`}
            disabled={submitting}
          >
            Remover
          </button>
        )}
      </header>

      {stage === "service" ? (
        <>
          <p className="booking-modal__hint">Escolha o serviço ideal para este horário.</p>
          <div className="booking-service-list">
            {bookingServices.map((item) => (
              <button
                className={`booking-service${appointment.service === item.name ? " is-selected" : ""}`}
                key={item.name}
                type="button"
                disabled={submitting}
                aria-pressed={appointment.service === item.name}
                onClick={() => onChange(appointment.id, { service: item.name })}
              >
                <span><strong>{item.name}</strong><small>{item.durationMinutes} min</small></span>
                <strong>{priceFormatter.format(item.price)}</strong>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="booking-modal__hint booking-appointment__calendar-label">
            {date ? "Data selecionada" : "Escolha o melhor dia"}
          </p>
          <DayPicker
            mode="single"
            selected={date}
            onSelect={(selectedDate) => onChange(appointment.id, {
              date: selectedDate ? format(selectedDate, "yyyy-MM-dd") : "",
              time: "",
            })}
            disabled={submitting ? () => true : { before: startOfToday() }}
            locale={ptBR}
            showOutsideDays
            className="booking-calendar"
            aria-label={`Calendário do horário ${index + 1}`}
            labels={{
              labelNav: () => "Navegação do calendário",
              labelNext: () => "Próximo mês",
              labelPrevious: () => "Mês anterior",
            }}
          />
        </>
      )}

      {stage === "schedule" && date && (
        <div className="booking-appointment__times">
          <p className="booking-modal__hint">
            Horários para {format(date, "EEEE, dd 'de' MMMM", { locale: ptBR })}
          </p>
          {availabilityLoading ? (
            <div className="booking-loading" role="status"><span /> Consultando disponibilidade...</div>
          ) : availabilityError ? (
            <div className="booking-modal__error" role="alert">
              <p>Não foi possível consultar a disponibilidade desta data.</p>
              <button
                className="booking-modal__text-button"
                type="button"
                onClick={onRetry}
              >
                Tentar novamente
              </button>
            </div>
          ) : (
            <>
              <div className="booking-time-grid">
                {allTimes.map((time) => {
                  const isOccupied = blockedTimes.includes(time);
                  return (
                    <button
                      className={`booking-time${appointment.time === time ? " is-selected" : ""}${isOccupied ? " is-occupied" : ""}`}
                      key={time}
                      type="button"
                      disabled={isOccupied || submitting}
                      aria-pressed={appointment.time === time}
                      onClick={() => onChange(appointment.id, { time })}
                    >
                      {time}
                    </button>
                  );
                })}
              </div>
              {!appointment.time && blockedTimes.length === allTimes.length && (
                <p className="booking-modal__hint">Não há horários livres nessa data. Escolha outro dia.</p>
              )}
            </>
          )}
        </div>
      )}

      {(error || (stage === "schedule" && duplicateTime)) && (
        <p className="booking-appointment__error" role="alert">
          {duplicateTime ? "Esse horário já foi selecionado em outro agendamento." : error}
        </p>
      )}
    </section>
  );
}

function getCaretPosition(formattedValue: string, digitsBeforeCaret: number) {
  if (!digitsBeforeCaret) return formattedValue.startsWith("(") ? 1 : 0;
  let digitCount = 0;
  let position = 0;
  while (position < formattedValue.length && digitCount < digitsBeforeCaret) {
    if (/\d/.test(formattedValue[position])) digitCount += 1;
    position += 1;
  }
  while (position < formattedValue.length && !/\d/.test(formattedValue[position])) {
    position += 1;
  }
  return position;
}

export default function BookingModal({ open, onClose }: BookingModalProps) {
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState<AppointmentDraft[]>([
    { id: "booking-0", service: "", date: "", time: "" },
  ]);
  const [step, setStep] = useState(0);
  const [activeAppointmentIndex, setActiveAppointmentIndex] = useState(0);
  const nextAppointmentId = useRef(1);
  const [availability, setAvailability] = useState<Record<string, AvailabilityStatus>>({});
  const [availabilityRetry, setAvailabilityRetry] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [appointmentErrors, setAppointmentErrors] = useState<Record<string, string>>({});
  const [clientName, setClientName] = useState("");
  const [nameError, setNameError] = useState("");
  const [phoneDigits, setPhoneDigits] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const reportAvailability = useCallback((id: string, status: AvailabilityStatus) => {
    setAvailability((current) => ({ ...current, [id]: status }));
  }, []);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !submittingRef.current) {
        closeModal();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [open]);

  function closeModal() {
    if (submittingRef.current) return;
    setAppointments([{ id: "booking-0", service: "", date: "", time: "" }]);
    setStep(0);
    setActiveAppointmentIndex(0);
    nextAppointmentId.current = 1;
    setAvailability({});
    setAvailabilityRetry(0);
    setErrorMessage("");
    setAppointmentErrors({});
    setClientName("");
    setNameError("");
    setPhoneDigits("");
    setPhoneError("");
    onClose();
  }

  function updateAppointment(id: string, changes: Partial<Omit<AppointmentDraft, "id">>) {
    setAppointments((current) => current.map((appointment) =>
      appointment.id === id ? { ...appointment, ...changes } : appointment,
    ));
    setAppointmentErrors({});
    if ("date" in changes) {
      setAvailability((current) => ({
        ...current,
        [id]: { loading: Boolean(changes.date), error: false },
      }));
    }
    setErrorMessage("");
  }

  function addAppointment() {
    const id = `booking-${nextAppointmentId.current}`;
    nextAppointmentId.current += 1;
    const index = appointments.length;
    setAppointments((current) => [...current, { id, service: "", date: "", time: "" }]);
    setActiveAppointmentIndex(index);
    setErrorMessage("");
  }

  function removeAppointment(id: string) {
    const nextAppointments = appointments.filter((appointment) => appointment.id !== id);
    setAppointments(nextAppointments);
    setActiveAppointmentIndex((current) => Math.min(current, nextAppointments.length - 1));
    setAvailability((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setAppointmentErrors((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setErrorMessage("");
  }

  function goBack() {
    setErrorMessage("");
    if (step === 2) {
      setStep(1);
      setActiveAppointmentIndex(appointments.length - 1);
    } else if (step === 1 && activeAppointmentIndex > 0) {
      setActiveAppointmentIndex((index) => index - 1);
    } else if (step === 1) {
      setStep(0);
    }
  }

  function goNext() {
    setErrorMessage("");
    setAppointmentErrors({});

    if (step === 0) {
      const appointment = appointments[activeAppointmentIndex];
      if (!appointment.service) {
        setAppointmentErrors({
          [appointment.id]: "Escolha um serviço para este agendamento.",
        });
        return;
      }
      if (activeAppointmentIndex < appointments.length - 1) {
        setActiveAppointmentIndex((index) => index + 1);
      } else {
        setActiveAppointmentIndex(0);
        setStep(1);
      }
      return;
    }

    if (step !== 1) return;
    const appointment = appointments[activeAppointmentIndex];
    if (!appointment.date || !appointment.time) {
      setAppointmentErrors({
        [appointment.id]: "Selecione a data e o horário para continuar.",
      });
      return;
    }
    if (isTimeInPast(parseISO(appointment.date), appointment.time)) {
      setAppointmentErrors({
        [appointment.id]: "Este horário já passou. Escolha outro horário ou data.",
      });
      return;
    }
    const status = availability[appointment.id];
    if (!status || status.loading || status.error) {
      setAppointmentErrors({
        [appointment.id]: "A disponibilidade ainda não foi confirmada. Aguarde ou tente novamente.",
      });
      return;
    }
    if (appointments.some((other, index) =>
      index !== activeAppointmentIndex &&
      other.date === appointment.date &&
      other.time === appointment.time,
    )) {
      setAppointmentErrors({
        [appointment.id]: "Esse horário já foi selecionado em outro agendamento.",
      });
      return;
    }

    if (activeAppointmentIndex < appointments.length - 1) {
      setActiveAppointmentIndex((index) => index + 1);
    } else {
      setStep(2);
    }
  }

  function handlePhoneChange(event: ChangeEvent<HTMLInputElement>) {
    const rawValue = event.currentTarget.value;
    const caret = event.currentTarget.selectionStart ?? rawValue.length;
    const digitsBeforeCaret = rawValue.slice(0, caret).replace(/\D/g, "").length;
    const nextDigits = rawValue.replace(/\D/g, "").slice(0, 11);
    const formattedValue = formatBrazilianPhone(nextDigits);
    setPhoneDigits(nextDigits);
    setPhoneError("");
    window.requestAnimationFrame(() => {
      const input = phoneInputRef.current;
      if (!input) return;
      const position = getCaretPosition(formattedValue, Math.min(digitsBeforeCaret, nextDigits.length));
      input.setSelectionRange(position, position);
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    setErrorMessage("");
    setAppointmentErrors({});

    if (!clientName.trim()) {
      setNameError("Informe seu nome para concluir o agendamento.");
      document.getElementById("booking-client-name")?.focus();
      return;
    }
    setNameError("");

    if (phoneDigits.length !== 11) {
      setPhoneError("Informe o telefone completo com DDD e 9 dígitos.");
      phoneInputRef.current?.focus();
      return;
    }

    const nextErrors: Record<string, string> = {};
    for (const appointment of appointments) {
      if (!appointment.service || !appointment.date || !appointment.time) {
        nextErrors[appointment.id] = "Selecione o serviço, a data e o horário deste agendamento.";
      } else if (isTimeInPast(parseISO(appointment.date), appointment.time)) {
        nextErrors[appointment.id] = "Este horário já passou. Escolha outro horário ou data.";
      } else if (
        !availability[appointment.id] ||
        availability[appointment.id].loading ||
        availability[appointment.id].error
      ) {
        nextErrors[appointment.id] = "A disponibilidade ainda não foi confirmada. Tente novamente.";
      }
    }

    const duplicateIds = appointments.filter((appointment, index) =>
      appointments.some((other, otherIndex) =>
        otherIndex !== index &&
        Boolean(appointment.date && appointment.time) &&
        other.date === appointment.date &&
        other.time === appointment.time,
      ),
    ).map(({ id }) => id);
    duplicateIds.forEach((id) => {
      nextErrors[id] = "Esse horário já foi selecionado em outro agendamento.";
    });

    if (Object.keys(nextErrors).length) {
      setAppointmentErrors(nextErrors);
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      const { data, error } = await getSupabaseClient()
        .from("agendamentos")
        .insert(appointments.map((appointment) => ({
          servico: appointment.service,
          nome_cliente: clientName.trim(),
          whatsapp: phoneDigits,
          data_agendamento: appointment.date,
          horario_agendamento: appointment.time,
        })))
        .select("id");

      if (error?.code === "23505") {
        setAppointmentErrors(Object.fromEntries(appointments.map(({ id }) => [
          id,
          "Um dos horários acabou de ser reservado. Confira a disponibilidade e tente novamente.",
        ])));
        setStep(1);
        setActiveAppointmentIndex(0);
        setAvailabilityRetry((attempt) => attempt + 1);
        return;
      }
      if (error) throw error;
      if (!data || data.length !== appointments.length || data.some((booking) => !booking.id)) {
        throw new Error("O banco não confirmou todos os agendamentos enviados.");
      }

      const bookingIds = data.map((booking) => booking.id);
      let reminderStorageFailed = false;
      try {
        const previousIds = readBookingIds(window.localStorage.getItem(LAST_BOOKING_STORAGE_KEY));
        saveBookingIds([...previousIds, ...bookingIds]);
      } catch {
        reminderStorageFailed = true;
      }
      navigate(`/agendamento/comprovante/${encodeURIComponent(bookingIds[0])}`, {
        state: { reminderStorageFailed, additionalBookingCount: bookingIds.length - 1 },
      });
    } catch (error) {
      setErrorMessage(error instanceof Error
        ? `Não foi possível salvar os agendamentos: ${error.message}`
        : getFriendlyError(error));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="booking-modal__backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeModal();
      }}
    >
      <section
        ref={dialogRef}
        className="booking-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-modal-title"
      >
        <div className="booking-modal__urgency">⚡ Escolha seus horários e confirme o agendamento</div>
        <header className="booking-modal__header">
          <div>
            <p className="eyebrow"><span /> AGENDAMENTO ONLINE</p>
            <h2 id="booking-modal-title">Seu próximo momento.</h2>
          </div>
          <button
            ref={closeButtonRef}
            className="booking-modal__close"
            type="button"
            aria-label="Fechar agendamento"
            onClick={closeModal}
            disabled={submitting}
          >
            ×
          </button>
        </header>

        <ol className="booking-steps" aria-label="Etapas do agendamento">
          {stepTitles.map((title, index) => (
            <li className={index <= step ? "is-active" : ""} key={title}>
              <span>{index + 1}</span>{title}
            </li>
          ))}
        </ol>

        <form className="booking-client-form booking-modal__form" onSubmit={handleSubmit} noValidate>
          {step < 2 && (
            <>
              {step < 2 && (
                <p className="booking-modal__hint booking-modal__step-hint" aria-live="polite">
                  {step === 0
                    ? `Serviço ${activeAppointmentIndex + 1} de ${appointments.length}`
                    : `Horário ${activeAppointmentIndex + 1} de ${appointments.length}`}
                </p>
              )}
              <div className="booking-modal__appointments">
                {appointments.map((appointment, index) => (
                  index === activeAppointmentIndex && (
                    <AppointmentFields
                      key={appointment.id}
                      appointment={appointment}
                      appointments={appointments}
                      index={index}
                      stage={step === 0 ? "service" : "schedule"}
                      open={open && step === 1}
                      submitting={submitting}
                      retry={availabilityRetry}
                      error={appointmentErrors[appointment.id] || ""}
                      onChange={updateAppointment}
                      onRemove={removeAppointment}
                      onRetry={() => setAvailabilityRetry((attempt) => attempt + 1)}
                      onAvailabilityChange={reportAvailability}
                    />
                  )
                ))}
              </div>

              {step === 0 && (
                <button
                  className="booking-modal__text-button booking-modal__add"
                  type="button"
                  onClick={addAppointment}
                  disabled={submitting}
                >
                  + Adicionar outro horário
                </button>
              )}

              <footer className="booking-modal__footer">
                <button
                  className="booking-modal__text-button"
                  type="button"
                  onClick={goBack}
                  disabled={step === 0 || submitting}
                >
                  ← Voltar
                </button>
                <button
                  className="button booking-modal__primary"
                  type="button"
                  onClick={goNext}
                  disabled={submitting}
                >
                  {step === 1 && activeAppointmentIndex === appointments.length - 1
                    ? "Continuar para seus dados"
                    : step === 1
                      ? "Próximo horário"
                      : step === 0 && activeAppointmentIndex < appointments.length - 1
                        ? "Próximo serviço"
                        : "Continuar para data e horário"}
                  <span aria-hidden="true">→</span>
                </button>
              </footer>
            </>
          )}

          {step === 2 && (
            <>
              <div className="booking-modal__contact">
                <h3>Como podemos te encontrar?</h3>
                <div className="booking-modal__booking-summary">
                  {appointments.map((appointment, index) => (
                    <p key={appointment.id}>
                      <strong>Horário {index + 1}:</strong> {appointment.service} ·{" "}
                      {format(parseISO(appointment.date), "dd/MM/yyyy")} às {appointment.time}
                    </p>
                  ))}
                </div>
                <label htmlFor="booking-client-name">Seu nome</label>
                <input
                  id="booking-client-name"
                  type="text"
                  autoComplete="name"
                  placeholder="Como podemos te chamar?"
                  value={clientName}
                  onChange={(event) => {
                    setClientName(event.target.value);
                    setNameError("");
                  }}
                  required
                  maxLength={100}
                  disabled={submitting}
                  aria-invalid={Boolean(nameError)}
                  aria-describedby={nameError ? "booking-client-name-error" : undefined}
                />
                {nameError && (
                  <p className="booking-appointment__error" id="booking-client-name-error" role="alert">
                    {nameError}
                  </p>
                )}
                <label htmlFor="booking-client-whatsapp">Telefone para contato</label>
                <input
                  ref={phoneInputRef}
                  id="booking-client-whatsapp"
                  type="tel"
                  autoComplete="tel"
                  inputMode="numeric"
                  placeholder="(00) 999999999"
                  value={formatBrazilianPhone(phoneDigits)}
                  onChange={handlePhoneChange}
                  required
                  maxLength={14}
                  aria-invalid={Boolean(phoneError)}
                  aria-describedby={phoneError ? "booking-client-whatsapp-error" : "booking-client-whatsapp-hint"}
                  disabled={submitting}
                />
                <small id="booking-client-whatsapp-hint">
                  Digite DDD e os 9 dígitos do celular.
                </small>
                {phoneError && (
                  <p className="booking-appointment__error" id="booking-client-whatsapp-error" role="alert">
                    {phoneError}
                  </p>
                )}
              </div>

              {errorMessage && (
                <div className="booking-modal__error" role="alert">
                  <p>{errorMessage}</p>
                </div>
              )}

              <footer className="booking-modal__footer">
                <button
                  className="booking-modal__text-button"
                  type="button"
                  onClick={goBack}
                  disabled={submitting}
                >
                  ← Voltar aos horários
                </button>
                <button className="button booking-modal__primary" type="submit" disabled={submitting}>
                  {submitting
                    ? <><span className="booking-spinner" /> Confirmando...</>
                    : <>Confirmar agendamentos <span aria-hidden="true">↗</span></>}
                </button>
              </footer>
            </>
          )}
        </form>
      </section>
    </div>
  );
}
