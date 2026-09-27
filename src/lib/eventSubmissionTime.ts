export function formatEventSubmissionTime(submittedAt?: string): string {
  if (!submittedAt) return "Submission time unavailable";
  const date = new Date(submittedAt);
  if (Number.isNaN(date.getTime())) return "Submission time unavailable";
  const philippinesTime = new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  }).format(date);
  return `${philippinesTime} PHT`;
}
