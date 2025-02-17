import { fileURLToPath } from 'url';
import path, { dirname } from 'path';
import { chromium, type Page, type BrowserContext } from '@playwright/test';

export default async function bootstrap(extUrl: string): Promise<{ extPage: Page; context: BrowserContext }> {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const pathToExtension = path.join(__dirname, '../../extension/dist');
  const userDataDir = `../temp/test-user-data-${Math.random()}`;

  const persistentContext = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [`--disable-extensions-except=${pathToExtension}`, `--load-extension=${pathToExtension}`],
  });

  const extPage = await persistentContext.newPage();
  await extPage.goto(extUrl, { waitUntil: 'load' });

  return {
    extPage,
    context: persistentContext,
  };
}
