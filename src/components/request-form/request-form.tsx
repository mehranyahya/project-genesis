import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { RequestFormFields, fieldId } from "./request-form-fields";
import { RequestFormState } from "./request-form-state";
import { RequestSuccess } from "./request-success";
import { TurnstileField } from "./turnstile-field";
import type { TurnstileFieldHandle } from "./turnstile-field";
import type { BuildingStoneValues } from "@/lib/building-stone";
import { buildingStoneFieldId } from "@/lib/building-stone";
import type { Site } from "@/lib/content/types";
import type {
  BuildingStoneExtensionContract,
  PriceRevision,
  RequestFieldErrors,
  RequestFieldKey,
  RequestFormValues,
  RequestSource,
  RequestTermsDocument,
} from "@/lib/request-form";
import {
  EMPTY_REQUEST_FORM_VALUES,
  REQUEST_FIELD_ORDER,
  SUBMISSION_BLOCKED_TEXT,
  buildRequestPayload,
  isRequestTermsDocument,
  requestSourceSelectionIdentity,
  validateRequestForm,
} from "@/lib/request-form";
import { submitRequestWithTurnstile as submitRequest } from "@/lib/request-submit-turnstile";
import type { RequestSubmitTransport, SubmitOutcome } from "@/lib/request-submit";
import { SUBMIT_MESSAGES, createSubmissionId, rememberTrackingCode } from "@/lib/request-submit";

export const SUBMIT_LABEL = "ثبت درخواست بررسی";

const ACTION =
  "inline-flex min-h-11 items-center justify-center border border-action-primary bg-action-primary px-5 py-2 text-sm font-bold text-text-inverse transition-colors duration-[180ms] enabled:hover:border-surface-inverse enabled:hover:bg-surface-inverse disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none";

type Phase = "editing" | "submitting" | "success";

const PII_FREE_VALUES = EMPTY_REQUEST_FORM_VALUES;

export interface RequestFormExtensionSlotState {
  readonly errors: Readonly<Record<string, string>>;
  readonly disabled: boolean;
}

export interface BuildingStoneFormBinding {
  readonly kind: "building_stone";
  readonly contract: BuildingStoneExtensionContract;
  readonly values: BuildingStoneValues;
  readonly fieldId?: (key: string) => string;
  readonly renderExtensionFields: (state: RequestFormExtensionSlotState) => ReactNode;
}

export function sourceIdentity(source: RequestSource): string {
  if (source.kind === "grave_stone") {
    const draft = source.draft;
    const snapshot = draft.displaySnapshot;
    return [
      "grave_stone",
      draft.catalogVersion,
      draft.productId,
      draft.productCode,
      draft.variantId,
      draft.stoneCode,
      draft.sizeCode,
      draft.optionIds.join("|"),
      snapshot.priceType,
      String(snapshot.amountToman),
    ].join("~");
  }
  if (source.kind === "building_stone") {
    return requestSourceSelectionIdentity(source) ?? "building_stone~unbound";
  }
  return `contact~${source.portfolioReferenceId ?? ""}`;
}

export interface GenerationTracker {
  readonly current: () => number;
  readonly observe: (identity: string) => number;
}

export function createGenerationTracker(initialIdentity: string): GenerationTracker {
  let identity = initialIdentity;
  let generation = 0;
  return {
    current: () => generation,
    observe: (next: string) => {
      if (next !== identity) {
        identity = next;
        generation += 1;
      }
      return generation;
    },
  };
}

export function isStaleAttempt(attemptGeneration: number, currentGeneration: number): boolean {
  return attemptGeneration !== currentGeneration;
}

function firstMappedFieldError(errors: RequestFieldErrors): RequestFieldKey | null {
  return REQUEST_FIELD_ORDER.find((key) => errors[key] !== undefined) ?? null;
}

export interface FocusableValidation {
  readonly firstInvalidExtensionField: string | null;
  readonly firstInvalidField: RequestFieldKey | null;
}

export function resolvePendingFocusId(
  validation: FocusableValidation,
  extensionFieldId: (key: string) => string,
): string | null {
  const extensionKey = validation.firstInvalidExtensionField;
  if (extensionKey !== null) return extensionFieldId(extensionKey);
  const key = validation.firstInvalidField;
  return key === null ? null : fieldId(key);
}

export function serverFocusDomId(errors: RequestFieldErrors): string | null {
  const key = firstMappedFieldError(errors);
  return key === null ? null : fieldId(key);
}

export function RequestForm({
  source,
  site,
  termsDocument,
  submitRequest: transport,
  extension,
  onSuccess,
}: {
  source: RequestSource;
  site: Site | null;
  termsDocument: RequestTermsDocument | null;
  submitRequest?: RequestSubmitTransport;
  extension?: BuildingStoneFormBinding | null;
  onSuccess?: (trackingCode: string) => void;
}) {
  const [values, setValues] = useState<RequestFormValues>(PII_FREE_VALUES);
  const [errors, setErrors] = useState<RequestFieldErrors>({});
  const [extensionErrors, setExtensionErrors] = useState<Readonly<Record<string, string>>>({});
  const [phase, setPhase] = useState<Phase>("editing");
  const [outcome, setOutcome] = useState<SubmitOutcome | null>(null);
  const [trackingCode, setTrackingCode] = useState<string | null>(null);
  const [terms, setTerms] = useState<RequestTermsDocument | null>(termsDocument);
  const [priceRevision, setPriceRevision] = useState<PriceRevision | null>(null);
  const [selectionBlockedByCatalog, setSelectionBlocked] = useState(false);
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  const [freshAttemptRequired, setFreshAttemptRequired] = useState(false);

  const submissionId = useRef<string | null>(null);
  const inFlight = useRef(false);
  const turnstileRef = useRef<TurnstileFieldHandle | null>(null);

  const binding =
    extension != null && extension.kind === source.kind && extension.contract?.kind === source.kind
      ? extension
      : null;
  const contract = binding === null ? null : binding.contract;
  const extensionFieldId = binding?.fieldId ?? ((key: string) => buildingStoneFieldId(key));

  const identity = sourceIdentity(source);
  const attemptIdentity = useRef(identity);
  attemptIdentity.current = identity;

  const generationTracker = useRef<GenerationTracker | null>(null);
  generationTracker.current ??= createGenerationTracker(identity);
  const generation = generationTracker.current.observe(identity);

  useEffect(() => {
    submissionId.current = null;
    inFlight.current = false;
    setOutcome(null);
    setSelectionBlocked(false);
    setPriceRevision(null);
    setErrors({});
    setExtensionErrors({});
    setTrackingCode(null);
    setPendingFocusId(null);
    setFreshAttemptRequired(false);
    setPhase("editing");
  }, [identity]);

  useEffect(() => {
    setTerms(termsDocument);
  }, [termsDocument]);

  useEffect(() => {
    if (pendingFocusId === null || typeof document === "undefined") return;
    const element = document.getElementById(pendingFocusId);
    if (element instanceof HTMLElement) element.focus();
    setPendingFocusId(null);
  }, [pendingFocusId]);

  const termsReady = isRequestTermsDocument(terms);
  const selectionBlocked = selectionBlockedByCatalog;

  const resetTurnstile = useCallback(() => {
    turnstileRef.current?.reset();
  }, []);

  const run = useCallback(
    async (revision: PriceRevision | null, options?: { readonly allowFreshAttempt?: boolean }) => {
      const allowFreshAttempt = options?.allowFreshAttempt === true;
      if (inFlight.current) return;
      if (!termsReady || selectionBlocked) return;
      if (freshAttemptRequired && !allowFreshAttempt) return;

      const validation = validateRequestForm({ values, source, extension: contract });
      setErrors(validation.errors);
      setExtensionErrors(validation.extensionErrors);
      if (!validation.valid) {
        setPendingFocusId(resolvePendingFocusId(validation, extensionFieldId));
        return;
      }

      if (submissionId.current === null) submissionId.current = createSubmissionId();

      const payload = buildRequestPayload({
        submissionId: submissionId.current,
        source,
        values,
        termsDocument: terms,
        priceRevision: revision,
        extension: contract,
      });
      if (payload === null) return;

      const attempt = attemptIdentity.current;
      const attemptGeneration = generationTracker.current?.current() ?? generation;

      inFlight.current = true;
      setPhase("submitting");
      setOutcome(null);

      const turnstileProof = (await turnstileRef.current?.execute()) ?? null;
      if (
        attempt !== attemptIdentity.current ||
        isStaleAttempt(attemptGeneration, generationTracker.current?.current() ?? generation)
      ) {
        inFlight.current = false;
        resetTurnstile();
        return;
      }

      const { turnstileToken } = { turnstileToken: turnstileProof };
      const result = await submitRequest(
        transport ? { payload, turnstileToken, transport } : { payload, turnstileToken },
      );
      resetTurnstile();

      if (attempt !== attemptIdentity.current) return;
      if (isStaleAttempt(attemptGeneration, generationTracker.current?.current() ?? generation)) {
        return;
      }

      inFlight.current = false;
      setOutcome(result);

      switch (result.kind) {
        case "success":
          rememberTrackingCode(result.trackingCode);
          setTrackingCode(result.trackingCode);
          setValues(PII_FREE_VALUES);
          setErrors({});
          submissionId.current = null;
          setPhase("success");
          onSuccess?.(result.trackingCode);
          return;
        case "price_changed":
          setPriceRevision(result.price);
          break;
        case "terms_updated":
          setTerms(result.termsDocument);
          setValues((current) => ({ ...current, termsAccepted: false }));
          break;
        case "selection_unavailable":
          setSelectionBlocked(true);
          break;
        case "idempotency_conflict":
        case "idempotency_expired":
          setFreshAttemptRequired(true);
          break;
        case "validation_error":
          setErrors(result.fieldErrors);
          setPendingFocusId(serverFocusDomId(result.fieldErrors));
          break;
        default:
          break;
      }
      setPhase("editing");
    },
    [
      contract,
      freshAttemptRequired,
      generation,
      onSuccess,
      resetTurnstile,
      selectionBlocked,
      source,
      terms,
      termsReady,
      transport,
      values,
    ],
  );

  if (phase === "success" && trackingCode !== null) {
    return <RequestSuccess trackingCode={trackingCode} site={site} />;
  }

  const submitting = phase === "submitting";

  return (
    <form
      noValidate
      aria-busy={submitting ? true : undefined}
      className="grid grid-cols-4 gap-x-4 gap-y-5 md:grid-cols-8 lg:grid-cols-12"
      onSubmit={(event) => {
        event.preventDefault();
        void run(priceRevision);
      }}
    >
      <div className="col-span-4 flex flex-col gap-5 md:col-span-8 lg:col-span-8">
        {binding === null
          ? null
          : binding.renderExtensionFields({ errors: extensionErrors, disabled: submitting })}

        <RequestFormFields
          values={values}
          errors={errors}
          source={source}
          disabled={submitting}
          onChange={(next) => setValues((current) => ({ ...current, ...next }))}
        />
      </div>

      <div className="col-span-4 flex flex-col gap-4 md:col-span-8 lg:col-span-4">
        {termsReady ? <TurnstileField ref={turnstileRef} /> : null}

        <button
          type="submit"
          className={ACTION}
          disabled={!termsReady || submitting || selectionBlocked}
        >
          {submitting ? SUBMIT_MESSAGES.submitting : SUBMIT_LABEL}
        </button>

        {!termsReady ? (
          <p className="text-sm text-text-secondary">{SUBMISSION_BLOCKED_TEXT}</p>
        ) : null}

        <RequestFormState
          outcome={submitting ? null : outcome}
          onRetry={() => void run(priceRevision)}
          onConfirmPrice={() => void run(priceRevision)}
          onNewAttempt={() => {
            if (inFlight.current) return;
            submissionId.current = null;
            setOutcome(null);
            setFreshAttemptRequired(false);
            void run(priceRevision, { allowFreshAttempt: true });
          }}
        />
      </div>
    </form>
  );
}
