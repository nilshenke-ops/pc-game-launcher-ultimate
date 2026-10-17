import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, CircleSlash, HelpCircle, Info, Loader2, X, XCircle } from "lucide-react";
import { dismissToast, useToasts } from "../lib/hooks";
import { t } from "../lib/i18n";
import type { RpcError } from "../lib/rpc";

export function Button({ children, variant, size, icon, busy, block, className = "", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "danger" | "ghost"; size?: "sm" | "lg"; icon?: ReactNode; busy?: boolean; block?: boolean }) {
  const cls = ["btn", variant, size, block && "block", !children && "icon", className].filter(Boolean).join(" ");
  return (
    <button type="button" className={cls} disabled={busy || rest.disabled} aria-busy={busy || undefined} {...rest}>
      {busy ? <Loader2 size={size === "sm" ? 15 : 18} className="spin" /> : icon}
      {children}
    </button>
  );
}

export function Card({ title, icon, meta, actions, children, className = "", style }: { title?: ReactNode; icon?: ReactNode; meta?: ReactNode; actions?: ReactNode; children?: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <section className={`card ${className}`} style={style}>
      {(title || actions) && (
        <div className="card-head">
          <h2>{icon}{title}</h2>
          {meta && <span className="meta">{meta}</span>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHead({ eyebrow, title, text, actions }: { eyebrow?: string; title: string; text?: ReactNode; actions?: ReactNode }) {
  useEffect(() => { document.title = `${title} · PC Game Launcher`; }, [title]);
  return (
    <header className="page-head fade-in">
      <div className="text">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {text && <p>{text}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}

export function Switch({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode; disabled?: boolean }) {
  return (
    <label className="switch">
      <span className="text">{label}{hint && <small>{hint}</small>}</span>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" aria-hidden />
    </label>
  );
}

export function Field({ label, hint, error, children }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <span className="hint">{hint}</span>}
      {error && <span className="error">{error}</span>}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={value === o.value ? "on" : ""} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Banner({ kind = "info", title, children, actions }: { kind?: "info" | "warn" | "error" | "ok"; title?: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  const Icon = kind === "error" ? XCircle : kind === "warn" ? AlertTriangle : kind === "ok" ? CheckCircle2 : Info;
  return (
    <div className={`banner ${kind}`} role={kind === "error" ? "alert" : "status"}>
      <Icon size={18} />
      <div className="grow">{title && <b>{title}</b>}{children}</div>
      {actions}
    </div>
  );
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="icon-wrap">{icon}</div>
      <b>{title}</b>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

/** Loading / error / empty wrapper so no page ever hangs on an endless spinner. */
export function Loadable({ loading, error, onRetry, children }: { loading: boolean; error: RpcError | null; onRetry?: () => void; children: ReactNode }) {
  if (error && loading === false && children == null) return null;
  if (error) return <Banner kind="error" title={t("Daten konnten nicht geladen werden")} actions={onRetry && <Button size="sm" onClick={onRetry}>{t("Erneut versuchen")}</Button>}>{error.message}</Banner>;
  if (loading) return <div className="stack" aria-busy><div className="skeleton" style={{ height: 22, width: "40%" }} /><div className="skeleton" style={{ height: 120 }} /><div className="skeleton" style={{ height: 120 }} /></div>;
  return <>{children}</>;
}

export function Modal({ title, onClose, children, footer, wide, className = "" }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const first = ref.current?.querySelector<HTMLElement>("input, select, textarea, button:not(.modal-close)");
    first?.focus();
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className={`modal ${wide ? "wide" : ""} ${className}`} role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}>
        <div className="modal-head">
          <h2>{title}</h2>
          <Button variant="ghost" className="modal-close" size="sm" icon={<X size={18} />} onClick={onClose} aria-label={t("Schließen")} />
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

let confirmResolver: ((v: boolean) => void) | null = null;
let confirmState: { title: string; text: string; danger?: boolean; ok?: string } | null = null;
const confirmListeners = new Set<() => void>();

export function confirmDialog(title: string, text: string, opts: { danger?: boolean; ok?: string } = {}): Promise<boolean> {
  confirmResolver?.(false);
  confirmState = { title, text, ...opts };
  confirmListeners.forEach((l) => l());
  return new Promise((r) => { confirmResolver = r; });
}

export function ConfirmHost() {
  const state = useSyncExternalStore((fn) => { confirmListeners.add(fn); return () => confirmListeners.delete(fn); }, () => confirmState);
  if (!state) return null;
  const done = (v: boolean) => { confirmState = null; confirmListeners.forEach((l) => l()); confirmResolver?.(v); confirmResolver = null; };
  return (
    <Modal title={state.title} onClose={() => done(false)} footer={<>
      <Button onClick={() => done(false)}>{t("Abbrechen")}</Button>
      <Button variant={state.danger ? "danger" : "primary"} onClick={() => done(true)}>{state.ok ?? t("Bestätigen")}</Button>
    </>}>
      <p>{state.text}</p>
    </Modal>
  );
}

export function Toasts() {
  const toasts = useToasts();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((x) => {
        const Icon = x.kind === "success" ? CheckCircle2 : x.kind === "error" ? XCircle : x.kind === "warning" ? AlertTriangle : Info;
        return (
          <div key={x.id} className={`toast ${x.kind}`} role={x.kind === "error" ? "alert" : "status"}>
            <Icon size={18} />
            <div className="grow">{x.text}</div>
            <Button variant="ghost" size="sm" icon={<X size={14} />} onClick={() => dismissToast(x.id)} aria-label={t("Schließen")} />
          </div>
        );
      })}
    </div>
  );
}

export function StatusIcon({ status }: { status: string }) {
  const map: Record<string, ReactNode> = {
    ok: <CheckCircle2 size={17} />, warn: <AlertTriangle size={17} />, error: <XCircle size={17} />,
    untested: <HelpCircle size={17} />, unsupported: <CircleSlash size={17} />, info: <Info size={17} />,
  };
  return <span className={`ico ${status}`}>{map[status] ?? map.info}</span>;
}

export function statusLabel(s: string) {
  return ({ ok: t("OK"), warn: t("Warnung"), error: t("Fehler"), untested: t("Nicht getestet"), unsupported: t("Nicht unterstützt"), info: t("Info") } as Record<string, string>)[s] ?? s;
}

export function CheckList({ checks }: { checks: { label: string; status: string; detail: string; ms?: number }[] }) {
  return (
    <div>
      {checks.map((c, i) => (
        <div key={i} className="check-row">
          <StatusIcon status={c.status} />
          <div className="grow">
            <div className="row between"><b>{c.label}</b><span className={`badge ${c.status === "ok" ? "ok" : c.status === "error" ? "error" : c.status === "warn" || c.status === "untested" ? "warn" : ""}`}>{statusLabel(c.status)}</span></div>
            <div className="small muted" style={{ wordBreak: "break-word" }}>{c.detail}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function Meter({ value, max = 100 }: { value?: number | null; max?: number }) {
  const pct = value == null ? 0 : Math.min(100, (value / max) * 100);
  return <div className={`meter ${pct > 90 ? "error" : pct > 75 ? "warn" : ""}`} role="meter" aria-valuenow={value ?? undefined} aria-valuemin={0} aria-valuemax={max}><i style={{ width: `${pct}%` }} /></div>;
}

export function Gauge({ value, label, sub }: { value?: number | null; label: string; sub?: string }) {
  const r = 50, c = 2 * Math.PI * r;
  const pct = value == null ? 0 : Math.min(100, value);
  return (
    <div className="gauge" role="img" aria-label={`${label}: ${value == null ? t("Nicht verfügbar") : Math.round(value) + " %"}`}>
      <svg viewBox="0 0 120 120" width="120" height="120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(127,127,127,0.15)" strokeWidth="10" />
        <circle cx="60" cy="60" r={r} fill="none" stroke="url(#g)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`} style={{ transition: "stroke-dasharray .6s" }} />
        <defs><linearGradient id="g"><stop offset="0" stopColor="var(--primary)" /><stop offset="1" stopColor="var(--accent)" /></linearGradient></defs>
      </svg>
      <div className="val"><div><b>{value == null ? "–" : `${Math.round(value)}%`}</b><small>{sub ?? label}</small></div></div>
    </div>
  );
}

export function Sparkline({ values, max = 100 }: { values: (number | null | undefined)[]; max?: number }) {
  const pts = values.map((v, i) => [i, v ?? 0] as const);
  if (pts.length < 2) return <svg className="spark" />;
  const w = 300, h = 56;
  const d = pts.map(([i, v], k) => `${k ? "L" : "M"}${(i / (pts.length - 1)) * w},${h - (Math.min(v, max) / max) * (h - 4) - 2}`).join(" ");
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <defs><linearGradient id="sf" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--primary)" stopOpacity="0.35" /><stop offset="1" stopColor="var(--primary)" stopOpacity="0" /></linearGradient></defs>
      <path d={`${d} L${w},${h} L0,${h} Z`} fill="url(#sf)" />
      <path d={d} fill="none" stroke="var(--primary)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Thumb({ name, icon, cover, gradient }: { name: string; icon?: string; cover?: string; gradient: string }) {
  if (icon) return <div className="thumb" style={{ background: "rgba(255,255,255,0.06)" }}><img src={icon} alt="" /></div>;
  if (cover) return <div className="thumb" style={{ backgroundImage: `url("${cover}")` }} />;
  return <div className="thumb" style={{ background: gradient }}>{name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}</div>;
}
