// ─── SoilHealthScore ──────────────────────────────────────────────────────
// Composite 0-100 soil health score computed from N, P, K, moisture & temp.
// Rendered as an SVG arc gauge with a letter grade and colour-coded fill.

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { COLORS, SIZES } from '../theme';

// ── Ideal ranges (agronomic defaults) ─────────────────────────────────────
const IDEALS = {
  N:        { min: 200,  max: 600  },   // mg/kg
  P:        { min: 100,  max: 400  },
  K:        { min: 150,  max: 500  },
  moisture: { min: 30,   max: 70   },   // %
  temp:     { min: 15,   max: 30   },   // °C
};

/** Return 0-100 score for a single sensor reading vs its ideal window */
function scoreComponent(value, { min, max }) {
  if (value === null || value === undefined || isNaN(value)) return 50; // neutral
  if (value >= min && value <= max) return 100;
  const midpoint = (min + max) / 2;
  const halfWidth = (max - min) / 2;
  const distance = Math.abs(value - midpoint) - halfWidth;
  // Penalise up to 100 points across half the ideal window's width
  const penalty = Math.min(100, (distance / (halfWidth || 1)) * 100);
  return Math.max(0, 100 - penalty);
}

/** Weighted average of all component scores → 0-100 */
export function computeHealthScore(reading) {
  if (!reading) return null;
  const weights = { N: 0.25, P: 0.20, K: 0.20, moisture: 0.25, temp: 0.10 };
  let totalWeight = 0;
  let weightedSum = 0;
  for (const [key, w] of Object.entries(weights)) {
    if (reading[key] !== undefined && reading[key] !== null) {
      weightedSum += scoreComponent(Number(reading[key]), IDEALS[key]) * w;
      totalWeight += w;
    }
  }
  return totalWeight === 0 ? null : Math.round(weightedSum / totalWeight);
}

/** Map score → letter grade + colour */
function gradeInfo(score) {
  if (score === null) return { grade: '?',  color: COLORS.textMuted,  label: 'No data'   };
  if (score >= 85)    return { grade: 'A',  color: COLORS.nutrientRich, label: 'Excellent' };
  if (score >= 70)    return { grade: 'B',  color: '#7ee787',           label: 'Good'      };
  if (score >= 55)    return { grade: 'C',  color: COLORS.moderate,     label: 'Fair'      };
  if (score >= 40)    return { grade: 'D',  color: '#fb8500',           label: 'Poor'      };
  return               { grade: 'F',  color: COLORS.depleted,   label: 'Critical'  };
}

// ── SVG arc helpers ────────────────────────────────────────────────────────
const R  = 52;   // radius of the arc
const CX = 70;   // centre x
const CY = 70;   // centre y
const START_ANGLE = 210; // degrees (7 o'clock)
const TOTAL_SWEEP = 300; // degrees

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx, cy, r, startAngle, endAngle) {
  const s = polarToCartesian(cx, cy, r, startAngle);
  const e = polarToCartesian(cx, cy, r, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${largeArc} 1 ${e.x} ${e.y}`;
}

// ── Component ──────────────────────────────────────────────────────────────
const SoilHealthScore = ({ reading }) => {
  const score = computeHealthScore(reading);
  const { grade, color, label } = gradeInfo(score);

  const animVal = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animVal, {
      toValue: score ?? 0,
      duration: 900,
      useNativeDriver: false,
    }).start();
  }, [score]);

  const bgPath  = describeArc(CX, CY, R, START_ANGLE, START_ANGLE + TOTAL_SWEEP);
  const fillEnd = START_ANGLE + ((score ?? 0) / 100) * TOTAL_SWEEP;
  const fillPath = score !== null && score > 0
    ? describeArc(CX, CY, R, START_ANGLE, fillEnd)
    : null;

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <Text style={styles.sectionLabel}>🌿 Soil Health Score</Text>
        <Text style={[styles.gradeLabel, { color }]}>{label}</Text>
      </View>

      <View style={styles.gaugeRow}>
        {/* Arc gauge */}
        <Svg width={140} height={130} style={styles.svg}>
          {/* Background track */}
          <Path
            d={bgPath}
            fill="none"
            stroke={COLORS.surface}
            strokeWidth={10}
            strokeLinecap="round"
          />
          {/* Filled arc */}
          {fillPath && (
            <Path
              d={fillPath}
              fill="none"
              stroke={color}
              strokeWidth={10}
              strokeLinecap="round"
            />
          )}
        </Svg>

        {/* Centred score + grade */}
        <View style={styles.scoreOverlay}>
          <Text style={[styles.scoreNumber, { color }]}>
            {score !== null ? score : '—'}
          </Text>
          <Text style={styles.scoreUnit}>/100</Text>
          <View style={[styles.gradePill, { backgroundColor: color + '20', borderColor: color }]}>
            <Text style={[styles.gradeText, { color }]}>Grade {grade}</Text>
          </View>
        </View>

        {/* Component breakdown */}
        <View style={styles.breakdown}>
          {[
            { key: 'N',        label: 'N',    color: COLORS.nitrogen    },
            { key: 'P',        label: 'P',    color: COLORS.phosphorus  },
            { key: 'K',        label: 'K',    color: COLORS.potassium   },
            { key: 'moisture', label: '💧',   color: COLORS.moisture    },
            { key: 'temp',     label: '🌡',   color: COLORS.temperature },
          ].map(({ key, label: lbl, color: c }) => {
            const s = reading ? Math.round(scoreComponent(Number(reading[key]), IDEALS[key])) : null;
            return (
              <View key={key} style={styles.breakdownItem}>
                <Text style={[styles.breakdownLabel, { color: c }]}>{lbl}</Text>
                <View style={styles.miniBarBg}>
                  <View style={[styles.miniBarFill, { width: `${s ?? 0}%`, backgroundColor: c }]} />
                </View>
                <Text style={styles.breakdownScore}>{s ?? '—'}</Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: SIZES.radius,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: SIZES.cardPadding,
    marginBottom: 12,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionLabel: {
    color: COLORS.textSecondary,
    fontSize: SIZES.sm,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontWeight: '700',
  },
  gradeLabel: {
    fontSize: SIZES.sm,
    fontWeight: '700',
  },
  gaugeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  svg: {
    flexShrink: 0,
  },
  scoreOverlay: {
    position: 'absolute',
    left: 0,
    width: 140,
    top: 28,
    alignItems: 'center',
  },
  scoreNumber: {
    fontSize: 32,
    fontWeight: '900',
    lineHeight: 36,
  },
  scoreUnit: {
    color: COLORS.textMuted,
    fontSize: SIZES.xs,
    marginTop: 1,
  },
  gradePill: {
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  gradeText: {
    fontSize: SIZES.xs,
    fontWeight: '700',
  },
  breakdown: {
    flex: 1,
    gap: 6,
    marginLeft: 4,
  },
  breakdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  breakdownLabel: {
    fontSize: SIZES.xs,
    fontWeight: '700',
    width: 18,
    textAlign: 'center',
  },
  miniBarBg: {
    flex: 1,
    height: 5,
    backgroundColor: COLORS.surface,
    borderRadius: 3,
    overflow: 'hidden',
  },
  miniBarFill: {
    height: 5,
    borderRadius: 3,
  },
  breakdownScore: {
    color: COLORS.textMuted,
    fontSize: SIZES.xs,
    width: 20,
    textAlign: 'right',
  },
});

export default SoilHealthScore;
