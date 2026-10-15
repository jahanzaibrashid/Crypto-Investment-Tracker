import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { LoadingState } from '@/components/ui/LoadingState'
import { errorMessage } from '@/lib/errors'
import { FormAlert } from '@/components/ui/Alert'
import { AuthLayout } from './AuthLayout'
import { useAuth } from './auth.context'
import { requestPasswordReset, updatePassword } from './auth.service'
import { forgotPasswordSchema, resetPasswordSchema, type ForgotPasswordValues, type ResetPasswordValues } from './auth.schemas'

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: '' } })

  const onSubmit = handleSubmit(async ({ email }) => {
    setError(null)
    try {
      await requestPasswordReset(email)
      setSent(true)
    } catch (e) {
      setError(errorMessage(e))
    }
  })

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We'll email you a link to choose a new password."
      footer={
        <Link to="/login" className="font-medium text-primary-text hover:underline">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        // Same message whether or not the account exists, to avoid account enumeration.
        <FormAlert tone="success">If an account exists for that email, a reset link is on its way.</FormAlert>
      ) : (
        <>
          {error && <FormAlert tone="error">{error}</FormAlert>}
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
            <Input label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
            <Button type="submit" variant="primary" loading={isSubmitting} className="w-full justify-center">
              Send reset link
            </Button>
          </form>
        </>
      )}
    </AuthLayout>
  )
}

export function ResetPasswordPage() {
  const { status } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  })

  const onSubmit = handleSubmit(async ({ password }) => {
    setError(null)
    try {
      await updatePassword(password)
      navigate('/', { replace: true })
    } catch (e) {
      setError(errorMessage(e))
    }
  })

  if (status === 'loading') return <LoadingState label="Verifying reset link…" fullScreen />

  if (status === 'unauthenticated') {
    return (
      <AuthLayout title="Reset link invalid or expired">
        <FormAlert tone="error">This password reset link is invalid or has expired. Request a new one.</FormAlert>
        <Link to="/forgot-password" className="text-sm font-medium text-primary-text hover:underline">
          Request a new link
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Choose a new password">
      {error && <FormAlert tone="error">{error}</FormAlert>}
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters, including a letter and a number."
          error={errors.password?.message}
          {...register('password')}
        />
        <Input
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />
        <Button type="submit" variant="primary" loading={isSubmitting} className="w-full justify-center">
          Update password
        </Button>
      </form>
    </AuthLayout>
  )
}
