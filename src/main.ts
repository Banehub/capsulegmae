import './style.css';
import { MultiplayerGame } from './game/MultiplayerGame.ts';
import { LoadingScreen, LOGO_URL, MENU_BG_URL } from './ui/LoadingScreen.ts';

async function main(): Promise<void> {
  const container = document.querySelector<HTMLDivElement>('#app')!;

  const loading = new LoadingScreen();
  loading.show();

  await loading.preloadImages([MENU_BG_URL, LOGO_URL]);

  loading.setProgress(0.6);
  const game = new MultiplayerGame();

  loading.setProgress(0.75);
  await game.init(container);

  await loading.finish();
}

main();
