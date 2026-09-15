import {TestBed} from '@angular/core/testing';
import {App} from './app';
import {DemoApi} from './core/api';
import {SessionStore} from './core/session-store';
import {ApiError} from './core/types';

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

describe('App error screen', () => {
  // Same reason as the block above: the launch url is read once, at construction.
  afterEach(() => history.replaceState({}, '', '/'));

  const apiFailingContextFetch = (error: ApiError) => ({
    config: async () => ({mode: 'mock' as const}),
    checklist: async () => ({title: 'Demo', items: []}),
    session: async () => {
      throw error;
    },
    submit: async () => {
      throw new Error('not exercised by this spec');
    }
  });

  async function renderWithError(error: ApiError) {
    history.replaceState({}, '', `/?session_id=${ID}`);
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [{provide: DemoApi, useValue: apiFailingContextFetch(error)}]
    }).compileComponents();

    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    return fixture;
  }

  it('does not call a reached-and-answered failure "could not be reached"', async () => {
    // The LMS was reached and answered 403 — this must read as a rejection, not a network
    // problem. A spec that still passed with the old hardcoded heading would be worthless,
    // so this fails outright if that heading text comes back.
    const fixture = await renderWithError({
      status: 403, key: 'forbidden', message: 'Permission denied'
    });

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('could not be reached');
    expect(text).toContain('The LMS rejected this session');
    expect(text).toContain('forbidden');
    expect(text).toContain('Permission denied');
  });

  it('reserves "could not be reached" for a genuine transport failure', async () => {
    const fixture = await renderWithError({
      status: 502, key: 'lms_unreachable', message: 'Could not reach the LMS'
    });

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('The LMS could not be reached');
  });

  it('also calls it unreachable when the demo server itself cannot be reached', async () => {
    const fixture = await renderWithError({
      status: 0, key: 'demo_unreachable', message: 'Could not reach the demo server'
    });

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('The LMS could not be reached');
  });

  it('renders per-field messages on the error screen when the LMS returns them', async () => {
    const fixture = await renderWithError({
      status: 400, key: 'validation_error', message: 'The LMS rejected the payload',
      fields: {mark: '"mark" must be less than or equal to 100'}
    });

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('mark');
    expect(text).toContain('must be less than or equal to 100');
  });
});
