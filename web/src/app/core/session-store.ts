import {Injectable, signal} from '@angular/core';
import {ChecklistValue, ResultResponse, StoredSession} from './types';

export const SESSIONS_KEY = 'demo.sessions';

/**
 * The demo's only persistence. A real external service has a database; this one deliberately
 * does not, which keeps the LMS contract the single integration surface.
 *
 * Every access is guarded: inside a third-party iframe LocalStorage is partitioned per
 * top-level site and blocked outright in some privacy modes, so an unguarded read would take
 * the whole simulator down in a way that looks like an integration bug.
 */
@Injectable({providedIn: 'root'})
export class SessionStore {
  private readonly state = signal<StoredSession[]>(readAll());
  private memory: StoredSession[] = [];

  readonly sessions = this.state.asReadonly();
  readonly persistent = signal(probeStorage());

  get(sessionId: string): StoredSession | null {
    return this.state().find(session => session.sessionId === sessionId) ?? null;
  }

  start(sessionId: string): StoredSession {
    const existing = this.get(sessionId);
    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const session: StoredSession = {
      sessionId,
      startedAt: now,
      updatedAt: now,
      status: 'in-progress',
      answers: {},
      comments: {},
      lastResult: null
    };

    this.write([...this.state(), session]);
    return session;
  }

  saveProgress(
    sessionId: string,
    answers: Record<string, ChecklistValue>,
    comments: Record<string, string>
  ): void {
    this.update(sessionId, session => ({...session, answers, comments}));
  }

  finish(sessionId: string, lastResult: ResultResponse): void {
    this.update(sessionId, session => ({...session, status: 'finished', lastResult}));
  }

  /**
   * Back to editable without clearing anything. The contract makes session_id the
   * idempotency key and explicitly allows revising a finished session, so a resend is a
   * documented move rather than a way around the rules.
   */
  reopen(sessionId: string): void {
    this.update(sessionId, session => ({...session, status: 'in-progress'}));
  }

  private update(sessionId: string, change: (session: StoredSession) => StoredSession): void {
    this.write(this.state().map(session =>
      session.sessionId === sessionId
        ? {...change(session), updatedAt: new Date().toISOString()}
        : session
    ));
  }

  private write(sessions: StoredSession[]): void {
    this.state.set(sessions);
    this.memory = sessions;

    try {
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
    } catch {
      // Partitioned, full, or disabled. The signal already holds the value, so the session
      // keeps working for as long as the tab is open.
      this.persistent.set(false);
    }
  }
}

function readAll(): StoredSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    // Anything but an array is someone else's data or a truncated write — start clean
    // rather than crash on the first .find().
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function probeStorage(): boolean {
  try {
    const key = `${SESSIONS_KEY}.probe`;
    localStorage.setItem(key, '1');
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
