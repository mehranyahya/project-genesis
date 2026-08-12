import type { ReactNode } from "react";

import { LocaleLink } from "@/lib/i18n/react";

import type {
  PreferredContact,
  RequestFieldErrors,
  RequestFieldKey,
  RequestFormValues,
  RequestSource,
} from "@/lib/request-form";
import {
  LOCATION_UNKNOWN_VALUE,
  PREFERRED_CONTACT_OPTIONS,
  REQUEST_FIELD_LABELS,
} from "@/lib/request-form";
import { useT } from "@/lib/i18n/react";

export const FIELD_ID_PREFIX = "request";

/**
 * The accessible terms label is the official field label, split once so the
 * `/terms` link sits inside the same sentence without repeating any wording.
 */
export const TERMS_LINK_TEXT = "شرایط ثبت";
export const TERMS_LABEL_TAIL = REQUEST_FIELD_LABELS.termsAccepted.slice(TERMS_LINK_TEXT.length);

export const fieldId = (key: RequestFieldKey) => `${FIELD_ID_PREFIX}-${key}`;
export const errorId = (key: RequestFieldKey) => `${FIELD_ID_PREFIX}-${key}-error`;

const CONTROL =
  "min-h-11 w-full border border-border-control bg-surface px-3 py-2 text-sm text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-45";
const ROW =
  "flex min-h-11 items-start gap-3 border border-border-subtle bg-surface p-3 has-[:checked]:border-2 has-[:checked]:border-action-primary";
const CHOICE =
  "mt-1 h-5 w-5 shrink-0 accent-action-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (message === undefined) return null;
  return (
    <p id={id} role="alert" className="text-sm text-status-error">
      خطا: {message}
    </p>
  );
}

function TextField({
  fieldKey,
  value,
  error,
  disabled,
  multiline,
  onChange,
}: {
  fieldKey: RequestFieldKey;
  value: string;
  error: string | undefined;
  disabled: boolean;
  multiline?: boolean;
  onChange: (next: string) => void;
}) {
  const id = fieldId(fieldKey);
  const errId = errorId(fieldKey);
  const shared = {
    id,
    value,
    disabled,
    className: CONTROL,
    "aria-invalid": error ? true : undefined,
    "aria-errormessage": error ? errId : undefined,
  } as const;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-bold text-text-primary">
        {REQUEST_FIELD_LABELS[fieldKey]}
      </label>
      {multiline ? (
        <textarea {...shared} rows={4} onChange={(event) => onChange(event.currentTarget.value)} />
      ) : (
        <input {...shared} type="text" onChange={(event) => onChange(event.currentTarget.value)} />
      )}
      <FieldError id={errId} message={error} />
    </div>
  );
}

export function RequestFormFields({
  values,
  errors,
  source,
  disabled,
  onChange,
}: {
  values: RequestFormValues;
  errors: RequestFieldErrors;
  source: RequestSource;
  disabled: boolean;
  onChange: (next: Partial<RequestFormValues>) => void;
}): ReactNode {
  const t = useT();
  const graveStone = source.kind === "grave_stone";

  return (
    <div className="flex flex-col gap-5">
      <TextField
        fieldKey="customerName"
        value={values.customerName}
        error={errors.customerName}
        disabled={disabled}
        onChange={(customerName) => onChange({ customerName })}
      />

      <div className="flex flex-col gap-2">
        <label htmlFor={fieldId("phone")} className="text-sm font-bold text-text-primary">
          {REQUEST_FIELD_LABELS.phone}
        </label>
        <input
          id={fieldId("phone")}
          type="tel"
          inputMode="tel"
          dir="ltr"
          className={CONTROL}
          value={values.phone}
          disabled={disabled}
          aria-invalid={errors.phone ? true : undefined}
          aria-errormessage={errors.phone ? errorId("phone") : undefined}
          onChange={(event) => onChange({ phone: event.currentTarget.value })}
        />
        <FieldError id={errorId("phone")} message={errors.phone} />
      </div>

      <TextField
        fieldKey="city"
        value={values.city}
        error={errors.city}
        disabled={disabled}
        onChange={(city) => onChange({ city })}
      />

      <div className="flex flex-col gap-2">
        <TextField
          fieldKey="locationText"
          value={values.locationText}
          error={errors.locationText}
          disabled={disabled || (graveStone && values.locationUnknown)}
          onChange={(locationText) => onChange({ locationText })}
        />
        {graveStone ? (
          <label className={ROW} htmlFor={fieldId("locationUnknown")}>
            <input
              id={fieldId("locationUnknown")}
              type="checkbox"
              className={CHOICE}
              checked={values.locationUnknown}
              disabled={disabled}
              onChange={(event) =>
                onChange(
                  event.currentTarget.checked
                    ? { locationUnknown: true, locationText: "" }
                    : { locationUnknown: false },
                )
              }
            />
            <span className="text-sm text-text-primary">{LOCATION_UNKNOWN_VALUE}</span>
          </label>
        ) : null}
      </div>

      <fieldset className="border border-border-subtle p-4">
        <legend className="px-2 text-sm font-bold text-text-primary">
          {REQUEST_FIELD_LABELS.preferredContact}
        </legend>
        <div className="flex flex-col gap-3 pt-2">
          {PREFERRED_CONTACT_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={ROW}
              htmlFor={`${fieldId("preferredContact")}-${option.value}`}
            >
              <input
                id={`${fieldId("preferredContact")}-${option.value}`}
                type="radio"
                name="request-preferred-contact"
                className={CHOICE}
                value={option.value}
                checked={values.preferredContact === option.value}
                disabled={disabled}
                aria-invalid={errors.preferredContact ? true : undefined}
                aria-errormessage={
                  errors.preferredContact ? errorId("preferredContact") : undefined
                }
                onChange={() =>
                  onChange({ preferredContact: option.value satisfies PreferredContact })
                }
              />
              <span className="text-sm text-text-primary">{option.label}</span>
            </label>
          ))}
        </div>
        <FieldError id={errorId("preferredContact")} message={errors.preferredContact} />
      </fieldset>

      <TextField
        fieldKey="preferredContactTime"
        value={values.preferredContactTime}
        error={errors.preferredContactTime}
        disabled={disabled}
        onChange={(preferredContactTime) => onChange({ preferredContactTime })}
      />

      <TextField
        fieldKey="customerNote"
        value={values.customerNote}
        error={errors.customerNote}
        disabled={disabled}
        multiline
        onChange={(customerNote) => onChange({ customerNote })}
      />

      <div className="flex flex-col gap-2">
        <label className={ROW} htmlFor={fieldId("termsAccepted")}>
          <input
            id={fieldId("termsAccepted")}
            type="checkbox"
            className={CHOICE}
            checked={values.termsAccepted}
            disabled={disabled}
            aria-invalid={errors.termsAccepted ? true : undefined}
            aria-errormessage={errors.termsAccepted ? errorId("termsAccepted") : undefined}
            onChange={(event) => onChange({ termsAccepted: event.currentTarget.checked })}
          />
          <span className="text-sm text-text-primary">
            <LocaleLink
              to="/terms"
              className="underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {t(TERMS_LINK_TEXT)}
            </LocaleLink>
            {TERMS_LABEL_TAIL}
          </span>
        </label>
        <FieldError id={errorId("termsAccepted")} message={errors.termsAccepted} />
      </div>
    </div>
  );
}
