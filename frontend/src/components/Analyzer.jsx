import { useState } from "react"
import axios from "axios"

const API_URL = import.meta.env.VITE_API_URL

export default function Analyzer() {

  const [text, setText] = useState("")
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const analyze = async () => {
    if (!text.trim()) return
    setLoading(true)
    setError("")
    setResult(null)

    try {
      const response = await axios.post(
        `${API_URL}/analyze`,
        { text: text }
      )
      setResult(response.data)
    } catch (err) { 
      setError("Could not connect to the analysis server. Make sure the backend is running.")
    } finally {
      setLoading(false)
    }
  }

  const colors = {
    FAKE:         { border: "border-red-500",    bg: "bg-red-950",    bar: "bg-red-500"    },
    REAL:         { border: "border-green-500",  bg: "bg-green-950",  bar: "bg-green-500"  },
    SUSPICIOUS:   { border: "border-yellow-500", bg: "bg-yellow-950", bar: "bg-yellow-500" },
    UNVERIFIABLE: { border: "border-gray-500",   bg: "bg-gray-800",   bar: "bg-gray-500"   },
  }
  const c = result ? (colors[result.verdict] || colors.UNVERIFIABLE) : null

  return (
    <div className="min-h-screen bg-gray-950 text-white">

      {/* NAVBAR */}
      <nav className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div>
          <span className="text-xl font-bold text-blue-400">TruthShield</span>
          <span className="text-gray-500 text-sm ml-2">AI Misinformation Detector</span>
        </div>
        <span className="text-xs bg-green-900 text-green-400 px-3 py-1 rounded-full">
          AI Powered
        </span>
      </nav>

      {/* MAIN */}
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-10">

        {/* HERO */}
          <div className="text-center mb-10">
            <div className="inline-block bg-blue-900 text-blue-300 text-xs px-3 py-1 rounded-full mb-4">
              Powered by Llama 3.3 AI
            </div>
            <h1 className="text-3xl sm:text-5xl font-black mb-4 leading-tight">
              Detect Fake News <br/>
              <span className="text-blue-400">Instantly</span>
            </h1>
            <p className="text-gray-400 text-lg mb-6 max-w-lg mx-auto">
              Paste any news article, headline or claim.
              Our AI analyzes it in seconds and tells you
              if it is real, fake, or suspicious.
            </p>
            <div className="flex justify-center gap-6 text-sm text-gray-500 mb-8">
              <span>✓ Fake News Detection</span>
              <span>✓ Bias Analysis</span>
              <span>✓ Claim Extraction</span>
            </div>
          </div>
          

        {/* TEXT INPUT */}
        <textarea
          className="w-full h-36 sm:h-44 bg-gray-800 border border-gray-700
            rounded-xl p-4 text-white text-sm resize-none
            focus:outline-none focus:border-blue-500"
          placeholder="Paste a news article, headline, or claim here..."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />

        {/* CHARACTER COUNT */}
        <div className="text-right text-xs text-gray-600 mt-1 mb-3">
          {text.length} / 8000 characters
        </div>

        {/* ANALYZE BUTTON */}
        <button
          onClick={analyze}
          disabled={loading || text.trim().length < 30}
          className="w-full py-4 rounded-xl font-bold text-lg transition-all
            bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? "Analyzing... please wait" : "Analyze Content"}
        </button>

        {/* HINT */}
        {text.trim().length < 30 && text.length > 0 && (
          <p className="text-center text-xs text-gray-500 mt-2">
            Please enter at least 30 characters
          </p>
        )}

        {/* ERROR */}
        {error && (
          <div className="mt-4 p-4 bg-red-950 border border-red-800 rounded-xl">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* RESULTS */}
        {result && (
          <div className="mt-8 space-y-4">

            {/* VERDICT */}
            <div className={`p-6 rounded-xl border-2 ${c.border} ${c.bg}`}>
              <div className="flex items-center justify-between mb-4">
                <span className="text-5xl font-black tracking-tight">
                  {result.verdict}
                </span>
                <span className="text-3xl font-bold text-gray-200">
                  {result.confidence}%
                </span>
              </div>
              <div className="h-3 bg-gray-900 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${c.bar}`}
                  style={{ width: `${result.confidence}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-2">AI confidence level</p>
            </div>

            {/* SUMMARY */}
            {result.summary && (
              <div className="p-4 bg-gray-800 border border-gray-700 rounded-xl">
                <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">Summary</p>
                <p className="text-gray-200 text-sm leading-relaxed">
                  {result.summary}
                </p>
              </div>
            )}

            {/* REASONS */}
            {result.reasons && result.reasons.length > 0 && (
              <div className="p-4 bg-gray-800 border border-gray-700 rounded-xl">
                <p className="text-xs text-gray-500 mb-3 uppercase tracking-wide">
                  Key findings
                </p>
                {result.reasons.map((reason, i) => (
                  <div key={i} className="flex gap-3 mb-3 last:mb-0">
                    <span className="text-blue-400 font-bold text-sm mt-0.5 flex-shrink-0">
                      {i + 1}.
                    </span>
                    <p className="text-gray-300 text-sm leading-relaxed">{reason}</p>
                  </div>
                ))}
              </div>
            )}

            {/* CLAIMS */}
            {result.claims && result.claims.length > 0 && (
              <div className="p-4 bg-gray-800 border border-gray-700 rounded-xl">
                <p className="text-xs text-gray-500 mb-3 uppercase tracking-wide">
                  Claims detected
                </p>
                {result.claims.map((claim, i) => (
                  <div key={i} className="flex gap-2 mb-2 last:mb-0">
                    <span className="text-yellow-500 text-sm flex-shrink-0">⚑</span>
                    <p className="text-gray-400 text-sm">{claim}</p>
                  </div>
                ))}
              </div>
            )}

            {/* BIAS INDICATORS */}
            {result.bias_indicators && result.bias_indicators.length > 0 && (
              <div className="p-4 bg-gray-800 border border-gray-700 rounded-xl">
                <p className="text-xs text-gray-500 mb-3 uppercase tracking-wide">
                  Bias indicators
                </p>
                {result.bias_indicators.map((bias, i) => (
                  <div key={i} className="flex gap-2 mb-2 last:mb-0">
                    <span className="text-orange-500 text-sm flex-shrink-0">!</span>
                    <p className="text-gray-400 text-sm">{bias}</p>
                  </div>
                ))}
              </div>
            )}

            {/* ANALYZE AGAIN */}
            <button
              onClick={() => { setResult(null); setText("") }}
              className="w-full py-3 rounded-xl border border-gray-700
                text-gray-400 hover:bg-gray-800 transition-all text-sm"
            >
              Analyze another article
            </button>

          </div>
        )}
      </div>
    </div>
  )
}