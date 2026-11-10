// Preview builds can opt in without enabling Play Mode on the production Vault.
export const playPreviewEnabled = import.meta.env.DEV || import.meta.env.VITE_PLAY_MODE === '1' || import.meta.env.VAULT_PLAY_PREVIEW === true;
