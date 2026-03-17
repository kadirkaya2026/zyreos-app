'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store'

export default function Home() {
  const router = useRouter()
  const { user } = useAuthStore()

  useEffect(() => {
    if (user) {
      router.replace(user.role === 'admin' ? '/admin' : '/spor')
    } else {
      router.replace('/login')
    }
  }, [user, router])

  return null
}
