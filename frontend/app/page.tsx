"use client";

import { useState } from "react";

export default function Home() {
  const [health, setHealth] = useState<string>("");

  const checkHealth = async () => {
    const res = await fetch(
      "https://api.oussamalger6.workers.dev/health"
    );
    const data = await res.json();
    setHealth(JSON.stringify(data, null, 2));
  };

  return (
    <main className="min-h-screen p-10">
      <h1 className="text-2xl font-bold mb-4">SaaS TTS Dashboard</h1>

      <button
        onClick={checkHealth}
        className="px-4 py-2 bg-black text-white rounded"
      >
        Check API Health
      </button>

      {health && (
        <pre className="mt-4 p-4 bg-gray-100 rounded">
          {health}
        </pre>
      )}
    </main>
  );
}
