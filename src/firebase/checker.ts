import { getGenerativeModel, InferenceMode, type GenerativeModel } from 'firebase/ai';
import { firebase, loadSettings, type AppSettings } from './app';
import { CHECK_RESULT_SCHEMA, checkPrompt, explainPrompt, LANGUAGES, NAMES_SCHEMA, namesPrompt, type LanguageCode } from '../core/prompts';
import { redact, type RedactionResult } from '../core/redact';
import { route, type DeviceAvailability, type RouteDecision } from '../core/router';
import { parseCheckResult } from '../core/parse';
import type { CheckOutcome, Source } from '../core/types';

const TEXT_EN = [{ type: 'text' as const, languages: ['en'] }];

interface LanguageModelGlobal {
  availability(options?: unknown): Promise<'available' | 'downloadable' | 'downloading' | 'unavailable'>;
}
const languageModel = (): LanguageModelGlobal | undefined =>
  (globalThis as unknown as { LanguageModel?: LanguageModelGlobal }).LanguageModel;

export async function deviceAvailability(): Promise<DeviceAvailability> {
  const lm = languageModel();
  if (!lm) return 'no_api';
  try {
    return await lm.availability({ expectedInputs: TEXT_EN, expectedOutputs: TEXT_EN });
  } catch {
    return 'unavailable';
  }
}

let settings: AppSettings | undefined;
const models = new Map<string, GenerativeModel>();

async function ready(): Promise<AppSettings> {
  settings ??= await loadSettings();
  return settings;
}

/** One model per (mode, schema) so each call states exactly where it may run. */
function model(mode: InferenceMode, schema?: object): GenerativeModel {
  const key = `${mode}:${schema === CHECK_RESULT_SCHEMA ? 'check' : schema === NAMES_SCHEMA ? 'names' : 'text'}`;
  let m = models.get(key);
  if (!m) {
    m = getGenerativeModel(firebase().ai, {
      mode,
      onDeviceParams: {
        createOptions: { expectedInputs: TEXT_EN, expectedOutputs: TEXT_EN },
        promptOptions: schema ? { responseConstraint: schema } : undefined,
      },
      inCloudParams: {
        model: settings!.cloudModel,
        generationConfig: schema
          ? { responseMimeType: 'application/json', responseJsonSchema: schema as Record<string, unknown>, temperature: 0.2 }
          : { temperature: 0.4 },
      },
    });
    models.set(key, m);
  }
  return m;
}

/** Start the on-device model download (must be called from a user gesture). */
export async function prepareDeviceModel(onProgress: (p: number) => void): Promise<void> {
  await ready();
  await model(InferenceMode.ONLY_ON_DEVICE, CHECK_RESULT_SCHEMA).initializeDeviceModel(onProgress);
}

/**
 * Redact personal details on-device. Regex rules always run; when the
 * on-device model is ready it also finds person names (ONLY_ON_DEVICE, so the
 * raw text cannot leak to the cloud even if the model disappears mid-call).
 */
export async function redactOnDevice(text: string, device: DeviceAvailability): Promise<RedactionResult> {
  let names: string[] = [];
  if (device === 'available') {
    try {
      const res = await model(InferenceMode.ONLY_ON_DEVICE, NAMES_SCHEMA).generateContent(namesPrompt(text.slice(0, 4000)));
      const parsed = JSON.parse(stripFences(res.response.text())) as { names?: unknown };
      if (Array.isArray(parsed.names)) names = parsed.names.filter((n): n is string => typeof n === 'string');
    } catch {
      /* regex-only redaction still applies */
    }
  }
  return redact(text, names);
}

export interface Plan {
  decision: RouteDecision;
  device: DeviceAvailability;
  /** Present when the text will go to the cloud: exactly what would be sent. */
  redaction?: RedactionResult;
}

/** Decide where a check runs, and prepare the redacted copy when it is cloud-bound. */
export async function plan(text: string, opts: { deepCheck?: boolean } = {}): Promise<Plan> {
  const s = await ready();
  const device = await deviceAvailability();
  const decision = route({ textLength: text.length, device, maxDeviceChars: s.maxDeviceChars, deepCheck: opts.deepCheck });
  const redaction = decision.redact ? await redactOnDevice(text, device) : undefined;
  return { decision, device, redaction };
}

export async function runCheck(text: string, p: Plan): Promise<CheckOutcome> {
  const s = await ready();
  const started = performance.now();
  const onDevice = p.decision.target === 'on_device';
  const sentText = onDevice ? text : p.redaction!.text;
  const mode = onDevice ? InferenceMode.ONLY_ON_DEVICE : InferenceMode.ONLY_IN_CLOUD;
  const res = await model(mode, CHECK_RESULT_SCHEMA).generateContent(checkPrompt(sentText, s.patterns, !onDevice));
  const result = parseCheckResult(res.response.text());
  return {
    result,
    source: (res.response.inferenceSource ?? (onDevice ? 'on_device' : 'in_cloud')) as Source,
    redacted: !onDevice,
    sentText,
    ms: Math.round(performance.now() - started),
    route: p.decision.reason,
  };
}

/**
 * Explain a finding in a Nigerian language. The input is the finding (not the
 * original message) and is redacted again. English prefers the on-device model;
 * Hausa, Yorùbá, Igbo and Pidgin prefer the cloud, because Chrome's on-device
 * model is only validated for English.
 */
export async function* explain(outcome: CheckOutcome, language: LanguageCode): AsyncGenerator<{ text: string; source: Source }> {
  await ready();
  const r = outcome.result;
  const prompt = redact(
    explainPrompt(r.summary, r.redFlags.map((f) => `"${f.quote}" (${f.why})`), r.advice, language),
  ).text;
  const mode = language === 'en' ? InferenceMode.PREFER_ON_DEVICE : InferenceMode.PREFER_IN_CLOUD;
  const stream = await model(mode).generateContentStream(prompt);
  let text = '';
  for await (const chunk of stream.stream) {
    text += chunk.text();
    yield { text, source: (chunk.inferenceSource ?? 'in_cloud') as Source };
  }
}

export { LANGUAGES };

function stripFences(s: string): string {
  return s.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
}
