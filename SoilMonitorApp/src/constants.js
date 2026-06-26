// ─── Shared app constants ─────────────────────────────────────────────────
// Centralised place for AsyncStorage keys and other constants shared across screens.

export const STORAGE_KEY_GROQ       = '@groq_api_key';
export const STORAGE_KEY_THRESHOLDS = '@sensor_thresholds';

// Default thresholds (used when user hasn't configured custom ones)
export const DEFAULT_THRESHOLDS = {
  N_min:        100,   // mg/kg
  P_min:         50,
  K_min:         75,
  moisture_min:  20,   // %
  moisture_max:  85,
  temp_max:      40,   // °C
};
