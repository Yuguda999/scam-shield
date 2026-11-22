import { h, redactedView } from './dom';
import { deviceAvailability, explain, LANGUAGES, plan, prepareDeviceModel, runCheck, type Plan } from '../firebase/checker';
import { communityText, report, seenThisWeek, trendsThisWeek } from '../firebase/community';
import { ROUTE_LABELS, type DeviceAvailability } from '../core/router';
import type { LanguageCode } from '../core/prompts';
import type { CheckOutcome, ScamType, Source } from '../core/types';

export interface Host {
  /** Optional: read the current page or selection (extension only). */
  readPage?: () => Promise<string>;
  /** Persist "don't ask again" for cloud consent. */
  getPref(key: string): Promise<boolean>;
  setPref(key: string, value: boolean): Promise<void>;
}

const SCAM_LABELS: Record<ScamType, string> = {
  fake_bank_alert: 'Fake bank alert',
  account_or_bvn_update: 'Account / BVN “update”',
  otp_or_pin_request: 'OTP or PIN request',
  fake_job_offer: 'Fake job offer',
  investment_or_ponzi: 'Investment / Ponzi',
  loan_app: 'Loan app',
  prize_or_giveaway: 'Fake prize / giveaway',
  impersonation: 'Impersonation',
  romance: 'Romance scam',
  delivery_or_customs: 'Delivery / customs fee',
  phishing_link: 'Phishing link',
  other: 'Other scam',
  none: 'No scam pattern',
};

const VERDICT_TEXT = { scam: 'Likely scam', suspicious: 'Be careful', safe: 'Looks safe' } as const;

export const SAMPLES = [
  'Dear Customer, your GTBank account has been restricted due to BVN update. Click https://gtb-secure-update.com/verify to reactivate within 24hrs or call 08031234567.',
  'CREDIT ALERT! Acct: 012****789 Amt: NGN250,000.00 Desc: TRF FROM CHIOMA OKAFOR. Avail Bal: NGN251,340.22. Pls release the goods, I have paid.',
  'Hi, this is Tunde from HR at Dangote Group. You have been shortlisted for a remote data entry role (₦350,000/month). Pay ₦15,000 training fee to 0123456789 to start Monday.',
  'Hi mum, I am at the shop. Can you send ₦3,000 for the bread and milk? I will pay you back when I get home tonight.',
];

export function mountApp(root: HTMLElement, host: Host): { checkText(text: string): void } {
  const status = h('span', { class: 'chip', role: 'status' }, 'Checking device…');
  const input = h('textarea', {
    id: 'msg',
    rows: '6',
    placeholder: 'Paste an SMS, WhatsApp message, email or link…',
    'aria-label': 'Message to check',
  });
  const checkBtn = h('button', { class: 'primary', onclick: () => void start() }, 'Check message');
  const pageBtn = host.readPage
    ? h('button', { class: 'ghost', onclick: () => void fromPage() }, 'Check this page')
    : null;
  const samples = h(
    'div',
    { class: 'samples' },
    h('span', { class: 'muted' }, 'Try:'),
    ...SAMPLES.map((s, i) =>
      h('button', { class: 'link', onclick: () => { input.value = s; void start(); } }, ['Bank “BVN”', 'Credit alert', 'Job offer', 'Family'][i]!),
    ),
  );
  const out = h('section', { class: 'out', 'aria-live': 'polite' });

  root.append(
    h(
      'header',
      { class: 'top' },
      h('div', { class: 'brand' }, logo(), h('div', {}, h('h1', {}, 'Scam Shield'), h('p', { class: 'muted' }, 'Check before you pay.'))),
      status,
    ),
    h('section', { class: 'card input' }, input, h('div', { class: 'row' }, checkBtn, pageBtn), samples),
    out,
    trendsPanel(),
    h('footer', { class: 'muted' }, '🔒 Raw messages are only read by the AI on your device. Anything sent to the cloud is redacted first.'),
  );

  let device: DeviceAvailability = 'no_api';
  void refreshStatus();

  async function refreshStatus(): Promise<void> {
    device = await deviceAvailability();
    status.className = `chip ${device === 'available' ? 'ok' : device === 'downloading' ? 'warn' : 'cloud'}`;
    status.textContent =
      device === 'available'
        ? 'On-device AI ready'
        : device === 'downloading'
          ? 'Downloading on-device AI…'
          : device === 'downloadable'
            ? 'On-device AI: tap to download'
            : 'Cloud mode (redacted)';
    status.onclick = device === 'downloadable' ? () => void download() : null;
    status.style.cursor = device === 'downloadable' ? 'pointer' : '';
  }

  async function download(): Promise<void> {
    status.textContent = 'Downloading… 0%';
    try {
      await prepareDeviceModel((p) => (status.textContent = `Downloading… ${Math.round(p * 100)}%`));
    } catch (e) {
      status.textContent = 'Download failed';
      console.warn(e);
    }
    await refreshStatus();
  }

  async function fromPage(): Promise<void> {
    try {
      const text = await host.readPage!();
      if (!text.trim()) throw new Error('empty');
      input.value = text;
      void start();
    } catch {
      showError('Could not read this page. Select the text, right-click and choose “Check with Scam Shield”.');
    }
  }

  async function start(opts: { deepCheck?: boolean; previous?: CheckOutcome } = {}): Promise<void> {
    const text = input.value.trim();
    if (!text) {
      input.focus();
      return;
    }
    busy(true);
    out.replaceChildren(spinner(opts.deepCheck ? 'Redacting on your device…' : 'Checking…'));
    try {
      await refreshStatus();
      const p = await plan(text, opts);
      if (p.decision.target === 'in_cloud' && !opts.deepCheck && !(await host.getPref('cloudConsent'))) {
        out.replaceChildren(consentCard(p, text));
        return;
      }
      await execute(text, p);
    } catch (e) {
      showError(e);
    } finally {
      busy(false);
    }
  }

  async function execute(text: string, p: Plan): Promise<void> {
    busy(true);
    out.replaceChildren(spinner(p.decision.target === 'on_device' ? 'Checking privately on this device…' : 'Checking redacted copy in the cloud…'));
    try {
      const outcome = await runCheck(text, p);
      out.replaceChildren(resultCard(outcome, text));
    } catch (e) {
      showError(e);
    } finally {
      busy(false);
    }
  }

  function consentCard(p: Plan, text: string): HTMLElement {
    const remember = h('input', { type: 'checkbox', id: 'remember' });
    const why =
      p.device === 'available'
        ? 'This message is too long for the on-device AI.'
        : p.device === 'downloading' || p.device === 'downloadable'
          ? 'The on-device AI is not downloaded yet, so this check needs the cloud.'
          : 'This device has no on-device AI, so the check needs the cloud.';
    return h(
      'div',
      { class: 'card consent' },
      h('h2', {}, 'Send a redacted copy?'),
      h('p', {}, why, ' Personal details were removed on your device. Only this exact text will be sent:'),
      redactedView(p.redaction!.text),
      h('p', { class: 'muted small' }, `${p.redaction!.redactions.length} item(s) removed: ${summariseRedactions(p)}`),
      h('label', { class: 'small' }, remember, ' Don’t ask again for redacted copies'),
      h(
        'div',
        { class: 'row' },
        h('button', {
          class: 'primary',
          onclick: async () => {
            if (remember.checked) await host.setPref('cloudConsent', true);
            await execute(text, p);
          },
        }, 'Send redacted copy'),
        h('button', { class: 'ghost', onclick: () => out.replaceChildren() }, 'Cancel'),
      ),
    );
  }

  function resultCard(o: CheckOutcome, original: string): HTMLElement {
    const r = o.result;
    const community = communitySection(o, original);
    const explainOut = h('div', { class: 'explain' });
    const langButtons = (Object.keys(LANGUAGES) as LanguageCode[]).map((code) =>
      h('button', { class: 'pill', onclick: () => void doExplain(code) }, LANGUAGES[code].replace('simple ', '')),
    );

    async function doExplain(code: LanguageCode): Promise<void> {
      explainOut.replaceChildren(spinner(`Explaining in ${LANGUAGES[code]}…`));
      const body = h('p', {});
      const badge = h('span');
      try {
        let first = true;
        for await (const part of explain(o, code)) {
          if (first) {
            explainOut.replaceChildren(body, badge);
            first = false;
          }
          body.textContent = part.text;
          badge.replaceChildren(sourceBadge(part.source, true));
        }
      } catch (e) {
        explainOut.replaceChildren(h('p', { class: 'error' }, errorText(e)));
      }
    }

    return h(
      'article',
      { class: `card result ${r.verdict}` },
      h(
        'div',
        { class: 'verdict' },
        h('div', {}, h('strong', {}, VERDICT_TEXT[r.verdict]), h('span', { class: 'tag' }, SCAM_LABELS[r.scamType])),
        meter(r.risk),
      ),
      h('p', { class: 'summary' }, r.summary),
      r.redFlags.length
        ? h(
            'div',
            {},
            h('h3', {}, 'Warning signs'),
            h('ul', { class: 'flags' }, ...r.redFlags.map((f) => h('li', {}, f.quote ? h('q', {}, f.quote) : null, h('span', {}, f.why)))),
          )
        : null,
      r.advice.length ? h('div', {}, h('h3', {}, 'What to do'), h('ol', { class: 'advice' }, ...r.advice.map((a) => h('li', {}, a)))) : null,
      community,
      h('div', { class: 'meta' }, sourceBadge(o.source, o.redacted), h('span', { class: 'muted small' }, `${(o.ms / 1000).toFixed(1)} s`)),
      h(
        'details',
        {},
        h('summary', {}, 'How was this checked?'),
        h('p', { class: 'small' }, ROUTE_LABELS[o.route]),
        o.redacted ? redactedView(o.sentText) : null,
      ),
      h('h3', {}, 'Explain in'),
      h('div', { class: 'langs' }, ...langButtons),
      explainOut,
      o.source === 'on_device'
        ? h('button', { class: 'ghost wide', onclick: () => void start({ deepCheck: true, previous: o }) }, 'Second opinion from the cloud (redacted)')
        : null,
    );
  }

  /** "Seen N times this week" plus a consent-first "Report" flow. Only redacted text is ever shared. */
  function communitySection(o: CheckOutcome, original: string): HTMLElement {
    const box = h('div', { class: 'community' });
    const seen = h('p', { class: 'seen small muted' }, 'Checking community reports…');
    box.append(seen);
    let redacted: Promise<string> | undefined;
    const getRedacted = () => (redacted ??= communityText(o, original));

    void (async () => {
      try {
        const n = await seenThisWeek(await getRedacted());
        seen.className = `seen small ${n ? 'hot' : 'muted'}`;
        seen.textContent = n
          ? `👥 ${n} ${n === 1 ? 'person has' : 'people have'} reported this message this week.`
          : 'No one has reported this exact message this week.';
      } catch (e) {
        console.warn('community lookup failed', e);
        seen.remove();
      }
    })();

    if (o.result.verdict === 'safe') return box;

    const reportBtn = h('button', {
      class: 'ghost wide',
      onclick: async () => {
        reportBtn.disabled = true;
        const text = await getRedacted();
        reportBtn.replaceWith(
          h(
            'div',
            { class: 'consent-inline' },
            h('p', { class: 'small' }, 'Share this redacted copy so others are warned? Your name, numbers and links are removed:'),
            redactedView(text),
            h(
              'div',
              { class: 'row' },
              h('button', {
                class: 'primary',
                onclick: async (e: Event) => {
                  const btn = e.currentTarget as HTMLButtonElement;
                  btn.disabled = true;
                  try {
                    await report(o, text);
                    box.querySelector('.consent-inline')?.replaceWith(h('p', { class: 'small ok' }, '✅ Reported. Thank you for warning others.'));
                    const n = await seenThisWeek(text);
                    seen.className = 'seen small hot';
                    seen.textContent = `👥 ${n} ${n === 1 ? 'person has' : 'people have'} reported this message this week.`;
                    void loadTrends();
                  } catch (err) {
                    btn.disabled = false;
                    box.append(h('p', { class: 'small error' }, errorText(err)));
                  }
                },
              }, 'Share redacted report'),
              h('button', { class: 'ghost', onclick: () => box.querySelector('.consent-inline')?.replaceWith(reportBtn) }, 'Cancel'),
            ),
          ),
        );
        reportBtn.disabled = false;
      },
    }, '📣 Report to warn others');
    box.append(reportBtn);
    return box;
  }

  const trendsList = h('div', { class: 'trends' });
  function trendsPanel(): HTMLElement {
    const d = h(
      'details',
      { class: 'card' },
      h('summary', {}, 'What’s going around this week'),
      trendsList,
    );
    d.addEventListener('toggle', () => {
      if (d.open) void loadTrends();
    });
    return d;
  }

  async function loadTrends(): Promise<void> {
    trendsList.replaceChildren(spinner('Loading community reports…'));
    try {
      const { total, rows } = await trendsThisWeek();
      if (!total) {
        trendsList.replaceChildren(h('p', { class: 'small muted' }, 'No reports yet this week. Be the first to warn others.'));
        return;
      }
      const max = rows[0]!.count;
      trendsList.replaceChildren(
        h('p', { class: 'small muted' }, `${total} redacted ${total === 1 ? 'report' : 'reports'} from Scam Shield users this week`),
        ...rows.slice(0, 6).map((row) =>
          h(
            'div',
            { class: 'trend' },
            h('span', {}, SCAM_LABELS[row.scamType as ScamType] ?? row.scamType),
            h('span', { class: 'bar', style: `--w:${Math.max(8, Math.round((row.count / max) * 100))}%` }),
            h('strong', {}, String(row.count)),
          ),
        ),
      );
    } catch (e) {
      trendsList.replaceChildren(h('p', { class: 'small error' }, errorText(e)));
    }
  }

  function showError(e: unknown): void {
    out.replaceChildren(h('div', { class: 'card error' }, errorText(e)));
  }

  function busy(on: boolean): void {
    checkBtn.disabled = on;
    if (pageBtn) pageBtn.disabled = on;
  }

  return {
    checkText(text: string) {
      input.value = text;
      void start();
    },
  };
}

function summariseRedactions(p: Plan): string {
  const counts = new Map<string, number>();
  for (const r of p.redaction!.redactions) counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1);
  if (!counts.size) return 'nothing personal found';
  return [...counts].map(([k, n]) => `${n} ${k.toLowerCase().replace(/_/g, ' ')}`).join(', ');
}

function sourceBadge(source: Source, redacted: boolean): HTMLElement {
  return source === 'on_device'
    ? h('span', { class: 'badge device', title: 'Ran on Gemini Nano in Chrome' }, '🔒 On this device')
    : h('span', { class: 'badge cloud', title: 'Ran on Gemini in the cloud via Firebase AI Logic' }, redacted ? '☁️ Cloud · redacted' : '☁️ Cloud');
}

function meter(risk: number): HTMLElement {
  return h(
    'div',
    { class: 'meter', role: 'meter', 'aria-valuenow': String(risk), 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': 'Scam risk' },
    h('span', { class: 'num' }, `${risk}`),
    h('span', { class: 'muted small' }, 'risk'),
  );
}

function spinner(label: string): HTMLElement {
  return h('div', { class: 'card loading' }, h('span', { class: 'spin', 'aria-hidden': 'true' }), label);
}

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/app.?check|attestation|403|PERMISSION_DENIED/i.test(msg)) return 'The cloud check was blocked by App Check. The developer needs to register this build’s debug token.';
  if (/fetch|network|offline|Failed to fetch/i.test(msg)) return 'You seem to be offline, and this check needs the cloud. Try again when connected.';
  return msg || 'Something went wrong. Please try again.';
}

function logo(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.setAttribute('class', 'logo');
  svg.setAttribute('aria-hidden', 'true');
  const shield = document.createElementNS(svg.namespaceURI, 'path');
  shield.setAttribute('d', 'M16 2 4 6.5v8.2C4 22.3 9.1 28.2 16 30c6.9-1.8 12-7.7 12-15.3V6.5L16 2Z');
  shield.setAttribute('fill', 'currentColor');
  const tick = document.createElementNS(svg.namespaceURI, 'path');
  tick.setAttribute('d', 'm10.5 16.2 3.8 3.8 7.4-8');
  tick.setAttribute('fill', 'none');
  tick.setAttribute('stroke', 'var(--bg)');
  tick.setAttribute('stroke-width', '3');
  tick.setAttribute('stroke-linecap', 'round');
  tick.setAttribute('stroke-linejoin', 'round');
  svg.append(shield, tick);
  return svg;
}
