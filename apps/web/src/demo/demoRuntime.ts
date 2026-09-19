import type { DemoConversation } from './demoConversation.js';
import type { DemoPersona } from './demoFetch.js';

/** Which sample player Stats shows. A tiny store so the banner switch and the
 * fetch shim agree without prop-drilling through the app. */
export class PersonaStore {
  private current: DemoPersona = 'sixWeeks';
  private readonly listeners = new Set<() => void>();

  get = (): DemoPersona => this.current;

  set(persona: DemoPersona): void {
    this.current = persona;
    for (const listener of this.listeners) listener();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}

/** The one-line message the banner shows for a few seconds after a refused write. */
export class NoticeStore {
  private current: string | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly listeners = new Set<() => void>();

  get = (): string | null => this.current;

  show(message: string, visibleMs = 6000): void {
    this.current = message;
    this.emit();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.clear(), visibleMs);
  }

  clear = (): void => {
    this.current = null;
    this.emit();
  };

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

export interface DemoRuntime {
  conversation: DemoConversation;
  persona: PersonaStore;
  notice: NoticeStore;
  /** The session the banner's "Try the coach conversation" link opens. */
  coachSessionId: string;
}

let runtime: DemoRuntime | null = null;

export function setDemoRuntime(next: DemoRuntime | null): void {
  runtime = next;
}

/** Null everywhere except inside the /demo build of the app. */
export function getDemoRuntime(): DemoRuntime | null {
  return runtime;
}
