import React from 'react'
import { StatusBar } from 'expo-status-bar'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider, useAuth } from './src/context/AuthContext'
import LoginScreen from './src/screens/LoginScreen'
import HomeScreen from './src/screens/HomeScreen'
import AccueilScreen from './src/screens/AccueilScreen'
import CaisseScreen from './src/screens/CaisseScreen'
import ConsultationScreen from './src/screens/ConsultationScreen'
import PharmacieScreen from './src/screens/PharmacieScreen'
import LaboratoireScreen from './src/screens/LaboratoireScreen'
import ImagerieScreen from './src/screens/ImagerieScreen'
import HospitalisationScreen from './src/screens/HospitalisationScreen'
import StatistiquesScreen from './src/screens/StatistiquesScreen'

const Stack = createNativeStackNavigator()

function Navigation() {
  const { token, loading } = useAuth()

  if (loading) return null

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!token ? (
        <Stack.Screen name="Login" component={LoginScreen} />
      ) : (
        <>
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="Accueil" component={AccueilScreen} />
          <Stack.Screen name="Caisse" component={CaisseScreen} />
          <Stack.Screen name="Consultation" component={ConsultationScreen} />
          <Stack.Screen name="Pharmacie" component={PharmacieScreen} />
          <Stack.Screen name="Laboratoire" component={LaboratoireScreen} />
          <Stack.Screen name="Imagerie" component={ImagerieScreen} />
          <Stack.Screen name="Hospitalisation" component={HospitalisationScreen} />
          <Stack.Screen name="Statistiques" component={StatistiquesScreen} />
        </>
      )}
    </Stack.Navigator>
  )
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer>
          <Navigation />
        </NavigationContainer>
        <StatusBar style="auto" />
      </AuthProvider>
    </SafeAreaProvider>
  )
}
