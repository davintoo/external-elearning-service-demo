import {TestBed} from '@angular/core/testing';
import {ContextCard} from './context-card';
import {SessionContext} from '../core/types';

const context: SessionContext = {
  session_id: 'b3f1c9e2-4a17-4c0e-9f31-8a2d5e77b101',
  user: {id: 482, name: 'Ivan Petrenko', login: 'i.petrenko', lang: 'uk'},
  resource_id: 512, task_id: 9137, attempt_number: 2, attempts_limit: 3,
  threshold: 80, status: 'inprogress', mark: null,
  started_at: '2026-09-15T09:14:02Z', expires_at: null
};

describe('ContextCard', () => {
  it('shows who the learner is and what they are held to', async () => {
    const fixture = TestBed.createComponent(ContextCard);
    fixture.componentRef.setInput('context', context);
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Ivan Petrenko');
    expect(text).toContain('attempt 2');
    expect(text).toContain('80');
  });
});
