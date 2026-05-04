import { requireAdmin } from '@/lib/admin-auth'
import { getBugReportAdminSettings, getMiniMaxCodeHelpAdminSettings } from '@/lib/services/system-settings-service'
import { updateBugReportSettingsAction, updateMiniMaxCodeHelpSettingsAction } from './actions'

export const dynamic = 'force-dynamic'

export default async function AdminSettingsPage() {
  await requireAdmin('admin')
  const [settings, bugReportSettings] = await Promise.all([
    getMiniMaxCodeHelpAdminSettings(),
    getBugReportAdminSettings(),
  ])

  return (
    <section className="admin-stack">
      <header className="admin-page-head">
        <div>
          <span className="admin-eyebrow">Runtime</span>
          <h1>Settings</h1>
        </div>
        <span className={`admin-status ${settings.configured ? 'admin-status-published' : 'admin-status-draft'}`}>
          {settings.configured ? 'MiniMax ready' : 'MiniMax missing key'}
        </span>
      </header>

      <section className="admin-detail-grid">
        <article className="admin-panel">
          <div className="admin-panel-head">
            <h2>MiniMax Code Help</h2>
            <span className="admin-count">{settings.source}</span>
          </div>
          <dl className="admin-dl">
            <dt>API mode</dt>
            <dd>{settings.apiMode}</dd>
            <dt>Base URL</dt>
            <dd>{settings.baseUrl}</dd>
            <dt>Model</dt>
            <dd>{settings.model}</dd>
            <dt>API key</dt>
            <dd>
              {settings.hasStoredApiKey ? 'stored in database' : settings.hasEnvApiKey ? 'from environment' : 'not set'}
            </dd>
            <dt>Updated</dt>
            <dd>{settings.updatedAt ? new Date(settings.updatedAt).toLocaleString() : '-'}</dd>
          </dl>
        </article>

        <article className="admin-panel">
          <h2>Edit MiniMax</h2>
          <form action={updateMiniMaxCodeHelpSettingsAction} className="admin-form-grid">
            <label>
              <span>Enabled</span>
              <select name="enabled" defaultValue={String(settings.enabled)}>
                <option value="true">enabled</option>
                <option value="false">disabled</option>
              </select>
            </label>
            <label>
              <span>API mode</span>
              <select name="apiMode" defaultValue={settings.apiMode}>
                <option value="anthropic">anthropic</option>
                <option value="openai">openai-compatible</option>
              </select>
            </label>
            <label className="admin-form-span-2">
              <span>Base URL</span>
              <input name="baseUrl" defaultValue={settings.baseUrl} placeholder="https://api.minimaxi.com/anthropic" />
            </label>
            <label>
              <span>Model</span>
              <input name="model" defaultValue={settings.model} placeholder="MiniMax-M2.7" />
            </label>
            <label>
              <span>Timeout ms</span>
              <input name="timeoutMs" type="number" min={5000} max={3000000} step={1000} defaultValue={settings.timeoutMs} />
            </label>
            <label className="admin-form-span-2">
              <span>API key</span>
              <input
                name="apiKey"
                type="password"
                autoComplete="new-password"
                placeholder={settings.hasStoredApiKey ? '已设置，留空则不修改' : '输入 MiniMax API key'}
              />
            </label>
            <label className="admin-checkbox">
              <input name="clearApiKey" type="checkbox" value="true" />
              <span>Clear stored API key</span>
            </label>
            <p className="admin-help-text admin-form-span-2">
              默认配置使用你已验证的 Coding Plan 接口：Anthropic mode, https://api.minimaxi.com/anthropic, MiniMax-M2.7。
              API key 会加密保存，审计日志只记录是否变更。
            </p>
            <button className="admin-button" type="submit">
              Save settings
            </button>
          </form>
        </article>
      </section>

      <section className="admin-detail-grid">
        <article className="admin-panel">
          <div className="admin-panel-head">
            <h2>Bug Report Debug Tool</h2>
            <span className="admin-count">{bugReportSettings.source}</span>
          </div>
          <dl className="admin-dl">
            <dt>Status</dt>
            <dd>
              <em className={`admin-status ${bugReportSettings.enabled ? 'admin-status-published' : 'admin-status-archived'}`}>
                {bugReportSettings.enabled ? 'enabled' : 'disabled'}
              </em>
            </dd>
            <dt>Default</dt>
            <dd>enabled</dd>
            <dt>Updated</dt>
            <dd>{bugReportSettings.updatedAt ? new Date(bugReportSettings.updatedAt).toLocaleString() : '-'}</dd>
          </dl>
        </article>

        <article className="admin-panel">
          <h2>Edit Bug Tool</h2>
          <form action={updateBugReportSettingsAction} className="admin-form-grid">
            <label>
              <span>Enabled</span>
              <select name="enabled" defaultValue={String(bugReportSettings.enabled)}>
                <option value="true">enabled</option>
                <option value="false">disabled</option>
              </select>
            </label>
            <p className="admin-help-text admin-form-span-2">
              关闭后全局 Bug 按钮不显示，后端提交接口也会拒绝写入 system_bugs。
            </p>
            <button className="admin-button" type="submit">
              Save bug settings
            </button>
          </form>
        </article>
      </section>
    </section>
  )
}
