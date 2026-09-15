import {TestBed} from '@angular/core/testing';
import {FinishScreen} from './finish-screen';
import {SubmitResponse} from '../core/types';

const ID = 'b3f1c9e2-4a17-4c0e-9f31-8a2d5e77b101';

/** Mirrors #/$defs/ResultRequest, as api/src/payload.js#buildResultPayload actually builds it. */
const sentPayload = (mark: number) => ({
  session_id: ID,
  status: 'completed',
  mark,
  data: {
    format: 'checklist',
    // Present only in the raw payload, never in the summary <dl> - the marker that proves
    // the "What we sent" panel is the real request body, not a paraphrase of it.
    title: 'ZORK-77 Demo Checklist',
    items: [{id: 'c1', order: 1, group: 'G', text: 'Item', value: 'yes', weight: 1, score: 1}]
  }
});

/** Mirrors #/$defs/ResultResponse. */
const submission = (status: string, taskStatus: string): SubmitResponse => ({
  sent: sentPayload(status === 'fail' ? 63 : 100),
  received: {
    data: {
      session_id: ID,
      // Present only in the raw payload, never in the summary <dl> - the marker that proves
      // the "What the LMS answered" panel is the real response body, not a paraphrase of it.
      attempt_number: 5,
      status,
      mark: status === 'fail' ? 63 : 100,
      threshold: 80,
      task_status: taskStatus,
      task_mark: status === 'fail' ? 63 : 100,
      updated_at: '2026-09-15T09:20:00Z'
    }
  }
});

const render = async (response: SubmitResponse) => {
  const fixture = TestBed.createComponent(FinishScreen);
  fixture.componentRef.setInput('submission', response);
  await fixture.whenStable();
  return fixture;
};

describe('FinishScreen', () => {
  it('shows the verdict-changed note when we reported completed but the LMS stored fail', async () => {
    // The §4.2 demonstration: a completed submission at 63% against an 80% threshold comes
    // back "fail" - the LMS decided the verdict, not the external service.
    const fixture = await render(submission('fail', 'failed'));

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('completed');
    expect(text).toContain('fail');
    expect(fixture.nativeElement.querySelector('.note')).not.toBeNull();
  });

  it('has no verdict-changed note when the LMS stored finished', async () => {
    const fixture = await render(submission('finished', 'passed'));

    expect(fixture.nativeElement.querySelector('.note')).toBeNull();
  });

  it('renders the exact sent payload in the "what we sent" panel', async () => {
    const fixture = await render(submission('finished', 'passed'));

    const panels = fixture.nativeElement.querySelectorAll('pre');
    expect(panels[0].textContent).toContain('"title": "ZORK-77 Demo Checklist"');
  });

  it('renders the exact received response in the "what the LMS answered" panel', async () => {
    const fixture = await render(submission('finished', 'passed'));

    const panels = fixture.nativeElement.querySelectorAll('pre');
    expect(panels[1].textContent).toContain('"attempt_number": 5');
  });

  it('emits again when Revise and send again is activated', async () => {
    const fixture = await render(submission('finished', 'passed'));
    let emitted = false;
    fixture.componentInstance.again.subscribe(() => (emitted = true));

    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    button.click();
    await fixture.whenStable();

    expect(emitted).toBe(true);
  });
});
