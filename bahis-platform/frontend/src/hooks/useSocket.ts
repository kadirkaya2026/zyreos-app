'use client'
import { useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null

export function useSocket() {
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    if (!socket) {
      socket = io(process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:4000')
    }
    socketRef.current = socket
    return () => {}
  }, [])

  return socketRef.current
}
