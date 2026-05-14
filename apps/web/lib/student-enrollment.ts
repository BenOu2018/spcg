import type { StudentEnrollmentType } from '@spcg/shared/types'

export const STUDENT_ENROLLMENT_TYPE_LABELS: Record<StudentEnrollmentType, string> = {
  online: '线上学员',
  offline: '线下学员',
}

export const STUDENT_ENROLLMENT_TYPE_OPTIONS: Array<{
  value: StudentEnrollmentType
  label: string
  description: string
}> = [
  {
    value: 'online',
    label: STUDENT_ENROLLMENT_TYPE_LABELS.online,
    description: '按线上会员权益控制访问，可显示升级会员入口。',
  },
  {
    value: 'offline',
    label: STUDENT_ENROLLMENT_TYPE_LABELS.offline,
    description: '默认拥有最高级权益，不显示线上升级会员入口。',
  },
]

export function isStudentEnrollmentType(value: unknown): value is StudentEnrollmentType {
  return value === 'online' || value === 'offline'
}

export function getStudentEnrollmentLabel(value: StudentEnrollmentType): string {
  return STUDENT_ENROLLMENT_TYPE_LABELS[value]
}
