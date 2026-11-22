// Preview builds can opt in without enabling Play Mode on the production Vault.
export const playWorkbenchEnabled = import.meta.env.DEV || import.meta.env.VAULT_PLAY_PREVIEW === true;
export const playPreviewEnabled = playWorkbenchEnabled || import.meta.env.VITE_PLAY_MODE === '1';
