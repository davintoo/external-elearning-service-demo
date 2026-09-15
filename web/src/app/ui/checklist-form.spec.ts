import {TestBed} from '@angular/core/testing';
import {ChecklistForm} from './checklist-form';
import {Checklist, ChecklistValue, StoredSession} from '../core/types';

const checklist: Checklist = {
  title: 'Demo checklist',
  items: [
    {id: 'a', group: 'Structure', text: 'Has a title', weight: 1},
    {id: 'b', group: 'Structure', text: 'Has sections', weight: 3},
    {id: 'c', group: 'Content', text: 'Cites sources', weight: 2}
  ]
};

const session = (
  answers: Record<string, ChecklistValue> = {},
  comments: Record<string, string> = {}
): StoredSession => ({
  sessionId: 'b3f1c9e2-4a17-4c0e-9f31-8a2d5e77b101',
  startedAt: 'x',
  updatedAt: 'x',
  status: 'in-progress',
  answers,
  comments,
  lastResult: null
});

const render = async (
  answers: Record<string, ChecklistValue> = {},
  busy = false,
  list: Checklist = checklist
) => {
  const fixture = TestBed.createComponent(ChecklistForm);
  fixture.componentRef.setInput('checklist', list);
  fixture.componentRef.setInput('session', session(answers));
  fixture.componentRef.setInput('busy', busy);
  await fixture.whenStable();
  return fixture;
};

describe('ChecklistForm', () => {
  it('previews the mark as the weighted share of yes, not a plain count', async () => {
    // weight 1 (yes) + weight 2 (yes) met out of weight 1 + 3 + 2 = 6 assessed -> 3/6 = 50%.
    // A plain count of 2 out of 3 answered-yes items would read 67%, so this discriminates
    // a weighted computation from an unweighted one.
    const fixture = await render({a: 'yes', b: 'no', c: 'yes'});

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('50%');
  });

  it('excludes na items from both sides of the fraction, so marking one na cannot lower the mark', async () => {
    // Before: a=yes(1), b=yes(3) met, c unanswered -> assessed 4, met 4 -> 100%.
    const before = await render({a: 'yes', b: 'yes'});
    expect((before.nativeElement as HTMLElement).textContent ?? '').toContain('100%');

    // After marking c as na: c must not join assessed (would drop the mark to 4/6 = 67%)
    // nor join met, so the mark stays 100%.
    const after = await render({a: 'yes', b: 'yes', c: 'na'});
    expect((after.nativeElement as HTMLElement).textContent ?? '').toContain('100%');
  });

  it('yields 0 rather than dividing by zero when every item is na', async () => {
    const fixture = await render({a: 'na', b: 'na', c: 'na'});

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('0%');
  });

  it('keeps Finish disabled until every item has an answer, then enables it', async () => {
    const incomplete = await render({a: 'yes', b: 'yes'});
    const incompleteButton = incomplete.nativeElement.querySelector('button.primary') as HTMLButtonElement;
    expect(incompleteButton.disabled).toBe(true);

    const complete = await render({a: 'yes', b: 'yes', c: 'na'});
    const completeButton = complete.nativeElement.querySelector('button.primary') as HTMLButtonElement;
    expect(completeButton.disabled).toBe(false);
  });

  it('keeps Finish disabled while busy, even when every item is answered', async () => {
    // Complete answers alone must not be enough — busy is what prevents a double submit
    // while the first send is still in flight.
    const fixture = await render({a: 'yes', b: 'yes', c: 'na'}, true);
    const button = fixture.nativeElement.querySelector('button.primary') as HTMLButtonElement;

    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('Sending');
  });

  it('emits the current answers on the changed output when one is set', async () => {
    const fixture = await render({a: 'yes'});
    let emitted: {answers: Record<string, ChecklistValue>; comments: Record<string, string>} | undefined;
    fixture.componentInstance.changed.subscribe(event => (emitted = event));

    const radios = fixture.nativeElement.querySelectorAll('input[type="radio"][name="b"]');
    const noRadio = Array.from(radios).find(
      radio => (radio as HTMLInputElement).value === 'no'
    ) as HTMLInputElement;
    noRadio.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    expect(emitted).toBeDefined();
    expect(emitted!.answers).toEqual({a: 'yes', b: 'no'});
  });
});
