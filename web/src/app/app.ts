import {Component, signal} from '@angular/core';
import {readLaunch} from './core/launch';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly launch = signal(readLaunch(window.location.search));
}
