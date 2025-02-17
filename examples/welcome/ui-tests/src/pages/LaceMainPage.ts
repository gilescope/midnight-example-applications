import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export class LaceMainPage {
  readonly page: Page;
  readonly menuButton: Locator;
  readonly walletStatus: Locator;

  constructor(page: Page) {
    this.page = page;
    this.menuButton = page.getByTestId('header-menu-button');
    this.walletStatus = page.locator('[data-testid="header-menu"] [data-testid="header-wallet-status"]');
  }

  async waitForSync(): Promise<void> {
    await this.menuButton.click();
    await expect(this.walletStatus).toHaveText('Synced', {
      timeout: 300000,
    });
  }
}
