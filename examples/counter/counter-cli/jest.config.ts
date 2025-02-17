import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  verbose: true,
  testTimeout: 120_000,
  roots: ['<rootDir>'],
  modulePaths: ['<rootDir>'],
  passWithNoTests: false,
  testMatch: ['**/*.test.ts'],
  extensionsToTreatAsEsm: ['.ts'],
  resolver: '<rootDir>/js-resolver.cjs',
  reporters: [
    'default',
    ['jest-junit', { outputDirectory: 'reports', outputName: 'report.xml' }],
    ['jest-html-reporters', { publicPath: 'reports', filename: 'report.html' }],
  ],
};

export default config;
