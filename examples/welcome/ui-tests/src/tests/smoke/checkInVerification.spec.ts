import test, { expect } from '@playwright/test';
import { getConfig } from 'setup/envConfig';
import { runProofServer } from 'setup/dockerSetup';
import { Constants } from 'setup/Constants';
import bootstrap from 'setup/bootstrapExtension';
import { LaceSetupPage } from 'pages/LaceSetupPage';
import { LaceMainPage } from 'pages/LaceMainPage';
import { testWallet } from 'setup/walletConfig';
import { ConnectorPage } from 'pages/ConnectorPage';
import { ParticipantPage } from 'pages/ParticipantPage';
import { pino } from 'pino';

const logger = pino({
  transport: {
    target: 'pino-pretty',
  },
});

test.describe('Welcome dApp. Smoke Test.', () => {
  test.beforeAll(async () => {
    /* eslint-disable @typescript-eslint/strict-boolean-expressions */
    if (process.env.CI) {
      logger.info('Starting proof server ...');
      await runProofServer();
    }
  });

  test('Check-in Verification', async ({ page }) => {
    test.setTimeout(600000);
    const PARTICIPANT_URL = getConfig().participantUrl;
    const ADDED_PARTICIPANT = getConfig().addedParticipant;

    const NODE_ADDRESS = getConfig().nodeAddress;
    const PUBSUB_ADDRESS = getConfig().indexerAddress;
    const PROOF_SERVER_ADDRESS = getConfig().proofServerAddress;

    const context1 = await bootstrap(Constants.INITIAL_EXTENSION_URL);
    const page1 = context1.extPage;
    const browserContext = context1.context;

    const laceSetupPage1 = new LaceSetupPage(page1);
    const laceMainPage1 = new LaceMainPage(page1);
    const participantPage = new ParticipantPage(page1);

    await laceSetupPage1.restoreWallet(testWallet, NODE_ADDRESS, PUBSUB_ADDRESS, PROOF_SERVER_ADDRESS);
    await page1.waitForTimeout(5000);
    await laceMainPage1.waitForSync();

    await test.step('Not added participant is not able to check-in', async () => {
      logger.info('Trying to check in with not existing participant');
      await page1.goto(PARTICIPANT_URL);

      // Connector
      const pagePromise = await browserContext.waitForEvent('page');
      const connectorPage = new ConnectorPage(pagePromise);
      await connectorPage.authorizeAlways();

      await participantPage.performCheckIn('notExistingUser');
      await expect(participantPage.spinner).not.toBeVisible({ timeout: 120000 });
      await expect(participantPage.failedAssert).toHaveText('failed assert: Not eligible participant');
      await expect(participantPage.participantInput).toBeVisible();
      await expect(participantPage.checkInButton).toBeVisible();
    });

    await test.step('Added participant is able to check-in', async () => {
      logger.info('Trying to check in with existing participant');
      await participantPage.participantInput.clear();
      await participantPage.performCheckIn(ADDED_PARTICIPANT);

      // Connector
      const pagePromise = await browserContext.waitForEvent('page');
      const connectorPage = new ConnectorPage(pagePromise);
      await connectorPage.signTxButton.click();

      await expect(participantPage.spinner).not.toBeVisible({ timeout: 120000 });
      await expect(participantPage.participantInput).not.toBeVisible({ timeout: 120000 });
      await expect(participantPage.title).toHaveText(`Welcome ${ADDED_PARTICIPANT}.`);
      await expect(participantPage.subTitle).toHaveText("You're checked in. Have fun.");

      await expect(participantPage.participantInput).not.toBeVisible();
      await expect(participantPage.checkInButton).not.toBeVisible();
    });
  });
});
