import { type Locator, type Page } from '@playwright/test';
import { type Wallet } from 'setup/types';
import { pino } from 'pino';

const logger = pino({
  transport: {
    target: 'pino-pretty',
  },
});

export class LaceSetupPage {
  readonly page: Page;
  readonly restoreButton: Locator;
  readonly confirmRestoreButton: Locator;
  readonly acceptTermsCheckbox: Locator;
  readonly nextButton: Locator;
  readonly walletNameInput: Locator;
  readonly walletPasswordInput: Locator;
  readonly walletConfirmPasswordInput: Locator;
  readonly nodeAddressInput: Locator;
  readonly pubsubAddressInput: Locator;
  readonly proofServerAddressInput: Locator;

  constructor(page: Page) {
    this.page = page;
    this.restoreButton = page.getByTestId('restore-wallet-button');
    this.confirmRestoreButton = page.getByTestId('delete-address-modal-confirm');
    this.acceptTermsCheckbox = page.getByTestId('wallet-setup-legal-terms-checkbox');
    this.nextButton = page.getByTestId('wallet-setup-step-btn-next');
    this.walletNameInput = page.getByTestId('wallet-setup-register-name-input');
    this.walletPasswordInput = page.getByTestId('wallet-setup-password-step-password');
    this.walletConfirmPasswordInput = page.getByTestId('wallet-setup-password-step-confirm-password');
    this.nodeAddressInput = page.getByTestId('midnight-wallet-address-input');
    this.pubsubAddressInput = page.getByTestId('pubsub-indexer-address-input');
    this.proofServerAddressInput = page.getByTestId('proving-server-address-input');
  }

  async restoreWallet(wallet: Wallet, nodeAddress: string, pubsubAddress: string, proofServerAddress: string): Promise<void> {
    logger.info('Restoring wallet');

    await this.restoreButton.click();
    await this.confirmRestoreButton.click();
    await this.acceptTermsCheckbox.check();
    await this.nextButton.click();

    await this.walletNameInput.fill(wallet.name);
    await this.nextButton.click();

    await this.walletPasswordInput.fill(wallet.password);
    await this.walletConfirmPasswordInput.fill(wallet.password);
    await this.nextButton.click();

    // Clear addresses
    await this.nodeAddressInput.clear();
    await this.pubsubAddressInput.clear();
    await this.proofServerAddressInput.clear();

    // Paste appropriate addresses
    await this.nodeAddressInput.fill(nodeAddress);
    await this.pubsubAddressInput.fill(pubsubAddress);
    await this.proofServerAddressInput.fill(proofServerAddress);

    await this.nextButton.click();

    await this.fillMnemonics(wallet.mnemonics);
    await this.nextButton.click();
  }

  async fillMnemonics(mnemonic: string[]): Promise<void> {
    logger.info('Fill in mnemonics');

    const offset = [0, 8, 16];
    for (let k = 0; k < 3; k++) {
      const locators = this.page.getByTestId('mnemonic-word-input');
      let inputs = await Promise.all(await locators.all());
      if (inputs.length === 0) {
        await this.page.waitForTimeout(1000);
        inputs = await Promise.all(await locators.all());
      }
      for (let i = 0; i < 8; i++) {
        const input = inputs[i];
        await input.fill(mnemonic[i + offset[k]], { timeout: 5000 });
      }
      await this.nextButton.click();
    }
  }
}
