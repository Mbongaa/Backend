import { useEffect, useMemo, useState } from "react";
import { brand, kiosks as demoKiosks, ingredients as demoIngredients, kpis as demoKpis } from "../data";

const formatIQD = (value, lang) => {
  const num = Math.round(value || 0);
  const formatted = num.toLocaleString(lang === "ar" ? "ar-IQ" : "en-IQ");
  return `IQD ${formatted}`;
};

const formatNumber = (value, lang) => {
  const num = Math.round(value || 0);
  return num.toLocaleString(lang === "ar" ? "ar-IQ" : "en-IQ");
};

const formatPct = (value) => `${(value || 0).toFixed(1)}%`;

const localText = (value, lang) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") return value[lang] || value.en || "";
  return String(value);
};

const STORAGE_LANG = "bayaan.mobile.lang.v1";
const STORAGE_THEME = "bayaan.mobile.theme.v1";

function useLang() {
  const initial = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_LANG) || "en" : "en";
  const [lang, setLang] = useState(initial === "ar" ? "ar" : "en");
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_LANG, lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);
  return [lang, setLang];
}

function useTheme() {
  const initial = typeof window !== "undefined"
    ? window.localStorage.getItem(STORAGE_THEME) || (window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light")
    : "light";
  const [theme, setTheme] = useState(initial === "dark" ? "dark" : "light");
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_THEME, theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  return [theme, setTheme];
}

const TEXT = {
  brand_subline: { en: "Mobile owner view", ar: "عرض المالك على الجوال" },
  signed_in_as: { en: "Signed-in role", ar: "الدور الحالي" },
  spectator: { en: "Spectator (read-only)", ar: "مراقب (قراءة فقط)" },
  manager: { en: "Manager", ar: "مدير" },
  loading_label: { en: "Syncing chain data…", ar: "جارٍ مزامنة بيانات السلسلة…" },
  demo_label: { en: "Showing demo data — connect a live backend to pull real chain status.", ar: "عرض بيانات تجريبية — اربط بنظام مباشر لجلب حالة السلسلة الفعلية." },
  kpi_revenue: { en: "Sales today", ar: "مبيعات اليوم" },
  kpi_profit: { en: "Net profit", ar: "صافي الربح" },
  kpi_orders: { en: "Orders", ar: "الطلبات" },
  kpi_cash: { en: "Cash on hand", ar: "النقد المتاح" },
  delta_vs_yesterday: { en: "vs yesterday", ar: "مقارنة بالأمس" },
  branch_ranking: { en: "Best → worst today", ar: "الأفضل → الأسوأ اليوم" },
  watchlist_title: { en: "Watch closely", ar: "تحت المراقبة" },
  watchlist_empty: { en: "All branches are performing within thresholds.", ar: "جميع الفروع ضمن العتبات المقبولة." },
  low_stock_title: { en: "Low / critical stock", ar: "المخزون منخفض / حرج" },
  low_stock_empty: { en: "No low-stock alerts.", ar: "لا توجد تنبيهات مخزون منخفض." },
  ranking_header_name: { en: "Branch", ar: "الفرع" },
  ranking_header_revenue: { en: "Sales", ar: "المبيعات" },
  ranking_header_orders: { en: "Orders", ar: "طلبات" },
  ranking_header_status: { en: "Status", ar: "الحالة" },
  status_good: { en: "Good", ar: "جيد" },
  status_watch: { en: "Watch", ar: "مراقبة" },
  status_critical: { en: "Critical", ar: "حرج" },
  threshold_label: { en: "Reorder at", ar: "إعادة الطلب عند" },
  footer_note: { en: "Mobile view is read-only by policy. Open the desktop dashboard for POS, transfers, and approvals.", ar: "العرض على الجوال للقراءة فقط بحسب السياسة. افتح لوحة التحكم على سطح المكتب لإجراء البيع والتحويل والاعتمادات." },
};

const STATUS_COLORS = {
  good: "var(--ok)",
  watch: "var(--warn)",
  critical: "var(--crit)",
};

export default function MobileDashboard() {
  const [lang, setLang] = useLang();
  const [theme, setTheme] = useTheme();
  const t = (key) => localText(TEXT[key], lang);

  const sortedKiosks = useMemo(
    () => [...demoKiosks].sort((a, b) => (b.revenue || 0) - (a.revenue || 0)),
    [],
  );
  const watchlist = useMemo(
    () => sortedKiosks.filter((k) => k.status === "watch" || k.status === "critical"),
    [sortedKiosks],
  );
  const lowStock = useMemo(
    () => demoIngredients.filter((row) => (row.opening || 0) <= (row.reorderAt || 0) * 1.2),
    [],
  );

  return (
    <div className="mobile-dashboard" data-testid="mobile-dashboard">
      <header className="mobile-dashboard__hero">
        <div className="mobile-dashboard__brand">
          <strong>{lang === "ar" ? brand.arName : brand.name}</strong>
          <small>{t("brand_subline")}</small>
        </div>
        <div className="mobile-dashboard__toggles">
          <button
            type="button"
            className="mobile-pill"
            aria-pressed={lang === "ar"}
            onClick={() => setLang(lang === "ar" ? "en" : "ar")}
          >
            {lang === "ar" ? "EN" : "AR"}
          </button>
          <button
            type="button"
            className="mobile-pill"
            aria-pressed={theme === "dark"}
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>
      </header>

      <section className="mobile-dashboard__role">
        <span className="mobile-dashboard__role-label">{t("signed_in_as")}</span>
        <span className="mobile-dashboard__role-value">{t("spectator")}</span>
      </section>

      <p className="mobile-dashboard__demo-note">{t("demo_label")}</p>

      <section className="mobile-dashboard__kpis" aria-label={t("kpi_revenue")}>
        <article className="mobile-kpi">
          <span className="mobile-kpi__label">{t("kpi_revenue")}</span>
          <strong className="mobile-kpi__value">{formatIQD(demoKpis.revenueToday, lang)}</strong>
          <span className="mobile-kpi__delta mobile-kpi__delta--pos">+{formatPct(demoKpis.revenueDelta)}</span>
        </article>
        <article className="mobile-kpi">
          <span className="mobile-kpi__label">{t("kpi_profit")}</span>
          <strong className="mobile-kpi__value">{formatIQD(demoKpis.profitToday, lang)}</strong>
          <span className="mobile-kpi__delta">{formatPct(demoKpis.profitMargin)} margin</span>
        </article>
        <article className="mobile-kpi">
          <span className="mobile-kpi__label">{t("kpi_orders")}</span>
          <strong className="mobile-kpi__value">{formatNumber(demoKpis.ordersToday, lang)}</strong>
          <span className="mobile-kpi__delta">avg {formatIQD(demoKpis.avgTicket, lang)}</span>
        </article>
        <article className="mobile-kpi">
          <span className="mobile-kpi__label">{t("kpi_cash")}</span>
          <strong className="mobile-kpi__value">{formatIQD(demoKpis.cashOnHand, lang)}</strong>
          <span className="mobile-kpi__delta">stock {formatIQD(demoKpis.stockValue, lang)}</span>
        </article>
      </section>

      <section className="mobile-dashboard__section">
        <header className="mobile-dashboard__section-head">
          <h2>{t("branch_ranking")}</h2>
          <span>{sortedKiosks.length}</span>
        </header>
        <ol className="mobile-ranking">
          {sortedKiosks.map((k, i) => (
            <li key={k.id} className={`mobile-ranking__row mobile-ranking__row--${k.status}`}>
              <span className="mobile-ranking__rank">{i + 1}</span>
              <div className="mobile-ranking__body">
                <strong>{localText(k.name, lang)}</strong>
                <small>{localText(k.area, lang)}</small>
              </div>
              <div className="mobile-ranking__metrics">
                <strong>{formatIQD(k.revenue, lang)}</strong>
                <small>
                  {formatNumber(k.orders, lang)} {t("ranking_header_orders").toLowerCase()} · {formatPct(k.margin)}
                </small>
              </div>
              <span
                className="mobile-ranking__status"
                style={{ background: STATUS_COLORS[k.status] || "var(--line)" }}
                title={t(`status_${k.status}`)}
              >
                {t(`status_${k.status}`)}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mobile-dashboard__section">
        <header className="mobile-dashboard__section-head">
          <h2>{t("watchlist_title")}</h2>
          <span>{watchlist.length}</span>
        </header>
        {watchlist.length === 0 ? (
          <p className="mobile-dashboard__empty">{t("watchlist_empty")}</p>
        ) : (
          <ul className="mobile-watchlist">
            {watchlist.map((k) => (
              <li key={k.id} className={`mobile-watchlist__row mobile-watchlist__row--${k.status}`}>
                <strong>{localText(k.name, lang)}</strong>
                <span>
                  {t(`status_${k.status}`)} · {formatPct(k.waste)} waste
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mobile-dashboard__section">
        <header className="mobile-dashboard__section-head">
          <h2>{t("low_stock_title")}</h2>
          <span>{lowStock.length}</span>
        </header>
        {lowStock.length === 0 ? (
          <p className="mobile-dashboard__empty">{t("low_stock_empty")}</p>
        ) : (
          <ul className="mobile-lowstock">
            {lowStock.map((row) => (
              <li key={row.id} className="mobile-lowstock__row">
                <strong>{localText(row.name, lang)}</strong>
                <span>
                  {formatNumber(row.opening, lang)} {row.unit} · {t("threshold_label")} {formatNumber(row.reorderAt, lang)} {row.unit}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="mobile-dashboard__footer">{t("footer_note")}</footer>
    </div>
  );
}
