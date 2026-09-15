import {Component, computed, input, output} from '@angular/core';
import {SubmitResponse} from '../core/types';

@Component({
  selector: 'app-finish-screen',
  template: `
    <section class="card">
      <h1>Result sent</h1>

      <dl>
        <dt>Session status</dt><dd><strong>{{ result().status }}</strong></dd>
        <dt>Mark</dt><dd>{{ result().mark }}%</dd>
        <dt>Pass mark</dt><dd>{{ result().threshold }}%</dd>
        <dt>Task status</dt><dd>{{ result().task_status }}</dd>
        <dt>Task mark</dt><dd>{{ result().task_mark }}%</dd>
        <dt>Stored at</dt><dd>{{ result().updated_at }}</dd>
      </dl>

      @if (verdictChanged()) {
        <p class="note">
          We reported <code>completed</code>; the LMS stored
          <code>{{ result().status }}</code>. The task threshold decides the verdict, not the
          external service — which is why the service should never send
          <code>passed</code> or <code>failed</code> itself.
        </p>
      }

      <details>
        <summary>What we sent</summary>
        <pre>{{ sentJson() }}</pre>
      </details>
      <details>
        <summary>What the LMS answered</summary>
        <pre>{{ receivedJson() }}</pre>
      </details>

      <p><button (click)="again.emit()">Revise and send again</button></p>
      <p class="muted">
        The session id is the idempotency key, so a second send updates this same attempt.
        The LMS logs every change of status or mark.
      </p>
    </section>
  `,
  styles: [`
    dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; margin: 0 0 14px; }
    dt { color: var(--muted); }
    dd { margin: 0; }
    .note { border-left: 3px solid var(--accent); padding-left: 10px; }
    details { margin: 8px 0; }
    summary { cursor: pointer; }
    pre { background: #16181d; color: #e6e8eb; padding: 12px; border-radius: 5px;
          overflow-x: auto; font-size: 12px; }
  `]
})
export class FinishScreen {
  readonly submission = input.required<SubmitResponse>();
  readonly again = output<void>();

  protected readonly result = computed(() => this.submission().received.data);

  /** The whole point of §4.2, made visible. */
  protected readonly verdictChanged = computed(() => this.result().status === 'fail');

  protected readonly sentJson = computed(() => JSON.stringify(this.submission().sent, null, 2));
  protected readonly receivedJson = computed(() =>
    JSON.stringify(this.submission().received, null, 2));
}
