import {TestBed} from '@angular/core/testing';
import {App} from './app';
import {DemoApi} from './core/api';
import {SessionStore} from './core/session-store';

describe('App', () => {
  it('explains itself when opened outside an LMS', async () => {
    // jsdom gives an empty query string, which IS the no-session case: someone always
    // opens the URL directly, and this screen is what they get. Asserts only that branch
    // deliberately - later tasks replace the placeholder that follows it, and a test
    // pinned to the placeholder would have to be rewritten three times.
    await TestBed.configureTestingModule({imports: [App]}).compileComponents();

    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Launch this from the LMS');
    expect(text).toContain('session_id');
  });
});

const ID = 'b3f1c9e2-4a17-4c0e-9f31-8a2d5e77b101';

describe('App submit failure', () => {
  // The component reads the launch url once, at construction, so the query string has to
  // be in place first - and put back afterwards, or the no-session spec above would see
  // a session id and fail depending on execution order.
  afterEach(() => history.replaceState({}, '', '/'));

  it('keeps the learner answers when the LMS rejects the send', async () => {
    history.replaceState({}, '', `/?session_id=${ID}`);

    const api = {
      config: async () => ({mode: 'mock' as const}),
      checklist: async () => ({
        title: 'Demo', items: [{id: 'c1', group: 'G', text: 'Item', weight: 1}]
      }),
      session: async () => ({
        session_id: ID,
        user: {id: 482, name: 'Ivan Petrenko', login: 'i.petrenko', lang: 'uk'},
        resource_id: 512, task_id: 9137, attempt_number: 1, attempts_limit: 3,
        threshold: 80, status: 'started', mark: null,
        started_at: '2026-09-15T09:14:02Z', expires_at: null
      }),
      submit: async () => {
        throw {status: 410, key: 'session_expired', message: 'Task deadline has passed'};
      }
    };

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [{provide: DemoApi, useValue: api}]
    }).compileComponents();

    const store = TestBed.inject(SessionStore);
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const app = fixture.componentInstance as any;
    app.openChecklist();
    store.saveProgress(ID, {c1: 'yes'}, {c1: 'looked fine'});

    await app.submit();

    // The failure genuinely happened - without this the test could pass on a submit that
    // never ran at all.
    expect(app.submitError()).toMatchObject({key: 'session_expired'});

    const session = store.get(ID)!;
    expect(session.answers['c1']).toBe('yes');
    expect(session.comments['c1']).toBe('looked fine');
    expect(session.status).toBe('in-progress');
  });
});
