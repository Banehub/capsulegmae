import logoUrl from '../assets/logo.png';

export class MatchUI {
  private logoEl: HTMLImageElement;
  private healthWrap: HTMLElement;
  private healthFill: HTMLElement;
  private healthText: HTMLElement;
  private statusEl: HTMLElement;
  private spectatorEl: HTMLElement;

  constructor() {
    this.logoEl = document.createElement('img');
    this.logoEl.id = 'ingame-logo';
    this.logoEl.src = logoUrl;
    this.logoEl.alt = 'Last Player Standing';
    document.body.appendChild(this.logoEl);

    this.healthWrap = document.createElement('div');
    this.healthWrap.id = 'health';
    this.healthWrap.innerHTML = `
      <div class="health-label">HEALTH</div>
      <div class="health-track">
        <div class="health-fill" id="health-fill"></div>
        <div class="health-value" id="health-value">20</div>
      </div>
    `;
    document.body.appendChild(this.healthWrap);
    this.healthFill = this.healthWrap.querySelector('#health-fill')!;
    this.healthText = this.healthWrap.querySelector('#health-value')!;

    this.statusEl = document.createElement('div');
    this.statusEl.id = 'match-status';
    document.body.appendChild(this.statusEl);

    this.spectatorEl = document.createElement('div');
    this.spectatorEl.id = 'spectator-hud';
    document.body.appendChild(this.spectatorEl);
  }

  setHealth(current: number, max: number): void {
    const ratio = Math.max(0, Math.min(1, current / max));
    this.healthFill.style.width = `${ratio * 100}%`;
    this.healthText.textContent = String(Math.max(0, current));

    let color = '#3ad14f';
    if (ratio <= 0.3) color = '#ff3b2f';
    else if (ratio <= 0.6) color = '#ffb02d';
    this.healthFill.style.background = color;
    this.healthFill.style.boxShadow = `0 0 12px ${color}`;
  }

  setStatus(text: string): void {
    this.statusEl.textContent = text;
  }

  setSpectatorInfo(text: string): void {
    this.spectatorEl.textContent = text;
  }

  clearSpectatorInfo(): void {
    this.spectatorEl.textContent = '';
  }

  showGameplayHud(visible: boolean): void {
    this.healthWrap.classList.toggle('hidden', !visible);
    this.logoEl.classList.toggle('hidden', !visible);
    const crosshair = document.getElementById('crosshair');
    crosshair?.classList.toggle('hidden', !visible);
  }
}
