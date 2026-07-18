import type { Card, MsgBody, StepId, WidgetSpec } from '../types';

export interface FlowUI {
  push: (msg: MsgBody) => void;
  setTyping: (t: boolean) => void;
  setWidget: (w: WidgetSpec | null) => void;
  setStep: (s: StepId | 'done') => void;
}

/**
 * Mediates between the async conversation script and the React UI.
 * The script awaits `ask(widget)`; the active widget component calls
 * `provide(value)` to resolve it and hand control back to the script.
 */
export class FlowController {
  private resolver: ((v: unknown) => void) | null = null;

  /** Reference face descriptor from the ID document (set by the script). */
  refDescriptor: Promise<Float32Array | null> = Promise.resolve(null);

  constructor(
    private ui: FlowUI,
    public readonly demo: boolean
  ) {}

  sleep(ms: number) {
    return new Promise((r) => setTimeout(r, this.demo ? Math.min(ms, 200) : ms));
  }

  async say(text: string, delay = 750) {
    this.ui.setTyping(true);
    await this.sleep(delay);
    this.ui.setTyping(false);
    this.ui.push({ from: 'bot', text });
    await this.sleep(120);
  }

  user(text: string) {
    this.ui.push({ from: 'user', text });
  }

  userImage(image: string, caption?: string) {
    this.ui.push({ from: 'user-image', image, caption });
  }

  card(card: Card) {
    this.ui.push({ from: 'card', card });
  }

  step(s: StepId | 'done') {
    this.ui.setStep(s);
  }

  processing(label: string, pct?: number) {
    this.ui.setWidget({ type: 'processing', label, pct });
  }

  clearWidget() {
    this.ui.setWidget(null);
  }

  ask<T>(w: WidgetSpec): Promise<T> {
    this.ui.setWidget(w);
    return new Promise<T>((resolve) => {
      this.resolver = resolve as (v: unknown) => void;
    });
  }

  provide(value: unknown) {
    const r = this.resolver;
    this.resolver = null;
    this.ui.setWidget(null);
    r?.(value);
  }
}
