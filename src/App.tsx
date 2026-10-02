import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Bluetooth,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  FileText,
  ImagePlus,
  Info,
  LoaderCircle,
  Pencil,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Trash2,
  Usb,
  Wifi,
  X,
  AlertCircle,
} from "lucide-react";
import QRCode from "qrcode";
import { printer, isAndroid } from "./printer";
import {
  diagnostic,
  money,
  newProfile,
  newReceipt,
  stateLabels,
  total,
  uid,
  validateProfile,
  validateReceipt,
  type AppState,
  type Connection,
  type Device,
  type PrintJob,
  type PrinterProfile,
  type Receipt,
} from "./model";

type Tab = "print" | "printers" | "activity";
const connectionLabels = {
  bluetooth: "Bluetooth",
  usb: "USB cable",
  network: "Wi-Fi / LAN",
};
function ConnectionIcon({
  type,
  size = 20,
}: {
  type: Connection;
  size?: number;
}) {
  const Icon = type === "bluetooth" ? Bluetooth : type === "usb" ? Usb : Wifi;
  return <Icon size={size} />;
}
function readDraft(): Receipt {
  try {
    const saved = localStorage.getItem("anyprint.draft");
    if (!saved) return newReceipt();
    const draft = JSON.parse(saved) as Receipt;
    if (
      !Array.isArray(draft.items) ||
      typeof draft.title !== "string" ||
      typeof draft.currency !== "string"
    )
      return newReceipt();
    return { ...newReceipt(), ...draft };
  } catch {
    return newReceipt();
  }
}
function readSelected() {
  try {
    return localStorage.getItem("anyprint.selected") ?? "";
  } catch {
    return "";
  }
}
function Notice({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "warning";
}) {
  return (
    <div className={`notice ${tone}`}>
      <Info size={18} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
function ReceiptPaper({
  receipt,
  width = 58,
}: {
  receipt: Receipt;
  width?: number;
}) {
  const [qr, setQr] = useState("");
  useEffect(() => {
    let active = true;
    setQr("");
    if (receipt.qr)
      void QRCode.toDataURL(receipt.qr, { margin: 2, width: 180 })
        .then((url) => {
          if (active) setQr(url);
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [receipt.qr]);
  if (receipt.qualityCheck) return (
    <article className="receipt-paper" aria-label="Receipt preview">
      <strong>Anyprint / short test</strong>
      <p>Normal: AaBb 0123456789</p>
      <p><strong>Bold: AaBb 0123456789</strong></p>
      <p>A / Raster · image and black bars</p>
      <p>B / Column · same image and bars</p>
      <p>Compact comparison; no sale items or QR.</p>
    </article>
  );
  return (
    <article
      className={`receipt-paper ${width >= 80 ? "wide" : ""}`}
      aria-label="Receipt preview"
    >
      {receipt.logo && (
        <img className="receipt-logo" src={receipt.logo} alt="Store logo" />
      )}
      <div className="receipt-store">{receipt.title || "Your store name"}</div>
      {receipt.subtitle ? (
        <p className="receipt-subtitle">{receipt.subtitle}</p>
      ) : (
        <p className="receipt-subtitle placeholder">
          Your receipt, ready to make your own.
        </p>
      )}
      {receipt.isCopy && (
        <strong className="receipt-copy">COPY / REPRINT</strong>
      )}
      <div className="receipt-meta">
        {receipt.reference || "RECEIPT"}
        {receipt.date && (
          <>
            <br />
            {receipt.date}
          </>
        )}
      </div>
      <div className="receipt-rule" />
      {receipt.items.map((item, index) => (
        <div className="receipt-item" key={item.id || index}>
          <strong>{item.name || "Item name"}</strong>
          <div>
            <span>
              {item.quantity || 1} ×{" "}
              {money(
                Number.isFinite(item.price) ? item.price : 0,
                receipt.currency,
              )}
            </span>
            <span>
              {money(
                (Number.isFinite(item.price) ? item.price : 0) *
                  (item.quantity || 1),
                receipt.currency,
              )}
            </span>
          </div>
        </div>
      ))}
      <div className="receipt-rule" />
      <div className="receipt-total">
        <span>TOTAL</span>
        <strong>
          {money(
            Number.isFinite(total(receipt)) ? total(receipt) : 0,
            receipt.currency,
          )}
        </strong>
      </div>
      <div className="receipt-rule" />
      {receipt.footer && <p className="receipt-footer">{receipt.footer}</p>}
      {qr && <img className="receipt-qr" src={qr} alt="Receipt QR code" />}
      
    </article>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>("print");
  const [state, setState] = useState<AppState>({ profiles: [], jobs: [] });
  const [draft, setDraft] = useState<Receipt>(readDraft);
  const [selectedId, setSelectedId] = useState(readSelected);
  const selected =
    state.profiles.find((p) => p.id === selectedId) ?? state.profiles[0];
  const [editingReceipt, setEditingReceipt] = useState(false);
  const [editingPrinter, setEditingPrinter] = useState<PrinterProfile | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [detail, setDetail] = useState<PrintJob | null>(null);
  const [confirm, setConfirm] = useState<{
    title: string;
    body: string;
    action: string;
    run: () => Promise<void>;
  } | null>(null);
  const submission = useRef<{ key: string; id: string } | null>(null);
  const activeCount = state.jobs.filter((j) =>
    ["queued", "connecting", "sending"].includes(j.state),
  ).length;
  const attentionCount = state.jobs.filter((j) =>
    ["failed", "unknown"].includes(j.state),
  ).length;
  const refresh = useCallback(async () => {
    const next = await printer.getState();
    setState(next);
    setLoaded(true);
  }, []);
  useEffect(() => {
    let active = true;
    let pending = false;
    const update = async () => {
      if (pending) return;
      pending = true;
      try {
        const next = await printer.getState();
        if (active) {
          setState(next);
          setLoaded(true);
        }
      } catch (e) {
        if (active) {
          setError(
            e instanceof Error ? e.message : "Could not load printer settings.",
          );
          setLoaded(true);
        }
      } finally {
        pending = false;
      }
    };
    void update();
    const interval = window.setInterval(() => {
      if (!document.hidden) void update();
    }, 1500);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("anyprint.draft", JSON.stringify(draft));
    } catch {
      setError("Your draft could not be saved. Device storage may be full.");
    }
  }, [draft]);
  useEffect(() => {
    try {
      localStorage.setItem("anyprint.selected", selectedId);
    } catch {
      /* Native printer profiles remain persisted. */
    }
  }, [selectedId]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(id);
  }, [toast]);
  const run = async (operation: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await operation();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  };
  const navigate = (next: Tab) => {
    setTab(next);
    setEditingPrinter(null);
    setEditingReceipt(false);
    setError("");
    window.scrollTo(0, 0);
  };
  const send = async (receipt: Receipt, profile = selected) => {
    if (!profile) {
      setTab("printers");
      setEditingPrinter(newProfile());
      return;
    }
    const problem = validateReceipt(receipt);
    if (problem) throw new Error(problem);
    const key = JSON.stringify({ receipt, profile });
    if (submission.current?.key !== key)
      submission.current = { key, id: uid() };
    // Keep the same ID after an uncertain bridge response, preventing a duplicate submission.
    await printer.enqueue({
      id: submission.current.id,
      profile,
      receipt: {
        ...receipt,
        date: receipt.date || new Date().toLocaleString(),
      },
    });
    submission.current = null;
    setToast("Receipt added to the print queue.");
    setTab("activity");
    setEditingReceipt(false);
  };
  const reprint = (job: PrintJob) =>
    setConfirm({
      title: "Print another copy?",
      body:
        job.state === "unknown"
          ? "Some or all of this receipt may already have printed. Check the paper first. The new receipt will be marked COPY / REPRINT."
          : "This creates a new print job using the original printer settings. The receipt will be marked COPY / REPRINT.",
      action: "Print a copy",
      run: async () => {
        setDetail(null);
        await send({ ...job.receipt, isCopy: true }, job.profile);
      },
    });
  const viewJob = detail
    ? ({ ...detail, ...(state.jobs.find((j) => j.id === detail.id) ?? {}), receipt: detail.receipt })
    : null;
  const modalRef = useRef<HTMLDialogElement>(null);
  const confirmRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (detail) modalRef.current?.showModal();
    else modalRef.current?.close();
  }, [detail]);
  useEffect(() => {
    if (confirm) confirmRef.current?.showModal();
    else confirmRef.current?.close();
  }, [confirm]);
  const toolbar = (
    <header className="app-header">
      <button
        className="brand"
        onClick={() => navigate("print")}
        aria-label="Anyprint home"
      >
        <span className="brand-icon">
          <Printer size={21} strokeWidth={2.3} />
        </span>
        <span>
          anyprint<span className="brand-dot">.</span>
        </span>
      </button>
      <span className="local-label">
        <ShieldCheck size={15} /> On-device printing
      </span>
    </header>
  );
  return (
    <div className="app-shell">
      {toolbar}
      {!isAndroid && (
        <div className="preview-banner">
          <Info size={16} />
          <span>
            Browser preview · Install the Android app to connect and print.
          </span>
        </div>
      )}
      <main id="main-content">
        {error && (
          <div className="error-banner" role="alert">
            <AlertCircle size={20} />
            <p>{error}</p>
            <button
              className="icon-button"
              aria-label="Dismiss error"
              onClick={() => setError("")}
            >
              <X size={18} />
            </button>
          </div>
        )}
        {tab === "print" && !editingReceipt && (
          <>
            <div className="page-heading">
              <div>
                <h1>Let’s print.</h1>
                <p>A good receipt. Without the fuss.</p>
              </div>
              <span className="page-icon">
                <FileText size={26} strokeWidth={1.5} />
              </span>
            </div>
            <button
              className={`printer-selector ${selected ? "has-printer" : ""}`}
              onClick={() => {
                navigate("printers");
                if (!selected) setEditingPrinter(newProfile());
              }}
            >
              <span className="selector-icon">
                {selected ? (
                  <ConnectionIcon type={selected.connection} />
                ) : (
                  <Printer size={22} />
                )}
              </span>
              <span className="selector-copy">
                <strong>
                  {selected?.name ?? "Connect your first printer"}
                </strong>
                <small>
                  {selected
                    ? `${connectionLabels[selected.connection]} · ${selected.paperMm} mm · Saved on this device`
                    : "Bluetooth, USB, or Wi-Fi / LAN"}
                </small>
              </span>
              {selected ? <ChevronRight size={20} /> : <Plus size={20} />}
            </button>
            <section className="preview-section" aria-label="Receipt workspace">
              <div className="section-bar">
                <span>RECEIPT PREVIEW</span>
                <span className="paper-chip">{selected?.paperMm ?? 58} mm</span>
              </div>
              <div className="paper-stage">
                <ReceiptPaper receipt={draft} width={selected?.paperMm} />
              </div>
              <button
                className="edit-receipt"
                onClick={() => setEditingReceipt(true)}
              >
                <Pencil size={16} /> Edit receipt <ArrowRight size={16} />
              </button>
            </section>
            <div className="print-actions">
              <div className="print-summary">
                <span>
                  {draft.items.length}{" "}
                  {draft.items.length === 1 ? "item" : "items"}
                </span>
                <strong>
                  {money(
                    Number.isFinite(total(draft)) ? total(draft) : 0,
                    draft.currency,
                  )}
                </strong>
              </div>
              <button
                className="button primary print-button"
                disabled={busy || !loaded}
                onClick={() => {
                  if (!selected) {
                    navigate("printers");
                    setEditingPrinter(newProfile());
                  } else if (validateReceipt(draft)) {
                    setEditingReceipt(true);
                    setError(validateReceipt(draft)!);
                  } else void run(() => send(draft));
                }}
              >
                <Printer size={19} />
                {busy
                  ? "Adding to queue…"
                  : selected
                    ? "Print receipt"
                    : "Set up a printer"}
                <ArrowRight size={18} />
              </button>
              <p className="quiet-note">
                <ShieldCheck size={14} /> Receipts stay on this device. No
                account needed.
              </p>
            </div>
            {selected && (
              <button
                className="text-button test-link"
                disabled={busy}
                onClick={() => void run(() => send(diagnostic(selected)))}
              >
                <RefreshCw size={15} /> Print a test receipt
              </button>
            )}
          </>
        )}
        {tab === "print" && editingReceipt && (
          <ReceiptEditor
            draft={draft}
            onChange={setDraft}
            onDone={() => {
              const problem = validateReceipt(draft);
              if (problem) setError(problem);
              else {
                setError("");
                setEditingReceipt(false);
                window.scrollTo(0, 0);
              }
            }}
            onBack={() => {
              setEditingReceipt(false);
              setError("");
            }}
            onError={setError}
          />
        )}
        {tab === "printers" && !editingPrinter && (
          <>
            <div className="page-heading">
              <div>
                <h1>Your printers</h1>
                <p>Set up once. Print whenever.</p>
              </div>
              <span className="page-icon">
                <Printer size={26} strokeWidth={1.5} />
              </span>
            </div>
            {state.profiles.length === 0 ? (
              <section className="empty-state">
                <div className="empty-device">
                  <Printer size={42} strokeWidth={1.3} />
                  <span>
                    <Plus size={15} />
                  </span>
                </div>
                <h2>A printer makes it official.</h2>
                <p>
                  Connect an ESC/POS receipt printer.
                  <br />
                  Start with 58 mm, 80 mm, or a custom width.
                </p>
                <button
                  className="button primary"
                  onClick={() => setEditingPrinter(newProfile())}
                >
                  <Plus size={18} /> Add your first printer
                </button>
                <div className="connection-options">
                  <span>
                    <Bluetooth size={16} /> Bluetooth
                  </span>
                  <span>
                    <Usb size={16} /> USB
                  </span>
                  <span>
                    <Wifi size={16} /> Network
                  </span>
                </div>
              </section>
            ) : (
              <>
                <div className="printer-list">
                  {state.profiles.map((profile) => (
                    <article className="saved-printer" key={profile.id}>
                      <div className="printer-row">
                        <span className="device-icon">
                          <ConnectionIcon type={profile.connection} size={23} />
                        </span>
                        <div>
                          <h2>{profile.name}</h2>
                          <p>
                            {connectionLabels[profile.connection]} ·{" "}
                            {profile.paperMm} mm
                          </p>
                        </div>
                        <button
                          className="icon-button"
                          aria-label={`Edit ${profile.name}`}
                          onClick={() => setEditingPrinter({ ...profile })}
                        >
                          <Settings2 size={20} />
                        </button>
                      </div>
                      <div className="printer-address">{profile.address}</div>
                      <div className="printer-controls">
                        <button
                          className={`text-button ${selected?.id === profile.id ? "selected-label" : ""}`}
                          onClick={() => {
                            setSelectedId(profile.id);
                            setToast(`${profile.name} selected.`);
                          }}
                        >
                          {selected?.id === profile.id ? (
                            <>
                              <CheckCircle2 size={16} /> Selected printer
                            </>
                          ) : (
                            "Use this printer"
                          )}
                        </button>
                        <button
                          className="button small secondary"
                          disabled={busy}
                          onClick={() =>
                            void run(() => send(diagnostic(profile), profile))
                          }
                        >
                          <Printer size={15} /> Test print
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
                <button
                  className="button secondary full-width"
                  onClick={() => setEditingPrinter(newProfile())}
                >
                  <Plus size={18} /> Add another printer
                </button>
              </>
            )}
            <div className="support-note">
              <CircleHelp size={19} />
              <div>
                <strong>Made for generic receipt printers</strong>
                <p>
                  Supports ESC/POS over Bluetooth Classic, standard USB printer
                  interfaces, and raw network printing. BLE-only and proprietary
                  printers need a dedicated adapter.
                </p>
              </div>
            </div>
          </>
        )}
        {tab === "printers" && editingPrinter && (
          <PrinterEditor
            initial={editingPrinter}
            busy={busy}
            onBack={() => setEditingPrinter(null)}
            onError={setError}
            onSave={(profile) =>
              void run(async () => {
                await printer.saveProfile({ profile });
                setSelectedId(profile.id);
                setEditingPrinter(null);
                setToast("Printer saved. Run a test print to check it.");
              })
            }
            onDelete={
              state.profiles.some((p) => p.id === editingPrinter.id)
                ? () =>
                    setConfirm({
                      title: "Remove this printer?",
                      body: "Its saved settings will be removed. Existing print jobs keep their original printer settings.",
                      action: "Remove printer",
                      run: async () => {
                        await printer.deleteProfile({ id: editingPrinter.id });
                        setEditingPrinter(null);
                        setToast("Printer removed.");
                      },
                    })
                : undefined
            }
          />
        )}
        {tab === "activity" && (
          <>
            <div className="page-heading">
              <div>
                <h1>Print activity</h1>
                <p>
                  {activeCount
                    ? `${activeCount} ${activeCount === 1 ? "receipt" : "receipts"} in the queue.`
                    : "Every receipt has a trail."}
                </p>
              </div>
              <span className="page-icon">
                <Activity size={26} strokeWidth={1.5} />
              </span>
            </div>
            {state.jobs.some((j) => j.state === "queued") && (
              <div className="queue-resume">
                <div>
                  <strong>Receipts waiting</strong>
                  <p>If printing was interrupted, resume your queue.</p>
                </div>
                <button
                  className="button small secondary"
                  disabled={busy}
                  onClick={() => void run(() => printer.resume())}
                >
                  <RefreshCw size={15} /> Resume
                </button>
              </div>
            )}
            {state.jobs.length === 0 ? (
              <section className="empty-state activity-empty">
                <span className="empty-activity">
                  <FileText size={38} strokeWidth={1.3} />
                </span>
                <h2>Your next receipt starts here.</h2>
                <p>
                  Print jobs appear here with their status,
                  <br />
                  so you always know what happened.
                </p>
                <button
                  className="button secondary"
                  onClick={() => navigate("print")}
                >
                  Create a receipt <ArrowRight size={16} />
                </button>
              </section>
            ) : (
              <div className="job-list">
                {state.jobs.map((job) => (
                  <button
                    className="job-row"
                    key={job.id}
                    onClick={() => void run(async () => setDetail(await printer.getJob({ id: job.id })))}
                  >
                    <span className={`job-symbol ${job.state}`}>
                      {["failed", "unknown"].includes(job.state) ? (
                        <AlertCircle size={21} />
                      ) : job.state === "sent" ? (
                        <Check size={22} />
                      ) : ["connecting", "sending"].includes(job.state) ? (
                        <LoaderCircle className="spin" size={21} />
                      ) : (
                        <FileText size={21} />
                      )}
                    </span>
                    <span className="job-copy">
                      <strong>
                        {job.receipt.reference || job.receipt.title}
                      </strong>
                      <small>
                        {job.profile.name} ·{" "}
                        {new Date(job.created).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </small>
                      <span className={`status-label ${job.state}`}>
                        {stateLabels[job.state]}
                      </span>
                    </span>
                    <span className="job-amount">
                      {money(total(job.receipt), job.receipt.currency)}
                      <ChevronRight size={16} />
                    </span>
                  </button>
                ))}
              </div>
            )}
            <Notice>
              “Sent” means data was handed to the connection, not a confirmed
              paper receipt. If the result is uncertain, check the paper before
              reprinting.
            </Notice>
          </>
        )}
      </main>
      <nav className="bottom-nav" aria-label="Main navigation">
        {(
          [
            { id: "print", label: "Print", icon: FileText },
            { id: "printers", label: "Printers", icon: Printer },
            { id: "activity", label: "Activity", icon: Activity },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => navigate(id)}
          >
            <span>
              <Icon size={22} strokeWidth={tab === id ? 2.1 : 1.7} />
              {id === "activity" && activeCount + attentionCount > 0 && (
                <span className="nav-dot" />
              )}
            </span>
            {label}
          </button>
        ))}
      </nav>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
      <dialog
        ref={modalRef}
        className="job-dialog"
        onCancel={() => setDetail(null)}
      >
        {viewJob && (
          <>
            <div className="dialog-heading">
              <h2>Receipt details</h2>
              <button
                className="icon-button"
                aria-label="Close receipt details"
                onClick={() => setDetail(null)}
              >
                <X size={20} />
              </button>
            </div>
            <span className={`status-label ${viewJob.state}`}>
              {stateLabels[viewJob.state]}
            </span>
            <p className="job-message">{viewJob.message}</p>
            <dl className="job-facts">
              <div>
                <dt>Printer</dt>
                <dd>{viewJob.profile.name}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{new Date(viewJob.created).toLocaleString()}</dd>
              </div>
              <div>
                <dt>Job</dt>
                <dd>{viewJob.id.slice(0, 8)}</dd>
              </div>
            </dl>
            <div className="dialog-receipt">
              <ReceiptPaper
                receipt={viewJob.receipt}
                width={viewJob.profile.paperMm}
              />
            </div>
            <div className="dialog-actions">
              {viewJob.state === "failed" && (
                <button
                  disabled={busy}
                  className="button primary"
                  onClick={() =>
                    void run(async () => {
                      setDetail(null);
                      await printer.retry({ id: viewJob.id });
                    })
                  }
                >
                  <RefreshCw size={17} /> Retry safely
                </button>
              )}
              {["sent", "unknown"].includes(viewJob.state) && (
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() => reprint(viewJob)}
                >
                  <Printer size={17} /> Print another copy
                </button>
              )}
              {["queued", "failed"].includes(viewJob.state) && (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      setDetail(null);
                      await printer.cancel({ id: viewJob.id });
                    })
                  }
                >
                  Cancel job
                </button>
              )}
            </div>
          </>
        )}
      </dialog>
      <dialog
        ref={confirmRef}
        className="confirm-dialog"
        onCancel={() => setConfirm(null)}
      >
        {confirm && (
          <>
            <h2>{confirm.title}</h2>
            <p>{confirm.body}</p>
            <div className="dialog-actions">
              <button
                className="button secondary"
                onClick={() => setConfirm(null)}
              >
                Go back
              </button>
              <button
                className="button primary"
                disabled={busy}
                onClick={() => {
                  const action = confirm.run;
                  setConfirm(null);
                  void run(action);
                }}
              >
                {confirm.action}
              </button>
            </div>
          </>
        )}
      </dialog>
    </div>
  );
}

function ReceiptEditor({
  draft,
  onChange,
  onDone,
  onBack,
  onError,
}: {
  draft: Receipt;
  onChange: (r: Receipt) => void;
  onDone: () => void;
  onBack: () => void;
  onError: (s: string) => void;
}) {
  const update = (patch: Partial<Receipt>) => onChange({ ...draft, ...patch });
  const updateItem = (id: string, patch: Partial<Receipt["items"][number]>) =>
    update({
      items: draft.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    });
  const uploadLogo = async (file?: File) => {
    if (!file) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 250_000
    ) {
      onError("Choose a PNG, JPEG, or WebP image below 250 KB.");
      return;
    }
    const reader = new FileReader();
    reader.onerror = () =>
      onError("Could not read the logo. Try another image.");
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => onError("This image could not be opened.");
      image.onload = () => {
        if (image.width > 4096 || image.height > 4096)
          onError("Use a logo smaller than 4096 × 4096 pixels.");
        else update({ logo: String(reader.result) });
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };
  return (
    <div className="editor">
      <button className="back-button" onClick={onBack}>
        <ArrowLeft size={18} /> Back to preview
      </button>
      <div className="page-heading compact">
        <div>
          <h1>Make it yours.</h1>
          <p>Your draft saves as you go.</p>
        </div>
      </div>
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          onDone();
        }}
      >
        <section className="form-section">
          <h2>Store details</h2>
          <label>
            Store name
            <input
              value={draft.title}
              maxLength={80}
              placeholder="e.g. Kopi Pagi"
              onChange={(e) => update({ title: e.target.value })}
              required
            />
          </label>
          <label>
            Address or subtitle
            <textarea
              rows={2}
              maxLength={200}
              value={draft.subtitle}
              placeholder="A short address, phone number, or tagline"
              onChange={(e) => update({ subtitle: e.target.value })}
            />
          </label>
          <div className="form-grid">
            <label>
              Receipt number <span className="optional">Optional</span>
              <input
                maxLength={80}
                value={draft.reference}
                placeholder="e.g. INV-001"
                onChange={(e) => update({ reference: e.target.value })}
              />
            </label>
            <label>
              Currency
              <select
                value={draft.currency}
                onChange={(e) => update({ currency: e.target.value })}
              >
                {["IDR", "USD", "EUR", "GBP", "MYR", "SGD"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>
        </section>
        <section className="form-section">
          <div className="section-title">
            <h2>Items</h2>
            <span>{draft.items.length} / 40</span>
          </div>
          {draft.items.map((item, index) => (
            <div className="item-editor" key={item.id}>
              <div className="item-top">
                <span>Item {index + 1}</span>
                <button
                  type="button"
                  className="icon-button"
                  disabled={draft.items.length === 1}
                  aria-label={`Remove item ${index + 1}`}
                  onClick={() =>
                    update({
                      items: draft.items.filter((i) => i.id !== item.id),
                    })
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <label>
                Item name
                <input
                  required
                  value={item.name}
                  maxLength={120}
                  placeholder="e.g. Iced latte"
                  onChange={(e) =>
                    updateItem(item.id, { name: e.target.value })
                  }
                />
              </label>
              <div className="form-grid item-numbers">
                <label>
                  Quantity
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    max="999"
                    step="1"
                    value={Number.isNaN(item.quantity) ? "" : item.quantity}
                    onChange={(e) =>
                      updateItem(item.id, {
                        quantity:
                          e.target.value === "" ? NaN : Number(e.target.value),
                      })
                    }
                    required
                  />
                </label>
                <label>
                  Unit price ({draft.currency})
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max="100000000"
                    step={draft.currency === "IDR" ? "1" : "0.01"}
                    value={Number.isNaN(item.price) ? "" : item.price}
                    onChange={(e) =>
                      updateItem(item.id, {
                        price:
                          e.target.value === "" ? NaN : Number(e.target.value),
                      })
                    }
                    required
                  />
                </label>
              </div>
            </div>
          ))}
          <button
            type="button"
            className="button secondary full-width"
            disabled={draft.items.length >= 40}
            onClick={() =>
              update({
                items: [
                  ...draft.items,
                  { id: uid(), name: "", quantity: 1, price: 0 },
                ],
              })
            }
          >
            <Plus size={17} /> Add item
          </button>
        </section>
        <section className="form-section">
          <h2>Finishing touches</h2>
          <label>
            Footer
            <textarea
              maxLength={500}
              rows={2}
              value={draft.footer}
              onChange={(e) => update({ footer: e.target.value })}
            />
          </label>
          <label>
            <span className="label-icon">
              <QrCode size={16} /> QR content{" "}
              <span className="optional">Optional</span>
            </span>
            <input
              value={draft.qr}
              maxLength={300}
              placeholder="A website, payment link, or short text"
              onChange={(e) => update({ qr: e.target.value })}
            />
          </label>
          <label className="logo-upload">
            <ImagePlus size={20} />
            <span>
              {draft.logo ? "Change store logo" : "Add a store logo"}
              <small>PNG, JPEG, or WebP · up to 250 KB</small>
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => void uploadLogo(e.target.files?.[0])}
            />
          </label>
          {draft.logo && (
            <button
              type="button"
              className="text-button"
              onClick={() => update({ logo: "" })}
            >
              <Trash2 size={15} /> Remove logo
            </button>
          )}
        </section>
        <div className="editor-total">
          <span>Total</span>
          <strong>
            {money(
              Number.isFinite(total(draft)) ? total(draft) : 0,
              draft.currency,
            )}
          </strong>
        </div>
        <button type="submit" className="button primary full-width">
          Preview receipt <ArrowRight size={18} />
        </button>
      </form>
    </div>
  );
}

function PrinterEditor({
  initial,
  busy,
  onBack,
  onError,
  onSave,
  onDelete,
}: {
  initial: PrinterProfile;
  busy: boolean;
  onBack: () => void;
  onError: (s: string) => void;
  onSave: (p: PrinterProfile) => void;
  onDelete?: () => void;
}) {
  const [profile, setProfile] = useState(initial);
  const [devices, setDevices] = useState<Device[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [searched, setSearched] = useState(false);
  const [usbGranted, setUsbGranted] = useState(false);
  const update = (patch: Partial<PrinterProfile>) =>
    setProfile((p) => ({ ...p, ...patch }));
  const discover = async () => {
    setDiscovering(true);
    onError("");
    try {
      const result = await (profile.connection === "bluetooth"
        ? printer.listBluetooth()
        : printer.listUsb());
      setDevices(result.devices);
      setSearched(true);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setDiscovering(false);
    }
  };
  const selectDevice = async (device: Device) => {
    if (profile.connection === "usb") {
      setDiscovering(true);
      try {
        await printer.requestUsb({ address: device.address });
        setUsbGranted(true);
      } catch (e) {
        onError(e instanceof Error ? e.message : String(e));
        setDiscovering(false);
        return;
      }
      setDiscovering(false);
    }
    update({
      address: device.address,
      name: profile.name || device.name,
      vendorId: device.vendorId,
      productId: device.productId,
    });
  };
  const connection = (type: Connection) => {
    update({
      connection: type,
      address: "",
      vendorId: undefined,
      productId: undefined,
    });
    setDevices([]);
    setSearched(false);
    setUsbGranted(false);
  };
  return (
    <div className="editor">
      <button className="back-button" onClick={onBack}>
        <ArrowLeft size={18} /> Your printers
      </button>
      <div className="page-heading compact">
        <div>
          <h1>{onDelete ? "Printer settings" : "Meet your printer."}</h1>
          <p>A few details, then a test receipt.</p>
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const problem = validateProfile(profile);
          if (problem) onError(problem);
          else if (profile.connection === "usb" && !usbGranted)
            onError(
              "Select your USB printer from the list to grant access before saving.",
            );
          else onSave(profile);
        }}
      >
        <section className="form-section">
          <h2>
            01 <span>Connection</span>
          </h2>
          <div
            className="connection-picker"
            role="group"
            aria-label="Connection type"
          >
            {(["bluetooth", "usb", "network"] as const).map((type) => (
              <button
                type="button"
                key={type}
                className={profile.connection === type ? "selected" : ""}
                aria-pressed={profile.connection === type}
                onClick={() => connection(type)}
                disabled={discovering}
              >
                <ConnectionIcon type={type} size={23} />
                <span>
                  {type === "network"
                    ? "Network"
                    : type === "usb"
                      ? "USB"
                      : "Bluetooth"}
                </span>
                {profile.connection === type && (
                  <Check size={13} className="connection-check" />
                )}
              </button>
            ))}
          </div>
          {profile.connection === "network" ? (
            <>
              <p className="field-help">
                Use the printer’s IP address from its self-test slip. Your
                Android device must be on the same network.
              </p>
              <label>
                Printer IP address
                <input
                  required
                  value={profile.address}
                  placeholder="192.168.1.100"
                  autoCapitalize="none"
                  autoCorrect="off"
                  onChange={(e) => update({ address: e.target.value.trim() })}
                />
              </label>
              <label>
                Port
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="65535"
                  value={profile.port || ""}
                  onChange={(e) => update({ port: Number(e.target.value) })}
                  required
                />
              </label>
            </>
          ) : (
            <>
              <p className="field-help">
                {profile.connection === "bluetooth"
                  ? "Pair your printer in Android Bluetooth settings, then choose it below. Use a Bluetooth Classic / SPP printer."
                  : "Connect your printer with a USB OTG adapter. Allow USB access when Android asks."}
              </p>
              {profile.connection === "bluetooth" && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    void printer
                      .bluetoothSettings()
                      .catch((e) => onError(e.message));
                  }}
                >
                  Open Bluetooth settings <ArrowRight size={15} />
                </button>
              )}
              <button
                type="button"
                className="button secondary full-width discover-button"
                disabled={discovering}
                onClick={() => void discover()}
              >
                {discovering ? (
                  <LoaderCircle size={17} className="spin" />
                ) : (
                  <RefreshCw size={17} />
                )}
                {discovering
                  ? "Looking for printers…"
                  : profile.connection === "bluetooth"
                    ? "Show paired devices"
                    : "Find USB printers"}
              </button>
              {searched && devices.length === 0 && (
                <Notice>
                  {profile.connection === "bluetooth"
                    ? "No paired devices found. Pair your printer in Android settings and try again."
                    : "No USB devices found. Check your OTG adapter, cable, and printer power."}
                </Notice>
              )}
              <div className="device-list">
                {devices.map((device) => (
                  <button
                    type="button"
                    key={device.address}
                    disabled={discovering || device.supported === false}
                    className={`device-option ${profile.address === device.address ? "selected" : ""}`}
                    onClick={() => void selectDevice(device)}
                  >
                    <ConnectionIcon type={profile.connection} />
                    <span>
                      <strong>{device.name}</strong>
                      <small>
                        {device.supported === false
                          ? "USB-serial / proprietary interface not supported"
                          : device.address}
                      </small>
                    </span>
                    {profile.address === device.address ? (
                      <CheckCircle2 size={19} />
                    ) : (
                      <Plus size={17} />
                    )}
                  </button>
                ))}
              </div>
              {profile.address &&
                !devices.some((d) => d.address === profile.address) && (
                  <Notice>
                    Saved device: {profile.address}
                    {profile.connection === "usb" &&
                      ". Find and select it again to renew USB access."}
                  </Notice>
                )}
            </>
          )}
        </section>
        <section className="form-section">
          <h2>
            02 <span>Printer details</span>
          </h2>
          <label>
            Printer name
            <input
              required
              maxLength={80}
              value={profile.name}
              placeholder="e.g. Front counter"
              onChange={(e) => update({ name: e.target.value })}
            />
          </label>
          <label>
            Paper width
            <div className="width-picker">
              {[58, 80].map((width) => (
                <button
                  type="button"
                  key={width}
                  aria-pressed={profile.paperMm === width}
                  className={profile.paperMm === width ? "selected" : ""}
                  onClick={() =>
                    update({ paperMm: width, dots: width === 58 ? 384 : 576 })
                  }
                >
                  {width} mm{profile.paperMm === width && <Check size={15} />}
                </button>
              ))}
              <button
                type="button"
                aria-pressed={![58, 80].includes(profile.paperMm)}
                className={
                  ![58, 80].includes(profile.paperMm) ? "selected" : ""
                }
                onClick={() => update({ paperMm: 112, dots: 832 })}
              >
                Custom
              </button>
            </div>
          </label>
          {![58, 80].includes(profile.paperMm) && (
            <label>
              Paper width (mm)
              <input
                type="number"
                min="58"
                max="112"
                required
                value={profile.paperMm || ""}
                onChange={(e) => update({ paperMm: Number(e.target.value) })}
              />
            </label>
          )}
          <p className="field-help">
            Paper size and printable area are different. Fine-tune the printable
            width below if your test receipt is clipped.
          </p>
        </section>
        <section className="form-section">
          <h2>03 <span>Print quality</span></h2>
          <label>
            Text printing
            <select value={profile.textMode ?? "native"} onChange={e => update({ textMode: e.target.value as "native" | "image" })}>
              <option value="native">Printer font · compact data</option>
              <option value="image">Image · consistent layout</option>
            </select>
          </label>
          <p className="field-help">Printer font uses the printer’s own letter shapes. Special characters automatically use a sharp image fallback.</p>
          <label>
            Print weight
            <select value={profile.textWeight ?? "bold"} onChange={e => update({ textWeight: e.target.value as "normal" | "bold" })}>
              <option value="bold">Darker · thicker text and stronger logos</option>
              <option value="normal">Normal</option>
            </select>
          </label>
          <label>
            Logo rendering
            <select value={profile.logoMode ?? "solid"} onChange={e => update({ logoMode: e.target.value as "solid" | "photo" })}>
              <option value="solid">Solid · logos and lettering</option>
              <option value="photo">Photo · shaded images</option>
            </select>
          </label>
          <p className="field-help">Solid keeps logo strokes filled. Photo uses small dots to represent shades. Images use the selected printable dot width; increasing file DPI cannot add printer dots.</p>
          <p className="field-help">Test print is a short A/B comparison (about 4–5 cm at 384 dots). Choose the result that is clearer on your printer under Compatibility settings. This does not change the printer’s heat setting.</p>
        </section>
        <details className="advanced">
          <summary>
            <Settings2 size={18} /> Compatibility settings{" "}
            <ChevronDown size={17} />
          </summary>
          <div className="advanced-content">
            <label>
              Printable width (dots)
              <input
                type="number"
                min="192"
                max="832"
                step="8"
                value={profile.dots || ""}
                onChange={(e) => update({ dots: Number(e.target.value) })}
                required
              />
            </label>
            <label>
              Image mode
              <select
                value={profile.imageMode}
                onChange={(e) =>
                  update({ imageMode: e.target.value as "raster" | "column" })
                }
              >
                <option value="raster">Raster (GS v 0) · common default</option>
                <option value="column">Column (ESC *) · alternate firmware path</option>
              </select>
            </label>
            <p className="field-help">
              Both options send the same full-resolution dots. Use the short A/B test to choose the one your printer handles most clearly.
            </p>
            <label>
              Transfer pacing
              <select
                value={profile.paceMs}
                onChange={(e) => update({ paceMs: Number(e.target.value) })}
              >
                <option value={10}>Normal · recommended</option>
                <option value={30}>Slow · small printer buffers</option>
                <option value={0}>Fast · network printers</option>
              </select>
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={profile.cut}
                onChange={(e) => update({ cut: e.target.checked })}
              />
              <span>
                Cut paper after printing
                <small>
                  Enable only if your printer has an automatic cutter.
                </small>
              </span>
            </label>
          </div>
        </details>
        <button
          type="submit"
          className="button primary full-width"
          disabled={busy || discovering}
        >
          {busy ? (
            <LoaderCircle className="spin" size={18} />
          ) : (
            <Check size={18} />
          )}{" "}
          Save printer
        </button>
        {onDelete && (
          <button
            type="button"
            className="text-button delete-printer"
            onClick={onDelete}
          >
            <Trash2 size={16} /> Remove printer
          </button>
        )}
      </form>
    </div>
  );
}
