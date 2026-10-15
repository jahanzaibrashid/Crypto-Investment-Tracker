import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { errorMessage } from '@/lib/errors'
import { FormAlert } from '@/components/ui/Alert'
import { AuthLayout } from './AuthLayout'
import { useAuth } from './auth.context'
import { signIn, signUp } from './auth.service'
import { loginSchema, registerSchema, type LoginValues, type RegisterValues } from './auth.schemas'

export function LoginPage() {
  const { notice, clearNotice } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } })

  const onSubmit = handleSubmit(async (values) => {
    setError(null)
    try {
      await signIn(values.email, values.password)
      clearNotice()
      navigate(from, { replace: true })
    } catch (e) {
      setError(errorMessage(e))
    }
  })

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Track your crypto purchases, sales and returns."
      footer={
        <>
          No account?{' '}
          <Link to="/register" className="font-medium text-primary-text hover:underline">
            Create one
          </Link>
        </>
      }
    >
      {notice && <FormAlert tone="info">{notice}</FormAlert>}
      {error && <FormAlert tone="error">{error}</FormAlert>}
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Input label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          aside={
            <Link to="/forgot-password" className="text-xs text-primary-text hover:underline">
              Forgot password?
            </Link>
          }
          {...register('password')}
        />
        <Button type="submit" variant="primary" loading={isSubmitting} className="mt-1 w-full justify-center">
          Sign in
        </Button>
      </form>
    </AuthLayout>
  )
}

export function RegisterPage() {
  const [error, setError] = useState<string | null>(null)
  const [confirmationSentTo, setConfirmationSentTo] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { displayName: '', email: '', password: '', confirmPassword: '' },
  })

  const onSubmit = handleSubmit(async (values) => {
    setError(null)
    try {
      const { needsConfirmation } = await signUp(values.email, values.password, values.displayName || undefined)
      // When confirmation is disabled Supabase signs the user in and GuestOnly redirects to the dashboard.
      if (needsConfirmation) setConfirmationSentTo(values.email)
    } catch (e) {
      setError(errorMessage(e))
    }
  })

  if (confirmationSentTo) {
    return (
      <AuthLayout title="Check your email">
        <FormAlert tone="success">
          We sent a confirmation link to <strong>{confirmationSentTo}</strong>. Open it to activate your account, then sign in.
        </FormAlert>
        <Link to="/login" className="text-sm font-medium text-primary-text hover:underline">
          Back to sign in
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Create your account"
      footer={
        <>
          Already registered?{' '}
          <Link to="/login" className="font-medium text-primary-text hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      {error && <FormAlert tone="error">{error}</FormAlert>}
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Input label="Display name (optional)" autoComplete="nickname" error={errors.displayName?.message} {...register('displayName')} />
        <Input label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
        <Input
          label="Password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters, including a letter and a number."
          error={errors.password?.message}
          {...register('password')}
        />
        <Input
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />
        <Button type="submit" variant="primary" loading={isSubmitting} className="mt-1 w-full justify-center">
          Create account
        </Button>
      </form>
    </AuthLayout>
  )
}
