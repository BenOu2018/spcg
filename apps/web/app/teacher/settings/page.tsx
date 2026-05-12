import Link from 'next/link'
import { requireTeacherSession } from '@/lib/teacher-auth'
import { TeacherPageHeader, TeacherPanel, TeacherStatCard } from '../components/TeacherChrome'

export const dynamic = 'force-dynamic'

export default async function TeacherSettingsPage() {
  const session = await requireTeacherSession('/teacher/settings')
  const displayName = session.user.name ?? session.user.username ?? session.user.email ?? session.user.id

  return (
    <section className="teacher-page">
      <TeacherPageHeader
        eyebrow="Settings"
        title="老师后台设置"
        description="这里是老师端专属设置页，不再跳转到学生设置。账号资料、通知与报告配置后续都放在这里。"
        actions={
          <Link className="teacher-button secondary" href="/teacher">
            返回工作台
          </Link>
        }
      />

      <section className="teacher-stat-grid compact">
        <TeacherStatCard label="当前账号" value={displayName} hint={session.user.username ? `@${session.user.username}` : session.user.id} />
        <TeacherStatCard label="后台类型" value="Teacher" hint="教师管理后台" />
        <TeacherStatCard label="资料设置" value="预留" hint="后续支持头像、昵称、通知" />
      </section>

      <TeacherPanel title="老师端设置入口" meta="Teacher settings">
        <div className="teacher-summary-list">
          <div>
            <span>账号资料</span>
            <strong>后续在此维护老师昵称、头像与联系方式。</strong>
          </div>
          <div>
            <span>通知设置</span>
            <strong>后续在此配置学生报告、家长通知和异常提醒。</strong>
          </div>
          <div>
            <span>数据权限</span>
            <strong>老师仍只能查看 owner 或 shared 的学生数据。</strong>
          </div>
        </div>
      </TeacherPanel>
    </section>
  )
}
