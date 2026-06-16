import { useState } from 'react'
import { useModelStore } from '../../stores/modelStore'

export function ModelSwitcher() {
  const { providers, currentModel, switchModel, isSwitching, switchMessage } = useModelStore()
  const [apiKeyInput, setApiKeyInput] = useState<{ providerId: string; key: string } | null>(null)
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null)

  const list = Array.isArray(providers) ? providers : []

  if (list.length === 0) {
    return (
      <div className="p-3 text-xs text-[#8b949e]">
        未找到提供商配置。<br />
        检查 <code className="bg-[#0d1117] px-1 py-0.5 rounded text-[#58a6ff]">~/.claude/providers.json</code>
      </div>
    )
  }

  const configured = list.filter(p => p.configured !== false)
  const unconfigured = list.filter(p => p.configured === false)

  const handleSetApiKey = async (providerId: string, authEnv: string) => {
    if (!apiKeyInput || !apiKeyInput.key.trim()) return
    await window.electron.invoke('config:set', `env.${authEnv}`, apiKeyInput.key.trim())
    // Also set ANTHROPIC_AUTH_TOKEN for providers that use it
    if (authEnv === 'ANTHROPIC_AUTH_TOKEN') {
      // already set
    }
    setApiKeyInput(null)
    // Reload providers to refresh configured status
    const updated: any = await window.electron.invoke('model:list')
    if (updated) useModelStore.getState().setProviders(updated)
  }

  return (
    <div className="flex flex-col">
      {currentModel && (
        <div className="px-3 py-2.5 border-b border-[#30363d] bg-[#0d1117]/50">
          <div className="text-[10px] text-[#8b949e] uppercase tracking-wider">当前模型</div>
          <div className="text-xs text-[#e6edf3] font-medium truncate mt-0.5">
            {currentModel.display}
          </div>
          <div className="text-[10px] text-[#8b949e] truncate mt-0.5">
            {currentModel.provider}
          </div>
        </div>
      )}

      <div className="py-1">
        {configured.map(p => renderProvider(p))}

        {/* 未配置的分隔 */}
        {unconfigured.length > 0 && (
          <div className="px-3 py-1.5 text-[10px] text-[#484f58] uppercase tracking-wider border-t border-[#21262d] mt-1">
            未配置 Key
          </div>
        )}
        {unconfigured.map(p => renderProvider(p))}
      </div>

      {switchMessage && (
        <div className={`px-3 py-2 text-[10px] ${
          switchMessage.includes('成功') || switchMessage.includes('已切换')
            ? 'text-[#3fb950]' : 'text-[#d2991d]'
        }`}>
          {switchMessage}
        </div>
      )}
    </div>
  )

  function renderProvider(provider: (typeof list)[0]) {
    const isExpanded = expandedProvider === provider.id
    const isActive = currentModel?.provider === provider.name
    const isConfigured = provider.configured !== false
    const modelList = Array.isArray(provider.models) ? provider.models : []
    const showApiInput = apiKeyInput?.providerId === provider.id

    return (
      <div key={provider.id}>
        <button
          onClick={() => setExpandedProvider(isExpanded ? null : provider.id)}
          className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors
            ${isActive && isConfigured ? 'text-[#58a6ff] bg-[#1c2a3e]/50' : ''}
            ${!isConfigured ? 'text-[#484f58]' : 'text-[#e6edf3]'}
            hover:bg-[#21262d]`}
        >
          <span className="text-[10px]" style={isExpanded ? {transform:'rotate(90deg)'} : undefined}>
            ▸
          </span>
          <span className="flex-1 text-left font-medium truncate">{provider.name}</span>
          {!isConfigured ? (
            <span className="text-[10px] text-[#f85149] flex-shrink-0">Key 未设</span>
          ) : (
            <span className="text-[10px] text-[#8b949e] flex-shrink-0">{modelList.length} 模型</span>
          )}
        </button>

        {isExpanded && (
          <div className="bg-[#0d1117]/30">
            {!isConfigured && (
              <div className="px-7 py-2 space-y-1.5">
                <div className="text-[10px] text-[#f85149]">
                  需要设置 <code className="bg-[#0d1117] px-1 rounded">{provider.auth_env}</code>
                </div>
                {showApiInput ? (
                  <div className="flex gap-1">
                    <input
                      type="password"
                      autoFocus
                      placeholder="粘贴 API Key..."
                      className="flex-1 bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-[10px] text-[#e6edf3] outline-none focus:border-[#58a6ff]"
                      onChange={(e) => setApiKeyInput({ providerId: provider.id, key: e.target.value })}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter') await handleSetApiKey(provider.id, provider.auth_env)
                      }}
                    />
                    <button
                      onClick={() => handleSetApiKey(provider.id, provider.auth_env)}
                      className="px-2 py-1 text-[10px] bg-[#1c2a3e] text-[#58a6ff] rounded hover:bg-[#243656]"
                    >
                      保存
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setApiKeyInput({ providerId: provider.id, key: '' })}
                    className="text-[10px] text-[#58a6ff] hover:underline"
                  >
                    + 配置 Key
                  </button>
                )}
              </div>
            )}
            {modelList.map((model) => {
              const isSelected = currentModel?.modelId === model.model_id && isActive
              const features = Array.isArray(model.features) ? model.features : []

              return (
                <button
                  key={model.model_id}
                  onClick={() => { if (isConfigured) switchModel(provider.id, model.model_id) }}
                  disabled={!isConfigured || isSwitching}
                  className={`w-full flex flex-col gap-0.5 pl-7 pr-3 py-2 text-left transition-colors
                    ${isSelected ? 'bg-[#1c2a3e]/70 border-l-2 border-[#58a6ff] text-[#58a6ff]' : ''}
                    ${!isSelected ? 'hover:bg-[#21262d] border-l-2 border-transparent text-[#e6edf3]' : ''}
                    ${!isConfigured || isSwitching ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <span className="text-xs font-medium">{model.display}</span>
                  <span className="text-[10px] text-[#8b949e] leading-tight">
                    {(model.context_window / 1000).toFixed(0)}K 上下文
                    {features.includes('prompt_caching') && ' · 缓存'}
                    {features.includes('vision') && ' · 视觉'}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }
}
