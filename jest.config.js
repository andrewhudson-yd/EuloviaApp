/**
 * Two projects:
 *  - app: unit tests of the app's logic, with the Expo preset;
 *  - server: runs that same logic against a real server (skipped unless COMPANION_TEST_SERVER is set).
 *    It needs Node's real fetch, which the Expo preset replaces, so it uses a plain Babel transform.
 */
const babelPresetExpo = require.resolve('babel-preset-expo', { paths: [require.resolve('expo')] });

module.exports = {
    projects: [
        { displayName: 'app', preset: 'jest-expo', testEnvironment: 'node', testMatch: ['<rootDir>/src/**/*.test.ts'] },
        {
            displayName: 'server',
            testEnvironment: 'node',
            testMatch: ['<rootDir>/tests/server/**/*.test.ts'],
            transform: { '\\.[jt]sx?$': ['babel-jest', { presets: [babelPresetExpo] }] },
        },
    ],
};
