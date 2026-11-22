import { h, redactedView } from './dom';
import { icon } from './icons';
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
  account_or_bvn_update: 'Account or BVN “update”',
  otp_or_pin_request: 'OTP or PIN request',
  fake_job_offer: 'Fake job offer',
  investment_or_ponzi: 'Investment or Ponzi',
  loan_app: 'Loan app',
  prize_or_giveaway: 'Fake prize or giveaway',
  impersonation: 'Impersonation',
  romance: 'Romance scam',
  delivery_or_customs: 'Delivery or customs fee',
  phishing_link: 'Phishing link',
  other: 'Other scam',
  none: 'No scam pattern',
};

const VERDICT = {
  scam: { title: 'Likely scam', tone: 'critical', chip: 'Scam' },
  suspicious: { title: 'Be careful', tone: 'warn', chip: 'Suspicious' },
  safe: { title: 'Looks safe', tone: 'ok', chip: 'Safe' },
} as const;

export const SAMPLES: { label: string; text: string }[] = [
  {
    label: 'BVN update',
    text: 'Dear Customer, your GTBank account has been restricted due to BVN update. Click https://gtb-secure-update.com/verify to reactivate within 24hrs or call 08031234567.',
  },
  {
    label: 'Credit alert',
    text: 'CREDIT ALERT! Acct: 012****789 Amt: NGN250,000.00 Desc: TRF FROM CHIOMA OKAFOR. Avail Bal: NGN251,340.22. Pls release the goods, I have paid.',
  },
  {
    label: 'Job offer',
    text: 'Hi, this is Tunde from HR at Dangote Group. You have been shortlisted for a remote data entry role (₦350,000/month). Pay ₦15,000 training fee to 0123456789 to start Monday.',
  },
  {
    label: 'Family',
    text: 'Hi mum, I am at the shop. Can you send ₦3,000 for the bread and milk? I will pay you back when I get home tonight.',
  },
];

/** Give children a staggered rise-in entrance. */
function stagger<T extends HTMLElement>(el: T, i: number): T {
  el.classList.add('rise');
  el.style.setProperty('--i', String(i));
  return el;
}

export function mountApp(root: HTMLElement, host: Host): { checkText(text: string): void } {
  root.classList.add('shell');
  const status = h('button', { class: 'chip idle', type: 'button', disabled: true }, h('span', { class: 'dot' }), 'Checking');
  const input = h('textarea', {
    id: 'msg',
    rows: '5',
    placeholder: 'Paste an SMS, WhatsApp message, email or link',
    'aria-label': 'Message to check',
  });
  const checkBtn = h('button', { class: 'btn pill primary', type: 'button', onclick: () => void start() }, icon('shield'), 'Check message');
  const pasteBtn = h(
    'button',
    { class: 'btn circle surface', type: 'button', title: 'Paste from clipboard', 'aria-label': 'Paste from clipboard', onclick: () => void paste() },
    icon('paste'),
  );
  const pageBtn = host.readPage
    ? h(
        'button',
        { class: 'btn circle surface', type: 'button', title: 'Check this page', 'aria-label': 'Check this page', onclick: () => void fromPage() },
        icon('page'),
      )
    : null;
  const samples = h(
    'div',
    { class: 'samples' },
    h('span', { class: 'readout' }, 'Try'),
    ...SAMPLES.map((s) =>
      h('button', { class: 'sample', type: 'button', onclick: () => { input.value = s.text; void start(); } }, s.label),
    ),
  );
  const out = h('section', { class: 'out', 'aria-live': 'polite' });
  const trendsList = h('div', { class: 'trends' });

  root.append(
    h(
      'header',
      { class: 'top' },
      h(
        'div',
        { class: 'brand' },
        h('span', { class: 'mark' }, icon('shield')),
        h('div', {}, h('div', { class: 'wordmark' }, 'Scam Shield'), h('p', { class: 'readout' }, 'Check before you pay')),
      ),
      status,
    ),
    h('section', { class: 'bento composer' }, input, h('div', { class: 'actions' }, checkBtn, pasteBtn, pageBtn), samples),
    out,
    trendsPanel(),
    h('footer', { class: 'foot readout' }, icon('lock'), 'Raw messages stay on your device. Cloud gets a redacted copy.'),
  );
  out.replaceChildren(emptyState());

  let device: DeviceAvailability = 'no_api';
  void refreshStatus();

  function setStatus(tone: string, label: string, clickable = false): void {
    status.className = `chip ${tone}`;
    status.replaceChildren(h('span', { class: 'dot' }), label);
    status.disabled = !clickable;
  }

  async function refreshStatus(): Promise<void> {
    device = await deviceAvailability();
    if (device === 'available') setStatus('ok', 'On-device ready');
    else if (device === 'downloading') setStatus('running', 'On-device loading');
    else if (device === 'downloadable') setStatus('running', 'Get on-device AI', true);
    else setStatus('idle', 'Cloud · redacted');
    status.onclick = device === 'downloadable' ? () => void download() : null;
    status.title = device === 'downloadable' ? 'Download Gemini Nano so checks run privately on this device' : '';
  }

  async function download(): Promise<void> {
    setStatus('running', 'Downloading 0%');
    try {
      await prepareDeviceModel((p) => setStatus('running', `Downloading ${Math.round(p * 100)}%`));
    } catch (e) {
      setStatus('critical', 'Download failed');
      console.warn(e);
    }
    await refreshStatus();
  }

  async function paste(): Promise<void> {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        input.value = text;
        void start();
      } else input.focus();
    } catch {
      input.focus();
    }
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

  async function start(opts: { deepCheck?: boolean } = {}): Promise<void> {
    const text = input.value.trim();
    if (!text) {
      input.focus();
      return;
    }
    busy(true);
    out.replaceChildren(loadingState(opts.deepCheck ? 'Redacting on your device' : 'Reading the message'));
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
    out.replaceChildren(
      loadingState(p.decision.target === 'on_device' ? 'Checking privately on this device' : 'Checking the redacted copy in the cloud'),
    );
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
    const remember = h('input', { type: 'checkbox' });
    const why =
      p.device === 'available'
        ? 'This message is too long for the on-device AI.'
        : p.device === 'downloading' || p.device === 'downloadable'
          ? 'The on-device AI is not downloaded yet.'
          : 'This device has no on-device AI.';
    return h(
      'div',
      { class: 'bento consent rise' },
      h('div', {}, h('p', { class: 'readout' }, 'Cloud check'), h('h2', {}, 'Send a redacted copy?')),
      h('p', {}, `${why} Personal details were removed on your device. Only the text below will be sent.`),
      h('div', { class: 'tile' }, redactedView(p.redaction!.text)),
      h('p', { class: 'readout' }, `${p.redaction!.redactions.length} removed · ${summariseRedactions(p)}`),
      h('label', { class: 'check' }, remember, 'Don’t ask again for redacted copies'),
      h(
        'div',
        { class: 'actions' },
        h(
          'button',
          {
            class: 'btn pill primary',
            type: 'button',
            onclick: async () => {
              if (remember.checked) await host.setPref('cloudConsent', true);
              await execute(text, p);
            },
          },
          icon('cloud'),
          'Send redacted copy',
        ),
        h('button', { class: 'btn pill surface', type: 'button', onclick: () => out.replaceChildren(emptyState()) }, 'Cancel'),
      ),
    );
  }

  function resultCard(o: CheckOutcome, original: string): HTMLElement {
    const r = o.result;
    const v = VERDICT[r.verdict];
    const explainOut = h('div', { class: 'explain' });
    const langButtons = (Object.keys(LANGUAGES) as LanguageCode[]).map((code) =>
      h(
        'button',
        { type: 'button', 'aria-pressed': 'false', onclick: (e: Event) => void doExplain(code, e.currentTarget as HTMLButtonElement) },
        LANGUAGES[code].replace('simple ', '').replace('Nigerian ', ''),
      ),
    );

    async function doExplain(code: LanguageCode, btn: HTMLButtonElement): Promise<void> {
      for (const b of langButtons) b.setAttribute('aria-pressed', String(b === btn));
      explainOut.replaceChildren(h('p', { class: 'readout' }, `Writing in ${LANGUAGES[code]}…`));
      const body = h('p', { lang: code === 'pcm' ? 'pcm' : code });
      const meta = h('div');
      try {
        let first = true;
        for await (const part of explain(o, code)) {
          if (first) {
            explainOut.replaceChildren(h('div', { class: 'tile' }, body), meta);
            first = false;
          }
          body.textContent = part.text;
          meta.replaceChildren(sourceChip(part.source, true));
        }
      } catch (e) {
        explainOut.replaceChildren(h('p', { class: 'error-text' }, errorText(e)));
      }
    }

    let i = 0;
    return h(
      'article',
      { class: `bento result ${r.verdict}` },
      stagger(
        h(
          'div',
          { class: 'verdict' },
          h(
            'div',
            { class: 'verdict-text' },
            h('span', { class: `chip ${v.tone}` }, h('span', { class: 'dot' }), SCAM_LABELS[r.scamType]),
            h('h2', {}, v.title),
          ),
          h('div', { class: 'score' }, h('div', { class: 'num tabular' }, String(r.risk)), h('p', { class: 'readout' }, 'Risk / 100')),
        ),
        i++,
      ),
      stagger(h('div', { class: 'bar', role: 'meter', 'aria-label': 'Scam risk', 'aria-valuenow': String(r.risk), 'aria-valuemin': '0', 'aria-valuemax': '100', style: `--w:${r.risk}%` }, h('i')), i++),
      stagger(h('p', { class: 'summary' }, r.summary), i++),
      r.redFlags.length
        ? stagger(
            h(
              'div',
              { class: 'section' },
              h('h3', { class: 'readout' }, 'Warning signs'),
              h('ul', { class: 'flags' }, ...r.redFlags.map((f) => h('li', { class: 'flag' }, f.quote ? h('q', {}, f.quote) : null, h('span', {}, f.why)))),
            ),
            i++,
          )
        : null,
      r.advice.length
        ? stagger(h('div', { class: 'section' }, h('h3', { class: 'readout' }, 'What to do'), h('ol', { class: 'steps' }, ...r.advice.map((a) => h('li', {}, a)))), i++)
        : null,
      stagger(communitySection(o, original), i++),
      stagger(
        h(
          'div',
          { class: 'section' },
          h('h3', { class: 'readout' }, 'Explain in'),
          h('div', { class: 'segmented', role: 'group', 'aria-label': 'Explain in a language' }, ...langButtons),
          explainOut,
        ),
        i++,
      ),
      o.source === 'on_device'
        ? h('button', { class: 'btn pill surface wide', type: 'button', onclick: () => void start({ deepCheck: true }) }, icon('cloud'), 'Second opinion from the cloud')
        : null,
      stagger(
        h(
          'div',
          { class: 'provenance' },
          sourceChip(o.source, o.redacted),
          h('span', { class: 'readout tabular' }, `${(o.ms / 1000).toFixed(1)} s`),
        ),
        i++,
      ),
      h(
        'details',
        { class: 'how' },
        h('summary', { class: 'readout' }, 'How was this checked', icon('chevron')),
        h('div', { class: 'tile' }, h('p', { class: 'small ink-2' }, ROUTE_LABELS[o.route]), o.redacted ? redactedView(o.sentText) : null),
      ),
    );
  }

  /** "Seen N times this week" plus a consent-first report flow. Only redacted text is ever shared. */
  function communitySection(o: CheckOutcome, original: string): HTMLElement {
    const box = h('div', { class: 'tile community' });
    const count = h('p', { class: 'count ink-2' }, 'Checking community reports…');
    box.append(h('span', { class: 'glyph' }, icon('users')), count);
    let redacted: Promise<string> | undefined;
    const getRedacted = () => (redacted ??= communityText(o, original));

    const showCount = (n: number) => {
      box.classList.toggle('hot', n > 0);
      count.className = `count${n ? '' : ' ink-2'}`;
      count.replaceChildren(
        ...(n
          ? [h('b', { class: 'tabular' }, String(n)), ` ${n === 1 ? 'person has' : 'people have'} reported this message this week.`]
          : ['No one has reported this exact message this week.']),
      );
    };

    void (async () => {
      try {
        showCount(await seenThisWeek(await getRedacted()));
      } catch (e) {
        console.warn('community lookup failed', e);
        count.textContent = 'Community reports are unavailable right now.';
      }
    })();

    if (o.result.verdict === 'safe') return box;

    const reportBtn = h(
      'button',
      {
        class: 'btn pill-sm surface full',
        type: 'button',
        onclick: async () => {
          reportBtn.disabled = true;
          const text = await getRedacted();
          const confirm = h(
            'div',
            { class: 'full section' },
            h('p', { class: 'small ink-2' }, 'Share this copy to warn others? Personal details were removed on your device.'),
            h('div', { class: 'tile' }, redactedView(text)),
            h(
              'div',
              { class: 'actions' },
              h(
                'button',
                {
                  class: 'btn pill-sm primary',
                  type: 'button',
                  onclick: async (e: Event) => {
                    const btn = e.currentTarget as HTMLButtonElement;
                    btn.disabled = true;
                    try {
                      await report(o, text);
                      confirm.replaceWith(h('p', { class: 'full ok-text' }, 'Reported. Thank you for warning others.'));
                      showCount(await seenThisWeek(text));
                      void loadTrends();
                    } catch (err) {
                      btn.disabled = false;
                      confirm.append(h('p', { class: 'error-text' }, errorText(err)));
                    }
                  },
                },
                'Share redacted copy',
              ),
              h('button', { class: 'btn pill-sm ghost', type: 'button', onclick: () => confirm.replaceWith(reportBtn) }, 'Cancel'),
            ),
          );
          reportBtn.replaceWith(confirm);
          reportBtn.disabled = false;
        },
      },
      icon('megaphone'),
      'Report to warn others',
    );
    box.append(reportBtn);
    return box;
  }

  function trendsPanel(): HTMLElement {
    const d = h(
      'details',
      { class: 'bento trends-card' },
      h('summary', {}, h('div', {}, h('p', { class: 'readout' }, 'Community'), h('p', { class: 'title' }, 'Going around this week')), icon('chevron')),
      trendsList,
    );
    d.addEventListener('toggle', () => {
      if (d.open) void loadTrends();
    });
    return d;
  }

  async function loadTrends(): Promise<void> {
    trendsList.replaceChildren(h('p', { class: 'readout' }, 'Loading reports…'));
    try {
      const { total, rows } = await trendsThisWeek();
      if (!total) {
        trendsList.replaceChildren(h('p', { class: 'small ink-2' }, 'No reports yet this week. Be the first to warn others.'));
        return;
      }
      const max = rows[0]!.count;
      trendsList.replaceChildren(
        h('p', { class: 'readout tabular' }, `${total} redacted ${total === 1 ? 'report' : 'reports'}`),
        ...rows.slice(0, 6).map((row) =>
          h(
            'div',
            { class: 'trend' },
            h('span', {}, SCAM_LABELS[row.scamType as ScamType] ?? row.scamType),
            h('span', { class: 'meter', style: `--w:${Math.max(8, Math.round((row.count / max) * 100))}%` }, h('i')),
            h('b', { class: 'tabular' }, String(row.count)),
          ),
        ),
      );
    } catch (e) {
      trendsList.replaceChildren(h('p', { class: 'error-text' }, errorText(e)));
    }
  }

  function showError(e: unknown): void {
    out.replaceChildren(
      h(
        'div',
        { class: 'bento empty rise', role: 'alert' },
        rings(false, true),
        h('p', { class: 'title' }, 'That didn’t work'),
        h('p', { class: 'body' }, errorText(e)),
      ),
    );
  }

  function busy(on: boolean): void {
    checkBtn.disabled = on;
    pasteBtn.disabled = on;
    if (pageBtn) pageBtn.disabled = on;
  }

  return {
    checkText(text: string) {
      input.value = text;
      void start();
    },
  };
}

function rings(isBusy = false, critical = false): HTMLElement {
  const core = h('span', { class: 'core' }, h('i', critical ? { style: 'background: var(--critical)' } : {}));
  return h('span', { class: `rings${isBusy ? ' busy' : ''}`, 'aria-hidden': 'true' }, h('span'), h('span'), core);
}

function emptyState(): HTMLElement {
  return h(
    'div',
    { class: 'bento empty' },
    rings(),
    h('p', { class: 'title' }, 'Paste anything that feels off'),
    h('p', { class: 'body' }, 'A bank alert, a job offer, a “BVN update” link. Scam Shield reads it on your device first.'),
  );
}

function loadingState(label: string): HTMLElement {
  return h('div', { class: 'bento empty' }, rings(true), h('p', { class: 'title' }, label), h('p', { class: 'body readout' }, 'This takes a few seconds'));
}

function summariseRedactions(p: Plan): string {
  const counts = new Map<string, number>();
  for (const r of p.redaction!.redactions) counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1);
  if (!counts.size) return 'nothing personal found';
  return [...counts].map(([k, n]) => `${n} ${k.toLowerCase().replace(/_/g, ' ')}`).join(', ');
}

function sourceChip(source: Source, redacted: boolean): HTMLElement {
  return source === 'on_device'
    ? h('span', { class: 'chip ok', title: 'Ran on Gemini Nano in Chrome' }, icon('lock'), 'On this device')
    : h('span', { class: 'chip idle', title: 'Ran on Gemini in the cloud via Firebase AI Logic' }, icon('cloud'), redacted ? 'Cloud · redacted' : 'Cloud');
}

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/app.?check|attestation|403|PERMISSION_DENIED/i.test(msg)) return 'The cloud check was blocked by App Check. This build’s debug token needs to be registered.';
  if (/fetch|network|offline|Failed to fetch/i.test(msg)) return 'You seem to be offline, and this check needs the cloud. Try again when you’re connected.';
  return msg || 'Something went wrong. Please try again.';
}
