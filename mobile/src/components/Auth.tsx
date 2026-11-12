
import { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

import { supabase } from '../lib/supabase'

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Missing details', 'Enter your email and password.')
      return
    }

    setLoading(true)

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })

        if (error) throw error
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        })

        if (error) throw error

        if (!data.session) {
          Alert.alert(
            'Registration successful',
            'Please check your email to confirm your account.'
          )
        }
      }
    } catch (error) {
      Alert.alert(
        'Authentication failed',
        error instanceof Error ? error.message : 'Something went wrong.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.logo}>
          Link<Text style={styles.accent}>Bridge</Text>
        </Text>

        <Text style={styles.heading}>
          {isLogin ? 'Welcome back!' : 'Create your account'}
        </Text>

        <Text style={styles.subtitle}>
          {isLogin
            ? 'Sign in to access your saved links.'
            : 'Start saving and sharing your links.'}
        </Text>

        <Text style={styles.label}>Email address</Text>

        <TextInput
          style={styles.input}
          placeholder="you@example.com"
          placeholderTextColor="#8993A4"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          value={email}
          onChangeText={setEmail}
        />

        <Text style={styles.label}>Password</Text>

        <TextInput
          style={styles.input}
          placeholder="Enter your password"
          placeholderTextColor="#8993A4"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <Pressable
          style={styles.button}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>
              {isLogin ? 'Sign In' : 'Create Account'}
            </Text>
          )}
        </Pressable>

        <View style={styles.switchRow}>
          <Text style={styles.switchText}>
            {isLogin
              ? "Don't have an account? "
              : 'Already have an account? '}
          </Text>

          <Pressable
            onPress={() => {
              setIsLogin(!isLogin)
            }}
          >
            <Text style={styles.switchButton}>
              {isLogin ? 'Sign Up' : 'Sign In'}
            </Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#101828',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#1C2638',
    borderRadius: 20,
    padding: 24,
  },
  logo: {
    fontSize: 30,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 30,
  },
  accent: {
    color: '#6C8CFF',
  },
  heading: {
    fontSize: 25,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    color: '#A0AEC0',
    marginBottom: 28,
  },
  label: {
    color: '#FFFFFF',
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#101828',
    borderWidth: 1,
    borderColor: '#344054',
    borderRadius: 10,
    padding: 15,
    color: '#FFFFFF',
    fontSize: 15,
  },
  button: {
    backgroundColor: '#5578F5',
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 28,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
    flexWrap: 'wrap',
  },
  switchText: {
    color: '#A0AEC0',
  },
  switchButton: {
    color: '#819AFF',
    fontWeight: 'bold',
  },
})
