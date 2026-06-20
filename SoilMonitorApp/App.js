// ─── App.js ───────────────────────────────────────────────────────────
// Root application component.
// Sets up bottom tab navigation and wraps everything in FirebaseProvider
// (exported as MqttProvider alias for backward compatibility).

import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text } from 'react-native';

import { MqttProvider } from './src/services/firebaseService';
import DashboardScreen from './src/screens/DashboardScreen';
import TrendsScreen from './src/screens/TrendsScreen';
import AlertsScreen from './src/screens/AlertsScreen';
import AIChatScreen from './src/screens/AIChatScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { COLORS } from './src/theme';

const Tab = createBottomTabNavigator();

// Simple emoji-based tab icons (no vector icon library needed)
const TabIcon = ({ emoji, focused }) => (
  <View style={{ alignItems: 'center' }}>
    <Text style={{ fontSize: focused ? 24 : 20, opacity: focused ? 1 : 0.5 }}>
      {emoji}
    </Text>
  </View>
);

export default function App() {
  return (
    <MqttProvider>
      <NavigationContainer
        theme={{
          ...DarkTheme,
          colors: {
            ...DarkTheme.colors,
            primary: COLORS.accent,
            background: COLORS.bg,
            card: COLORS.card,
            text: COLORS.textPrimary,
            border: COLORS.cardBorder,
            notification: COLORS.depleted,
          },
        }}
      >
        <Tab.Navigator
          screenOptions={{
            headerShown: false,
            tabBarStyle: {
              backgroundColor: COLORS.card,
              borderTopColor: COLORS.cardBorder,
              borderTopWidth: 1,
              height: 60,
              paddingBottom: 8,
              paddingTop: 6,
            },
            tabBarActiveTintColor: COLORS.accent,
            tabBarInactiveTintColor: COLORS.textMuted,
            tabBarLabelStyle: {
              fontSize: 11,
              fontWeight: '600',
            },
          }}
        >
          <Tab.Screen
            name="Dashboard"
            component={DashboardScreen}
            options={{
              tabBarIcon: ({ focused }) => <TabIcon emoji="🌱" focused={focused} />,
            }}
          />
          <Tab.Screen
            name="Trends"
            component={TrendsScreen}
            options={{
              tabBarIcon: ({ focused }) => <TabIcon emoji="📈" focused={focused} />,
            }}
          />
          <Tab.Screen
            name="Alerts"
            component={AlertsScreen}
            options={{
              tabBarIcon: ({ focused }) => <TabIcon emoji="🚨" focused={focused} />,
            }}
          />
          <Tab.Screen
            name="AI Chat"
            component={AIChatScreen}
            options={{
              tabBarIcon: ({ focused }) => <TabIcon emoji="🎙️" focused={focused} />,
            }}
          />
          <Tab.Screen
            name="Settings"
            component={SettingsScreen}
            options={{
              tabBarIcon: ({ focused }) => <TabIcon emoji="⚙️" focused={focused} />,
            }}
          />
        </Tab.Navigator>
      </NavigationContainer>
      <StatusBar style="light" />
    </MqttProvider>
  );
}
