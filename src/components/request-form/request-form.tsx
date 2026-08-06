import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { RequestFormFields, fieldId } from "./request-form-fields";
import { RequestFormState } from "./request-form-state";
import { RequestSuccess } from "./request-success";
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
import type { RequestSubmitTransport, SubmitOutcome } from "@/lib/request-submit";
import {
  SUBMIT_MESSAGES,
  createSubmissionId,
  rememberTrackingCode,
  submitRequest,
} from "@/lib/request-submit";

export const SUBMIT_LABEL = "ثبت درخواست بررسی";

const ACTION =
  "inline-flex min-h-11 items-center justify-center border border-action-primary bg-action-primary px-5 py-2 text-sm font-bold text-text-inverse transition-colors duration-[180ms] enabled:hover:border-surface-inverse enabled:hover:bg-surface-inverse disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none";

type Phase = "editing" | "submitting" | "success";

const PII_FREE_VALUES = EMPTY_REQUEST_FORM_VALUES;

/** The type-safe slot an active extension renders into the shared form. */
export interface RequestFormExtensionSlotState {
  readonly errors: Readonly<Record<string, string>>;
  readonly disabled: boolean;
}

/**
 * The component-level binding of the building-stone extension: the pure
 * contract, the current values and the renderer, in one type-safe object. The
 * renderer alone is never enough to integrate an extension.
 */
export interface BuildingStoneFormBinding {
  readonly kind: "building_stone";
  readonly contract: BuildingStoneExtensionContract;
  readonly values: BuildingStoneValues;
  readonly fieldId?: (key: string) => string;
  readonly renderExtensionFields: (state: RequestFormExtensionSlotState) => ReactNode;
}

/**
 * A stable identity for the current selection. A new object with identical
 * content is not a selection change, so a re-render never clears a blocked
 * selection or a pending price revision. The extended part of the identity is
 * produced by the extension contract, never recomputed here.
 */
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


/**
 * A monotonic attempt epoch. A semantic source change always produces a new
 * generation, so an A -> B -> A cycle never reuses the generation of the first
 * A attempt and a late response of that attempt stays detectable as stale.
 */
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

/** A response is stale as soon as its recorded generation is not the current one. */
export function isStaleAttempt(attemptGeneration: number, currentGeneration: number): boolean {
  return attemptGeneration !== currentGeneration;
}

/** The first errored field in the official contract order, never insertion order. */
function firstMappedFieldError(errors: RequestFieldErrors): RequestFieldKey | null {
  return REQUEST_FIELD_ORDER.find((key) => errors[key] !== undefined) ?? null;
}

/** The type-safe slot an active extension renders into the shared form. */
export interface RequestFormExtensionSlotState {
  readonly errors: Readonly<Record<string, string>>;
  readonly disabled: boolean;
}

export function RequestForm({
  source,
  site,
  termsDocument,
  submitRequest: transport,
  renderExtensionFields,
  onSuccess,
}: {
  source: RequestSource;
  site: Site | null;
  termsDocument: RequestTermsDocument | null;
  submitRequest?: RequestSubmitTransport;
  renderExtensionFields?: (state: RequestFormExtensionSlotState) => ReactNode;
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
  const [selectionBlocked, setSelectionBlocked] = useState(false);
  const [pendingFocus, setPendingFocus] = useState<RequestFieldKey | null>(null);
  const [freshAttemptRequired, setFreshAttemptRequired] = useState(false);

  const submissionId = useRef<string | null>(null);
  const inFlight = useRef(false);

  const identity = sourceIdentity(source);
  // The attempt token of the running request; a response from an older
  // identity is discarded before any result state is applied.
  const attemptIdentity = useRef(identity);
  attemptIdentity.current = identity;

  // The monotonic epoch: it separates A -> B -> A, which the identity string
  // alone cannot, and it is updated during render so a source change is
  // detectable immediately instead of only after the effect has run.
  const generationTracker = useRef<GenerationTracker | null>(null);
  generationTracker.current ??= createGenerationTracker(identity);
  const generation = generationTracker.current.observe(identity);

  // Only a real semantic selection change resets the source-coupled state.
  useEffect(() => {
    submissionId.current = null;
    inFlight.current = false;
    setOutcome(null);
    setSelectionBlocked(false);
    setPriceRevision(null);
    setErrors({});
    setExtensionErrors({});
    setTrackingCode(null);
    setPendingFocus(null);
    setFreshAttemptRequired(false);

    setPhase("editing");
  }, [identity]);

  useEffect(() => {
    setTerms(termsDocument);
  }, [termsDocument]);

  // Focus runs after React has committed the error state.
  useEffect(() => {
    if (pendingFocus === null || typeof document === "undefined") return;
    const element = document.getElementById(fieldId(pendingFocus));
    if (element instanceof HTMLElement) element.focus();
    setPendingFocus(null);
  }, [pendingFocus]);

  const termsReady = isRequestTermsDocument(terms);

  const focusById = (id: string) => {
    if (typeof document === "undefined") return;
    const element = document.getElementById(id);
    if (element instanceof HTMLElement) element.focus();
  };

  // The extension fields sit before the contact fields, so their first error is
  // focused before any general field error.
  const focusFirstInvalid = (validation: ReturnType<typeof validateRequestForm>) => {
    const extensionKey = validation.firstInvalidExtensionField;
    if (extensionKey !== null) {
      focusById(buildingStoneFieldId(extensionKey));
      return;
    }
    const key = validation.firstInvalidField;
    if (key === null) return;
    focusById(fieldId(key));
  };

  const run = useCallback(
    async (revision: PriceRevision | null, options?: { readonly allowFreshAttempt?: boolean }) => {
      const allowFreshAttempt = options?.allowFreshAttempt === true;
      if (inFlight.current) return;
      if (!termsReady || selectionBlocked) return;
      // After an idempotency outcome only the dedicated action may submit again;
      // the main submit button and the Enter key stay inert.
      if (freshAttemptRequired && !allowFreshAttempt) return;

      const validation = validateRequestForm({ values, source });
      setErrors(validation.errors);
      setExtensionErrors(validation.extensionErrors);
      if (!validation.valid) {
        focusFirstInvalid(validation);
        return;
      }

      if (submissionId.current === null) submissionId.current = createSubmissionId();

      const payload = buildRequestPayload({
        submissionId: submissionId.current,
        source,
        values,
        termsDocument: terms,
        priceRevision: revision,
      });
      if (payload === null) return;

      const attempt = attemptIdentity.current;
      const attemptGeneration = generationTracker.current?.current() ?? generation;

      inFlight.current = true;
      setPhase("submitting");
      setOutcome(null);

      const result = await submitRequest(transport ? { payload, transport } : { payload });

      // A stale response from an obsolete source attempt is ignored completely.
      if (attempt !== attemptIdentity.current) return;
      // An A -> B -> A cycle restores the identity string but never the epoch.
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
          // No automatic retry and no eager id reset: only the dedicated action
          // releases the block and generates a fresh submission id.
          setFreshAttemptRequired(true);
          break;
        case "validation_error":
          setErrors(result.fieldErrors);
          setPendingFocus(firstMappedFieldError(result.fieldErrors));
          break;
        default:
          break;
      }
      setPhase("editing");
    },
    [
      freshAttemptRequired,
      generation,
      onSuccess,
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
        {renderExtensionFields
          ? renderExtensionFields({ errors: extensionErrors, disabled: submitting })
          : null}

        <RequestFormFields
          values={values}
          errors={errors}
          source={source}
          disabled={submitting}
          onChange={(next) => setValues((current) => ({ ...current, ...next }))}
        />
      </div>

      <div className="col-span-4 flex flex-col gap-4 md:col-span-8 lg:col-span-4">
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
            // A second click while the fresh attempt is running must not touch
            // the submission id, the outcome or the fresh-attempt block.
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
