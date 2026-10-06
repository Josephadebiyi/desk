import { AnimatePresence } from "framer-motion";
import {
  Banknote,
  Check,
  Copy,
  CreditCard,
  Download,
  HandHeart,
  Landmark,
  Plus,
  QrCode,
  Search,
  Trash2,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AskAI,
  Bars,
  downloadCsv,
  fmtDate,
  Kpi,
  Modal,
  money,
  NoAccess,
  PageHead,
  PlanGate,
  Tabs,
  tEnum,
  today,
} from "./kit";
import { confirmAction, withConfirm } from "./confirm";
import { useMembers } from "./store";
import { can, uid } from "./types";
import { useWorkspace } from "./workspace";
import { PayoutConnect } from "./PayoutConnect";
import { getLocale, useT } from "../i18n";
import { Link, useSearchParams } from "react-router-dom";
import { publicOrigin } from "../lib/site";
import {
  formatIban,
  manualMethods,
  METHODS as GIVE_METHODS,
  MethodLogo,
  suggestedMethods,
  validateMethods,
  type ManualMethod,
  type MethodType,
} from "../lib/giveMethods";
import { ONLINE_GIVING } from "../lib/features";

const METHODS = ["Transfer", "Card", "Cash", "Cheque"];
const EXPENSE_CATS = [
  "Utilities",
  "Salaries",
  "Outreach",
  "Equipment",
  "Maintenance",
  "Missions",
  "Events",
  "Other",
];

interface Row {
  id: string;
  date: string;
  donor: string;
  fund: string;
  method: string;
  amount: number;
}

function monthKey(d: string) {
  return d.slice(0, 7);
}
function lastMonths(n: number) {
  const out: string[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}
const monthLabel = (k: string) =>
  new Date(k + "-01T00:00:00").toLocaleDateString(getLocale(), {
    month: "short",
  });

function RecordGift({ onClose }: { onClose: () => void }) {
  const { members, addGift } = useMembers();
  const { settings, addAnonGift } = useWorkspace();
  const { t } = useT();
  const [giver, setGiver] = useState("anon");
  const [donor, setDonor] = useState(() => t("giving.basketDefault"));
  const [amount, setAmount] = useState("");
  const [fund, setFund] = useState(settings.funds[0] ?? "Offering");
  const [method, setMethod] = useState("Cash");
  const [date, setDate] = useState(today());
  const [error, setError] = useState("");
  const sorted = useMemo(
    () => [...members].sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [members],
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = Number(amount);
    if (!n || n <= 0) return setError(t("giving.errAmount"));
    if (!(await confirmAction({ title: t("cf.giftTitle"), body: `${money(n, settings.currency)} · ${fund} · ${method}`, confirmLabel: t("cf.save") }))) return;
    if (giver === "anon")
      addAnonGift({
        amount: n,
        fund,
        method,
        date,
        donor: donor.trim() || t("giving.anonymous"),
      });
    else addGift(giver, { amount: n, fund, method, date });
    onClose();
  };

  return (
    <Modal title={t("giving.recordTitle")} onClose={onClose}>
      <form className="d-form" onSubmit={submit} noValidate>
        <label className="d-field">
          <span>{t("giving.giver")}</span>
          <select value={giver} onChange={(e) => setGiver(e.target.value)}>
            <option value="anon">{t("giving.anonBasket")}</option>
            {sorted.map((m) => (
              <option key={m.id} value={m.id}>
                {m.fullName}
              </option>
            ))}
          </select>
        </label>
        {giver === "anon" && (
          <label className="d-field">
            <span>{t("giving.description")}</span>
            <input value={donor} onChange={(e) => setDonor(e.target.value)} />
          </label>
        )}
        <div className="d-grid">
          <label className={`d-field ${error ? "has-error" : ""}`}>
            <span>{t("giving.amountCur", { cur: settings.currency })}</span>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
            {error && <em>{error}</em>}
          </label>
          <label className="d-field">
            <span>{t("common.date")}</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="d-field">
            <span>{t("giving.fund")}</span>
            <select value={fund} onChange={(e) => setFund(e.target.value)}>
              {settings.funds.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
          <label className="d-field">
            <span>{t("giving.method")}</span>
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {tEnum("method", m)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="d-form-actions">
          <button type="button" className="d-btn" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="d-btn d-btn-ink">
            <Check size={15} /> {t("giving.record")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AddExpense({ onClose }: { onClose: () => void }) {
  const { addExpense, settings } = useWorkspace();
  const { t } = useT();
  const [f, setF] = useState({
    category: EXPENSE_CATS[0],
    amount: "",
    date: today(),
    note: "",
  });
  const [error, setError] = useState("");
  return (
    <Modal title={t("giving.addExpense")} onClose={onClose}>
      <form
        className="d-form"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          const n = Number(f.amount);
          if (!n || n <= 0) return setError(t("giving.errAmount"));
          if (!(await confirmAction({ title: t("cf.expenseTitle"), body: `${money(n, settings.currency)} · ${f.category}`, confirmLabel: t("cf.save") }))) return;
          addExpense({
            category: f.category,
            amount: n,
            date: f.date,
            note: f.note.trim(),
          });
          onClose();
        }}
      >
        <div className="d-grid">
          <label className="d-field">
            <span>{t("giving.category")}</span>
            <select
              value={f.category}
              onChange={(e) => setF({ ...f, category: e.target.value })}
            >
              {EXPENSE_CATS.map((c) => (
                <option key={c} value={c}>
                  {tEnum("expense", c)}
                </option>
              ))}
            </select>
          </label>
          <label className={`d-field ${error ? "has-error" : ""}`}>
            <span>{t("giving.amountCur", { cur: settings.currency })}</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={f.amount}
              onChange={(e) => setF({ ...f, amount: e.target.value })}
              autoFocus
            />
            {error && <em>{error}</em>}
          </label>
          <label className="d-field">
            <span>{t("common.date")}</span>
            <input
              type="date"
              value={f.date}
              onChange={(e) => setF({ ...f, date: e.target.value })}
            />
          </label>
          <label className="d-field">
            <span>{t("giving.note")}</span>
            <input
              value={f.note}
              onChange={(e) => setF({ ...f, note: e.target.value })}
              placeholder={t("giving.notePh")}
            />
          </label>
        </div>
        <div className="d-form-actions">
          <button type="button" className="d-btn" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="d-btn d-btn-ink">
            <Check size={15} /> {t("giving.addExpense")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function GivingPageSetup() {
  const { settings, updateSettings } = useWorkspace();
  const { t } = useT();
  const [payout, setPayout] = useState(settings.payout);
  const [slug, setSlug] = useState(settings.givingSlug);
  const [saved, setSaved] = useState(false);
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  const link = `${publicOrigin()}/give/${settings.givingSlug}`;

  useEffect(() => {
    QRCode.toDataURL(link, {
      margin: 1,
      width: 600,
      color: { dark: "#17112e", light: "#ffffff" },
    })
      .then(setQr)
      .catch(() => {});
  }, [link]);

  const [online, setOnline] = useState(
    ONLINE_GIVING &&
      (settings.payout.online ?? settings.payout.method === "ziondesk"),
  );
  const [manual, setManual] = useState<ManualMethod[]>(() =>
    manualMethods(settings.payout),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const addMethod = (type: MethodType) =>
    setManual([...manual, { id: uid(), type, fields: {} }]);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const errs = validateMethods(manual);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    if (!(await confirmAction({ title: t("cf.payoutTitle"), body: t("cf.payoutBody"), confirmLabel: t("cf.save") }))) return;
    // The first bank-type method also fills the older flat fields (receipts, older pages).
    const firstBank = manual.find(
      (m) => m.fields.accountNumber || m.fields.iban,
    );
    const payoutOut = {
      ...payout,
      online,
      manual,
      method: (online
        ? "ziondesk"
        : manual.length
          ? "bank"
          : "none") as typeof payout.method,
      bankName: firstBank?.fields.bankName ?? "",
      accountName: firstBank?.fields.accountName ?? "",
      accountNumber:
        firstBank?.fields.accountNumber ?? firstBank?.fields.iban ?? "",
      routing:
        firstBank?.fields.routing ??
        firstBank?.fields.sortCode ??
        firstBank?.fields.bic ??
        "",
    };
    updateSettings({
      payout: payoutOut,
      givingSlug:
        slug
          .toLowerCase()
          .replace(/[^a-z0-9-]+/g, "-")
          .replace(/^-|-$/g, "") || settings.givingSlug,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  };

  return (
    <div className="g-setup">
      <form className="d-panel d-form" onSubmit={save}>
        <div className="d-panel-head">
          <h2>
            <Wallet size={17} /> {t("giving.page.how")}
          </h2>
        </div>
        {ONLINE_GIVING && (
          <div className="g-block">
            <label className="d-switch">
              <input
                type="checkbox"
                checked={online}
                onChange={(e) => setOnline(e.target.checked)}
              />
              <span>
                <CreditCard size={16} /> {t("giving.setup.onlineTitle")}
              </span>
            </label>
            <small className="d-notes">{t("giving.setup.onlineText")}</small>
            {online && <PayoutConnect />}
          </div>
        )}

        <div className="g-block">
          <b className="g-block-title">
            <Landmark size={16} /> {t("giving.setup.manualTitle")}
          </b>
          <small className="d-notes">
            {t("giving.setup.manualText", { currency: settings.currency })}
          </small>
          <div className="g-suggest">
            {suggestedMethods(settings.currency)
              .concat(
                (Object.keys(GIVE_METHODS) as MethodType[]).filter(
                  (x) => !suggestedMethods(settings.currency).includes(x),
                ),
              )
              .map((type, i) => (
                <button
                  key={type}
                  type="button"
                  className={`g-add ${i < suggestedMethods(settings.currency).length ? "is-suggested" : ""}`}
                  onClick={() => addMethod(type)}
                >
                  <MethodLogo type={type} size="sm" />{" "}
                  <span>{GIVE_METHODS[type].name}</span> <Plus size={14} />
                </button>
              ))}
          </div>
          {manual.map((m) => (
            <div key={m.id} className="g-mcard">
              <div className="g-mcard-head">
                <MethodLogo type={m.type} />
                <div>
                  <b>{GIVE_METHODS[m.type].name}</b>
                  <small>{GIVE_METHODS[m.type].hint}</small>
                </div>
                <button
                  type="button"
                  className="d-icon-btn"
                  aria-label={t("common.remove")}
                  onClick={() => setManual(manual.filter((x) => x.id !== m.id))}
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <div className="d-grid">
                {GIVE_METHODS[m.type].fields.map((f) => {
                  const err = errors[`${m.id}.${f.key}`];
                  const val = m.fields[f.key] ?? "";
                  const set = (v: string) =>
                    setManual(
                      manual.map((x) =>
                        x.id === m.id
                          ? { ...x, fields: { ...x.fields, [f.key]: v } }
                          : x,
                      ),
                    );
                  return (
                    <label
                      key={f.key}
                      className={`d-field ${err ? "has-error" : ""}`}
                    >
                      <span>
                        {f.label}
                        {f.optional ? ` (${t("common.optional")})` : ""}
                      </span>
                      {f.options ? (
                        <select
                          value={val}
                          onChange={(e) => set(e.target.value)}
                        >
                          <option value="">—</option>
                          {f.options.map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={val}
                          placeholder={
                            f.placeholder ??
                            (f.key === "accountName" || f.key === "name"
                              ? settings.churchName
                              : "")
                          }
                          onChange={(e) =>
                            set(
                              f.key === "iban"
                                ? formatIban(e.target.value)
                                : e.target.value,
                            )
                          }
                        />
                      )}
                      {err && <em>{err}</em>}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
          <label className="d-field">
            <span>{t("giving.setup.instructions")}</span>
            <textarea
              rows={2}
              value={payout.instructions}
              maxLength={400}
              placeholder={t("giving.setup.instructionsPh")}
              onChange={(e) =>
                setPayout({ ...payout, instructions: e.target.value })
              }
            />
          </label>
        </div>
        <label className="d-field">
          <span>{t("giving.page.address")}</span>
          <div className="g-slug">
            <span>ziondesk.com/give/</span>
            <input value={slug} onChange={(e) => setSlug(e.target.value)} />
          </div>
        </label>
        <div className="d-form-actions">
          <button type="submit" className="d-btn d-btn-ink">
            <Check size={15} />{" "}
            {saved ? t("common.saved") : t("giving.page.save")}
          </button>
        </div>
      </form>

      <div className="d-panel g-share">
        <div className="d-panel-head">
          <h2>
            <QrCode size={17} /> {t("giving.page.share")}
          </h2>
        </div>
        <div className="g-qr">
          {qr && (
            <img
              src={qr}
              alt={t("links.qrAlt", { name: settings.churchName })}
            />
          )}
        </div>
        <div className="g-link">
          <span>{link}</span>
          <button
            type="button"
            className="d-circle d-circle-sm"
            aria-label={t("common.copyLink")}
            onClick={() => {
              // Only confirm once the copy succeeded (it can be blocked by the browser).
              void navigator.clipboard?.writeText(link).then(
                () => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                },
                () => {},
              );
            }}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
        </div>
        <a
          className="d-btn"
          href={qr}
          download={`${settings.givingSlug}-giving-qr.png`}
        >
          <Download size={15} /> {t("links.qrPng")}
        </a>
        <Link to="/dashboard/links" className="d-btn">
          <QrCode size={15} /> {t("giving.page.allLinks")}
        </Link>
        <div className="g-phone" aria-label={t("links.bank.preview")}>
          <b>{settings.churchName}</b>
          <small>{t("giving.page.giveOnline")}</small>
          <div className="g-amounts">
            {[10, 25, 50, 100].map((a) => (
              <span key={a}>{money(a, settings.currency)}</span>
            ))}
          </div>
          <div className="g-funds">
            {settings.funds.slice(0, 3).map((f) => (
              <span key={f}>{f}</span>
            ))}
          </div>
          {settings.payout.method === "bank" &&
          settings.payout.accountNumber ? (
            <div className="g-bank">
              <small>{settings.payout.bankName}</small>
              <b>{settings.payout.accountNumber}</b>
              <small>
                {settings.payout.accountName || settings.churchName}
              </small>
            </div>
          ) : (
            <span className="g-give">{t("giving.page.giveNow")}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Giving() {
  const { members, role } = useMembers();
  const { anonGifts, expenses, settings, removeExpense } = useWorkspace();
  const [tabParams] = useSearchParams();
  const [tab, setTab] = useState<"overview" | "gifts" | "expenses" | "page">(
    tabParams.get("tab") === "page" ? "page" : "overview",
  );
  const [recording, setRecording] = useState(false);
  const [addingExpense, setAddingExpense] = useState(false);
  const [q, setQ] = useState("");
  const [fund, setFund] = useState("");
  const [method, setMethod] = useState("");
  const { t } = useT();
  const cur = settings.currency;

  const rows: Row[] = useMemo(
    () =>
      [
        ...members.flatMap((m) =>
          m.giving.map((g) => ({
            id: g.id,
            date: g.date,
            donor: m.fullName,
            fund: g.fund,
            method: g.method,
            amount: g.amount,
          })),
        ),
        ...anonGifts.map((g) => ({
          id: g.id,
          date: g.date,
          donor: g.donor,
          fund: g.fund,
          method: g.method,
          amount: g.amount,
        })),
      ].sort((a, b) => b.date.localeCompare(a.date)),
    [members, anonGifts],
  );

  if (!can.viewGiving(role)) return <NoAccess what={t("giving.what")} />;

  const months = lastMonths(6);
  const thisMonth = months[months.length - 1];
  const byMonth = months.map((k) => ({
    label: monthLabel(k),
    value: rows
      .filter((r) => monthKey(r.date) === k)
      .reduce((s, r) => s + r.amount, 0),
  }));
  const monthRows = rows.filter((r) => monthKey(r.date) === thisMonth);
  const monthTotal = monthRows.reduce((s, r) => s + r.amount, 0);
  const givers = new Set(monthRows.map((r) => r.donor)).size;
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const expTotal = expenses.reduce((s, x) => s + x.amount, 0);
  const funds = settings.funds.map((f) => ({
    f,
    v: rows.filter((r) => r.fund === f).reduce((s, r) => s + r.amount, 0),
  }));
  const fundMax = Math.max(1, ...funds.map((x) => x.v));
  const filtered = rows.filter(
    (r) =>
      (!fund || r.fund === fund) &&
      (!method || r.method === method) &&
      (!q || r.donor.toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <div className="d-page">
      <PageHead title={t("giving.title")}>
        <Kpi
          icon={<HandHeart size={17} />}
          value={money(monthTotal, cur)}
          label={t("giving.received")}
          pill={t("giving.givers", { count: givers })}
          tone="lime"
        />
        <Kpi
          icon={<TrendingUp size={17} />}
          value={money(total - expTotal, cur)}
          label={t("giving.netAll")}
        />
      </PageHead>

      <div className="d-toolrow">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "overview", label: t("giving.tabs.overview") },
            { id: "gifts", label: t("giving.tabs.gifts") },
            { id: "expenses", label: t("giving.tabs.expenses") },
            { id: "page", label: t("giving.tabs.page") },
          ]}
        />
        <div className="d-tool-actions">
          <AskAI label={t("giving.analyze")} k="finance" />
          {tab === "expenses" ? (
            <button
              type="button"
              className="d-btn d-btn-ink"
              onClick={() => setAddingExpense(true)}
            >
              <Plus size={15} /> {t("giving.addExpense")}
            </button>
          ) : (
            <button
              type="button"
              className="d-btn d-btn-ink"
              onClick={() => setRecording(true)}
            >
              <Plus size={15} /> {t("giving.record")}
            </button>
          )}
        </div>
      </div>

      {tab === "overview" && (
        <div className="d-two">
          <section className="d-panel">
            <div className="d-panel-head">
              <h2>{t("giving.last6")}</h2>
            </div>
            <Bars data={byMonth} format={(n) => (n ? money(n, cur) : "")} />
          </section>
          <section className="d-panel">
            <div className="d-panel-head">
              <h2>{t("giving.byFund")}</h2>
            </div>
            <ul className="d-meter-list">
              {funds.map(({ f, v }) => (
                <li key={f}>
                  <span>{f}</span>
                  <b>{money(v, cur)}</b>
                  <i>
                    <em style={{ width: `${(v / fundMax) * 100}%` }} />
                  </i>
                </li>
              ))}
            </ul>
            <div className="d-net">
              <div>
                <small>{t("giving.totalIncome")}</small>
                <b>{money(total, cur)}</b>
              </div>
              <div>
                <small>{t("giving.tabs.expenses")}</small>
                <b>{money(expTotal, cur)}</b>
              </div>
              <div className="is-net">
                <small>{t("ai.fin.net")}</small>
                <b>{money(total - expTotal, cur)}</b>
              </div>
            </div>
          </section>
          <section className="d-panel d-span-2">
            <div className="d-panel-head">
              <h2>{t("giving.recent")}</h2>
              <button
                type="button"
                className="d-link"
                onClick={() => setTab("gifts")}
              >
                {t("common.seeAll")}
              </button>
            </div>
            <ul className="d-list">
              {rows.slice(0, 6).map((r) => (
                <li key={r.id}>
                  <span className="d-kpi-ico">
                    <Banknote size={15} />
                  </span>
                  <div>
                    <b>{r.donor}</b>
                    <small>
                      {fmtDate(r.date)} · {r.fund} · {tEnum("method", r.method)}
                    </small>
                  </div>
                  <b>{money(r.amount, cur)}</b>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      {tab === "gifts" && (
        <section className="d-panel">
          <div className="d-toolbar">
            <label className="d-search">
              <Search size={16} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("giving.searchPh")}
                aria-label={t("giving.searchPh")}
              />
            </label>
            <div className="d-filters">
              <select
                value={fund}
                onChange={(e) => setFund(e.target.value)}
                aria-label={t("giving.fund")}
              >
                <option value="">{t("giving.allFunds")}</option>
                {settings.funds.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                aria-label={t("giving.method")}
              >
                <option value="">{t("giving.allMethods")}</option>
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {tEnum("method", m)}
                  </option>
                ))}
              </select>
            </div>
            <div className="d-tool-actions">
              <button
                type="button"
                className="d-btn"
                onClick={() =>
                  downloadCsv(`ziondesk-gifts-${today()}.csv`, [
                    [
                      t("common.date"),
                      t("giving.giver"),
                      t("giving.fund"),
                      t("giving.method"),
                      t("common.amount"),
                    ],
                    ...filtered.map((r) => [
                      r.date,
                      r.donor,
                      r.fund,
                      r.method,
                      r.amount,
                    ]),
                  ])
                }
              >
                <Download size={15} /> {t("common.exportCsv")}
              </button>
            </div>
          </div>
          <div className="d-table-wrap">
            <table className="d-table is-static">
              <thead>
                <tr>
                  <th>{t("common.date")}</th>
                  <th>{t("giving.giver")}</th>
                  <th>{t("giving.fund")}</th>
                  <th className="d-hide-sm">{t("giving.method")}</th>
                  <th>{t("common.amount")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td>{fmtDate(r.date)}</td>
                    <td>
                      <b>{r.donor}</b>
                    </td>
                    <td>
                      <span className="d-chip t-white">{r.fund}</span>
                    </td>
                    <td className="d-hide-sm">{tEnum("method", r.method)}</td>
                    <td>
                      <b>{money(r.amount, cur)}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length && (
              <div className="d-empty">
                <Users size={26} />
                <b>{t("giving.noMatch")}</b>
              </div>
            )}
          </div>
        </section>
      )}

      {tab === "expenses" && (
        <section className="d-panel">
          <div className="d-table-wrap">
            <table className="d-table is-static">
              <thead>
                <tr>
                  <th>{t("common.date")}</th>
                  <th>{t("giving.category")}</th>
                  <th className="d-hide-sm">{t("giving.note")}</th>
                  <th>{t("common.amount")}</th>
                  <th aria-label={t("common.delete")} />
                </tr>
              </thead>
              <tbody>
                {[...expenses]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((x) => (
                    <tr key={x.id}>
                      <td>{fmtDate(x.date)}</td>
                      <td>
                        <span className="d-chip t-lavender">
                          {tEnum("expense", x.category)}
                        </span>
                      </td>
                      <td className="d-hide-sm">{x.note || "—"}</td>
                      <td>
                        <b>{money(x.amount, cur)}</b>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="d-circle d-circle-sm"
                          aria-label={t("common.delete")}
                          onClick={withConfirm({ title: t("cf.expenseDeleteTitle"), body: t("cf.cantUndo"), danger: true, confirmLabel: t("cf.delete") }, () => removeExpense(x.id))}
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "page" && (
        <PlanGate need="plus" feature={t("giving.feature")}>
          <GivingPageSetup />
        </PlanGate>
      )}

      <AnimatePresence>
        {recording && <RecordGift onClose={() => setRecording(false)} />}
        {addingExpense && (
          <AddExpense onClose={() => setAddingExpense(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}
