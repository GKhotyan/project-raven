import { useState, useEffect } from 'react'
import { createLogger } from '../../../lib/logger'

const log = createLogger('Settings:Integrations')

export function IntegrationsTab() {
  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookToken, setWebhookToken] = useState('')
  const [savedUrl, setSavedUrl] = useState('')
  const [savedToken, setSavedToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const url = ((await window.raven.storeGet('n8nWebhookUrl')) as string) || ''
        const token = ((await window.raven.storeGet('n8nWebhookToken')) as string) || ''
        setWebhookUrl(url)
        setSavedUrl(url)
        setWebhookToken(token)
        setSavedToken(token)
      } catch (error) {
        log.error('Failed to load n8n settings:', error)
      }
    }
    void load()
  }, [])

  const trimmedUrl = webhookUrl.trim()
  const trimmedToken = webhookToken.trim()
  const urlInvalid = trimmedUrl !== '' && !/^https?:\/\/\S+$/i.test(trimmedUrl)
  const hasChanges = trimmedUrl !== savedUrl || trimmedToken !== savedToken

  async function handleSave() {
    if (urlInvalid) return
    setSaving(true)
    try {
      await window.raven.storeSet('n8nWebhookUrl', trimmedUrl)
      await window.raven.storeSet('n8nWebhookToken', trimmedToken)
      setSavedUrl(trimmedUrl)
      setSavedToken(trimmedToken)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (error) {
      log.error('Failed to save n8n settings:', error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-sm font-semibold text-gray-900 mb-1">n8n webhook</h4>
        <p className="text-sm text-gray-500 mb-4">
          Where "Send summary" posts a session summary for publishing to Mattermost.
        </p>

        <label className="block text-sm font-medium text-gray-700 mb-1.5">Webhook URL</label>
        <input
          type="url"
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
          placeholder="https://n8n.example.com/webhook/..."
          className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
            urlInvalid ? 'border-red-400' : 'border-gray-300'
          }`}
        />
        {urlInvalid && <p className="text-xs text-red-500 mt-1">Enter a full http(s) URL.</p>}

        <label className="block text-sm font-medium text-gray-700 mt-4 mb-1.5">Header auth token</label>
        <div className="relative">
          <input
            type={showToken ? 'text' : 'password'}
            value={webhookToken}
            onChange={(e) => setWebhookToken(e.target.value)}
            placeholder="Token sent in the request header"
            className="w-full px-3 py-2 pr-16 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
          />
          <button
            type="button"
            onClick={() => setShowToken((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
          >
            {showToken ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={!hasChanges || urlInvalid || saving}
        className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
          hasChanges && !urlInvalid
            ? 'bg-blue-600 text-white hover:bg-blue-700'
            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
        }`}
      >
        {saving ? 'Saving...' : saved ? 'Saved!' : 'Save'}
      </button>
    </div>
  )
}
