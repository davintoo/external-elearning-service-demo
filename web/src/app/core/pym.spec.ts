import {PymChild} from './pym';

const CHILD_ID = 'cbr-external-0';

/**
 * jsdom implements no ResizeObserver, so the spec installs one — in the style `test-setup.ts`
 * already uses for `Storage`. Holding the callback lets a test drive a layout change instead
 * of waiting for one that jsdom would never produce.
 */
class FakeResizeObserver {
  static callbacks: (() => void)[] = [];

  constructor(private readonly callback: () => void) {
    FakeResizeObserver.callbacks.push(callback);
  }

  observe(): void {}
  disconnect(): void {}
}

function relayout(height: number): void {
  vi.spyOn(document.body, 'getBoundingClientRect')
    .mockReturnValue({height} as DOMRect);
  for (const callback of FakeResizeObserver.callbacks) {
    callback();
  }
}

describe('PymChild', () => {
  let posted: [string, string][];

  beforeEach(() => {
    posted = [];
    FakeResizeObserver.callbacks = [];

    Object.defineProperty(globalThis, 'ResizeObserver', {
      value: FakeResizeObserver,
      configurable: true,
      writable: true
    });

    // `window.parent === window` in jsdom, which is precisely the "not embedded" case, so the
    // parent has to be replaced for the embedded ones.
    Object.defineProperty(window, 'parent', {
      value: {postMessage: (data: string, origin: string) => posted.push([data, origin])},
      configurable: true,
      writable: true
    });
  });

  it('reports the content height in pym wire format', () => {
    new PymChild().start(CHILD_ID);
    relayout(412.4);

    expect(posted).toEqual([[`pymxPYMx${CHILD_ID}xPYMxheightxPYMx413`, '*']]);
  });

  it('rounds up, so the frame never clips by a fraction of a pixel', () => {
    new PymChild().start(CHILD_ID);
    relayout(412.1);

    expect(posted[0][0]).toContain('xPYMx413');
  });

  it('reports a shrink as readily as a growth', () => {
    new PymChild().start(CHILD_ID);
    relayout(900);
    relayout(240);

    expect(posted.map(([data]) => data.split('xPYMx')[3])).toEqual(['900', '240']);
  });

  it('does not repost a height the host already has', () => {
    new PymChild().start(CHILD_ID);
    relayout(500);
    relayout(500);

    expect(posted).toHaveLength(1);
  });

  it('says nothing before there is anything laid out', () => {
    new PymChild().start(CHILD_ID);
    relayout(0);

    expect(posted).toEqual([]);
  });

  it('stays silent when the launch url carried no child id', () => {
    new PymChild().start(null);
    relayout(500);

    expect(posted).toEqual([]);
    expect(FakeResizeObserver.callbacks).toEqual([]);
  });

  it('stays silent when opened outside a frame', () => {
    Object.defineProperty(window, 'parent', {
      value: window,
      configurable: true,
      writable: true
    });

    new PymChild().start(CHILD_ID);

    expect(posted).toEqual([]);
    expect(FakeResizeObserver.callbacks).toEqual([]);
  });

  it('observes once however often it is started', () => {
    const child = new PymChild();
    child.start(CHILD_ID);
    child.start(CHILD_ID);

    expect(FakeResizeObserver.callbacks).toHaveLength(1);
  });
});
