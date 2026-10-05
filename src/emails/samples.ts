/** Example values for email previews (admin → Emails) and test sends. */
export const SAMPLE_VARS: Record<string, string | number> = {
  name: 'Ade',
  church: 'Grace Chapel',
  days: 7,
  plan: 'Ministry Plus',
  amount: '€19.99',
  date: 'November 5, 2026',
  time: '9:00 AM',
  fund: 'Tithe',
  reference: 'ZD-4821',
  event: 'Sunday Service',
  inviter: 'Pastor James',
  role: 'Admin',
  prayer: 'May this new year of your life overflow with God’s grace, peace and joy. May He guide every step you take.',
  subject: 'What’s new in ZionDesk this month',
  text: 'We’ve made it even easier to welcome new members on Sunday.\n\nYour registration QR code now works offline, and Ellen can draft follow-up messages for every first-time guest.\n\nRead more: https://ziondesk.com',
}

/** Groups for the admin email gallery. */
export const EMAIL_GROUPS: { title: string; kinds: string[] }[] = [
  { title: 'Account & sign-up', kinds: ['welcomeAccount', 'confirmSignup', 'resetPassword', 'magicLink', 'emailChange', 'teamInvite', 'accountDeleted'] },
  { title: 'Finish sign-up reminders (weekly)', kinds: ['finishSignup1', 'finishSignup2', 'finishSignup3', 'finishSignup4'] },
  { title: 'Billing', kinds: ['subscriptionConfirmed', 'paymentReceipt', 'trialEnding', 'paymentFailed', 'planExpired', 'promoEnded'] },
  { title: 'Newsletter', kinds: ['newsletter'] },
  { title: 'Sent by churches to members', kinds: ['registered', 'message', 'giftReceipt', 'claimReceived', 'claimAlert', 'birthday', 'birthdayPrayer', 'eventReminder', 'meetingInvite'] },
]
