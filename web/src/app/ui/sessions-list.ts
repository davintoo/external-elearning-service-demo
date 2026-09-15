import {Component, input, output} from '@angular/core';
import {StoredSession} from '../core/types';

@Component({
  selector: 'app-sessions-list',
  template: `
    <section class="card">
      <h2>Sessions on this browser</h2>
      <p class="muted">
        Kept in LocalStorage. The LMS mints one session per attempt; this list is only what
        this browser has been launched with.
      </p>

      @if (!persistent()) {
        <p class="warn">
          Storage is unavailable here, so this history will not survive a reload. The current
          session still works.
        </p>
      }

      @if (sessions().length === 0) {
        <p class="muted">Nothing yet.</p>
      } @else {
        <table>
          <tbody>
            @for (session of sessions(); track session.sessionId) {
              <tr [class.current]="session.sessionId === currentId()">
                <td><code>{{ session.sessionId.slice(0, 8) }}</code></td>
                <td>{{ session.status }}</td>
                <td>
                  @if (session.lastResult) {
                    LMS: {{ session.lastResult.data.status }}
                    @if (session.lastResult.data.mark !== null) { · {{ session.lastResult.data.mark }}% }
                  } @else {
                    <span class="muted">not sent</span>
                  }
                </td>
                <td>{{ session.updatedAt }}</td>
                <td>
                  @if (session.sessionId === currentId()) { <strong>current</strong> }
                </td>
              </tr>
            }
          </tbody>
        </table>
      }

      <p>
        <button class="primary" (click)="open.emit()">{{ actionLabel() }}</button>
      </p>
    </section>
  `,
  styles: [`
    table { border-collapse: collapse; width: 100%; margin-bottom: 12px; }
    td { padding: 5px 8px; border-top: 1px solid var(--border); vertical-align: top; }
    tr.current td { background: #eef4fc; }
    .warn { color: var(--no); }
  `]
})
export class SessionsList {
  readonly sessions = input.required<StoredSession[]>();
  readonly currentId = input.required<string>();
  readonly persistent = input.required<boolean>();
  readonly actionLabel = input.required<string>();
  readonly open = output<void>();
}
