import type { Locator, Page } from '@playwright/test';

export class ConnectorPage {
  readonly page: Page;
  readonly authorizeButton: Locator;
  readonly alwaysButton: Locator;
  readonly signTxButton: Locator;

  constructor(page: Page) {
    this.authorizeButton = page.getByTestId('connect-authorize-button');
    this.alwaysButton = page.getByTestId('connect-modal-accept-always');
    this.signTxButton = page.getByTestId('allow-dapp');
  }

  async authorizeAlways(): Promise<void> {
    await this.authorizeButton.click();
    await this.alwaysButton.click();
  }
}
