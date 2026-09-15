import {Component, computed, inject, signal} from '@angular/core';

import {DemoApi} from './core/api';
import {SessionStore} from './core/session-store';
import {readLaunch} from './core/launch';
import {ApiError, Checklist, SessionContext} from './core/types';
import {ContextCard} from './ui/context-card';
import {SessionsList} from './ui/sessions-list';

type Screen = 'no-session' | 'loading' | 'error' | 'list' | 'checklist' | 'finish';

@Component({
  selector: 'app-root',
  imports: [ContextCard, SessionsList],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  private readonly api = inject(DemoApi);
  protected readonly store = inject(SessionStore);

  protected readonly launch = signal(readLaunch(window.location.search));
  protected readonly mode = signal<'mock' | 'live'>('mock');
  protected readonly context = signal<SessionContext | null>(null);
  protected readonly checklist = signal<Checklist | null>(null);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly screen = signal<Screen>('no-session');

  protected readonly current = computed(() => {
    const sessionId = this.launch().sessionId;
    return sessionId ? this.store.sessions().find(s => s.sessionId === sessionId) ?? null : null;
  });

  /** Resume only makes sense for a launch this browser has already worked on. */
  protected readonly actionLabel = computed(() => {
    const session = this.current();
    if (!session) {
      return 'Start';
    }
    return session.status === 'finished' ? 'Send again' : 'Resume';
  });

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    const {sessionId, force} = this.launch();
    if (!sessionId) {
      this.screen.set('no-session');
      return;
    }

    this.screen.set('loading');
    try {
      const [config, checklist, context] = await Promise.all([
        this.api.config(),
        this.api.checklist(),
        this.api.session(sessionId, force)
      ]);

      this.mode.set(config.mode);
      this.checklist.set(checklist);
      this.context.set(context);
      this.screen.set('list');
    } catch (error) {
      this.error.set(error as ApiError);
      this.screen.set('error');
    }
  }

  protected openChecklist(): void {
    const sessionId = this.launch().sessionId!;
    const session = this.store.get(sessionId);

    if (!session) {
      this.store.start(sessionId);
    } else if (session.status === 'finished') {
      this.store.reopen(sessionId);
    }

    this.screen.set('checklist');
  }
}
