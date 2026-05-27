import { useMemo, useState } from "react";
import {
  buildVariantSignature,
  computePriceDelta,
  computeRecipeFactor,
  defaultSelection,
  selectionIsComplete,
  summarizeSelection,
} from "../domain/modifiers";

const formatIQD = (value, lang) => {
  const sign = value < 0 ? "-" : "+";
  const abs = Math.abs(value).toLocaleString(lang === "ar" ? "ar-IQ" : "en-IQ");
  return value === 0 ? "" : `${sign}${abs}`;
};

const TEXT = {
  customize: { en: "Customize order", ar: "تخصيص الطلب" },
  required: { en: "Required", ar: "إجباري" },
  cancel: { en: "Cancel", ar: "إلغاء" },
  add_to_order: { en: "Add to order", ar: "إضافة للطلب" },
  base_price: { en: "Base", ar: "الأساس" },
  total: { en: "Line total", ar: "إجمالي السطر" },
};

const t = (key, lang) => TEXT[key]?.[lang] || TEXT[key]?.en || key;

export default function ProductModifierSheet({ item, groups, lang = "en", onCancel, onConfirm }) {
  const [selection, setSelection] = useState(() => defaultSelection(groups));
  const isComplete = selectionIsComplete(groups, selection);
  const priceDelta = useMemo(() => computePriceDelta(groups, selection), [groups, selection]);
  const recipeFactor = useMemo(() => computeRecipeFactor(groups, selection), [groups, selection]);
  const lineTotal = (item?.price || 0) + priceDelta;
  const summary = useMemo(() => summarizeSelection(groups, selection, lang), [groups, selection, lang]);

  const toggle = (groupId, valueId, selectionType) => {
    setSelection((prev) => {
      const current = prev[groupId] || [];
      if (selectionType === "single") {
        return { ...prev, [groupId]: [valueId] };
      }
      return {
        ...prev,
        [groupId]: current.includes(valueId)
          ? current.filter((v) => v !== valueId)
          : [...current, valueId],
      };
    });
  };

  const handleConfirm = () => {
    if (!isComplete) return;
    onConfirm?.({
      selection,
      signature: buildVariantSignature(selection),
      priceDelta,
      recipeFactor,
      summary,
      lineTotal,
    });
  };

  const productName = typeof item?.name === "object" ? (item.name[lang] || item.name.en) : item?.name || "";

  return (
    <div
      className="modifier-sheet__overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modifier-sheet-title"
      data-testid="product-modifier-sheet"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel?.();
      }}
    >
      <div className="modifier-sheet">
        <header className="modifier-sheet__head">
          <div>
            <span className="modifier-sheet__eyebrow">{t("customize", lang)}</span>
            <h2 id="modifier-sheet-title">{productName}</h2>
          </div>
          <button type="button" className="modifier-sheet__close" onClick={onCancel} aria-label={t("cancel", lang)}>×</button>
        </header>
        <div className="modifier-sheet__body">
          {groups.map((group) => (
            <section key={group.id} className="modifier-sheet__group">
              <div className="modifier-sheet__group-head">
                <strong>{group.name[lang] || group.name.en}</strong>
                {group.required ? <span className="modifier-sheet__required">{t("required", lang)}</span> : null}
              </div>
              <div className={`modifier-sheet__options modifier-sheet__options--${group.selection}`}>
                {group.values.map((value) => {
                  const isSelected = (selection[group.id] || []).includes(value.id);
                  return (
                    <button
                      key={value.id}
                      type="button"
                      className={`modifier-chip ${isSelected ? "modifier-chip--on" : ""}`}
                      aria-pressed={isSelected}
                      data-testid={`mod-${group.id}-${value.id}`}
                      onClick={() => toggle(group.id, value.id, group.selection)}
                    >
                      <span className="modifier-chip__label">{value.name[lang] || value.name.en}</span>
                      {typeof value.priceDelta === "number" && value.priceDelta !== 0 ? (
                        <span className="modifier-chip__price">{formatIQD(value.priceDelta, lang)}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
        <footer className="modifier-sheet__foot">
          <div className="modifier-sheet__summary">
            <span>{summary || `${t("base_price", lang)}: IQD ${(item?.price || 0).toLocaleString(lang === "ar" ? "ar-IQ" : "en-IQ")}`}</span>
            <strong data-testid="modifier-line-total">
              {t("total", lang)} IQD {lineTotal.toLocaleString(lang === "ar" ? "ar-IQ" : "en-IQ")}
            </strong>
          </div>
          <div className="modifier-sheet__actions">
            <button type="button" className="btn btn-quiet" onClick={onCancel}>{t("cancel", lang)}</button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleConfirm}
              disabled={!isComplete}
              data-testid="modifier-add-to-order"
            >
              {t("add_to_order", lang)}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
