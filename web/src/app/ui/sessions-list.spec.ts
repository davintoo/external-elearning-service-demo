import {TestBed} from '@angular/core/testing';
import {SessionsList} from './sessions-list';
import {StoredSession} from '../core/types';

const ID = 'b3f1c9e2-4a17-4c0e-9f31-8a2d5e77b101';

const render = async (sessions: StoredSession[], persistent: boolean) => {
  const fixture = TestBed.createComponent(SessionsList);
  fixture.componentRef.setInput('sessions', sessions);
  fixture.componentRef.setInput('currentId', ID);
  fixture.componentRef.setInput('persistent', persistent);
  fixture.componentRef.setInput('actionLabel', 'Start');
  await fixture.whenStable();

  return (fixture.nativeElement as HTMLElement).textContent ?? '';
};

describe('SessionsList', () => {
  it('says so when history will not survive a reload', async () => {
    expect(await render([], false)).toContain('Storage is unavailable');
  });

  it('stays quiet about storage when it works', async () => {
    expect(await render([], true)).not.toContain('Storage is unavailable');
  });

  it('marks which session is the current launch', async () => {
    const session: StoredSession = {
      sessionId: ID, startedAt: 'x', updatedAt: 'y', status: 'in-progress',
      answers: {}, comments: {}, lastResult: null
    };

    expect(await render([session], true)).toContain('current');
  });
});
