import { Link } from 'react-router-dom'

import * as s from '../theme'
import { LegalH, LegalP, LegalShell } from './legalShared'

const EFFECTIVE = 'September 26, 2026'

/**
 * Terms of Service for Change My Mind / Common Ground, operated by 4FRN Education LLC (Florida).
 * Strong protective terms for an AI debate product; have counsel review before relying on them.
 */
export default function Terms() {
  return (
    <LegalShell title="Terms of service">
      <LegalP>Effective date: {EFFECTIVE}</LegalP>
      <LegalP>
        These Terms of Service (“Terms”) are a binding agreement between you and 4FRN Education LLC
        (“4FRN,” “we,” “us,” or “our”), a Florida limited liability company, governing access to
        and use of Change My Mind / Common Ground and related websites, apps, APIs, content, and
        communications (the “Service”). By accessing or using the Service, creating an account,
        clicking Next, or otherwise indicating acceptance, you agree to these Terms and our{' '}
        <Link to="/privacy" style={{ color: s.color.text }}>
          Privacy Policy
        </Link>
        . If you do not agree, do not use the Service.
      </LegalP>

      <LegalH>1. Eligibility</LegalH>
      <LegalP>
        You must be at least 18 years old (or the age of majority where you live, if higher) and
        able to form a binding contract to use the Service. By using the Service you represent that
        you meet these requirements and that the information you provide is accurate.
      </LegalP>

      <LegalH>2. The Service; educational / experimental nature</LegalH>
      <LegalP>
        The Service is an experimental educational product intended to explore civil debate using
        artificial intelligence. It is not legal, medical, financial, political, therapeutic, or
        professional advice. Features, availability, scoring, topics, timers, and AI behavior may
        change, fail, or be withdrawn at any time without notice. We may refuse, suspend, or
        terminate access for any reason or no reason, to the fullest extent permitted by law.
      </LegalP>

      <LegalH>3. No endorsement of opinions</LegalH>
      <LegalP>
        AI-generated arguments, positions, voice content, scores, win/lose outcomes, and any other
        statements in the Service are simulated for debate practice only. 4FRN Education LLC does
        not stand for, adopt, endorse, sponsor, or vouch for any opinion, political position,
        ideology, factual claim, or recommendation presented by the AI, by other users, or by
        third-party models. You agree not to treat Service content as our views or as verified
        truth.
      </LegalP>

      <LegalH>4. Accounts and phone authentication</LegalH>
      <LegalP>
        Access may require phone-number authentication and related bot checks. You are responsible
        for activity under your account and for keeping your device and codes secure. You must not
        share accounts, evade bans, or use the Service to harass, threaten, defraud, or violate
        law. We may delete accounts and associated data as described in the Privacy Policy.
      </LegalP>

      <LegalH>5. User conduct and content</LegalH>
      <LegalP>
        You retain rights in your own voice and text inputs, subject to the licenses below. You
        grant 4FRN a worldwide, non-exclusive, royalty-free, sublicensable license to host,
        process, transmit, analyze, and display your inputs as needed to operate, secure, improve,
        and defend the Service, including through third-party AI and infrastructure providers. You
        represent that you have rights to provide that content and that it does not infringe
        others’ rights or violate law. You must not upload malware, attempt unauthorized access,
        reverse engineer except where prohibited restrictions are unenforceable, scrape at scale,
        or interfere with the Service.
      </LegalP>

      <LegalH>6. AI, third parties, and SMS</LegalH>
      <LegalP>
        Debates and judging depend on third-party AI and cloud services (including Google). Those
        services may err, hallucinate, interrupt, mis-score, or become unavailable. SMS and
        authentication may involve carriers and Firebase/Google Auth; message and data rates may
        apply. We are not responsible for third-party outages, model behavior, carrier delivery, or
        third-party terms you must also accept.
      </LegalP>

      <LegalH>7. Intellectual property</LegalH>
      <LegalP>
        The Service, including software, branding, design, prompts, and non-user content, is owned
        by 4FRN or its licensors and protected by law. Except for the limited right to use the
        Service as offered, no license is granted. Feedback you submit may be used by us without
        restriction or compensation.
      </LegalP>

      <LegalH>8. Disclaimers</LegalH>
      <LegalP>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE,”
        WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING
        MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, NON-INFRINGEMENT, ACCURACY,
        QUIET ENJOYMENT, AND ANY WARRANTIES ARISING FROM COURSE OF DEALING OR USAGE OF TRADE. WE DO
        NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, SECURE, ERROR-FREE, OR FREE OF HARMFUL
        COMPONENTS, OR THAT DEBATE OUTCOMES, SCORES, OR AI STATEMENTS ARE CORRECT, FAIR, OR FIT FOR
        ANY PURPOSE.
      </LegalP>

      <LegalH>9. Assumption of risk</LegalH>
      <LegalP>
        You understand that debates may involve provocative, offensive, or upsetting speech; that
        AI may produce inaccurate or biased content; and that microphone use involves privacy and
        environmental risks you control. You voluntarily assume all risks arising from your use of
        the Service, including emotional distress, reputational harm, device damage, data loss, and
        decisions you make based on Service content.
      </LegalP>

      <LegalH>10. Limitation of liability</LegalH>
      <LegalP>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, 4FRN EDUCATION LLC AND ITS MEMBERS, MANAGERS,
        OFFICERS, EMPLOYEES, AGENTS, CONTRACTORS, LICENSORS, AND SUPPLIERS WILL NOT BE LIABLE FOR
        ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, PUNITIVE, OR MULTIPLE DAMAGES;
        LOST PROFITS, REVENUE, DATA, GOODWILL, OR BUSINESS OPPORTUNITY; OR COST OF SUBSTITUTE
        SERVICES, WHETHER BASED IN CONTRACT, TORT (INCLUDING NEGLIGENCE), STRICT LIABILITY, OR
        OTHERWISE, EVEN IF ADVISED OF THE POSSIBILITY. OUR TOTAL LIABILITY FOR ALL CLAIMS RELATING
        TO THE SERVICE WILL NOT EXCEED THE GREATER OF (A) THE AMOUNTS YOU PAID US FOR THE SERVICE
        IN THE TWELVE MONTHS BEFORE THE CLAIM OR (B) ONE HUNDRED U.S. DOLLARS (US $100). SOME
        JURISDICTIONS DO NOT ALLOW CERTAIN LIMITATIONS; IN THOSE CASES OUR LIABILITY IS LIMITED TO
        THE FULLEST EXTENT PERMITTED.
      </LegalP>

      <LegalH>11. Indemnification</LegalH>
      <LegalP>
        You will defend, indemnify, and hold harmless 4FRN Education LLC and its members, managers,
        officers, employees, agents, contractors, and affiliates from and against any claims,
        damages, losses, liabilities, costs, and expenses (including reasonable attorneys’ fees)
        arising out of or related to: your use of the Service; your content or conduct; your
        violation of these Terms or law; or your infringement of any third-party right. We may
        assume exclusive defense at your expense; you will cooperate fully.
      </LegalP>

      <LegalH>12. Release</LegalH>
      <LegalP>
        To the fullest extent permitted by law, you release 4FRN Education LLC and its related
        parties from claims and damages of every kind, known or unknown, arising out of disputes
        with other users, AI-generated content, third-party services, or your interactions through
        the Service. If you are a California resident, you waive California Civil Code § 1542 (and
        similar laws) to the extent applicable.
      </LegalP>

      <LegalH>13. Dispute resolution; arbitration; class waiver</LegalH>
      <LegalP>
        Except for small-claims matters or claims seeking injunctive relief for intellectual
        property or unauthorized access, any dispute arising out of or relating to these Terms or
        the Service will be resolved by binding individual arbitration administered by the American
        Arbitration Association under its Consumer Arbitration Rules, in English, seated in
        Florida (or by video if permitted). YOU AND 4FRN WAIVE ANY RIGHT TO A JURY TRIAL AND TO
        PARTICIPATE IN A CLASS, COLLECTIVE, CONSOLIDATED, OR REPRESENTATIVE ACTION. If this class
        waiver is found unenforceable as to a particular claim, that claim must proceed in court
        and not in arbitration. Either party may seek provisional relief in court to protect
        rights pending arbitration.
      </LegalP>

      <LegalH>14. Governing law and venue</LegalH>
      <LegalP>
        These Terms are governed by the laws of the State of Florida, excluding conflict-of-law
        rules. Subject to the arbitration clause, exclusive venue for permitted court actions lies
        in state or federal courts located in Florida, and you consent to personal jurisdiction
        there.
      </LegalP>

      <LegalH>15. Export and sanctions</LegalH>
      <LegalP>
        You may not use the Service if you are barred under U.S. export control or sanctions laws,
        or on behalf of any sanctioned person or in any prohibited jurisdiction.
      </LegalP>

      <LegalH>16. Changes and termination</LegalH>
      <LegalP>
        We may modify these Terms by posting an updated version with a new effective date.
        Continued use after posting constitutes acceptance where allowed. We may suspend or end
        the Service or your access at any time. Sections that by nature should survive
        (including ownership, disclaimers, limitations, indemnity, arbitration, and governing law)
        survive termination.
      </LegalP>

      <LegalH>17. Miscellaneous</LegalH>
      <LegalP>
        These Terms and the Privacy Policy are the entire agreement between you and us regarding
        the Service. If any provision is unenforceable, the remainder stays in effect. Our failure
        to enforce a provision is not a waiver. You may not assign these Terms without our consent;
        we may assign them freely. No third-party beneficiaries except as stated for indemnified
        parties. Headings are for convenience only. Notices may be provided through the Service or
        contact channels we publish.
      </LegalP>

      <LegalH>18. Contact</LegalH>
      <LegalP>
        4FRN Education LLC, Florida, United States. Contact us through the channel published with
        the Service.
      </LegalP>
    </LegalShell>
  )
}
