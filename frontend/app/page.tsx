"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

const API_BASE = "https://api.oussamalger6.workers.dev"

export default function SignupPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  // 🔒 Auto-redirect if already signed up
  useEffect(() => {
    const key = localStorage.getItem("saas_tts_api_key")
    if (key) {
      router.push("/tts")
    }
  }, [router])

  async function signup() {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`${API_BASE}/create-key`, {
        method: "POST",
      })

      if (!res.ok) {
        throw new Error("Signup failed")
      }

      const data = await res.json()

      // Store API key locally
      localStorage.setItem("saas_tts_api_key", data.apiKey)
      localStorage.setItem("saas_tts_user_id", data.userId)

      router.push("/tts")
    } catch (e: any) {
      setError(e.message || "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="p-10 max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-4">Create your account</h1>

      <p className="mb-6 text-gray-600">
        Get instant access to private GPU text-to-speech.
      </p>

      <button
        onClick={signup}
        disabled={loading}
        className="w-full px-4 py-2 bg-black text-white rounded disabled:opacity-50"
      >
        {loading ? "Creating account…" : "Create account"}
      </button>

      {error && <p className="mt-4 text-red-600">{error}</p>}
    </main>
  )
}
