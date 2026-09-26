import { Link } from 'react-router-dom'

import * as s from '../theme'
import { LegalH, LegalP, LegalShell } from './legalShared'

const EFFECTIVE = 'September 26, 2026'

/**
 * Privacy policy for Change My Mind / Common Ground, operated by 4FRN Education LLC.
 */
export default function Privacy() {
  return (
    <LegalShell title="Privacy policy">
      <LegalP>Effective date: {EFFECTIVE}</LegalP>
      <LegalP>
        This Privacy Policy describes how 4FRN Education LLC (“4FRN,” “we,” “us,” or “our”), a
        Florida limited liability company, collects, uses, discloses, and protects information in
        connection with the Change My Mind / Common Ground application and related websites,
        services, and communications (collectively, the “Service”). By using the Service, you
        agree to this Policy. If you do not agree, do not use the Service.
      </LegalP>

      <LegalH>1. Who we are</LegalH>
      <LegalP>
        The Service is operated by 4FRN Education LLC, organized under the laws of the State of
        Florida, United States. For privacy requests, contact us at the email or other channel we
        publish with the Service (or, if none is listed, by written notice to 4FRN Education LLC in
        Florida).
      </LegalP>

      <LegalH>2. Information we collect</LegalH>
      <LegalP>
        Depending on how you use the Service, we may collect: (a) account identifiers such as phone
        number and authentication tokens; (b) diagnostic and quiz responses, assigned topics, and
        related preferences (for example difficulty); (c) debate session data, including
        transcripts, timing, scores, outcomes, and technical metadata; (d) voice audio when you
        participate in a debate, which is processed to power live conversation and evaluation; (e)
        device, log, and usage data (IP address, browser or app type, timestamps, error logs,
        approximate location derived from IP); and (f) information you voluntarily provide in
        support messages or feedback.
      </LegalP>

      <LegalH>3. How we use information</LegalH>
      <LegalP>
        We use information to: provide, operate, secure, and improve the Service; authenticate you;
        run debates and scoring (including via third-party AI providers); personalize topic
        assignment; communicate about the Service; detect fraud, abuse, and security incidents;
        comply with law; enforce our Terms of Service; and defend our legal rights. We do not sell
        your personal information for money. We do not use your debate content for third-party
        advertising.
      </LegalP>

      <LegalH>4. AI and voice processing</LegalH>
      <LegalP>
        Live debate and judging rely on third-party artificial intelligence and cloud providers
        (including Google Gemini and related Google Cloud / Firebase services). Voice and text you
        provide during a session are transmitted to those providers to generate responses and
        scores. Those providers process data under their own terms and privacy practices. Do not
        share information in debates that you are not comfortable having processed by AI systems.
      </LegalP>

      <LegalH>5. Disclosure of information</LegalH>
      <LegalP>
        We may disclose information to: service providers who assist us (hosting, authentication,
        SMS, analytics, AI inference) under contractual obligations; professional advisors; parties
        to a merger, acquisition, financing, or sale of assets; and authorities when required by
        law, legal process, or to protect rights, safety, and security. We may also disclose
        aggregated or de-identified information that cannot reasonably identify you.
      </LegalP>

      <LegalH>6. Retention</LegalH>
      <LegalP>
        We retain information for as long as needed to provide the Service, comply with legal
        obligations, resolve disputes, and enforce agreements. You may delete your account from
        Settings, which removes your profile and debate history from our primary systems, subject
        to residual copies in backups, logs, or legal holds that expire or are purged on our
        ordinary schedules.
      </LegalP>

      <LegalH>7. Security</LegalH>
      <LegalP>
        We use reasonable administrative, technical, and organizational measures designed to
        protect information. No method of transmission or storage is completely secure. You use the
        Service at your own risk regarding residual security risk.
      </LegalP>

      <LegalH>8. Your choices</LegalH>
      <LegalP>
        You may log out at any time. You may request account deletion through the Service. Where
        applicable law grants additional rights (access, correction, deletion, restriction,
        portability, or opt-out of certain processing), we will respond as required. California and
        other U.S. state privacy laws: we do not “sell” or “share” personal information as those
        terms are commonly defined for cross-context behavioral advertising in connection with this
        Service. You may contact us to exercise available rights.
      </LegalP>

      <LegalH>9. Children</LegalH>
      <LegalP>
        The Service is not directed to children under 13 (or under 16 where a higher age is
        required). We do not knowingly collect personal information from children. If we learn we
        have collected such information, we will delete it. Guardians who believe a child has
        provided information should contact us.
      </LegalP>

      <LegalH>10. International users</LegalH>
      <LegalP>
        The Service is operated from the United States. If you access it from elsewhere, you
        consent to transfer and processing of information in the United States and other locations
        where our providers operate, which may have different data-protection rules than your
        home country.
      </LegalP>

      <LegalH>11. Charitable / offset notices</LegalH>
      <LegalP>
        From time to time we may describe emissions offsets or charitable donations related to AI
        use. Those statements are informational and do not create a fiduciary duty, escrow, or
        enforceable promise beyond what we expressly state in writing for a specific period.
      </LegalP>

      <LegalH>12. Changes</LegalH>
      <LegalP>
        We may update this Policy. Material changes will be posted in the Service or on this page
        with an updated effective date. Continued use after changes constitutes acceptance where
        permitted by law.
      </LegalP>

      <LegalH>13. Contact</LegalH>
      <LegalP>
        Privacy questions: contact 4FRN Education LLC through the channel published with the
        Service. Related documents:{' '}
        <Link to="/terms" style={{ color: s.color.text }}>
          Terms of Service
        </Link>
        .
      </LegalP>
    </LegalShell>
  )
}
