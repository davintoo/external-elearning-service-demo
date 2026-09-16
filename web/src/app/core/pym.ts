import {Injectable} from '@angular/core';

/**
 * pym.js frames every message as `pym`, the child id, the message type and the payload,
 * joined by this delimiter. Matching it exactly is the entire compatibility requirement:
 * the LMS runs the parent half — Collaborator's `@cbr/pym`, a fork of pym.js — and a parent
 * only acts on messages addressed to the child id it minted.
 */
const DELIMITER = 'xPYMx';

/**
 * Reports our content height to the LMS page that embedded us, so the task page can size the
 * frame to fit instead of pinning it to a guess.
 *
 * Only the height goes up. pym also carries `navigateTo`, `scrollToChildPos` and
 * `parentPositionInfo`; a checklist has no use for any of them, and the parent's `width`
 * messages are redundant for a resource that lays itself out in CSS.
 */
@Injectable({providedIn: 'root'})
export class PymChild {
  private observer: ResizeObserver | null = null;
  private lastSent = -1;

  /**
   * Silent when there is nothing to talk to — no `childId` on the launch URL, or no
   * surrounding frame — so opening the simulator directly stays a first-class way to use it.
   */
  start(childId: string | null): void {
    if (!childId || window.parent === window || this.observer) {
      return;
    }

    // ResizeObserver rather than a debounced MutationObserver: it fires once per layout
    // change, after layout, and so covers every way this app changes height — switching
    // screens, revealing the finish screen's JSON, a validation card appearing, a late font
    // load, the learner resizing the window.
    this.observer = new ResizeObserver(() => this.send(childId));
    this.observer.observe(document.body);
    this.send(childId);
  }

  private send(childId: string): void {
    // `body`, not `documentElement.scrollHeight`: scrollHeight is floored at the viewport, so
    // once the parent has grown the frame the reading could never come back down, leaving
    // dead space when a short screen replaces a long one. Nothing sets a height on `html` or
    // `body`, so body's box follows its content in both directions.
    //
    // The fractional rect ceiled, not `offsetHeight`: offsetHeight is rounded to an integer,
    // so content 412.4px tall would report 412 and the frame would clip by a fraction — which
    // is enough to raise a scrollbar inside it.
    const height = Math.ceil(document.body.getBoundingClientRect().height);

    // Before the first render there is no content to report, and a height the host already
    // has tells it nothing — ResizeObserver also fires for width-only changes.
    if (height <= 0 || height === this.lastSent) {
      return;
    }

    this.lastSent = height;

    // '*' as the target origin, exactly as pym does: a resource cannot know which origin the
    // LMS serves its task page from, and a content height is not a secret.
    window.parent.postMessage(
      `pym${DELIMITER}${childId}${DELIMITER}height${DELIMITER}${height}`,
      '*'
    );
  }
}
