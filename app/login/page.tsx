import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { getActorId } from '@/lib/users'
import { DRIVE } from '@/lib/routes'
import LoginForm from '@/components/auth/LoginForm'

export const dynamic = 'force-dynamic'

export default function LoginPage() {
  // Already signed in → straight to the drive.
  if (getActorId()) redirect(DRIVE)
  return (
    <div className="grid min-h-screen w-full place-items-center bg-gradient-to-br from-slate-50 to-red-50 px-6">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  )
}
