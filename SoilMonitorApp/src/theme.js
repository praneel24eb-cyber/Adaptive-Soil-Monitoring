// ─── Dark Theme Constants ─────────────────────────────────────────────
// Central design system for the Soil Monitor mobile app.

export const COLORS = {
  // Backgrounds
  bg:         '#0d1117',
  card:       '#161b22',
  cardBorder: '#30363d',
  surface:    '#21262d',

  // Text
  textPrimary:   '#e6edf3',
  textSecondary: '#8b949e',
  textMuted:     '#484f58',

  // Accent
  accent:     '#58a6ff',

  // Fertility class colors
  nutrientRich: '#00ff88',
  moderate:     '#ffb703',
  depleted:     '#ef233c',

  // Sensor-specific
  nitrogen:   '#4fc3f7',
  phosphorus: '#ab47bc',
  potassium:  '#ff7043',
  moisture:   '#29b6f6',
  temperature:'#ef5350',

  // Status
  connected:    '#3fb950',
  disconnected: '#f85149',

  // CUSUM
  cusumLine:  '#f0883e',
  cusumThreshold: '#f85149',
};

export const FONTS = {
  regular: 'System',
  bold:    'System',
};

export const SIZES = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 18,
  xl: 24,
  xxl: 32,
  title: 40,
  radius: 12,
  cardPadding: 16,
};

// Helper to get fertility class color
export const getClassColor = (className) => {
  if (!className) return COLORS.textMuted;
  const lower = className.toLowerCase().replace(/[-_\s]/g, '');
  if (lower.includes('nutrient') || lower.includes('rich'))    return COLORS.nutrientRich;
  if (lower.includes('moderate'))                               return COLORS.moderate;
  if (lower.includes('deplete') || lower.includes('low'))       return COLORS.depleted;
  return COLORS.textSecondary;
};
