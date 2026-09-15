import {Component, OnInit, computed, input, output, signal} from '@angular/core';
import {Checklist, ChecklistValue, StoredSession} from '../core/types';

interface Group {
  name: string;
  items: Checklist['items'];
}

@Component({
  selector: 'app-checklist-form',
  template: `
    <section class="card">
      <h2>{{ checklist().title }}</h2>
      <p class="muted">
        Every criterion needs an answer. “n/a” is excluded from the mark entirely, rather
        than counted as unmet.
      </p>

      @for (group of groups(); track group.name) {
        <h3>{{ group.name }}</h3>
        @for (item of group.items; track item.id) {
          <div class="item">
            <div class="text">{{ item.text }} <span class="muted">· weight {{ item.weight }}</span></div>
            <div class="values">
              @for (value of VALUES; track value) {
                <label [class.on]="answers()[item.id] === value">
                  <input type="radio" [name]="item.id" [value]="value"
                         [checked]="answers()[item.id] === value"
                         (change)="setAnswer(item.id, value)">
                  {{ value }}
                </label>
              }
            </div>
            <input class="comment" type="text" placeholder="comment (optional)"
                   [value]="comments()[item.id] || ''"
                   (input)="setComment(item.id, $any($event.target).value)">
          </div>
        }
      }

      <p class="summary">
        {{ answeredCount() }} of {{ checklist().items.length }} answered ·
        mark so far <strong>{{ previewMark() }}%</strong>
      </p>

      <button class="primary" [disabled]="!complete() || busy()" (click)="finish.emit()">
        {{ busy() ? 'Sending…' : 'Finish and send to the LMS' }}
      </button>
    </section>
  `,
  styles: [`
    h3 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted);
         margin: 16px 0 6px; }
    .item { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px 12px;
            padding: 8px 0; border-top: 1px solid var(--border); }
    .values { display: flex; gap: 6px; }
    label { border: 1px solid var(--border); border-radius: 4px; padding: 3px 9px; cursor: pointer; }
    label.on { border-color: var(--accent); background: #eef4fc; font-weight: 600; }
    label input { position: absolute; opacity: 0; width: 0; height: 0; }
    .comment { grid-column: 1 / -1; padding: 5px 7px; border: 1px solid var(--border);
               border-radius: 4px; font: inherit; }
    .summary { margin: 14px 0 10px; }
  `]
})
export class ChecklistForm implements OnInit {
  readonly checklist = input.required<Checklist>();
  readonly session = input.required<StoredSession>();
  readonly busy = input.required<boolean>();

  readonly changed = output<{
    answers: Record<string, ChecklistValue>;
    comments: Record<string, string>;
  }>();
  readonly finish = output<void>();

  protected readonly VALUES: ChecklistValue[] = ['yes', 'no', 'na'];

  protected readonly answers = signal<Record<string, ChecklistValue>>({});
  protected readonly comments = signal<Record<string, string>>({});

  protected readonly groups = computed<Group[]>(() => {
    const groups: Group[] = [];
    for (const item of this.checklist().items) {
      // First-appearance order, the same way the LMS report renders them.
      let group = groups.find(candidate => candidate.name === item.group);
      if (!group) {
        group = {name: item.group, items: []};
        groups.push(group);
      }
      group.items.push(item);
    }
    return groups;
  });

  protected readonly answeredCount = computed(() =>
    this.checklist().items.filter(item => this.answers()[item.id]).length);

  protected readonly complete = computed(() =>
    this.answeredCount() === this.checklist().items.length);

  /**
   * The same rule the server applies, shown live. Duplicated deliberately and only for the
   * preview — the mark that is actually sent is always the server's.
   */
  protected readonly previewMark = computed(() => {
    let assessed = 0;
    let met = 0;
    for (const item of this.checklist().items) {
      const value = this.answers()[item.id];
      if (!value || value === 'na') {
        continue;
      }
      assessed += item.weight;
      if (value === 'yes') {
        met += item.weight;
      }
    }
    return assessed === 0 ? 0 : Math.round((met * 100) / assessed);
  });

  /**
   * Seeded once from the stored session, not bound to it: the form owns the answers while it
   * is open and reports changes upward, so a save round-trip cannot reset a field the
   * learner is still typing in. A required input is only readable from ngOnInit onward.
   */
  ngOnInit(): void {
    this.answers.set({...this.session().answers});
    this.comments.set({...this.session().comments});
  }

  protected setAnswer(id: string, value: ChecklistValue): void {
    this.answers.update(current => ({...current, [id]: value}));
    this.emit();
  }

  protected setComment(id: string, value: string): void {
    this.comments.update(current => ({...current, [id]: value}));
    this.emit();
  }

  private emit(): void {
    this.changed.emit({answers: this.answers(), comments: this.comments()});
  }
}
