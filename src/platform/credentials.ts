import * as SecureStore from 'expo-secure-store';

/** The device token lives only in the iOS Keychain / Android Keystore. */
const SERVER = 'companion.server';
const TOKEN = 'companion.token';
const options: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

export async function loadCredentials(): Promise<{ server: string; token: string } | null> {
    const [server, token] = await Promise.all([SecureStore.getItemAsync(SERVER, options), SecureStore.getItemAsync(TOKEN, options)]);
    return server && token ? { server, token } : null;
}

export async function saveCredentials(server: string, token: string): Promise<void> {
    await SecureStore.setItemAsync(SERVER, server, options);
    await SecureStore.setItemAsync(TOKEN, token, options);
}

export async function clearCredentials(): Promise<void> {
    await SecureStore.deleteItemAsync(TOKEN, options);
}
