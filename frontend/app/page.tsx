"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

const API_BASE = "https://api.oussamalger6.workers.dev"

export default function AuthPage() {
  const router = useRouter()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [mode, setMode] = useState<"login" | "signup">("login")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 🔐 auto-redirect if already logged in (cookie-based)
  useEffect(() => {
    fetch(`${API_BASE}/me`, {
      credentials: "include",
    })
      .then(res => {
        if (res.ok) router.push("/tts")
      })
      .catch(() => {})
  }, [router])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`${API_BASE}/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // 🔥 REQUIRED for HttpOnly cookies
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Request failed")
      }

      router.push("/tts")
    } catch (e: any) {
      setError(e.message || "Network error")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <form
        onSubmit={submit}
        className="w-full max-w-md bg-white p-8 rounded shadow"
      >
        <h1 className="text-2xl font-bold mb-4 text-center">
          {mode === "login" ? "Login" : "Create account"}
        </h1>

        <input
          type="email"
          required
          placeholder="Email"
          className="w-full border p-2 mb-3"
          value={email}
          onChange={e => setEmail(e.target.value)}
        />

        <input
          type="password"
          required
          placeholder="Password"
          className="w-full border p-2 mb-4"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-black text-white py-2 rounded disabled:opacity-50"
        >
          {loading
            ? "Please wait…"
            : mode === "login"
            ? "Login"
            : "Sign up"}
        </button>

        {error && (
          <p className="text-red-600 text-sm mt-4 text-center">{error}</p>
        )}

        <p className="text-sm text-center mt-6">
          {mode === "login" ? (
            <>
              Don’t have an account?{" "}
              <button
                type="button"
                className="underline"
                onClick={() => setMode("signup")}
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                className="underline"
                onClick={() => setMode("login")}
              >
                Login
              </button>
            </>
          )}
        </p>
      </form>
    </main>
  )
}
