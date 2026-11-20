import { useEffect, useState } from "react";
import { Download, RefreshCw, Share, X } from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const INSTALL_DISMISSAL_KEY = "brasa-pwa-install-dismissed";

function wasInstallPromptDismissed() {
  try {
    return window.sessionStorage.getItem(INSTALL_DISMISSAL_KEY) === "true";
  } catch (error) {
    console.error("Não foi possível ler a preferência de instalação do PWA.", error);
    return false;
  }
}

function isRunningAsInstalledApp() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isAppleMobileDevice() {
  return (
    /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export default function PwaExperience() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isRunningAsInstalledApp);
  const [dismissed, setDismissed] = useState(wasInstallPromptDismissed);
  const [showIosInstructions, setShowIosInstructions] = useState(false);
  const isAppleMobile = isAppleMobileDevice();
  const iconUrl = `${import.meta.env.BASE_URL}icon/iconbrasa180.png`;
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisterError(error) {
      console.error("Não foi possível registrar o service worker do PWA.", error);
    },
  });
  const showInstallPrompt =
    !dismissed && !installed && (installPrompt !== null || isAppleMobile);

  useEffect(() => {
    function handleInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    }

    function handleAppInstalled() {
      setInstallPrompt(null);
      setInstalled(true);
    }

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (!showIosInstructions) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setShowIosInstructions(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showIosInstructions]);

  async function handleInstall() {
    if (!installPrompt) return;

    try {
      await installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      setInstallPrompt(null);
      if (outcome === "accepted") setInstalled(true);
      else dismissInstallPrompt();
    } catch (error) {
      console.error("Não foi possível iniciar a instalação do PWA.", error);
      setInstallPrompt(null);
      dismissInstallPrompt();
    }
  }

  function dismissInstallPrompt() {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(INSTALL_DISMISSAL_KEY, "true");
    } catch (error) {
      console.error("Não foi possível salvar a preferência de instalação do PWA.", error);
    }
  }

  return (
    <>
      {showInstallPrompt && (
          <aside className="pwa-prompt" aria-live="polite">
            <img className="pwa-prompt__icon" src={iconUrl} alt="" />
            <div className="pwa-prompt__copy">
              <strong>Brasa Barbearia</strong>
              <span>
                {isAppleMobile
                  ? "Tenha o app sempre à mão."
                  : "Adicione à tela inicial para acessar mais rápido."}
              </span>
            </div>
            {isAppleMobile ? (
            <button
                className="pwa-prompt__action"
              type="button"
                onClick={() => setShowIosInstructions(true)}
            >
                Como instalar
            </button>
            ) : (
              <button
                className="pwa-prompt__action"
                type="button"
                onClick={handleInstall}
              >
                <Download aria-hidden="true" size={16} />
                Instalar
              </button>
            )}
            <button
              className="pwa-prompt__dismiss"
              type="button"
              aria-label="Dispensar convite de instalação"
              onClick={dismissInstallPrompt}
            >
              <X aria-hidden="true" size={18} />
            </button>
          </aside>
      )}

      {needRefresh && (
          <aside
            className={`pwa-update${showInstallPrompt ? " pwa-update--stacked" : ""}`}
            aria-live="polite"
          >
          <span>Uma nova versão do app está disponível.</span>
          <button
            type="button"
            onClick={() => void updateServiceWorker(true)}
          >
            <RefreshCw aria-hidden="true" size={15} />
            Atualizar
          </button>
          <button
            className="pwa-update__dismiss"
            type="button"
            aria-label="Dispensar aviso de atualização"
            onClick={() => setNeedRefresh(false)}
          >
            <X aria-hidden="true" size={17} />
          </button>
        </aside>
      )}

      {showIosInstructions && (
        <div
          className="pwa-dialog-backdrop"
          onClick={() => setShowIosInstructions(false)}
        >
          <section
            className="pwa-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pwa-ios-title"
            aria-describedby="pwa-ios-description"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="pwa-dialog__close"
              type="button"
              aria-label="Fechar instruções"
              onClick={() => setShowIosInstructions(false)}
            >
              <X aria-hidden="true" size={20} />
            </button>
            <span className="pwa-dialog__icon" aria-hidden="true">
              <Share size={22} />
            </span>
            <h2 id="pwa-ios-title">Instale no iPhone ou iPad</h2>
            <p id="pwa-ios-description">
              No Safari, adicione a Brasa à tela inicial em poucos passos:
            </p>
            <ol>
              <li>Abra este site no Safari.</li>
              <li>
                Toque em <strong>Compartilhar</strong> <Share aria-hidden="true" size={15} />.
              </li>
              <li>
                Selecione <strong>Adicionar à Tela de Início</strong>.
              </li>
              <li>Confirme tocando em Adicionar.</li>
            </ol>
            <button
              className="pwa-dialog__action"
              type="button"
              onClick={() => setShowIosInstructions(false)}
            >
              Entendi
            </button>
          </section>
        </div>
      )}
    </>
  );
}
