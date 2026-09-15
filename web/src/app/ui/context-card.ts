import {Component, input} from '@angular/core';
import {SessionContext} from '../core/types';

@Component({
  selector: 'app-context-card',
  template: `
    <section class="card">
      <h2>{{ context().user.name }}</h2>
      <p class="muted">
        {{ context().user.login }} · {{ context().user.lang }} ·
        attempt {{ context().attempt_number }}@if (context().attempts_limit) { of {{ context().attempts_limit }} }
        · pass mark {{ context().threshold }}%
        @if (context().expires_at) { · due {{ context().expires_at }} }
      </p>
      <p class="muted">
        Fetched server-to-server from the LMS. The launch URL carried nothing but
        <code>{{ context().session_id }}</code>.
      </p>
    </section>
  `
})
export class ContextCard {
  readonly context = input.required<SessionContext>();
}
