import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type Lang = 'en' | 'kn'

const en = {
  'brand.name': 'Mane Maarga',
  'brand.tagline.kn': 'ಮನೆಗೆ ದಾರಿ, ಬದುಕಿಗೆ ಭರವಸೆ',
  'brand.tagline.en': 'The path to a home. Hope for a better life.',
  'brand.promise.kn': 'ಪ್ರತಿಯೊಂದು ಕುಟುಂಬಕ್ಕೂ ಒಂದು ಸುರಕ್ಷಿತ ಮನೆ.',
  'brand.promise.en': 'Every family deserves a safe home.',

  'nav.overview': 'Overview', 'nav.beneficiaries': 'Beneficiaries', 'nav.verification': 'Verification',
  'nav.finance': 'Financial planning', 'nav.construction': 'Construction', 'nav.intelligence': 'Intelligence',
  'nav.audit': 'Audit trail', 'nav.team': 'Team', 'nav.more': 'More', 'nav.signout': 'Sign out',
  'nav.skip': 'Skip to content',

  'status.intake': 'Intake', 'status.verified': 'Verified', 'status.planning': 'Housing planning',
  'status.finance_review': 'Financial assistance', 'status.construction': 'Construction', 'status.completed': 'Home completed',

  'doc.pending': 'Pending review', 'doc.verified': 'Verified', 'doc.rejected': 'Rejected',
  'consent.given': 'Consent given', 'consent.withdrawn': 'Consent withdrawn', 'consent.pending': 'Consent pending',

  'common.search': 'Search', 'common.save': 'Save', 'common.cancel': 'Cancel', 'common.close': 'Close',
  'common.loading': 'Loading', 'common.retry': 'Try again', 'common.edit': 'Edit', 'common.delete': 'Delete',
  'common.open': 'Open case file', 'common.selectCase': 'Choose a beneficiary', 'common.comingSoon': 'Coming soon',
  'common.readOnly': 'Read-only access', 'common.all': 'All',

  'overview.eyebrow': 'Housing mission control',
  'overview.title': 'Building pathways to {n} homes',
  'overview.titleOne': 'Building a pathway to 1 home',
  'overview.titleZero': 'Every home begins with a first step',
  'overview.lead': 'Where each family stands, what needs a decision today, and what the assistance really covers.',
  'overview.add': 'Add beneficiary',
  'overview.journey': 'The journey, family by family',
  'overview.attention': 'Needs attention',
  'overview.activity': 'Recent activity',
  'overview.money': 'What the money covers',
  'overview.estimated': 'Estimated construction cost', 'overview.sanctioned': 'Sanctioned assistance',
  'overview.gap': 'Gap before other funding', 'overview.attentionNone': 'Nothing is waiting on you. Good work.',
  'overview.gapNote': 'Each case\'s estimate minus its sanctioned assistance, before savings, wages or loans. Existing loans are never counted as funding.',
  'att.withdrawn': 'Consent withdrawn — pause processing', 'att.noConsent': 'Consent not yet recorded',
  'att.noEstimate': 'No construction cost estimate', 'att.gap': 'Gap of {amount} before other funding',
  'att.high': 'High priority', 'att.medium': 'Medium priority',
  'ladder.subsidy': 'Subsidy', 'ladder.peakCash': 'Peak cash to find before an instalment',
  'ladder.timingGap': 'Largest timing gap (money that is only late)', 'ladder.fundingGap': 'Never covered by the scheme',
  'stage.planned': 'Planned', 'stage.in_progress': 'In progress', 'stage.blocked': 'Blocked', 'stage.verified': 'Verified', 'stage.completed': 'Completed',
  'funding.proposed': 'Proposed', 'funding.confirmed': 'Confirmed', 'funding.received': 'Received', 'funding.rejected': 'Rejected',
  'task.open': 'Open', 'task.in_progress': 'In progress', 'task.blocked': 'Blocked', 'task.completed': 'Completed', 'task.cancelled': 'Cancelled',
  'banner.demo': 'Sample data · You\'re exploring with invented families. Changes stay in this browser tab and nothing is sent to a server.',
  'banner.reset': 'Reset', 'banner.leave': 'Leave demo',
  'banner.intel': 'Case analysis below runs fixed rules over the case records. The agent run uses the same tools, and a check withholds any answer whose figures it cannot trace. Nothing is submitted, approved or paid without the family or an administrator.',

  'list.title': 'Beneficiaries', 'list.lead': 'Every case, its stage and what it is waiting on.',
  'list.searchPh': 'Search name, village or taluk', 'list.compact': 'Compact', 'list.detailed': 'Detailed', 'list.byVillage': 'By village',
  'list.empty': 'Every home begins with a first step.', 'list.emptySub': 'Add the first family to start their journey.',
  'list.noMatch': 'No families match these filters.',

  'case.journey': 'Housing journey', 'case.documents': 'Documents', 'case.finance': 'Financial assistance',
  'case.construction': 'Construction progress', 'case.consent': 'Consent', 'case.insights': 'Case insights',
  'case.noDocs': 'Documents help us build a clearer picture of the family\'s needs.',
  'case.noStages': 'The journey is waiting for its next milestone.',
  'case.upload': 'Upload document', 'case.back': 'All beneficiaries',

  'verify.title': 'Verification desk', 'verify.lead': 'Compare each document with the case record. The reviewer decides; extraction only suggests.',
  'verify.queue': 'Review queue', 'verify.approve': 'Mark verified', 'verify.reject': 'Reject', 'verify.correction': 'Request correction',
  'verify.extract': 'Read document', 'verify.extracted': 'Extracted — not yet verified', 'verify.empty': 'No documents are waiting for review.',

  'finance.title': 'Financial planning', 'finance.lead': 'Confirmed money, estimated money and the gap between them — never mixed.',
  'construction.title': 'Construction progress', 'construction.lead': 'Each stage, its cost and the evidence behind it.',
  'intel.title': 'Intelligence', 'intel.lead': 'Decision support for case workers. Suggestions carry their evidence; people make the decisions.',
  'audit.title': 'Audit trail', 'audit.lead': 'Every sensitive action, who took it and when.',
  'team.title': 'Team and access', 'team.lead': 'Who can see and change beneficiary records.',

  'landing.cta.explore': 'Explore Mane Maarga', 'landing.cta.access': 'Access the platform',
  'landing.headline': 'A home is more than walls. It is a beginning.',
  'landing.sub': 'A case file for rural housing in Karnataka. It keeps a family\'s money, documents and decisions in one honest record, in Kannada and English, from the first visit to the day the keys are handed over.',
  'landing.story.title': 'The journey to a home shouldn\'t be complicated.',

  'auth.welcome': 'Welcome back', 'auth.setup': 'Set up the workspace', 'auth.signin': 'Sign in', 'auth.create': 'Create administrator',
  'auth.username': 'Username', 'auth.password': 'Password', 'auth.email': 'Email address',
  'lang.label': 'Language',
}

type Key = keyof typeof en

const kn: Partial<Record<Key, string>> = {
  'brand.name': 'ಮನೆ ಮಾರ್ಗ',
  'nav.overview': 'ಮುನ್ನೋಟ', 'nav.beneficiaries': 'ಫಲಾನುಭವಿಗಳು', 'nav.verification': 'ಪರಿಶೀಲನೆ',
  'nav.finance': 'ಹಣಕಾಸು ಯೋಜನೆ', 'nav.construction': 'ನಿರ್ಮಾಣ', 'nav.intelligence': 'ಒಳನೋಟ',
  'nav.audit': 'ಲೆಕ್ಕಪರಿಶೋಧನೆ', 'nav.team': 'ತಂಡ', 'nav.more': 'ಇನ್ನಷ್ಟು', 'nav.signout': 'ನಿರ್ಗಮಿಸಿ', 'nav.skip': 'ವಿಷಯಕ್ಕೆ ಹೋಗಿ',
  'status.intake': 'ನೋಂದಣಿ', 'status.verified': 'ಪರಿಶೀಲಿತ', 'status.planning': 'ಮನೆ ಯೋಜನೆ',
  'status.finance_review': 'ಹಣಕಾಸು ನೆರವು', 'status.construction': 'ನಿರ್ಮಾಣ', 'status.completed': 'ಮನೆ ಪೂರ್ಣ',
  'doc.pending': 'ಪರಿಶೀಲನೆ ಬಾಕಿ', 'doc.verified': 'ಪರಿಶೀಲಿತ', 'doc.rejected': 'ತಿರಸ್ಕೃತ',
  'consent.given': 'ಸಮ್ಮತಿ ನೀಡಲಾಗಿದೆ', 'consent.withdrawn': 'ಸಮ್ಮತಿ ಹಿಂಪಡೆಯಲಾಗಿದೆ', 'consent.pending': 'ಸಮ್ಮತಿ ಬಾಕಿ',
  'common.search': 'ಹುಡುಕಿ', 'common.save': 'ಉಳಿಸಿ', 'common.cancel': 'ರದ್ದುಮಾಡಿ', 'common.close': 'ಮುಚ್ಚಿ',
  'common.loading': 'ಲೋಡ್ ಆಗುತ್ತಿದೆ', 'common.retry': 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ', 'common.edit': 'ತಿದ್ದಿ', 'common.delete': 'ಅಳಿಸಿ',
  'common.open': 'ಕೇಸ್ ಕಡತ ತೆರೆಯಿರಿ', 'common.selectCase': 'ಫಲಾನುಭವಿಯನ್ನು ಆಯ್ಕೆಮಾಡಿ', 'common.comingSoon': 'ಶೀಘ್ರದಲ್ಲೇ',
  'common.readOnly': 'ಓದಲು ಮಾತ್ರ', 'common.all': 'ಎಲ್ಲಾ',
  'overview.eyebrow': 'ವಸತಿ ಕಾರ್ಯ ನಿಯಂತ್ರಣ',
  'overview.title': '{n} ಮನೆಗಳಿಗೆ ದಾರಿ ನಿರ್ಮಿಸುತ್ತಿದ್ದೇವೆ',
  'overview.titleOne': '1 ಮನೆಗೆ ದಾರಿ ನಿರ್ಮಿಸುತ್ತಿದ್ದೇವೆ',
  'overview.titleZero': 'ಪ್ರತಿ ಮನೆಯೂ ಮೊದಲ ಹೆಜ್ಜೆಯಿಂದ ಆರಂಭ',
  'overview.lead': 'ಪ್ರತಿ ಕುಟುಂಬ ಎಲ್ಲಿದೆ, ಇಂದು ಯಾವ ನಿರ್ಧಾರ ಬೇಕು, ಮತ್ತು ನೆರವು ನಿಜವಾಗಿ ಎಷ್ಟು ಸಾಕು.',
  'overview.add': 'ಫಲಾನುಭವಿ ಸೇರಿಸಿ', 'overview.journey': 'ಕುಟುಂಬವಾರು ಪಯಣ', 'overview.attention': 'ಗಮನ ಬೇಕು',
  'overview.activity': 'ಇತ್ತೀಚಿನ ಚಟುವಟಿಕೆ', 'overview.money': 'ಹಣ ಎಷ್ಟು ಸಾಕು',
  'overview.estimated': 'ಅಂದಾಜು ನಿರ್ಮಾಣ ವೆಚ್ಚ', 'overview.sanctioned': 'ಮಂಜೂರಾದ ನೆರವು', 'overview.gap': 'ಅಂದಾಜು ಕೊರತೆ',
  'overview.attentionNone': 'ಈಗ ಯಾವುದೂ ಬಾಕಿ ಇಲ್ಲ.',
  'overview.gapNote': 'ಪ್ರತಿ ಕೇಸ್‌ನ ಅಂದಾಜು ವೆಚ್ಚದಿಂದ ಮಂಜೂರಾದ ನೆರವು ಕಳೆದು; ಉಳಿತಾಯ, ಕೂಲಿ ಅಥವಾ ಸಾಲ ಸೇರಿಸುವ ಮೊದಲು. ಹಳೆಯ ಸಾಲಗಳನ್ನು ಎಂದಿಗೂ ನೆರವು ಎಂದು ಎಣಿಸುವುದಿಲ್ಲ.',
  'att.withdrawn': 'ಸಮ್ಮತಿ ಹಿಂಪಡೆಯಲಾಗಿದೆ — ಪ್ರಕ್ರಿಯೆ ನಿಲ್ಲಿಸಿ', 'att.noConsent': 'ಸಮ್ಮತಿ ಇನ್ನೂ ದಾಖಲಾಗಿಲ್ಲ',
  'att.noEstimate': 'ನಿರ್ಮಾಣ ವೆಚ್ಚದ ಅಂದಾಜು ಇಲ್ಲ', 'att.gap': 'ಇತರ ಹಣ ಸೇರಿಸುವ ಮೊದಲು {amount} ಕೊರತೆ',
  'att.high': 'ಹೆಚ್ಚಿನ ಆದ್ಯತೆ', 'att.medium': 'ಮಧ್ಯಮ ಆದ್ಯತೆ',
  'ladder.subsidy': 'ಸಹಾಯಧನ', 'ladder.peakCash': 'ಕಂತಿನ ಮೊದಲು ಹೊಂದಿಸಬೇಕಾದ ಗರಿಷ್ಠ ಹಣ',
  'ladder.timingGap': 'ಅತಿ ದೊಡ್ಡ ಸಮಯದ ಅಂತರ (ತಡವಾಗಿ ಬರುವ ಹಣ ಮಾತ್ರ)', 'ladder.fundingGap': 'ಯೋಜನೆ ಎಂದಿಗೂ ಭರಿಸದ ಮೊತ್ತ',
  'stage.planned': 'ಯೋಜಿತ', 'stage.in_progress': 'ನಡೆಯುತ್ತಿದೆ', 'stage.blocked': 'ತಡೆ', 'stage.verified': 'ಪರಿಶೀಲಿತ', 'stage.completed': 'ಪೂರ್ಣ',
  'funding.proposed': 'ಪ್ರಸ್ತಾಪಿತ', 'funding.confirmed': 'ದೃಢೀಕೃತ', 'funding.received': 'ಸ್ವೀಕರಿಸಲಾಗಿದೆ', 'funding.rejected': 'ತಿರಸ್ಕೃತ',
  'task.open': 'ತೆರೆದಿದೆ', 'task.in_progress': 'ನಡೆಯುತ್ತಿದೆ', 'task.blocked': 'ತಡೆ', 'task.completed': 'ಪೂರ್ಣ', 'task.cancelled': 'ರದ್ದು',
  'banner.demo': 'ಮಾದರಿ ದತ್ತಾಂಶ · ನೀವು ಕಲ್ಪಿತ ಕುಟುಂಬಗಳೊಂದಿಗೆ ನೋಡುತ್ತಿದ್ದೀರಿ. ಬದಲಾವಣೆಗಳು ಈ ಬ್ರೌಸರ್ ಟ್ಯಾಬ್‌ನಲ್ಲೇ ಉಳಿಯುತ್ತವೆ; ಯಾವುದೂ ಸರ್ವರ್‌ಗೆ ಹೋಗುವುದಿಲ್ಲ.',
  'banner.reset': 'ಮರುಹೊಂದಿಸಿ', 'banner.leave': 'ಡೆಮೊದಿಂದ ಹೊರಬನ್ನಿ',
  'banner.intel': 'ಕೆಳಗಿನ ಕಡತ ವಿಶ್ಲೇಷಣೆ ನಿಗದಿತ ನಿಯಮಗಳಿಂದ ನಡೆಯುತ್ತದೆ. ಏಜೆಂಟ್ ಅದೇ ಸಾಧನಗಳನ್ನು ಬಳಸುತ್ತದೆ; ಆಧಾರ ಸಿಗದ ಅಂಕಿ ಇರುವ ಉತ್ತರವನ್ನು ತಡೆಹಿಡಿಯಲಾಗುತ್ತದೆ. ಕುಟುಂಬ ಅಥವಾ ನಿರ್ವಾಹಕರ ಒಪ್ಪಿಗೆ ಇಲ್ಲದೆ ಏನನ್ನೂ ಸಲ್ಲಿಸುವುದಿಲ್ಲ, ಅನುಮೋದಿಸುವುದಿಲ್ಲ ಅಥವಾ ಪಾವತಿಸುವುದಿಲ್ಲ.',
  'list.title': 'ಫಲಾನುಭವಿಗಳು', 'list.lead': 'ಪ್ರತಿ ಕೇಸ್, ಅದರ ಹಂತ ಮತ್ತು ಅದು ಯಾವುದಕ್ಕಾಗಿ ಕಾಯುತ್ತಿದೆ.',
  'list.searchPh': 'ಹೆಸರು, ಗ್ರಾಮ ಅಥವಾ ತಾಲ್ಲೂಕು ಹುಡುಕಿ', 'list.compact': 'ಸಂಕ್ಷಿಪ್ತ', 'list.detailed': 'ವಿವರವಾದ', 'list.byVillage': 'ಗ್ರಾಮವಾರು',
  'list.empty': 'ಪ್ರತಿ ಮನೆಯೂ ಮೊದಲ ಹೆಜ್ಜೆಯಿಂದ ಆರಂಭ.', 'list.emptySub': 'ಮೊದಲ ಕುಟುಂಬವನ್ನು ಸೇರಿಸಿ ಅವರ ಪಯಣ ಆರಂಭಿಸಿ.',
  'list.noMatch': 'ಈ ಆಯ್ಕೆಗಳಿಗೆ ಯಾವುದೇ ಕುಟುಂಬ ಹೊಂದುತ್ತಿಲ್ಲ.',
  'case.journey': 'ವಸತಿ ಪಯಣ', 'case.documents': 'ದಾಖಲೆಗಳು', 'case.finance': 'ಹಣಕಾಸು ನೆರವು', 'case.construction': 'ನಿರ್ಮಾಣ ಪ್ರಗತಿ',
  'case.consent': 'ಸಮ್ಮತಿ', 'case.insights': 'ಕೇಸ್ ಒಳನೋಟ',
  'case.noDocs': 'ದಾಖಲೆಗಳು ಕುಟುಂಬದ ಅಗತ್ಯಗಳನ್ನು ಸ್ಪಷ್ಟವಾಗಿ ತಿಳಿಯಲು ಸಹಾಯ ಮಾಡುತ್ತವೆ.',
  'case.noStages': 'ಪಯಣ ಮುಂದಿನ ಹಂತಕ್ಕಾಗಿ ಕಾಯುತ್ತಿದೆ.', 'case.upload': 'ದಾಖಲೆ ಅಪ್‌ಲೋಡ್ ಮಾಡಿ', 'case.back': 'ಎಲ್ಲಾ ಫಲಾನುಭವಿಗಳು',
  'verify.title': 'ಪರಿಶೀಲನಾ ಮೇಜು', 'verify.lead': 'ಪ್ರತಿ ದಾಖಲೆಯನ್ನು ಕೇಸ್ ದಾಖಲೆಯೊಂದಿಗೆ ಹೋಲಿಸಿ. ನಿರ್ಧಾರ ಪರಿಶೀಲಕರದು; ಯಂತ್ರ ಕೇವಲ ಸಲಹೆ ನೀಡುತ್ತದೆ.',
  'verify.queue': 'ಪರಿಶೀಲನಾ ಸಾಲು', 'verify.approve': 'ಪರಿಶೀಲಿತ ಎಂದು ಗುರುತಿಸಿ', 'verify.reject': 'ತಿರಸ್ಕರಿಸಿ', 'verify.correction': 'ತಿದ್ದುಪಡಿ ಕೇಳಿ',
  'verify.extract': 'ದಾಖಲೆ ಓದಿ', 'verify.extracted': 'ಹೊರತೆಗೆದದ್ದು — ಇನ್ನೂ ಪರಿಶೀಲಿಸಿಲ್ಲ', 'verify.empty': 'ಪರಿಶೀಲನೆಗೆ ಯಾವುದೇ ದಾಖಲೆ ಬಾಕಿ ಇಲ್ಲ.',
  'finance.title': 'ಹಣಕಾಸು ಯೋಜನೆ', 'finance.lead': 'ದೃಢೀಕೃತ ಹಣ, ಅಂದಾಜು ಹಣ ಮತ್ತು ಅವುಗಳ ನಡುವಿನ ಕೊರತೆ — ಎಂದಿಗೂ ಬೆರೆಸುವುದಿಲ್ಲ.',
  'construction.title': 'ನಿರ್ಮಾಣ ಪ್ರಗತಿ', 'construction.lead': 'ಪ್ರತಿ ಹಂತ, ಅದರ ವೆಚ್ಚ ಮತ್ತು ಅದರ ಹಿಂದಿನ ಸಾಕ್ಷ್ಯ.',
  'intel.title': 'ಒಳನೋಟ', 'intel.lead': 'ಕೇಸ್ ಕಾರ್ಯಕರ್ತರಿಗೆ ನಿರ್ಧಾರ ಬೆಂಬಲ. ಸಲಹೆಗಳು ಸಾಕ್ಷ್ಯದೊಂದಿಗೆ; ನಿರ್ಧಾರ ಮನುಷ್ಯರದು.',
  'audit.title': 'ಲೆಕ್ಕಪರಿಶೋಧನಾ ದಾಖಲೆ', 'audit.lead': 'ಪ್ರತಿ ಸೂಕ್ಷ್ಮ ಕ್ರಿಯೆ, ಯಾರು ಮಾಡಿದರು ಮತ್ತು ಯಾವಾಗ.',
  'team.title': 'ತಂಡ ಮತ್ತು ಪ್ರವೇಶ', 'team.lead': 'ಫಲಾನುಭವಿ ದಾಖಲೆಗಳನ್ನು ಯಾರು ನೋಡಬಹುದು ಮತ್ತು ಬದಲಾಯಿಸಬಹುದು.',
  'landing.cta.explore': 'ಮನೆ ಮಾರ್ಗ ಅನ್ವೇಷಿಸಿ', 'landing.cta.access': 'ವೇದಿಕೆಗೆ ಪ್ರವೇಶಿಸಿ',
  'landing.headline': 'ಮನೆ ಎಂದರೆ ಗೋಡೆಗಳಷ್ಟೇ ಅಲ್ಲ. ಅದು ಹೊಸ ಆರಂಭ.',
  'landing.sub': 'ಕರ್ನಾಟಕದ ಗ್ರಾಮೀಣ ವಸತಿಗಾಗಿ ಒಂದು ಕಡತ. ಮೊದಲ ಭೇಟಿಯಿಂದ ಕೀಲಿ ಕೈಗೆ ಬರುವವರೆಗೆ ಕುಟುಂಬದ ಹಣ, ದಾಖಲೆ ಮತ್ತು ನಿರ್ಧಾರಗಳನ್ನು ಕನ್ನಡ ಮತ್ತು ಇಂಗ್ಲಿಷ್‌ನಲ್ಲಿ ಒಂದೇ ಪ್ರಾಮಾಣಿಕ ದಾಖಲೆಯಾಗಿ ಇಡುತ್ತದೆ.',
  'landing.story.title': 'ಮನೆಯ ಪಯಣ ಕಷ್ಟಕರವಾಗಿರಬಾರದು.',
  'auth.welcome': 'ಮರಳಿ ಸ್ವಾಗತ', 'auth.setup': 'ಕಾರ್ಯಕ್ಷೇತ್ರ ಸಿದ್ಧಪಡಿಸಿ', 'auth.signin': 'ಸೈನ್ ಇನ್', 'auth.create': 'ನಿರ್ವಾಹಕರನ್ನು ರಚಿಸಿ',
  'auth.username': 'ಬಳಕೆದಾರ ಹೆಸರು', 'auth.password': 'ಪಾಸ್‌ವರ್ಡ್', 'auth.email': 'ಇಮೇಲ್ ವಿಳಾಸ', 'lang.label': 'ಭಾಷೆ',
}

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (k: Key, vars?: Record<string, string | number>) => string }
const I18n = createContext<Ctx>({ lang: 'en', setLang: () => {}, t: k => en[k] })

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    try { return (localStorage.getItem('mm_lang') as Lang) || 'en' } catch { return 'en' }
  })
  useEffect(() => {
    document.documentElement.lang = lang === 'kn' ? 'kn' : 'en'
    try { localStorage.setItem('mm_lang', lang) } catch { /* storage unavailable */ }
  }, [lang])
  const t = (k: Key, vars?: Record<string, string | number>) => {
    let s = (lang === 'kn' ? kn[k] : undefined) ?? en[k]
    if (vars) for (const [name, v] of Object.entries(vars)) s = s.replace(`{${name}}`, String(v))
    return s
  }
  return <I18n.Provider value={{ lang, setLang, t }}>{children}</I18n.Provider>
}

export const useI18n = () => useContext(I18n)

export function LanguageSwitch({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const { lang, setLang, t } = useI18n()
  return (
    <div className={`lang-switch ${tone}`} role="group" aria-label={t('lang.label')}>
      <button type="button" aria-pressed={lang === 'kn'} onClick={() => setLang('kn')} lang="kn">ಕನ್ನಡ</button>
      <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>English</button>
    </div>
  )
}
