# pym.js interaction with the LMS

**Date:** 2026-09-16
**Status:** approved, not yet implemented

## The problem

The LMS embeds a URL-type resource in an iframe it has already sized. Our simulator changes
height on every screen it shows — the sessions list, the checklist, the finish screen with its
two JSON dumps — and the mock LMS host page pins the frame at `height: 720px`. So today the
demo is wrong in both directions at once: the finish screen is clipped and scrolls inside the
frame, while the one-line loading state leaves 700px of empty box.

An external resource cannot fix this from inside. Only the host can resize the frame, so the
two have to talk. Collaborator's LMS speaks pym.js, a postMessage protocol where the child
reports its content height and the parent applies it.

## The protocol

Confirmed by reading `pym.js@1.3.2`, the upstream that Collaborator's `@cbr/pym` forks.

```
pym xPYMx <childId> xPYMx <messageType> xPYMx <message>
```

Sent as a single string via `postMessage(…, '*')` to `window.parent`. The child learns its
`childId` from its own query string; the parent appends `childId` (and, unconfigured,
`initialWidth`, `parentTitle` and `parentUrl`) to the iframe `src`. The child sends `height`;
the parent sets the iframe's height. The parent sends `width` on resize, which a child that
lays out in CSS can ignore.

`@cbr/pym` itself is not installable — 404 on npm and on GitHub — so nothing in this repo may
depend on it.

## Decisions

**Vendor a minimal typed child rather than take a dependency.** `npm install` has to keep
working for anyone who clones this repo; that is a stated virtue of the demo, not an
accident. The public `pym.js` would also cost us a UMD global with no types, an `autoInit`
that scans the DOM on load, and a `body.offsetHeight` poller we would have to bypass anyway.
Forty-five typed lines that spell the protocol out are worth more to an integrator than an
opaque dependency, and they stay wire-compatible with the real `@cbr/pym` parent.

**The mock LMS sends `childId` and nothing else.** Unconfigured pym also appends
`parentTitle` and `parentUrl`, which here would hand the vendor the task name
("Pump start-up procedure") and the learner's position in the course, in a query string that
lands in every access log along the way. That contradicts the README's central claim — one
opaque `session_id` is all that crosses — so the demo suppresses them, as `optionalparams:
false` does upstream, and says why. The child ignores unknown parameters regardless, so it
still works against an LMS that does send them.

`initialWidth` is omitted too, for a duller reason: the server cannot measure the container,
and our child never reads width. Sending it would mean assigning `iframe.src` from script and
moving the launch URL out of the server-rendered markup that three tests assert against.

## Design

### Ownership

| Layer | Role |
|---|---|
| `web/src/app/core/launch.ts` | extended — already owns what the host put on our URL; `childId` is one more launch parameter |
| `web/src/app/core/pym.ts` | new — owns the wire protocol and height reporting |
| `web/src/app/app.ts` | starts the reporter, alongside the existing `void this.load()` |
| `api/src/demo-lms.js` | the parent half — mints the child id, puts it on the iframe src, resizes on `height` |

`launch.ts` is extended rather than joined by a second URL parser: reading the launch query
string is one concern and it already owns it. `pym.ts` then owns only the protocol, taking
the id as an argument, which is what makes it testable without a fake `location`.

### Child

`childId` is validated against `/^[\w-]{1,64}$/`, not merely read. It is interpolated into the
message string, so a host sending `childId=a xPYMx height xPYMx 99999` could otherwise forge
message boundaries — the same instinct as the existing `force` escaping tests.

Height is `Math.ceil(document.body.getBoundingClientRect().height)`, observed with a
`ResizeObserver` on `document.body`, deduplicated against the last value sent, and reported
once on start.

Four measurement decisions, each avoiding a real bug:

- **`body`, not `documentElement.scrollHeight`.** `scrollHeight` has a viewport floor, so once
  the parent grows the frame the reading can never come back down — a one-way ratchet that
  would leave whitespace when the finish screen replaces a long checklist. `styles.css` sets
  no `height` on `html` or `body`, so body's box is content-driven and tracks both directions.
- **`getBoundingClientRect().height` ceiled, not `offsetHeight`.** `offsetHeight` is rounded
  to an integer, so content 412.4px tall reports 412 and the frame clips by a fraction —
  enough for a scrollbar to appear inside it. Ceiling the fractional rect is exact in the
  direction that matters.
- **No padding constant.** `body` has `padding: 16px` and `margin: 0`, and padding blocks
  margin-collapse, so the measured box already covers the last card's `margin-bottom`. A fudge
  factor would only add dead space.
- **`ResizeObserver`, not `MutationObserver` plus a debounce.** It fires once per layout
  change, after layout, and covers every case this app has: screen switches, the finish
  screen's JSON, a validation card appearing, font load, window resize. Dedupe is needed
  because it also fires on width-only changes.

The reporter no-ops when there is no `childId`, or when `window.parent === window`, so
opening `/?session_id=…` directly is unaffected.

`postMessage` targets `'*'`, as pym does: the child cannot know the LMS origin, and a content
height is not a secret.

### Parent

The child id is the constant `cbr-external-0`, not a per-render value. An existing test
asserts that two loads of the same URL are byte-identical, and a random id would break it for
nothing.

```js
if (event.source !== iframe.contentWindow) return;   // the only sender we trust
```

That is the line that matters. Any page in any tab can `postMessage` to this window; without
the check, any of them can resize the LMS frame. Identifying the exact frame is stronger than
an origin allowlist. Non-string data, unparseable numbers and non-positive heights are
dropped, and the height is clamped to 20000px, so a buggy or compromised resource cannot push
an absurd layout onto the LMS page.

CSS keeps `height: 720px` as the no-script fallback; script sets an inline height on the
first message. Nothing regresses for a child that never speaks pym. The inline script
interpolates only the literal child id — no query-derived values — so it does not reopen the
injection surface the existing tests guard.

## Tests

`api/test/demo-lms.test.js` (node:test):

- the existing iframe-src assertion, updated for `childId`
- the launch URL carries `childId`
- the page sends neither `parentTitle` nor `parentUrl` — the privacy decision, locked down
- byte-identical reloads (existing) already pin the child id to a constant

`web/src/app/core/pym.spec.ts` (vitest) — jsdom has no `ResizeObserver`, so the spec installs
a fake, in the style `test-setup.ts` already uses for `Storage`:

- posts a well-formed `height` message
- no-ops with no `childId`
- no-ops when not framed
- does not repost an unchanged height

`web/src/app/core/launch.spec.ts`:

- reads `childId`
- rejects a `childId` carrying the delimiter

## Documentation

README gains pym in *The flow it demonstrates*, immediately after the launch step, plus a
short note on what the host sends and what it deliberately withholds.

## Non-goals

`navigateTo`, `scrollToChildPos` and `parentPositionInfo` are pym messages this resource has
no use for. Width handling stays in CSS. No polling fallback: `ResizeObserver` has been
available in every browser since 2020.
