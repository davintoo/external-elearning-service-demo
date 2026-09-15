import {KeyValuePipe} from '@angular/common';
import {Component, computed, inject, signal} from '@angular/core';

import {DemoApi} from './core/api';
import {SessionStore} from './core/session-store';
import {readLaunch} from './core/launch';
import {ApiError, Checklist, ChecklistValue, SessionContext, SubmitResponse} from './core/types';
import {ChecklistForm} from './ui/checklist-form';
import {ContextCard} from './ui/context-card';
import {FinishScreen} from './ui/finish-screen';
import {SessionsList} from './ui/sessions-list';

type Screen = 'no-session' | 'loading' | 'error' | 'list' | 'checklist' | 'finish';

@Component({
  selector: 'app-root',
  imports: [ContextCard, SessionsList, ChecklistForm, FinishScreen, KeyValuePipe],
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

  /**
   * Only a genuine transport failure — the demo server itself unreachable, or the LMS
   * unreachable behind it — reads as "could not be reached". Every other key means the LMS
   * was reached and answered (401/403/404/409/410/429 and friends), so those get a neutral
   * heading rather than being misdiagnosed as a network problem.
   */
  protected readonly errorHeading = computed(() => {
    const key = this.error()?.key;
    return key === 'demo_unreachable' || key === 'lms_unreachable'
      ? 'The LMS could not be reached'
      : 'The LMS rejected this session';
  });

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

  protected readonly submission = signal<SubmitResponse | null>(null);
  protected readonly busy = signal(false);
  protected readonly submitError = signal<ApiError | null>(null);

  protected saveProgress(change: {
    answers: Record<string, ChecklistValue>;
    comments: Record<string, string>;
  }): void {
    this.store.saveProgress(this.launch().sessionId!, change.answers, change.comments);
  }

  protected async submit(): Promise<void> {
    const {sessionId, force} = this.launch();
    const session = this.store.get(sessionId!)!;

    this.busy.set(true);
    this.submitError.set(null);
    try {
      const response = await this.api.submit(
        sessionId!, session.answers, session.comments, force
      );
      this.submission.set(response);
      this.store.finish(sessionId!, response.received);
      this.screen.set('finish');
    } catch (error) {
      // The answers stay in the store either way — a rejected send must never cost the
      // learner their work.
      this.submitError.set(error as ApiError);
    } finally {
      this.busy.set(false);
    }
  }

  protected reviseAndResend(): void {
    this.store.reopen(this.launch().sessionId!);
    this.submission.set(null);
    this.screen.set('checklist');
  }
}
