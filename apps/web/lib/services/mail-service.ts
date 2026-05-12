import nodemailer from 'nodemailer'
import { getSmtpConfig } from '@/lib/smtp-config'

export type SendSystemMailInput = {
  to: string
  subject: string
  text: string
  html?: string
}

export async function sendSystemMail(input: SendSystemMailInput): Promise<void> {
  const config = getSmtpConfig()
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.password,
    },
  })

  await transporter.sendMail({
    from: config.from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  })
}

export async function verifySystemMailTransport(): Promise<void> {
  const config = getSmtpConfig()
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.password,
    },
  })

  await transporter.verify()
}
