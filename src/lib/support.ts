export const SUPPORT_EMAIL = "info@plv.edu.ph";

export interface SupportInquiry {
  name: string;
  email: string;
  category: string;
  subject: string;
  message: string;
  attachmentName?: string;
}

export function buildSupportMailto(
  inquiry: SupportInquiry,
  recipient = SUPPORT_EMAIL,
): string {
  const body = [
    `Name: ${inquiry.name.trim()}`,
    `Reply-to email: ${inquiry.email.trim()}`,
    `Category: ${inquiry.category.trim()}`,
    "",
    inquiry.message.trim(),
    inquiry.attachmentName ? `\nAttachment to add: ${inquiry.attachmentName}` : "",
  ].filter(Boolean).join("\n");

  const subject = `[PLV NaviSync] ${inquiry.subject.trim()}`;
  return `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
