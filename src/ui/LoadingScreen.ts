import menuBgUrl from '../assets/menu-bg.png';
import logoUrl from '../assets/logo.png';

const TIPS = [
  'Keep moving, aim for the head, and never stop shooting!',
  'Use obstacles for cover while you reload your nerves.',
  'Sprint with Shift to flank enemies from the side.',
  'Last player standing wins - patience beats panic.',
  'Jump with Space to dodge incoming fire.',
];

export const MENU_BG_URL = menuBgUrl;
export const LOGO_URL = logoUrl;

export class LoadingScreen {
  private root: HTMLElement;
  private barFill: HTMLElement;
  private tipTextEl: HTMLElement;
  private progress = 0;
  private shownAt = 0;

  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'loading';
    this.root.style.backgroundImage = `url(${menuBgUrl})`;
    this.root.innerHTML = `
      <img class="lobby-logo" src="${logoUrl}" alt="Last Player Standing" />
      <div class="loading-fade"></div>
      <div class="loading-content">
        <div class="loading-label">LOADING...</div>
        <div class="loading-bar-track">
          <div class="loading-bar-fill" id="loading-bar-fill"></div>
        </div>
        <div class="loading-tips">
          <div class="loading-tips-icon"></div>
          <div class="loading-tips-body">
            <div class="loading-tips-title">TIPS</div>
            <div class="loading-tips-text" id="loading-tips-text"></div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(this.root);

    this.barFill = this.root.querySelector('#loading-bar-fill')!;
    this.tipTextEl = this.root.querySelector('#loading-tips-text')!;
    this.tipTextEl.textContent = TIPS[Math.floor(Math.random() * TIPS.length)]!;
  }

  show(): void {
    this.shownAt = performance.now();
    this.root.classList.remove('hidden');
    this.setProgress(0.05);
  }

  setProgress(value: number): void {
    this.progress = Math.max(this.progress, Math.min(1, value));
    this.barFill.style.width = `${this.progress * 100}%`;
  }

  async preloadImages(urls: string[]): Promise<void> {
    let loaded = 0;
    await Promise.all(
      urls.map(
        (url) =>
          new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => {
              loaded += 1;
              this.setProgress(0.1 + (loaded / urls.length) * 0.4);
              resolve();
            };
            img.onerror = () => {
              loaded += 1;
              resolve();
            };
            img.src = url;
          }),
      ),
    );
  }

  async finish(minDurationMs = 1400): Promise<void> {
    this.setProgress(1);
    const elapsed = performance.now() - this.shownAt;
    if (elapsed < minDurationMs) {
      await delay(minDurationMs - elapsed);
    }
    this.root.classList.add('fade-out');
    await delay(500);
    this.root.classList.add('hidden');
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
