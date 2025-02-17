import type { Locator, Page } from '@playwright/test';

export class ParticipantPage {
  readonly page: Page;
  readonly spinner: Locator;
  readonly title: Locator;
  readonly subTitle: Locator;
  readonly participantInput: Locator;
  readonly checkInButton: Locator;
  readonly confirmYesButton: Locator;
  readonly failedAssert: Locator;

  constructor(page: Page) {
    this.page = page;
    this.spinner = page.getByTestId('backdrop-loader-spinner');
    this.title = page.getByTestId('check-in-page-title');
    this.subTitle = page.getByTestId('check-in-title');
    this.participantInput = page.locator('#participantId');
    this.checkInButton = page.getByTestId('check-in-button');
    this.confirmYesButton = page.getByTestId('alert-dialog-accept-button');
    this.failedAssert = page.locator('.MuiAlert-message');
  }

  async performCheckIn(participant: string): Promise<void> {
    await this.participantInput.fill(participant);
    await this.checkInButton.click();
    await this.confirmYesButton.click();
  }
}
