import {TestBed} from '@angular/core/testing';
import {App} from './app';

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
