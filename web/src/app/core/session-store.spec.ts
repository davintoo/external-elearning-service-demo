import {TestBed} from '@angular/core/testing';
import {SessionStore, SESSIONS_KEY} from './session-store';
import {ResultResponse} from './types';

const ID = 'b3f1c9e2-4a17-4c0e-9f31-8a2d5e77b101';
const OTHER = '0f5a1d44-9c7b-4a2e-8d10-5b6c3f2e9a77';

const result: ResultResponse = {
  data: {
    session_id: ID, attempt_number: 1, status: 'finished', mark: 87,
    threshold: 80, task_status: 'finished', task_mark: 87,
    updated_at: '2026-09-15T10:22:31Z'
  }
};

const make = () => TestBed.configureTestingModule({}).inject(SessionStore);

describe('SessionStore', () => {
  beforeEach(() => {
    localStorage.removeItem(SESSIONS_KEY);
    TestBed.resetTestingModule();
  });

  it('starts empty and records a launch', () => {
    const store = make();
    expect(store.sessions().length).toBe(0);

    const session = store.start(ID);
    expect(session.sessionId).toBe(ID);
    expect(session.status).toBe('in-progress');
    expect(store.sessions().length).toBe(1);
  });

  it('is idempotent on a relaunch of the same session', () => {
    const store = make();
    const first = store.start(ID);
    const second = store.start(ID);

    expect(store.sessions().length).toBe(1);
    expect(second.startedAt).toBe(first.startedAt);
  });

  it('survives a reload, which is what makes resume possible', () => {
    const store = make();
    store.start(ID);
    store.saveProgress(ID, {c1: 'yes'}, {c1: 'looked fine'});

    TestBed.resetTestingModule();
    const reloaded = make();

    expect(reloaded.get(ID)!.answers['c1']).toBe('yes');
    expect(reloaded.get(ID)!.comments['c1']).toBe('looked fine');
  });

  it('keeps sessions apart', () => {
    const store = make();
    store.start(ID);
    store.start(OTHER);
    store.saveProgress(ID, {c1: 'yes'}, {});

    expect(store.get(OTHER)!.answers).toEqual({});
    expect(store.sessions().length).toBe(2);
  });

  it('marks a session finished and keeps the LMS answer with it', () => {
    const store = make();
    store.start(ID);
    store.finish(ID, result);

    expect(store.get(ID)!.status).toBe('finished');
    expect(store.get(ID)!.lastResult!.data.mark).toBe(87);
  });

  it('reopens a finished session for a resend without losing the answers', () => {
    const store = make();
    store.start(ID);
    store.saveProgress(ID, {c1: 'no'}, {});
    store.finish(ID, result);
    store.reopen(ID);

    expect(store.get(ID)!.status).toBe('in-progress');
    expect(store.get(ID)!.answers['c1']).toBe('no');
  });

  it('reports no session it has never seen', () => {
    expect(make().get(OTHER)).toBeNull();
  });

  it('ignores corrupted storage rather than failing to start', () => {
    localStorage.setItem(SESSIONS_KEY, '{not json');
    expect(make().sessions()).toEqual([]);

    TestBed.resetTestingModule();
    localStorage.setItem(SESSIONS_KEY, '{"not":"an array"}');
    expect(make().sessions()).toEqual([]);
  });

  it('falls back to memory when storage throws, and says so', () => {
    // Construct FIRST, while storage still works, so probeStorage() reports true. Spying
    // before construction makes the probe fail instead, and then `persistent` is already
    // false before a single write - which is how this test used to pass with the line it
    // guards deleted.
    const store = make();
    expect(store.persistent()).toBe(true);

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    store.start(ID);
    store.saveProgress(ID, {c1: 'yes'}, {});

    // Flipped BY the failed write, not by the constructor probe.
    expect(store.persistent()).toBe(false);
    expect(store.get(ID)!.answers['c1']).toBe('yes');
  });
});
